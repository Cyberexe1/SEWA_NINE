package com.p2pchat.app.transport;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * BluetoothTransport — implements ITransport wrapping Android Bluetooth RFCOMM.
 *
 * STRICT RULES:
 * - This class NEVER performs routing, encryption, packet parsing, packet creation,
 *   flooding, relay, ACK, security, or dual-path logic.
 * - It transports OPAQUE BYTE ARRAYS only.
 * - It reuses existing Android Bluetooth APIs (BluetoothAdapter, BluetoothSocket,
 *   RFCOMM) without rewriting them.
 *
 * Framing: [4-byte big-endian length][payload bytes] — same scheme as the existing
 * Packet.writeTo/readFrom, but here the payload is opaque (not JSON).
 *
 * Threading: one read thread per connection (PeerLink). Inbound data is delivered
 * to the listener on the main thread via Handler.
 */
public class BluetoothTransport implements ITransport {

    private static final String TAG = "BT_Transport";
    private static final UUID SERVICE_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String SERVICE_NAME = "NINE_BT";
    private static final int MAX_FRAME = 1_000_000;

    // --- State ---
    private String state = "uninitialized";
    private BluetoothAdapter adapter;
    private Context context;
    private Handler mainHandler;
    private TransportListener listener;
    private AcceptLoop acceptLoop;
    private BroadcastReceiver discoveryReceiver;

    // --- Connections (keyed by peerId = Bluetooth MAC or mapped ID) ---
    private final ConcurrentHashMap<String, PeerLink> connections = new ConcurrentHashMap<>();

    // --- Metrics ---
    private final TransportMetrics metrics = new TransportMetrics();

    public BluetoothTransport(Context context) {
        this.context = context.getApplicationContext();
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    // ═══════════════════════════════════════════════════════════════════
    //  ITransport Lifecycle
    // ═══════════════════════════════════════════════════════════════════

    @Override
    public void initialize(TransportCallback callback) {
        adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            state = "error";
            if (callback != null) callback.onError("Bluetooth not supported");
            return;
        }
        state = "ready";
        if (callback != null) callback.onSuccess();
    }

