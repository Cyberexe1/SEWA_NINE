# NINE Bluetooth Transport — API Reference

## Document Metadata

| Field | Value |
|-------|-------|
| Status | **STABLE** — API frozen at Phase 9.8 |
| Date | 2026-07-18 |
| Test coverage | 121 transport unit tests + 11 NineCore integration tests |
| Total project tests | 560 (all passing) |

---

## 1. Overall Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                         NineCore                               │
│  (protocol logic: routing, security, messaging)               │
├───────────────────────────────────────────────────────────────┤
│                      TransportManager                          │
│  (registers transports, forwards events, selects best path)   │
├───────────────────────────────────────────────────────────────┤
│                    BluetoothTransport                          │
│  (implements ITransport — lifecycle, discovery, connections,   │
│   framed send/receive, metrics, events, connection policy)    │
├──────────────┬───────────────┬────────────────────────────────┤
│ BluetoothLink│ AcceptLoop    │ DiscoveryManager │ ConnPolicy  │
│ (per-peer    │ (server loop) │ (scan tracking)  │ (backoff/   │
│  socket I/O) │               │                  │  capacity)  │
├──────────────┴───────────────┴────────────────────────────────┤
│               IBluetoothAdapter (platform bridge)             │
│  (injected — Android impl or mock for tests)                  │
└───────────────────────────────────────────────────────────────┘
```

All Bluetooth-specific operations are behind the `IBluetoothAdapter` abstraction. The entire stack is testable without hardware.

---

## 2. Class Responsibilities

| Class | File | Responsibility |
|-------|------|----------------|
| `BluetoothTransport` | `BluetoothTransport.ts` | Top-level `ITransport` implementation. Orchestrates all subsystems. |
| `BluetoothLink` | `BluetoothLink.ts` | One RFCOMM connection: connect, close, framed write, framed read loop. |
| `BluetoothAcceptLoop` | `BluetoothAcceptLoop.ts` | Server socket accept loop for inbound connections. |
| `BluetoothDiscoveryManager` | `BluetoothDiscovery.ts` | Discovery scan lifecycle, duplicate suppression, timeout. |
| `ConnectionPolicy` | `ConnectionPolicy.ts` | Max peers, backoff, blacklisting, reconnect cooldown. |
| `PeerIdMapper` | `PeerIdMapper.ts` | Bidirectional PeerID ↔ NodeID mapping. |

---

## 3. Public APIs

### 3.1 BluetoothTransport (implements ITransport)

```typescript
// Construction
new BluetoothTransport(adapter: IBluetoothAdapter, options?: {
  connectTimeoutMs?: number;       // default 12000
  discoveryTimeoutMs?: number;     // default 12000
  connectionPolicy?: Partial<ConnectionPolicyConfig>;
})

// ITransport — Lifecycle
initialize(config?: TransportConfig): Promise<void>
shutdown(): Promise<void>

// ITransport — Discovery
startDiscovery(): Promise<void>
stopDiscovery(): Promise<void>
advertise(durationMs: number): Promise<void>

// ITransport — Connections
connect(peerId: PeerID): Promise<PeerConnection>
disconnect(peerId: PeerID): Promise<void>
getConnections(): PeerConnection[]
getConnection(peerId: PeerID): PeerConnection | undefined
isConnected(peerId: PeerID): boolean

// ITransport — Data Transfer
send(peerId: PeerID, data: Buffer): Promise<SendResult>
broadcast(data: Buffer): Promise<number>

// ITransport — Events
on(type: TransportEventType, handler: TransportEventHandler): void
off(type: TransportEventType, handler: TransportEventHandler): void

// ITransport — Metrics
getMetrics(): TransportMetricsSnapshot

// Bluetooth-specific (platform integration)
reportDeviceFound(peerId: PeerID, displayName?: string, rssi?: number): void
reportDiscoveryFinished(): void
getDiscoveredPeers(): Array<{ peerId: PeerID; displayName?: string }>
getLink(peerId: PeerID): BluetoothLink | undefined

// Readonly properties
readonly type: TransportType              // 'bluetooth_classic'
readonly capabilities: TransportCapabilities
readonly state: TransportState
readonly peerIdMapper: PeerIdMapper
readonly connectionPolicy: ConnectionPolicy
```

### 3.2 BluetoothLink

```typescript
new BluetoothLink(socket: IBluetoothSocket, peerId: PeerID, initiatedByUs: boolean)

