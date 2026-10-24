# NINE Transport Layer Specification

## Document Metadata

| Field | Value |
|-------|-------|
| Version | 0.1.0 |
| Status | Draft |
| Date | 2026-07-15 |
| Authors | NINE Team |

---

## 1. Overview

The transport layer is the lowest layer in the NINE stack that deals with actual data transmission. It abstracts the physical communication medium so that the protocol, routing, and security layers never need to know whether bytes are traveling over Bluetooth, Wi-Fi Direct, or a simulated channel.

---

## 2. Design Principle: Medium Agnosticism

The NINE protocol must work identically over:

- Wi-Fi Direct (primary — higher bandwidth, longer range)
- Bluetooth Classic (fallback — lower bandwidth, shorter range)
- BLE (future — low power discovery)
- LoRa (future — long range, very low bandwidth)
- Simulated channel (testing — in-process message passing)

The transport layer achieves this by defining a **Transport Adapter** interface that each medium implements independently.

---

## 3. Transport Adapter Interface

```typescript
interface TransportAdapter {
  readonly type: TransportType;
  readonly status: TransportStatus;

  // Lifecycle
  initialize(config: TransportConfig): Promise<void>;
  shutdown(): Promise<void>;

  // Discovery
  startDiscovery(): void;
  stopDiscovery(): void;
  makeDiscoverable(duration: number): void;

  // Connection management
  connect(peerId: PeerID): Promise<Connection>;
  disconnect(peerId: PeerID): Promise<void>;
  getConnections(): Connection[];

  // Data transfer
  send(peerId: PeerID, data: Buffer): Promise<SendResult>;
  broadcast(data: Buffer): Promise<void>;

  // Events
  on(event: TransportEvent, callback: TransportCallback): void;
  off(event: TransportEvent, callback: TransportCallback): void;
}
```

---

## 4. Transport Events

```typescript
enum TransportEvent {
  PEER_DISCOVERED = 'peer_discovered',
  PEER_LOST = 'peer_lost',
  CONNECTION_ESTABLISHED = 'connection_established',
  CONNECTION_LOST = 'connection_lost',
  DATA_RECEIVED = 'data_received',
  SEND_FAILED = 'send_failed',
  ADAPTER_ERROR = 'adapter_error',
}
```

---

## 5. Connection Object

```typescript
interface Connection {
  peerId: PeerID;
  transportType: TransportType;
  establishedAt: Timestamp;
  lastActivityAt: Timestamp;
  quality: LinkQuality;
  state: ConnectionState;
}

interface LinkQuality {
  rssi: number;          // Signal strength (if available)
  throughput: number;    // Estimated bytes/sec
  latency: number;       // Estimated RTT in ms
  reliability: number;   // 0.0 to 1.0 (packet delivery ratio)
}

enum ConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
}
```

---

## 6. Transport Types

### 6.1 Wi-Fi Direct Adapter

| Property | Value |
|----------|-------|
| Range | ~50-200 meters (line of sight) |
| Bandwidth | Up to 250 Mbps |
| Latency | ~5-20ms |
| Power | High |
| Connections | Up to ~8 simultaneous peers |

Wi-Fi Direct forms a P2P group where one device acts as Group Owner (GO). For NINE:
- The node with higher capability score becomes GO.
- GO assignment does not affect protocol behavior (all nodes are equal at protocol level).

### 6.2 Bluetooth Classic Adapter

| Property | Value |
|----------|-------|
| Range | ~10 meters (practical) |
| Bandwidth | ~2-3 Mbps |
| Latency | ~20-100ms |
| Power | Medium |
| Connections | Up to 7 simultaneous peers |

Uses RFCOMM sockets for reliable stream-based communication.

### 6.3 BLE Adapter (Future)

| Property | Value |
|----------|-------|
| Range | ~50 meters |
| Bandwidth | ~125 Kbps - 2 Mbps |
| Latency | ~10-50ms |
| Power | Very low |
| Connections | Limited (characteristic-based) |

Used primarily for discovery and small control messages. Large payloads should use Wi-Fi Direct or Bluetooth Classic.

### 6.4 Simulated Adapter

| Property | Value |
|----------|-------|
| Range | Configurable |
| Bandwidth | Unlimited |
| Latency | Configurable (0-5000ms) |
| Power | N/A |
| Connections | Unlimited |

In-process message passing between virtual nodes. Used for testing routing algorithms, protocol behavior, and failure scenarios without physical hardware.

---

## 7. Adapter Selection and Fallback

