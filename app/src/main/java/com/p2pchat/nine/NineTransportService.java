package com.p2pchat.nine;

import android.bluetooth.BluetoothDevice;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * NINE Transport Service — Android Integration Layer
 *
 * Bridges the TypeScript-designed BluetoothTransport architecture with real
 * Android Bluetooth APIs. This class is the single entry point for the
 * Android application to operate the NINE transport layer.
 *
 * Responsibilities:
 * - Wraps AndroidBluetoothAdapter into the transport lifecycle
 * - Manages RFCOMM connections (inbound via accept loop, outbound via connect)
 * - Runs per-link read loops on a thread pool
 * - Delivers received frames to a TransportListener on the main thread
 * - Sends framed packets (4-byte length prefix + payload) over active links
 * - Manages discovery via BluetoothDiscoveryCallback
 * - Enforces connection policy (max peers, duplicate rejection)
 *
 * Threading model:
 * - Accept loop: dedicated thread
 * - Per-link read: thread pool (one task per link)
 * - Writes: called from any thread (synchronized per-link)
 * - Callbacks: posted to main thread via Handler
 *
 * API Status: STABLE (Phase 10.2)
 */
public class NineTransportService {

    private static final String TAG = "NineTransport";
    private static final int MAX_FRAME_SIZE = 4096;
    private static final int MAX_CONNECTIONS = 7;

    // ─── Transport Listener (callback to protocol layer) ────────────

    /** Callback interface for transport events delivered to the protocol layer. */
    public interface TransportListener {
        /** A framed packet was received from a peer. */
        void onDataReceived(String peerId, byte[] data);
        /** A new peer connected (inbound or outbound). */
        void onPeerConnected(String peerId);
        /** A peer disconnected or the link was lost. */
        void onPeerDisconnected(String peerId, String reason);
        /** A new device was found during discovery. */
        void onPeerDiscovered(String address, String name, int rssi);
        /** Discovery scan finished. */
        void onDiscoveryFinished();
        /** An error occurred in the transport layer. */
        void onTransportError(String message);
    }

    // ─── State ──────────────────────────────────────────────────────

    public enum State { UNINITIALIZED, READY, DISCOVERING, SHUTDOWN }

    private final Context context;
    private final Handler mainHandler;
    private final AndroidBluetoothAdapter btAdapter;
    private final ExecutorService executor;
    private final Map<String, ActiveLink> links = new ConcurrentHashMap<>();
    private final Set<String> discoveredAddresses = ConcurrentHashMap.newKeySet();

    private TransportListener listener;
    private BluetoothDiscoveryCallback discoveryReceiver;
    private AndroidBluetoothServerSocket serverSocket;
    private volatile State state = State.UNINITIALIZED;
    private final AtomicBoolean acceptLoopRunning = new AtomicBoolean(false);

    // Metrics
    private final AtomicLong bytesSent = new AtomicLong(0);
    private final AtomicLong bytesReceived = new AtomicLong(0);
    private final AtomicInteger packetsSent = new AtomicInteger(0);
    private final AtomicInteger packetsReceived = new AtomicInteger(0);
    private final AtomicInteger sendFailures = new AtomicInteger(0);

    // ─── Construction ───────────────────────────────────────────────

    public NineTransportService(Context context) {
        this.context = context.getApplicationContext();
        this.mainHandler = new Handler(Looper.getMainLooper());
        this.btAdapter = new AndroidBluetoothAdapter(context);
        this.executor = Executors.newCachedThreadPool();
    }

    /** Set the listener that receives transport events on the main thread. */
    public void setListener(TransportListener listener) {
        this.listener = listener;
    }

    // ─── Lifecycle ──────────────────────────────────────────────────