connect(): Promise<void>                           // IDLE → CONNECTED or FAILED
close(): void                                      // any → CLOSED
isAlive(): boolean                                 // CONNECTED + socket.isConnected()
writeFrame(data: Buffer): Promise<void>            // [4-byte length][data]
startReadLoop(onFrame, onError): Promise<void>     // continuous frame reader

readonly state: LinkState
readonly peerId: PeerID
readonly initiatedByUs: boolean
readonly remoteAddress: string
static readonly MAX_FRAME_SIZE: 4096
```

### 3.3 BluetoothAcceptLoop

```typescript
new BluetoothAcceptLoop(serverSocket: IBluetoothServerSocket, onAccepted: AcceptCallback)

start(): Promise<void>     // runs until cancel() or server socket error
cancel(): void             // stops accepting, closes server socket

readonly running: boolean
```

### 3.4 BluetoothDiscoveryManager

```typescript
new BluetoothDiscoveryManager(config: {
  onPeerDiscovered: PeerDiscoveredCallback;
  onFinished: DiscoveryFinishedCallback;
  timeoutMs?: number;       // default 12000
})

start(): void
stop(): void
reportDeviceFound(peerId, displayName?, rssi?): void
reportDiscoveryFinished(): void
getDiscoveredPeers(): DiscoveredPeer[]
hasDiscovered(peerId: PeerID): boolean
clear(): void

readonly active: boolean
readonly discoveredCount: number
```

### 3.5 ConnectionPolicy

```typescript
new ConnectionPolicy(config?: Partial<ConnectionPolicyConfig>)

shouldConnect(peerId, now?): { allowed: boolean; reason?: string }
shouldAcceptInbound(peerId): { allowed: boolean; reason?: string }
recordConnected(peerId): void
recordFailure(peerId, now?): void
recordDisconnected(peerId, now?): void
isBlacklisted(peerId): boolean
getBackoffMs(peerId): number
getFailureCount(peerId): number
resetPeer(peerId): void
clear(): void

readonly activeCount: number
readonly maxConnections: number
```

### 3.6 PeerIdMapper

```typescript
new PeerIdMapper()

register(peerId, nodeId): void
getNodeId(peerId): NodeID | undefined
getPeerId(nodeId): PeerID | undefined
removeByPeerId(peerId): void
removeByNodeId(nodeId): void
hasPeerId(peerId): boolean
hasNodeId(nodeId): boolean
size(): number
clear(): void
```

---

## 4. Lifecycle

```
UNINITIALIZED ─── initialize() ───► INITIALIZING ───► READY
                                                        │
                              ┌──────────────────────────┤
                              │                          │
                              ▼                          ▼
                        DISCOVERING              ADVERTISING
                              │                          │
                              └──────────┬───────────────┘
                                         │ (timeout/stop/done)
                                         ▼
                                       READY ──── shutdown() ───► SHUTDOWN
                                         │
                                       ERROR ──── shutdown() ───► SHUTDOWN
```

---

## 5. State Transitions

### Transport State (BluetoothTransport)
| From | To | Trigger |
|------|-----|---------|
| UNINITIALIZED | INITIALIZING | `initialize()` called |
| INITIALIZING | READY | Adapter enabled, accept loop started |
| INITIALIZING | ERROR | Adapter disabled |
| READY | DISCOVERING | `startDiscovery()` |
| READY | ADVERTISING | `advertise()` |
| READY | SHUTDOWN | `shutdown()` |
| DISCOVERING | READY | `stopDiscovery()` / timeout / scan finished |
| ADVERTISING | READY | Duration expired / `shutdown()` |
| Any operational | SHUTDOWN | `shutdown()` |

### Link State (BluetoothLink)
| From | To | Trigger |
|------|-----|---------|
| IDLE | CONNECTING | `connect()` called |
| CONNECTING | CONNECTED | Socket connected successfully |
| CONNECTING | FAILED | Socket connect threw |
| CONNECTED | CLOSING | `close()` called |
| CLOSING | CLOSED | Socket closed |
| Any | CLOSED | `close()` (idempotent) |

---

## 6. Packet Flow

### 6.1 Outbound

```
NineCore.sendBroadcast("msg")
  → RoutingEngine.sendPacket(packet, bytes)
    → transport.broadcast(bytes)  [fire-and-forget]
      → BluetoothTransport.broadcast(data)
        → for each connection: send(peerId, data)
          → link.writeFrame(data)
            → socket.write([4-byte length][data])
              → RFCOMM → radio → remote device
