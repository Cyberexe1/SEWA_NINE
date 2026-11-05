# BluetoothTransport — Integration Report

## 1. BluetoothTransport Design

### 1.1 Architecture

```
┌─────────────────────────────────────────────────┐
│              Android Application                 │
│  BluetoothChatActivity (existing, untouched)     │
└───────────────────────┬─────────────────────────┘
                        │ (future: replace protocol)
┌───────────────────────┴─────────────────────────┐
│           ITransport (Java interface)            │
│  ─ Java port of core/transport/ITransport.ts ─  │
└───────────────────────┬─────────────────────────┘
                        │
┌───────────────────────┴─────────────────────────┐
│           BluetoothTransport (Java)              │
│  Wraps: BluetoothAdapter, BluetoothSocket,      │
│         RFCOMM, AcceptLoop, PeerLink, discovery  │
│  Transports: opaque byte[] only                  │
│  NEVER: routing, crypto, flooding, relay, ACK   │
└─────────────────────────────────────────────────┘
         │             │            │
   ┌─────┴─────┐ ┌────┴────┐ ┌────┴────┐
   │ PeerLink  │ │PeerLink │ │PeerLink │   (per connection)
   │ read loop │ │         │ │         │
   └───────────┘ └─────────┘ └─────────┘
```

### 1.2 Location

```
app/src/main/java/com/p2pchat/app/transport/
├── ITransport.java           ← Java interface (port of TS contract)
└── BluetoothTransport.java   ← Concrete implementation
```

Placed in an `app/transport/` subpackage of the existing `com.p2pchat.app` package. No new top-level packages invented.

### 1.3 Contract adherence

| ITransport method (TS)       | Java ITransport method       | BluetoothTransport implementation |
|------------------------------|------------------------------|-----------------------------------|
| `initialize(config?)`        | `initialize(callback)`       | Gets BluetoothAdapter, sets state to READY |
| `shutdown()`                 | `shutdown(callback)`         | Stops accept loop, closes all links |
| `startDiscovery()`           | `startDiscovery()`           | Registers BroadcastReceiver, calls adapter.startDiscovery() |
| `stopDiscovery()`            | `stopDiscovery()`            | Cancels discovery, unregisters receiver |
| `advertise(durationMs)`      | `advertise(durationMs)`      | Starts RFCOMM AcceptLoop |
| `connect(peerId)`            | `connect(peerId)`            | Background thread: createRfcommSocket → connect → PeerLink |
| `disconnect(peerId)`         | `disconnect(peerId)`         | Closes socket, removes from map |
| `getConnections()`           | `getConnectedPeers()`        | Returns connection map keys |
| `isConnected(peerId)`        | `isConnected(peerId)`        | Map lookup |
| `send(peerId, data: Buffer)` | `send(peerId, byte[])`       | Length-prefix frame write via PeerLink |
| `broadcast(data: Buffer)`    | `broadcast(byte[])`          | Iterates all PeerLinks, sends to each |
| `on(type, handler)`          | `setListener(listener)`      | Single listener (Java pattern) |
| `getMetrics()`               | `getMetrics()`               | Returns TransportMetrics snapshot |

### 1.4 Framing

Same as existing `Packet.writeTo`/`readFrom`:
```
[ 4-byte big-endian length ][ payload bytes ]
```
But the payload is now treated as **opaque** — no JSON assumption, no parsing.

### 1.5 What BluetoothTransport does NOT do

- Routing
- Encryption / decryption
- Packet parsing / creation
- Flooding / relay / forwarding
- Deduplication (seen-set)
- Acknowledgements / retransmission
- Security / key exchange
- Dual-path logic

---

## 2. Integration Report

### 2.1 Critical architectural finding

**NineCore is TypeScript. The Android app is Java.** There is no shared runtime. The `ITransport` from `core/transport/ITransport.ts` cannot be directly implemented by a Java class.

**Per `gateway/AndroidBridge/README.md`**, the protocol team's recommended approach for the BE prototype is **option 4**: the Android app implements the same protocol/transport contract in Java, using the TypeScript as the reference specification.

`BluetoothTransport` follows this approach: it is a faithful Java port of the `ITransport` interface contract, ready for either:
- A future Java NineCore port (directly consumes this interface), or
- A future bridge mechanism (WebSocket/JSON-RPC/native module per the gateway README options).

### 2.2 Existing Android code: UNCHANGED

| File | Modified? | Reason |
|------|-----------|--------|
| `BluetoothChatActivity.java` | NO | Existing behaviour preserved |
| `Packet.java` | NO | Still used by existing protocol |
| `Crypto.java` | NO | Still used by existing protocol |
| `NeighborManager` (inner class) | NO | Still used by existing protocol |
| `Link` (inner class) | NO | Still used by existing protocol |
| `AcceptThread` (inner class) | NO | Still used by existing protocol |
| `RelayService.java` | NO | Still used by relay mode |
| `OfflineRouter.java` | NO | Unrelated (maps) |
| `MainActivity.java` | NO | Startup only |

### 2.3 New files added

| File | Responsibility |
|------|---------------|
| `app/.../transport/ITransport.java` | Java interface mirroring the TS contract |
| `app/.../transport/BluetoothTransport.java` | Concrete implementation wrapping Android BT |

### 2.4 Identity mapping

| Android current | NineCore equivalent | BluetoothTransport |
|-----------------|--------------------|--------------------|
| `deviceId` (UUID string, per-install) | `PeerID` (branded string) | Uses Bluetooth MAC address as `peerId` (unique per physical device; stable) |