The transport layer supports multiple simultaneous adapters with priority-based selection:

```
Priority 1: Wi-Fi Direct (if available and connected)
Priority 2: Bluetooth Classic (fallback)
Priority 3: BLE (discovery only, or small packets)
```

### Fallback Rules

1. If Wi-Fi Direct connection fails → attempt Bluetooth.
2. If a peer is reachable via multiple transports → use highest priority.
3. If highest priority link degrades below quality threshold → switch to next.
4. Discovery runs on ALL available adapters simultaneously.

---

## 8. Framing Protocol

Raw bytes from the protocol layer must be framed for transport. The transport layer adds a simple frame wrapper:

```
┌────────────────────────────────────────┐
│  Field        │  Size    │  Purpose    │
├───────────────┼──────────┼─────────────┤
│  MAGIC        │  2 bytes │  0x4E39     │
│  frameLength  │  4 bytes │  Total size │
│  payload      │  N bytes │  Packet data│
│  MAGIC_END    │  2 bytes │  0x394E     │
└────────────────────────────────────────┘
```

- `MAGIC` (0x4E39 = "N9" in ASCII) marks the start of a frame.
- `MAGIC_END` (0x394E) marks the end.
- This allows recovery from stream corruption by scanning for frame boundaries.

---

## 9. Flow Management

### 9.1 Send Queue

Each connection maintains a send queue:

- Maximum queue depth: 128 packets.
- If queue is full, new packets are dropped with `QUEUE_FULL` error.
- Priority packets (ROUTE_ERROR, ACK) jump to front of queue.

### 9.2 Receive Buffer

Incoming bytes are accumulated in a receive buffer until a complete frame is detected (MAGIC → frameLength → payload → MAGIC_END).

Incomplete frames that exceed `FRAME_TIMEOUT_MS` (5000ms) are discarded.

---

## 10. Error Handling

| Error | Behavior |
|-------|----------|
| Send failure | Retry once, then report to routing layer |
| Connection drop | Emit CONNECTION_LOST event, notify routing layer |
| Corrupted frame | Discard, scan for next MAGIC marker |
| Queue full | Drop packet, emit SEND_FAILED event |
| Adapter unavailable | Skip, try next adapter |

---

## 11. Transport Manager

The Transport Manager coordinates multiple adapters:

```typescript
interface TransportManager {
  // Register adapters
  registerAdapter(adapter: TransportAdapter): void;
  removeAdapter(type: TransportType): void;

  // Unified send (auto-selects best adapter)
  send(peerId: PeerID, data: Buffer): Promise<SendResult>;
  broadcast(data: Buffer): Promise<void>;

  // Unified discovery
  startDiscovery(): void;
  stopDiscovery(): void;

  // Connection info
  getConnectedPeers(): PeerInfo[];
  getConnectionForPeer(peerId: PeerID): Connection | null;

  // Events (unified from all adapters)
  on(event: TransportEvent, callback: TransportCallback): void;
  off(event: TransportEvent, callback: TransportCallback): void;
}
```

---

## 12. Platform Implementation Notes

### Android (Mobile Nodes)

- Wi-Fi Direct: Use Android `WifiP2pManager` API.
- Bluetooth: Use Android `BluetoothSocket` (RFCOMM).
- The Android app provides platform-specific adapter implementations that conform to the `TransportAdapter` interface.

### Desktop (Admin Node)

- Wi-Fi Direct: Platform-dependent (Windows Wi-Fi Direct API, or external library).
- Bluetooth: Node.js `noble`/`bleno` or platform-specific bindings.
- Primary transport for Admin may be Wi-Fi Direct with Bluetooth fallback.

### Simulator

- No platform APIs needed.
- Simulated adapter uses in-process event emitters.
- Configurable latency, packet loss, and bandwidth limitations.

---

## 13. Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| FRAME_MAGIC | 0x4E39 | Frame start marker |
| FRAME_MAGIC_END | 0x394E | Frame end marker |
| MAX_FRAME_SIZE | 8192 | Maximum frame size in bytes |
| FRAME_TIMEOUT_MS | 5000 | Incomplete frame discard timeout |
| SEND_QUEUE_SIZE | 128 | Maximum queued packets per connection |
| SEND_RETRY_COUNT | 1 | Retries before reporting failure |
| DISCOVERY_INTERVAL_MS | 10000 | How often to scan for peers |
| DISCOVERABLE_DURATION_MS | 30000 | How long to remain discoverable |
| MIN_LINK_QUALITY | 0.3 | Below this, trigger fallback |