    /**
     * Initialize the transport: verify permissions, start accept loop.
     * @throws IllegalStateException if Bluetooth is unavailable or disabled
     */
    public void initialize() {
        if (state != State.UNINITIALIZED) {
            Log.w(TAG, "initialize() called in state " + state + " — ignored");
            return;
        }

        if (!btAdapter.isAvailable()) {
            postError("BLUETOOTH_UNAVAILABLE: no Bluetooth hardware");
            return;
        }
        if (!btAdapter.isEnabled()) {
            postError("BLUETOOTH_DISABLED: adapter is not enabled");
            return;
        }
        if (!btAdapter.getPermissions().hasAllPermissions()) {
            postError("PERMISSIONS_MISSING: " + 
                String.join(", ", btAdapter.getPermissions().getMissingPermissions()));
            return;
        }

        // Start the RFCOMM server accept loop
        try {
            serverSocket = btAdapter.createServerSocket();
            startAcceptLoop();
        } catch (Exception e) {
            Log.e(TAG, "Failed to create server socket", e);
            postError("SERVER_SOCKET_FAILED: " + e.getMessage());
            return;
        }

        // Register discovery receiver
        discoveryReceiver = new BluetoothDiscoveryCallback(new BluetoothDiscoveryCallback.DiscoveryListener() {
            @Override
            public void onDeviceFound(BluetoothDevice device, String name, int rssi) {
                String address = device.getAddress();
                if (address == null) return;
                // Duplicate suppression
                if (!discoveredAddresses.add(address.toLowerCase())) return;
                // Ignore already-connected peers
                if (links.containsKey(address.toLowerCase())) return;
                Log.i(TAG, "Discovered: " + name + " [" + address + "] rssi=" + rssi);
                if (listener != null) {
                    mainHandler.post(() -> listener.onPeerDiscovered(address, name, rssi));
                }
            }

            @Override
            public void onDiscoveryFinished() {
                Log.i(TAG, "Discovery finished. Found " + discoveredAddresses.size() + " devices.");
                if (state == State.DISCOVERING) state = State.READY;
                if (listener != null) {
                    mainHandler.post(() -> listener.onDiscoveryFinished());
                }
            }

            @Override
            public void onDiscoveryFailed(String reason) {
                Log.e(TAG, "Discovery failed: " + reason);
                if (state == State.DISCOVERING) state = State.READY;
                postError("DISCOVERY_FAILED: " + reason);
            }
        });
        discoveryReceiver.register(context);

        state = State.READY;
        Log.i(TAG, "Transport initialized. Accept loop running.");
    }

    /** Shut down the transport: close all connections, stop accept loop. */
    public void shutdown() {
        if (state == State.SHUTDOWN) return;
        state = State.SHUTDOWN;

        // Stop discovery
        btAdapter.cancelDiscovery();
        if (discoveryReceiver != null) {
            discoveryReceiver.unregister(context);
            discoveryReceiver = null;
        }

        // Close accept loop
        if (serverSocket != null) {
            serverSocket.close();
            serverSocket = null;
        }

        // Close all links
        for (Map.Entry<String, ActiveLink> entry : links.entrySet()) {
            entry.getValue().close();
            String peerId = entry.getKey();
            if (listener != null) {
                mainHandler.post(() -> listener.onPeerDisconnected(peerId, "shutdown"));
            }
        }
        links.clear();
        discoveredAddresses.clear();

        Log.i(TAG, "Transport shut down.");
    }

    // ─── Discovery ──────────────────────────────────────────────────

    /** Start Bluetooth Classic device discovery. */
    public boolean startDiscovery() {
        if (state != State.READY && state != State.DISCOVERING) {
            Log.w(TAG, "startDiscovery() called in state " + state);
            return false;
        }
        discoveredAddresses.clear();
        state = State.DISCOVERING;
        boolean started = btAdapter.startDiscovery();
        if (!started) {
            state = State.READY;
            Log.e(TAG, "startDiscovery() failed — adapter returned false");
        } else {
            Log.i(TAG, "Discovery started.");
        }
        return started;
    }

    /** Stop an ongoing discovery scan. */
    public void stopDiscovery() {
        btAdapter.cancelDiscovery();
        if (state == State.DISCOVERING) state = State.READY;
        Log.i(TAG, "Discovery stopped.");
    }

    // ─── Connection Management ──────────────────────────────────────

