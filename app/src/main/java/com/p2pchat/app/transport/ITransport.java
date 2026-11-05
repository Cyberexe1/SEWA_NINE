package com.p2pchat.app.transport;

/**
 * Java port of the NineCore ITransport interface (core/transport/ITransport.ts).
 *
 * This is a faithful translation of the TypeScript contract into Java.
 * All protocol-layer logic (routing, encryption, packet creation, flooding,
 * relay, ACK, deduplication) is EXCLUDED. This interface moves opaque bytes only.
 *
 * NineCore's TypeScript ITransport uses Promises (async); the Java equivalent
 * uses callbacks since Android Bluetooth is inherently asynchronous and we
 * cannot block the main thread.
 */
public interface ITransport {

    // --- Types mirroring core/shared/Types.ts ---

    String TRANSPORT_TYPE = "bluetooth_classic"; // TransportType.BLUETOOTH_CLASSIC

    // --- Lifecycle ---

    void initialize(TransportCallback callback);

    void shutdown(TransportCallback callback);

    // --- Discovery & Advertisement ---

    void startDiscovery();

    void stopDiscovery();

    void advertise(int durationMs);

    // --- Connection Management ---

    void connect(String peerId);

    void disconnect(String peerId);

    String[] getConnectedPeers();

    boolean isConnected(String peerId);

    // --- Data Transfer (opaque bytes only — no protocol knowledge) ---

    void send(String peerId, byte[] data);

    void broadcast(byte[] data);

    // --- Events (mirrors TransportEvents.ts event types) ---

    void setListener(TransportListener listener);

    // --- Metrics ---

    TransportMetrics getMetrics();

    // --- State ---

    String getState(); // Returns TransportState values as string

    // --- Callback/Listener interfaces ---

    interface TransportCallback {
        void onSuccess();
        void onError(String error);
    }

    interface TransportListener {
        void onPeerDiscovered(String peerId, String displayName);
        void onPeerLost(String peerId);
        void onConnectionEstablished(String peerId);
        void onConnectionLost(String peerId, String reason);
        void onDataReceived(String peerId, byte[] data);
        void onSendFailed(String peerId, String reason);
        void onError(String message);
    }

    // --- Metrics snapshot (mirrors TransportMetrics.ts) ---

    class TransportMetrics {
        public long bytesSent;
        public long bytesReceived;
        public int packetsSent;
        public int packetsReceived;
        public int sendFailures;
        public int connectionsEstablished;
        public int connectionsLost;
        public int peersDiscovered;
    }
}