    @Override
    public void shutdown(TransportCallback callback) {
        stopDiscovery();
        stopAccept();
        for (PeerLink link : connections.values()) {
            link.close();
        }
        connections.clear();
        state = "shutdown";
        if (callback != null) callback.onSuccess();
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Discovery & Advertisement
    // ═══════════════════════════════════════════════════════════════════

    @Override
    public void startDiscovery() {
        if (adapter == null) return;
        registerDiscoveryReceiver();
        try {
            if (adapter.isDiscovering()) adapter.cancelDiscovery();
            adapter.startDiscovery();
            state = "discovering";
        } catch (SecurityException e) {
            emitError("Discovery permission denied: " + e.getMessage());
        }
    }

    @Override
    public void stopDiscovery() {
        if (adapter == null) return;
        try {
            if (adapter.isDiscovering()) adapter.cancelDiscovery();
        } catch (SecurityException ignored) {}
        unregisterDiscoveryReceiver();
        if ("discovering".equals(state)) state = "ready";
    }

    @Override
    public void advertise(int durationMs) {
        // Start the RFCOMM accept loop (makes us connectable).
        // Android discoverability requires a system intent handled by the caller.
        startAccept();
        state = "advertising";
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Connection Management
    // ═══════════════════════════════════════════════════════════════════

    @Override
    public void connect(final String peerId) {
        if (adapter == null || peerId == null) return;
        if (connections.containsKey(peerId)) return; // already connected

        new Thread(() -> {
            try {
                BluetoothDevice device = adapter.getRemoteDevice(peerId);
                BluetoothSocket socket = device.createRfcommSocketToServiceRecord(SERVICE_UUID);
                try { if (adapter.isDiscovering()) adapter.cancelDiscovery(); } catch (SecurityException ignored) {}
                socket.connect();
                PeerLink link = new PeerLink(peerId, socket);
                connections.put(peerId, link);
                link.start();
                metrics.connectionsEstablished++;
                emitConnectionEstablished(peerId);
            } catch (IOException | SecurityException e) {
                Log.e(TAG, "Connect failed to " + peerId, e);
                emitSendFailed(peerId, "connect_failed: " + e.getMessage());
            }
        }).start();
    }

    @Override
    public void disconnect(String peerId) {
        PeerLink link = connections.remove(peerId);
        if (link != null) {
            link.close();
            metrics.connectionsLost++;
            emitConnectionLost(peerId, "disconnect_requested");
        }
    }

    @Override
    public String[] getConnectedPeers() {
        return connections.keySet().toArray(new String[0]);
    }

    @Override
    public boolean isConnected(String peerId) {
        return connections.containsKey(peerId);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Data Transfer — opaque bytes only
    // ═══════════════════════════════════════════════════════════════════

    @Override
    public void send(String peerId, byte[] data) {
        PeerLink link = connections.get(peerId);
        if (link == null) {
            metrics.sendFailures++;
            emitSendFailed(peerId, "not_connected");
            return;
        }
        link.send(data);
    }

    @Override
    public void broadcast(byte[] data) {
        for (PeerLink link : connections.values()) {
            link.send(data);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Events
    // ═══════════════════════════════════════════════════════════════════

    @Override
    public void setListener(TransportListener listener) {
        this.listener = listener;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Metrics & State
    // ═══════════════════════════════════════════════════════════════════

    @Override
    public TransportMetrics getMetrics() {
        return metrics;
    }

    @Override
    public String getState() {
        return state;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Accept Loop (server)
    // ═══════════════════════════════════════════════════════════════════

    private void startAccept() {
        if (acceptLoop != null) return;
        acceptLoop = new AcceptLoop();
        acceptLoop.start();
    }

    private void stopAccept() {
        if (acceptLoop != null) {
            acceptLoop.cancel();
            acceptLoop = null;
        }
    }

    private class AcceptLoop extends Thread {
        private BluetoothServerSocket serverSocket;
        private volatile boolean running = true;

        AcceptLoop() {
            try {
                serverSocket = adapter.listenUsingRfcommWithServiceRecord(SERVICE_NAME, SERVICE_UUID);
            } catch (IOException | SecurityException e) {
                Log.e(TAG, "AcceptLoop: cannot create server socket", e);
                running = false;
            }
        }

        @Override
        public void run() {
            while (running && serverSocket != null) {
                try {
                    BluetoothSocket socket = serverSocket.accept();
                    if (socket != null) {
                        String peerId = socket.getRemoteDevice().getAddress();
                        PeerLink link = new PeerLink(peerId, socket);
                        connections.put(peerId, link);
                        link.start();
                        metrics.connectionsEstablished++;
                        emitConnectionEstablished(peerId);
                    }
                } catch (IOException e) {
                    if (running) Log.e(TAG, "AcceptLoop: accept failed", e);
                    break;
                } catch (SecurityException e) {
                    Log.e(TAG, "AcceptLoop: permission error", e);
                    break;
                }
            }
        }

        void cancel() {
            running = false;
            try { if (serverSocket != null) serverSocket.close(); } catch (IOException ignored) {}
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Per-Peer Link (read thread + write)
    // ═══════════════════════════════════════════════════════════════════

    private class PeerLink extends Thread {
        private final String peerId;
        private final BluetoothSocket socket;
        private DataInputStream in;
        private DataOutputStream out;
        private volatile boolean closed = false;

        PeerLink(String peerId, BluetoothSocket socket) {
            this.peerId = peerId;
            this.socket = socket;
            try {
                in = new DataInputStream(socket.getInputStream());
                out = new DataOutputStream(socket.getOutputStream());
            } catch (IOException e) {
                Log.e(TAG, "PeerLink: stream creation failed", e);
            }
        }

        @Override
        public void run() {
            while (!closed) {
                try {
                    int len = in.readInt();
                    if (len <= 0 || len > MAX_FRAME) {
                        throw new IOException("Invalid frame length: " + len);
                    }
                    byte[] data = new byte[len];
                    in.readFully(data);
                    metrics.bytesReceived += data.length;
                    metrics.packetsReceived++;
                    emitDataReceived(peerId, data);
                } catch (IOException e) {
                    if (!closed) {
                        connections.remove(peerId);
                        metrics.connectionsLost++;
                        emitConnectionLost(peerId, e.getMessage());
                    }
                    break;
                }
            }
        }

        void send(byte[] data) {
            if (closed || out == null) {
                metrics.sendFailures++;
                emitSendFailed(peerId, "link_closed");
                return;
            }
            try {
                synchronized (out) {
                    out.writeInt(data.length);
                    out.write(data);
                    out.flush();
                }
                metrics.bytesSent += data.length;
                metrics.packetsSent++;
            } catch (IOException e) {
                metrics.sendFailures++;
                emitSendFailed(peerId, e.getMessage());
            }
        }

        void close() {
            closed = true;
            try { socket.close(); } catch (IOException ignored) {}
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Discovery Receiver
    // ═══════════════════════════════════════════════════════════════════

    private void registerDiscoveryReceiver() {
        if (discoveryReceiver != null) return;
        discoveryReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                if (BluetoothDevice.ACTION_FOUND.equals(intent.getAction())) {
                    BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    if (device != null) {
                        String peerId = device.getAddress();
                        String name;
                        try {
                            name = device.getName();
                        } catch (SecurityException e) {
                            name = null;
                        }
                        metrics.peersDiscovered++;
                        emitPeerDiscovered(peerId, name);
                    }
                }
            }
        };
        IntentFilter filter = new IntentFilter(BluetoothDevice.ACTION_FOUND);
        context.registerReceiver(discoveryReceiver, filter);
    }

    private void unregisterDiscoveryReceiver() {
        if (discoveryReceiver != null) {
            try { context.unregisterReceiver(discoveryReceiver); } catch (Exception ignored) {}
            discoveryReceiver = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Event emission (all on main thread)
    // ═══════════════════════════════════════════════════════════════════

    private void emitPeerDiscovered(String peerId, String name) {
        mainHandler.post(() -> { if (listener != null) listener.onPeerDiscovered(peerId, name); });
    }

    private void emitConnectionEstablished(String peerId) {
        mainHandler.post(() -> { if (listener != null) listener.onConnectionEstablished(peerId); });
    }

    private void emitConnectionLost(String peerId, String reason) {
        mainHandler.post(() -> { if (listener != null) listener.onConnectionLost(peerId, reason); });
    }

    private void emitDataReceived(String peerId, byte[] data) {
        mainHandler.post(() -> { if (listener != null) listener.onDataReceived(peerId, data); });
    }

    private void emitSendFailed(String peerId, String reason) {
        mainHandler.post(() -> { if (listener != null) listener.onSendFailed(peerId, reason); });
    }

    private void emitError(String message) {
        mainHandler.post(() -> { if (listener != null) listener.onError(message); });
    }
}