    /**
     * Initiate an outbound RFCOMM connection to a peer by Bluetooth address.
     * Runs on a background thread. Callbacks delivered on main thread.
     * @param address Bluetooth MAC address (e.g., "AA:BB:CC:DD:EE:FF")
     */
    public void connect(String address) {
        if (state == State.SHUTDOWN) return;
        String key = address.toLowerCase();

        // Connection policy: reject duplicates and enforce max
        if (links.containsKey(key)) {
            Log.w(TAG, "Already connected to " + address);
            return;
        }
        if (links.size() >= MAX_CONNECTIONS) {
            Log.w(TAG, "Max connections reached (" + MAX_CONNECTIONS + "), rejecting " + address);
            postError("MAX_CONNECTIONS_REACHED");
            return;
        }

        executor.execute(() -> {
            try {
                // Cancel discovery to speed up connection
                btAdapter.cancelDiscovery();

                BluetoothDevice device = btAdapter.getRemoteDevice(address);
                if (device == null) {
                    postError("DEVICE_NOT_FOUND: " + address);
                    return;
                }

                Log.i(TAG, "Connecting to " + address + "...");
                AndroidBluetoothSocket socket = btAdapter.createSocket(device);
                socket.connect(); // blocking

                registerLink(key, socket, true);
                Log.i(TAG, "Connected to " + address);

            } catch (Exception e) {
                Log.e(TAG, "Connection failed to " + address, e);
                postError("CONNECTION_FAILED: " + address + " — " + e.getMessage());
            }
        });
    }

    /** Disconnect from a specific peer. */
    public void disconnect(String address) {
        String key = address.toLowerCase();
        ActiveLink link = links.remove(key);
        if (link != null) {
            link.close();
            Log.i(TAG, "Disconnected from " + address);
            if (listener != null) {
                mainHandler.post(() -> listener.onPeerDisconnected(key, "manual"));
            }
        }
    }

    /** Get the number of active connections. */
    public int getConnectionCount() {
        return links.size();
    }

    /** Get all connected peer addresses. */
    public Set<String> getConnectedPeers() {
        return links.keySet();
    }

    // ─── Packet Transmission ────────────────────────────────────────

    /**
     * Send a framed packet to a specific peer: [4-byte big-endian length][data].
     * @param address Bluetooth MAC address of the target peer
     * @param data raw NINE binary packet bytes
     * @return true if sent successfully, false if peer not connected or write failed
     */
    public boolean send(String address, byte[] data) {
        String key = address.toLowerCase();
        ActiveLink link = links.get(key);
        if (link == null || !link.isAlive()) {
            sendFailures.incrementAndGet();
            return false;
        }

        // Build framed buffer: [4-byte length][payload]
        byte[] frame = new byte[4 + data.length];
        ByteBuffer.wrap(frame).order(ByteOrder.BIG_ENDIAN).putInt(data.length);
        System.arraycopy(data, 0, frame, 4, data.length);

        try {
            link.socket.write(frame);
            bytesSent.addAndGet(data.length);
            packetsSent.incrementAndGet();
            return true;
        } catch (IOException e) {
            Log.e(TAG, "Send failed to " + address + ": " + e.getMessage());
            sendFailures.incrementAndGet();
            handleLinkError(key, "write_failed: " + e.getMessage());
            return false;
        }
    }

    /**
     * Broadcast a framed packet to all connected peers.
     * @param data raw NINE binary packet bytes
     * @return number of peers the packet was successfully sent to
     */
    public int broadcast(byte[] data) {
        int count = 0;
        for (String key : links.keySet()) {
            if (send(key, data)) count++;
        }
        return count;
    }

    // ─── Accept Loop ────────────────────────────────────────────────