The MAC → PeerID mapping is straightforward and bijective. If NineCore's `PeerID` needs to be the install-UUID rather than MAC, a mapping table in the transport is the clean seam.

---

## 3. Sequence Diagram

### 3.1 Send (future NineCore path)

```
UI                NineCore              BluetoothTransport       Remote
│ sendMessage()   │                     │                        │
│────────────────►│ encrypt + route     │                        │
│                 │─────────────────────►│ send(peerId, bytes)   │
│                 │                     │────── frame write ─────►│
│                 │                     │                        │
```

### 3.2 Receive (future NineCore path)

```
Remote          BluetoothTransport       NineCore               UI
│               │                        │                      │
│── frame ─────►│ onDataReceived         │                      │
│               │────────────────────────►│ decrypt + deliver   │
│               │                        │─────────────────────►│
│               │                        │                      │
```

### 3.3 Current (today, no NineCore active)

```
UI            BluetoothChatActivity     NeighborManager/Link    Remote
│ sendMessage()│                         │                      │
│─────────────►│ Packet+Crypto+broadcast │                      │
│              │─────────────────────────►│ Packet.writeTo ─────►│
│              │                         │                      │
│              │                         │◄── Packet.readFrom ──│
│              │◄─ onLinkPacket ─────────│                      │
│◄─ display ──│                         │                      │
```

Both paths coexist. BluetoothTransport is additive — it doesn't remove or modify the existing path.

---

## 4. Class Diagram

```
┌──────────────────────────────────────────────┐
│           «interface» ITransport             │
├──────────────────────────────────────────────┤
│ +initialize(callback)                        │
│ +shutdown(callback)                          │
│ +startDiscovery()                            │
│ +stopDiscovery()                             │
│ +advertise(durationMs)                       │
│ +connect(peerId)                             │
│ +disconnect(peerId)                          │
│ +getConnectedPeers(): String[]               │
│ +isConnected(peerId): boolean                │
│ +send(peerId, data: byte[])                  │
│ +broadcast(data: byte[])                     │
│ +setListener(listener)                       │
│ +getMetrics(): TransportMetrics              │
│ +getState(): String                          │
├──────────────────────────────────────────────┤
│ «inner» TransportCallback                    │
│ «inner» TransportListener                    │
│ «inner» TransportMetrics                     │
└──────────────────┬───────────────────────────┘
                   │ implements
┌──────────────────┴───────────────────────────┐
│          BluetoothTransport                  │
├──────────────────────────────────────────────┤
│ -adapter: BluetoothAdapter                   │
│ -connections: ConcurrentHashMap<PeerLink>     │
│ -metrics: TransportMetrics                   │
│ -acceptLoop: AcceptLoop                      │
│ -discoveryReceiver: BroadcastReceiver        │
│ -listener: TransportListener                 │
│ -state: String                               │
├──────────────────────────────────────────────┤
│ «inner» AcceptLoop extends Thread            │
│ «inner» PeerLink extends Thread              │
└──────────────────────────────────────────────┘
```

---

## 5. List of Modified Files

| File | Change |
|------|--------|
| `app/src/main/java/com/p2pchat/app/transport/ITransport.java` | **NEW** |
| `app/src/main/java/com/p2pchat/app/transport/BluetoothTransport.java` | **NEW** |

**Zero existing files were modified.**

---

## 6. Transport Metrics

`BluetoothTransport` tracks (in `TransportMetrics`):
- `bytesSent` / `bytesReceived`
- `packetsSent` / `packetsReceived`
- `sendFailures`
- `connectionsEstablished` / `connectionsLost`
- `peersDiscovered`

Accessible via `getMetrics()`.

---

## 7. Known Limitations

| # | Limitation | Severity | Notes |
|---|-----------|----------|-------|
| 1 | **No NineCore runtime exists on Android yet** — BluetoothTransport is ready but has no consumer | Expected | By design: transport is prepared for future integration |
| 2 | **Bluetooth Classic Class 2 range ≈ 10m** | Physical | Not a software issue; relay mode extends range |
| 3 | **RFCOMM piconet limit: ~7 simultaneous links** | Hardware | Sufficient for 4-5 device mesh |
| 4 | **No chunking for payloads > RFCOMM buffer** | Medium | MAX_FRAME = 1MB guard; RFCOMM handles internally |
| 5 | **PeerId = Bluetooth MAC** | Design choice | May need mapping if NineCore uses install-UUID as PeerID |
| 6 | **No reconnection logic** | Low | PeerLink drops on disconnect; reconnect is caller's responsibility |
| 7 | **Single listener pattern** | Low | Java simplicity; can be extended to multi-listener if needed |
| 8 | **Android 12+ requires BLUETOOTH_CONNECT/SCAN/ADVERTISE** | Expected | Already declared in AndroidManifest.xml |

---

## 8. Success Criteria Verification

| Criterion | Status |
|-----------|--------|
| Android application behaves exactly as before | ✓ Zero files modified |
| NineCore protocol remains unchanged | ✓ No protocol files touched |
| BluetoothTransport is the only new transport | ✓ 2 new files in `transport/` package |
| Android capable of transporting raw NINE protocol packets | ✓ `send(peerId, byte[])` accepts any opaque bytes |
| No UI redesign | ✓ |
| No protocol redesign | ✓ |
| No unnecessary refactoring | ✓ Only additive |