```

### 6.2 Inbound

```
Remote device → radio → RFCOMM → socket
  → BluetoothLink.startReadLoop()
    → socket.read(4) → length prefix
    → socket.read(length) → payload
    → onFrame(payload)
      → BluetoothTransport emits DATA_RECEIVED event
        → TransportManager forwards to NineCore handler
          → RoutingEngine.handleIncoming(peerId, data)
            → verifyChecksum → parse → dedup → dispatch
              → deliver to application (onBroadcast/onSecureMessage)
```

### 6.3 Wire Frame Format

```
┌──────────────────────────────────────┐
│  4 bytes   │  N bytes               │
│  (uint32   │  (raw NINE binary      │
│   big-     │   packet — header +    │
│   endian   │   payload + optional   │
│   length)  │   signature)           │
└──────────────────────────────────────┘
```

- Maximum payload per frame: 4096 bytes (enforced by `BluetoothLink.MAX_FRAME_SIZE`)
- Oversized frames: rejected, link closed, `CONNECTION_LOST` emitted
- Zero-length frames: valid (delivered as empty Buffer)

---

## 7. Connection Flow

### 7.1 Outbound Connection
1. `BluetoothTransport.connect(peerId)` called
2. `ConnectionPolicy.shouldConnect()` checked (capacity, backoff, blacklist)
3. `adapter.createSocket(peerId)` creates RFCOMM socket
4. `BluetoothLink` wraps socket, calls `socket.connect()` with timeout
5. On success: connection registered, `CONNECTION_ESTABLISHED` emitted, read loop started
6. On failure: link closed, `ConnectionPolicy.recordFailure()`, error thrown

### 7.2 Inbound Connection
1. `BluetoothAcceptLoop` calls `serverSocket.accept()`
2. Accepted socket delivered to `handleAcceptedSocket()`
3. Duplicate check (already connected → socket closed)
4. `ConnectionPolicy.shouldAcceptInbound()` checked (capacity, blacklist)
5. `BluetoothLink` wraps socket (already connected state)
6. Connection registered, `CONNECTION_ESTABLISHED` emitted, read loop started

### 7.3 Disconnection
1. `disconnect(peerId)` or read loop error
2. `BluetoothLink.close()` closes socket
3. Connection deregistered, `ConnectionPolicy.recordDisconnected()`
4. `PeerIdMapper` entry removed
5. `CONNECTION_LOST` emitted with reason

---

## 8. Discovery Flow

1. `startDiscovery()` transitions to DISCOVERING, creates `BluetoothDiscoveryManager`
2. `adapter.startDiscovery()` triggers platform-level scan
3. Platform layer calls `reportDeviceFound(peerId, name, rssi)` for each device
4. `BluetoothDiscoveryManager` suppresses duplicates, calls `onPeerDiscovered`
5. `BluetoothTransport` emits `PEER_DISCOVERED` event + updates metrics
6. Scan finishes: `reportDiscoveryFinished()` or timeout → transitions back to READY
7. `stopDiscovery()` cancels explicitly

---

## 9. Threading Model

Each `BluetoothLink` runs its own independent read loop (via `startReadLoop`). On Android this maps to one thread per connection (matching the existing `Link extends Thread` pattern). In the TypeScript implementation, each read loop is an independent async chain that doesn't block other links.

**Write path**: `writeFrame()` is called from whatever context invokes `send()` (typically the main event loop). The write itself is serialized per-link since RFCOMM stream writes are sequential.

**Event delivery**: All events (`DATA_RECEIVED`, `CONNECTION_LOST`, etc.) are emitted synchronously from the detecting context. On Android, these should be posted to the main thread via `Handler` before reaching NineCore to maintain single-threaded protocol state access.

---

## 10. Error Handling

| Error | Source | Response |
|-------|--------|----------|
| `BLUETOOTH_DISABLED` | `initialize()` when adapter off | State → ERROR, error thrown |
| `DISCOVERY_FAILED` | `startDiscovery()` adapter refuses | State → READY (reverted), error thrown |
| `ALREADY_CONNECTED` | `connect()` duplicate peer | Error thrown, no state change |
| `CONNECT_IN_PROGRESS` | `connect()` while connecting | Error thrown, no state change |
| `CONNECTION_DENIED` | Policy rejects (capacity/backoff/blacklist) | Error thrown, no state change |
| `CONNECTION_FAILED` | Socket connect timeout or error | Link closed, failure recorded, error thrown |
| `LINK_NOT_ALIVE` | `writeFrame()` on dead link | Error thrown, `SEND_FAILED` emitted |
| `FRAME_TOO_LARGE` | Read loop receives oversized frame | Link closed, `CONNECTION_LOST` emitted |
| Socket EOF | Remote closed connection | Read loop exits, `CONNECTION_LOST` emitted |
| Socket write error | RFCOMM failure mid-transmission | `SEND_FAILED` emitted with error reason |

---

## 11. Metrics

`getMetrics()` returns a `TransportMetricsSnapshot`:

| Metric | Tracked by |
|--------|-----------|
| `bytesSent` | Each successful `writeFrame()` |
| `bytesReceived` | Each frame delivered by read loop |
| `packetsSent` | Each successful `send()` call |
| `packetsReceived` | Each frame delivered by read loop |
| `sendFailures` | Each failed `send()` or denied connection |
| `connectionsEstablished` | Each successful connect (inbound + outbound) |
| `connectionsLost` | Each disconnect/failure/shutdown |
| `peersDiscovered` | Each new (non-duplicate) device reported during scan |

---

## 12. Known Limitations

| Limitation | Description | Future resolution |
|-----------|-------------|-------------------|
| No TransportHandshake | PeerID → NodeID mapping is not automatically established post-connect. Currently the mapper must be populated externally. | Implement a lightweight handshake frame (17 bytes: version + NodeID) immediately after RFCOMM connect. |
| No reconnection scheduler | `ConnectionPolicy` tracks backoff state but nothing automatically retries failed connections. | Implement a `ReconnectionScheduler` driven by `tick()` that attempts to restore broken links after backoff expires. |
| No RSSI-based link quality | Link quality is not tracked or used for routing selection. | Surface RSSI from discovery and periodic readings into `TransportCapabilities`/metrics. |
| Single server UUID | Only one RFCOMM service UUID is used. All NINE devices must use the same UUID. | Acceptable for the protocol's purposes — no change needed. |
| No frame-level ACK | RFCOMM provides TCP-like reliability, so the transport assumes ordered, reliable byte delivery. No application-level ACK at the frame layer. | Not needed — RFCOMM guarantees this. |
| Fire-and-forget async sends | NineCore's routing engine uses `void transport.send(...)`. Send failures are only observable via `SEND_FAILED` events, not via the routing engine's return value. | Acceptable — matches the protocol's best-effort delivery semantics. The ACK layer at the protocol level handles retransmission. |

---

## 13. Future Extension Points

| Extension | Where | How |
|-----------|-------|-----|
| Real Android adapter | `IBluetoothAdapter` impl | Wrap `BluetoothAdapter` + `BroadcastReceiver` |
| Wi-Fi Direct transport | New class implementing `ITransport` | Same pattern as `BluetoothTransport` with Wi-Fi Direct APIs |
| BLE transport | New class implementing `ITransport` | Characteristic-based I/O instead of RFCOMM streams |
| Transport handshake | `BluetoothTransport.connect()` / `handleAcceptedSocket()` | Send/receive 17-byte frame with NodeID after socket connect, populate `PeerIdMapper` automatically |
| Auto-connect on discovery | `BluetoothTransport.reportDeviceFound()` | Optionally call `connect()` for newly discovered peers (Relay Mode behavior) |
| Connection quality tracking | `BluetoothLink` | Track write latency, read throughput, surface as link quality metric |

---

## 14. Platform Abstraction Interfaces

These are the contracts that a real Android implementation must satisfy:

### IBluetoothAdapter
```typescript
interface IBluetoothAdapter {
  isEnabled(): boolean;
  startDiscovery(): boolean;
  cancelDiscovery(): void;
  requestDiscoverable(durationMs: number): void;
  createServerSocket(): IBluetoothServerSocket;
  createSocket(peerId: PeerID): IBluetoothSocket;
}
```

### IBluetoothSocket
```typescript
interface IBluetoothSocket {
  connect(): Promise<void>;
  close(): void;
  isConnected(): boolean;
  write(data: Buffer): Promise<void>;
  read(size: number): Promise<Buffer>;
  readonly remoteAddress: string;
}
```

### IBluetoothServerSocket
```typescript
interface IBluetoothServerSocket {
  accept(): Promise<IBluetoothSocket>;
  close(): void;
}
```

---

*End of Bluetooth Transport API documentation. API is frozen — no behavioral changes without explicit approval.*