    private void startAcceptLoop() {
        acceptLoopRunning.set(true);
        executor.execute(() -> {
            Log.i(TAG, "Accept loop started.");
            while (acceptLoopRunning.get() && serverSocket != null && !serverSocket.isClosed()) {
                try {
                    AndroidBluetoothSocket socket = serverSocket.accept(); // blocking
                    if (!acceptLoopRunning.get()) {
                        socket.close();
                        break;
                    }
                    String address = socket.getRemoteAddress().toLowerCase();
                    // Reject duplicates and over-capacity
                    if (links.containsKey(address) || links.size() >= MAX_CONNECTIONS) {
                        socket.close();
                        continue;
                    }
                    registerLink(address, socket, false);
                    Log.i(TAG, "Accepted inbound connection from " + address);
                } catch (IOException e) {
                    if (acceptLoopRunning.get()) {
                        Log.e(TAG, "Accept loop error: " + e.getMessage());
                    }
                    break;
                }
            }
            Log.i(TAG, "Accept loop stopped.");
        });
    }

    // ─── Link Management ────────────────────────────────────────────

    private void registerLink(String key, AndroidBluetoothSocket socket, boolean outbound) {
        ActiveLink link = new ActiveLink(socket);
        links.put(key, link);

        // Notify listener on main thread
        if (listener != null) {
            mainHandler.post(() -> listener.onPeerConnected(key));
        }

        // Start read loop on background thread
        startReadLoop(key, link);
    }

    private void startReadLoop(String peerId, ActiveLink link) {
        executor.execute(() -> {
            Log.d(TAG, "Read loop started for " + peerId);
            try {
                while (link.isAlive()) {
                    // Read 4-byte length prefix
                    byte[] header = link.socket.read(4);
                    int payloadLength = ByteBuffer.wrap(header).order(ByteOrder.BIG_ENDIAN).getInt();

                    // Validate frame size
                    if (payloadLength < 0 || payloadLength > MAX_FRAME_SIZE) {
                        Log.e(TAG, "Frame too large from " + peerId + ": " + payloadLength);
                        handleLinkError(peerId, "FRAME_TOO_LARGE: " + payloadLength);
                        return;
                    }

                    // Read payload
                    byte[] payload;
                    if (payloadLength == 0) {
                        payload = new byte[0];
                    } else {
                        payload = link.socket.read(payloadLength);
                    }

                    // Deliver to listener on main thread
                    bytesReceived.addAndGet(payloadLength);
                    packetsReceived.incrementAndGet();
                    if (listener != null) {
                        final byte[] data = payload;
                        mainHandler.post(() -> listener.onDataReceived(peerId, data));
                    }
                }
            } catch (IOException e) {
                if (link.isAlive()) {
                    Log.d(TAG, "Read loop ended for " + peerId + ": " + e.getMessage());
                    handleLinkError(peerId, e.getMessage());
                }
            }
            Log.d(TAG, "Read loop exited for " + peerId);
        });
    }

    private void handleLinkError(String peerId, String reason) {
        ActiveLink link = links.remove(peerId);
        if (link != null) {
            link.close();
            if (listener != null) {
                mainHandler.post(() -> listener.onPeerDisconnected(peerId, reason));
            }
        }
    }

    // ─── Metrics ────────────────────────────────────────────────────

    public long getBytesSent() { return bytesSent.get(); }
    public long getBytesReceived() { return bytesReceived.get(); }
    public int getPacketsSent() { return packetsSent.get(); }
    public int getPacketsReceived() { return packetsReceived.get(); }
    public int getSendFailures() { return sendFailures.get(); }

    // ─── Helpers ────────────────────────────────────────────────────

    private void postError(String message) {
        Log.e(TAG, message);
        if (listener != null) {
            mainHandler.post(() -> listener.onTransportError(message));
        }
    }

    /** Get the current transport state. */
    public State getState() { return state; }

    /** Get the underlying adapter wrapper (for permission requests). */
    public AndroidBluetoothAdapter getAdapter() { return btAdapter; }

    // ─── ActiveLink (per-connection state) ──────────────────────────

    private static class ActiveLink {
        final AndroidBluetoothSocket socket;
        private volatile boolean closed = false;

        ActiveLink(AndroidBluetoothSocket socket) {
            this.socket = socket;
        }

        boolean isAlive() {
            return !closed && socket.isConnected();
        }

        void close() {
            if (closed) return;
            closed = true;
            socket.close();
        }
    }
}
