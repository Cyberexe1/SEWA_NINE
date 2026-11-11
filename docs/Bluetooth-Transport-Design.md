# NINE — Bluetooth Transport Design

## Document Metadata

| Field | Value |
|-------|-------|
| Phase | 9.1 (design only — no implementation) |
| Date | 2026-07-17 |
| Status | Design proposal, awaiting approval |
| Prerequisite | Protocol-authority decision (PROJECT-STATE.md §6) |
| Constraint | No production code modified |

---

## 1. Current Android Bluetooth Architecture

### 1.1 Bluetooth Discovery

**Evidence**: `BluetoothChatActivity.discoverDevices()` (line 1384), `BroadcastReceiver receiver` (line 1773).

- Uses `bluetoothAdapter.startDiscovery()` — a system-level scan for nearby discoverable devices.
- Results arrive as `BluetoothDevice.ACTION_FOUND` intents on the main-thread `BroadcastReceiver`.
- Discovery is time-limited (~12 seconds by the OS) and must be explicitly restarted.
- In Relay Mode, `rescanTask` re-triggers discovery every 40 seconds (`RESCAN_INTERVAL_MS`).
- Found devices are accumulated in `discoveredDevices` (ArrayList).
- In auto-connect mode (`autoConnect = true`), every newly found device is immediately connected via `connectToDevice()`.

### 1.2 Connection Establishment

**Evidence**: `connectToDevice()` (line 1539), `AcceptThread` (line 1980).

**Outbound (client)**:
1. A new thread is spawned for each connection attempt.
2. `device.createRfcommSocketToServiceRecord(MY_UUID)` creates the RFCOMM socket.
3. `bluetoothAdapter.cancelDiscovery()` stops scanning (improves connection speed).
4. `socket.connect()` blocks until the remote accepts (or throws IOException).
5. On success, `neighborManager.addLink(socket, true)` wraps the socket in a `Link`.

**Inbound (server)**:
1. `AcceptThread` calls `bluetoothAdapter.listenUsingRfcommWithServiceRecord(APP_NAME, MY_UUID)`.
2. Runs an infinite loop calling `serverSocket.accept()` (blocking).
3. Each accepted socket is passed to `neighborManager.addLink(socket, false)`.

**UUID**: `00001101-0000-1000-8000-00805F9B34FB` (standard SPP profile).

### 1.3 RFCOMM Sockets

**Evidence**: `Link` inner class (line 1809).

- Each `Link` wraps one `BluetoothSocket` with `DataInputStream` / `DataOutputStream`.
- Streams are reliable, ordered, byte-oriented (TCP-like semantics over Bluetooth).
- No MTU fragmentation at the application level — RFCOMM handles segmentation internally.
- The socket is full-duplex: read and write can happen concurrently.

### 1.4 Thread Model

**Evidence**: `Link extends Thread` (line 1809), `connectToDevice` spawns `new Thread`, `AcceptThread extends Thread`.

| Thread | Purpose | Lifetime |
|--------|---------|----------|
| Main (UI) thread | UI updates, `Handler` periodic tasks (presence, retry, rescan) | Activity lifecycle |
| `AcceptThread` | Blocking `serverSocket.accept()` loop | Until `cancel()` or Activity destruction |
| One `Link` thread per neighbor | Blocking `dataIn.readInt()` / `readFully()` read loop | Until socket closes or IOException |
| Ad-hoc connect threads | One per `connectToDevice()` call; blocks on `socket.connect()` | Until connect succeeds/fails |

**Synchronization**:
- `NeighborManager.neighbors`: `ConcurrentHashMap` (thread-safe reads/writes).
- `NeighborManager.seen`: `synchronized` LinkedHashMap (dedup).
- `NeighborManager.registerPeer()`: `synchronized` method (duplicate-link resolution).
- UI updates: always posted via `mainHandler.post(Runnable)`.
- `DataOutputStream.writeTo`: `synchronized(out)` block inside `Link.writePacket`.

### 1.5 Packet Transmission

**Evidence**: `Link.writePacket()`, `Packet.writeTo(DataOutputStream)`.

1. Caller invokes `link.writePacket(pkt)` from any thread.
2. `Packet.writeTo()` serializes to JSON bytes, then writes `[4-byte big-endian length][UTF-8 JSON]`.
3. The write is synchronized on the `DataOutputStream` to prevent interleaving from concurrent callers.
4. `out.flush()` is called after each packet.

### 1.6 Packet Reception

**Evidence**: `Link.run()`, `Packet.readFrom(DataInputStream)`.

1. `Link.run()` loops forever calling `Packet.readFrom(dataIn)`.
2. `readFrom` reads a 4-byte big-endian length, then `readFully(len)` for the JSON body.
3. The parsed `Packet` is dispatched to `onLinkPacket(link, pkt)` on the Link's own thread.
4. `onLinkPacket` handles HELLO, MSG, ACK, PRESENCE, LOCATION — all protocol logic lives here.
5. UI updates are posted to `mainHandler`.

### 1.7 Connection Lifecycle

| Event | Detection | Response |
|-------|-----------|----------|
| New connection | `AcceptThread.accept()` or `connectToDevice()` | `addLink()` → `Link.start()` → send HELLO |
| HELLO received | `onLinkPacket` TYPE_HELLO | `registerPeer()` with dedup (lower-ID wins) |
| Normal operation | Continuous read loop | Process packets, relay |
| Link lost | `IOException` in `Link.run()` | `neighborManager.remove(this)` → `link.close()` → UI update |
| Graceful close | Activity `onDestroy` | `neighborManager.closeAll()` → `acceptThread.cancel()` |

### 1.8 Error Handling

- **IOException on read**: Link terminates, `neighborManager.remove(link)` cleans up.
- **IOException on write**: `Link.writePacket` catches the error, calls `neighborManager.remove(this)`.
- **SecurityException**: Logged, user-facing toast, operation aborted.
- **Duplicate connections**: `registerPeer()` keeps the link initiated by the device with the lexicographically lower `deviceId`, closes the other.
- **Discovery failure**: `startDiscovery()` returning `false` triggers a diagnostic dialog.
- **No retry at transport level**: If `socket.connect()` fails, the attempt is abandoned. Relay Mode's `rescanTask` will rediscover the device on the next cycle.

---

## 2. Transport Boundary

### 2.1 The Exact Integration Layer

The boundary sits between the **raw byte I/O layer** (socket management, framing, threads) and the **protocol logic layer** (packet dispatch, routing, encryption, dedup).

```
┌─────────────────────────────────────────────────────────┐
│  NineCore (protocol logic — TypeScript concept,         │
│  to be bridged or reimplemented in Java)                │
├─────────────────────────────────────────────────────────┤
│  BluetoothTransport (implements ITransport)             │  ← NEW CLASS
│  Owns: Link threads, AcceptThread, connection registry, │
│         framing, discovery receiver                     │
├─────────────────────────────────────────────────────────┤
│  Android Bluetooth APIs (system)                        │
│  BluetoothAdapter, BluetoothSocket, RFCOMM             │
└─────────────────────────────────────────────────────────┘
```

### 2.2 What Remains Android-Specific

These elements are inherently platform-bound and stay inside `BluetoothTransport`:

- `BluetoothAdapter` access (enable check, discovery start/stop, discoverability intent).
- `BluetoothSocket` / `BluetoothServerSocket` creation and I/O streams.
- `BroadcastReceiver` for `ACTION_FOUND` / `ACTION_DISCOVERY_FINISHED`.
- Android permission checks (`BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE`).
- `Handler` / `Looper` threading for UI callbacks.
- Foreground service management (`RelayService`).

### 2.3 What Becomes Transport-Agnostic

These concerns move UP into NineCore (or remain there already):

- Packet construction, serialization, CRC-32 checksum (Packet Engine).
- Routing decisions, TTL management, dedup (Routing Engine).
- Encryption / key management (Security Engine).
- Dual-path logic (Messaging Engine).
- Neighbor table, node registry, heartbeat state (Node Layer).
- All protocol-level state machines.

### 2.4 What Must Never Be Modified

- `OfflineRouter.java` — GraphHopper map routing, orthogonal to protocol.
- `RelayService.java` — foreground service scaffolding, reusable as-is.
- `MainActivity.java` — launcher/permissions, no protocol logic.
- All `res/` layouts, drawables, menu, map/osmdroid code.
- The `core/` TypeScript modules (frozen protocol implementation).

---

## 3. ITransport Method Mapping

### 3.1 `initialize(config?): Promise<void>`

| Aspect | Detail |
|--------|--------|
| **Input** | Optional `TransportConfig` (unused for Bluetooth; adapter obtained from system) |
| **Output** | Resolves when `AcceptThread` is running and adapter is ready |
| **Android equivalent** | `bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()` + verify enabled + start `AcceptThread` + register `BroadcastReceiver` |
| **Blocking** | Non-blocking (async); server socket creation is fast |
| **Failure cases** | Adapter null (no BT hardware), adapter disabled, permission denied |

### 3.2 `shutdown(): Promise<void>`

| Aspect | Detail |
|--------|--------|
| **Input** | None |
| **Output** | Resolves when all links, accept thread, and receiver are closed |
| **Android equivalent** | `neighborManager.closeAll()` + `acceptThread.cancel()` + `unregisterReceiver(receiver)` |
| **Blocking** | Non-blocking; socket close is immediate |
| **Failure cases** | IOException on socket close (swallowed) |

### 3.3 `startDiscovery(): Promise<void>`

| Aspect | Detail |
|--------|--------|
| **Input** | None |
| **Output** | Resolves when `bluetoothAdapter.startDiscovery()` returns true |
| **Android equivalent** | `discoverDevices()` → `startDiscoveryProcess()` |
| **Blocking** | Non-blocking; discovery runs in the background via system callbacks |
| **Failure cases** | `startDiscovery()` returns false (adapter busy), SecurityException |
| **Events emitted** | `PEER_DISCOVERED` for each `ACTION_FOUND` intent received |

### 3.4 `stopDiscovery(): Promise<void>`

| Aspect | Detail |
|--------|--------|
| **Input** | None |
| **Output** | Resolves when `cancelDiscovery()` completes |
| **Android equivalent** | `bluetoothAdapter.cancelDiscovery()` |
| **Blocking** | Non-blocking |
| **Failure cases** | SecurityException (permission revoked) |

### 3.5 `advertise(durationMs): Promise<void>`

| Aspect | Detail |
|--------|--------|
| **Input** | Duration in milliseconds (max 300000ms per Android OS limit) |
| **Output** | Resolves when the discoverability intent is launched |
| **Android equivalent** | `makeDiscoverable()` — fires `ACTION_REQUEST_DISCOVERABLE` with `EXTRA_DISCOVERABLE_DURATION` |
| **Blocking** | Non-blocking (system UI prompt shown; result in `onActivityResult`) |
| **Failure cases** | User denies the prompt; SecurityException |

### 3.6 `connect(peerId): Promise<PeerConnection>`

| Aspect | Detail |
|--------|--------|
| **Input** | `PeerID` (mapped to a `BluetoothDevice` via a discovered-devices registry) |
| **Output** | `PeerConnection { peerId, state: CONNECTED, transportType: bluetooth_classic }` |
| **Android equivalent** | `connectToDevice(device)` — spawns thread, calls `socket.connect()`, then `neighborManager.addLink(socket, true)` |
| **Blocking** | Async (socket.connect blocks on a background thread; Promise resolves on success) |
| **Failure cases** | IOException (device unreachable, wrong UUID, timeout), SecurityException |
| **Events emitted** | `CONNECTION_ESTABLISHED` on success |

### 3.7 `disconnect(peerId): Promise<void>`

| Aspect | Detail |
|--------|--------|
| **Input** | `PeerID` |
| **Output** | Resolves when the link is closed and removed from `neighbors` map |
| **Android equivalent** | Look up `Link` by peerId → `link.close()` → `neighborManager.remove(link)` |
| **Blocking** | Non-blocking |
| **Failure cases** | PeerId not found (no-op) |
| **Events emitted** | `CONNECTION_LOST` with reason `"manual"` |

### 3.8 `getConnections(): PeerConnection[]`

| Aspect | Detail |
|--------|--------|
| **Input** | None |
| **Output** | Array of `PeerConnection` for every registered `Link` in `neighbors` map |
| **Android equivalent** | Iterate `neighborManager.neighbors.values()`, map each Link to a `PeerConnection` |
| **Blocking** | Synchronous, non-blocking (ConcurrentHashMap iteration) |
| **Failure cases** | None |

### 3.9 `getConnection(peerId): PeerConnection | undefined`

| Aspect | Detail |
|--------|--------|
| **Android equivalent** | `neighborManager.neighbors.get(peerId)` → map to PeerConnection or null |

### 3.10 `isConnected(peerId): boolean`

| Aspect | Detail |
|--------|--------|
| **Android equivalent** | `neighborManager.neighbors.containsKey(peerId)` |

### 3.11 `send(peerId, data): Promise<SendResult>`

| Aspect | Detail |
|--------|--------|
| **Input** | `PeerID` + raw `byte[]` (the serialized NINE packet from the protocol engine) |
| **Output** | `SendResult { success, bytesSent, error? }` |
| **Android equivalent** | Look up `Link` by peerId → write framed bytes: `[4-byte length][data]` via `link.dataOut` |
| **Blocking** | The write itself is fast (buffered); Promise resolves after flush. Technically may block briefly if the BT send buffer is full |
| **Failure cases** | PeerId not found → `{ success: false, error: "not_connected" }`; IOException → `{ success: false, error: "write_failed" }`, triggers link removal |
| **Events emitted** | `SEND_FAILED` on IOException |

### 3.12 `broadcast(data): Promise<number>`

| Aspect | Detail |
|--------|--------|
| **Input** | Raw `byte[]` |
| **Output** | Number of peers the data was successfully sent to |
| **Android equivalent** | `for each Link in neighbors.values(): send(link.peerId, data)` — count successes |
| **Blocking** | Iterates connections, each write is fast |
| **Failure cases** | Individual link failures don't stop the broadcast; count reflects successes only |

### 3.13 `on(type, handler) / off(type, handler)`

| Aspect | Detail |
|--------|--------|
| **Android equivalent** | Internal `TransportEventEmitter` (same pattern as `MockTransport`). Events posted from Link threads or BroadcastReceiver to the emitter |
| **Key events** | `DATA_RECEIVED` (from Link read loop), `PEER_DISCOVERED` (from BroadcastReceiver), `CONNECTION_ESTABLISHED` / `CONNECTION_LOST` (from Link lifecycle) |

### 3.14 `getMetrics(): TransportMetricsSnapshot`

| Aspect | Detail |
|--------|--------|
| **Android equivalent** | Internal `TransportMetrics` instance, incremented on each send/receive/connect/disconnect. Same `TransportMetrics` class from `core/transport/TransportMetrics.ts` reimplemented in Java |

---

## 4. Packet Flow

### 4.1 Outbound (Send)

```
Application calls NineCore.sendBroadcast("alert")
    │
    ▼
NineCore constructs BROADCAST packet (Packet Engine)
    │  createPacket() → serialize() → Buffer (71-byte header + payload)
    ▼
NineCore calls RoutingEngine.sendPacket(packet, serializedBytes)
    │
    ▼
RoutingEngine calls send(neighborId, bytes) [fire-and-forget bridge]
    │
    ▼
TransportManager.send(peerId, data)
    │  selects BluetoothTransport (only registered transport)
    ▼
BluetoothTransport.send(peerId, data)
    │  1. Look up Link by peerId
    │  2. Frame: write 4-byte big-endian length prefix
    │  3. Write raw bytes (NINE binary packet — NOT JSON)
    │  4. Flush
    ▼
Link.dataOut → BluetoothSocket OutputStream → RFCOMM → Radio → Remote Device
```

### 4.2 Inbound (Receive)

```
Remote Device → Radio → RFCOMM → BluetoothSocket InputStream
    │
    ▼
Link.run() read loop
    │  1. Read 4-byte big-endian length
    │  2. readFully(length) → raw bytes
    ▼
BluetoothTransport emits DATA_RECEIVED event
    │  event = { type: DATA_RECEIVED, peerId: link.peerId, data: rawBytes }
    ▼
TransportManager receives event, forwards to NineCore handler
    │
    ▼
NineCore.handleTransportEvent(DATA_RECEIVED)
    │  calls RoutingEngine.handleIncoming(peerId as NodeID, data)
    ▼
RoutingEngine pipeline: verifyChecksum → parse → dedup → dispatch
    │
    ▼
Delivered to application (onBroadcast / onSecureMessage callbacks)
```

### 4.3 Framing Change

**Current** (Android app): `[4-byte length][UTF-8 JSON]`
**Proposed** (BluetoothTransport): `[4-byte big-endian length][raw NINE binary packet bytes]`

The framing mechanism (4-byte length prefix) is REUSED. Only the content changes: JSON → opaque binary. This means the `Link` read/write logic is almost unchanged — only the parsing/dispatch layer above it is replaced by the `DATA_RECEIVED` event emission.

---

## 5. Lifecycle

### 5.1 `initialize`

1. Obtain `BluetoothAdapter` reference from system.
2. Verify Bluetooth is enabled (throw / emit ERROR if not).
3. Create and start `AcceptThread` (server socket listening).
4. Register `BroadcastReceiver` for discovery events.
5. Initialize `TransportMetrics`.
6. Transition state: `UNINITIALIZED → INITIALIZING → READY`.

### 5.2 `advertise`

1. Fire `ACTION_REQUEST_DISCOVERABLE` intent with requested duration.
2. Transition state: `READY → ADVERTISING`.
3. When discoverability expires (system callback or timer): transition back to `READY`.

### 5.3 `startDiscovery` / `stopDiscovery`

1. `startDiscovery`: Call `bluetoothAdapter.startDiscovery()`. Transition `READY → DISCOVERING`.
2. For each `ACTION_FOUND`: record device in an internal discovered-peers map, emit `PEER_DISCOVERED` event with the device address as `PeerID`.
3. On `ACTION_DISCOVERY_FINISHED`: optionally transition back to `READY` or stay `DISCOVERING` if periodic re-scan is enabled.
4. `stopDiscovery`: Call `cancelDiscovery()`, transition to `READY`.

### 5.4 `connect`

1. Resolve `PeerID` to `BluetoothDevice` (from discovered-peers map or bonded devices).
2. Spawn a connection thread: `device.createRfcommSocketToServiceRecord(MY_UUID)`, `socket.connect()`.
3. On success: create `Link`, start read loop, emit `CONNECTION_ESTABLISHED`.
4. **Identity exchange**: After the raw socket connects, both sides exchange a small handshake frame containing their NINE `NodeID`. This maps the transport-level `PeerID` (Bluetooth MAC or address) to the protocol-level `NodeID`. This replaces the current HELLO packet.
5. Return `PeerConnection`.

### 5.5 `disconnect`

1. Look up `Link` by `PeerID`.
2. Call `link.close()` (sets `closed = true`, closes socket).
3. Remove from neighbors map.
4. Emit `CONNECTION_LOST`.

### 5.6 `send`

1. Look up `Link` by `PeerID`.
2. Write `[4-byte length][bytes]` to `link.dataOut` (synchronized on the output stream).
3. Return `SendResult`.

### 5.7 `receive` (passive — driven by Link read loop)

1. `Link.run()` reads `[4-byte length][bytes]` from `link.dataIn`.
2. Emits `DATA_RECEIVED` event with the raw bytes and `peerId`.
3. NineCore's transport event handler feeds bytes into `RoutingEngine.handleIncoming`.

### 5.8 `shutdown`

1. Close all Links (`neighborManager.closeAll()`).
2. Cancel `AcceptThread` (close server socket).
3. Unregister `BroadcastReceiver`.
4. Transition state: `→ SHUTDOWN`.

---

## 6. Threading Model

### 6.1 Thread Architecture

```
┌───────────────────────────────────────────────────────────┐
│ Main Thread (UI + Handler)                                │
│  • NineCore API calls (sendBroadcast, sendSecureMessage)  │
│  • Transport event delivery to NineCore                   │
│  • UI updates                                             │
└───────────────────┬───────────────────────────────────────┘
                    │ post callbacks via Handler
┌───────────────────▼───────────────────────────────────────┐
│ AcceptThread (1 thread)                                   │
│  • Blocking accept() loop                                 │
│  • Creates Link on each accepted connection               │
└───────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────┐
│ Link Thread (1 per neighbor, N total)                     │
│  • Blocking read loop                                     │
│  • Emits DATA_RECEIVED / CONNECTION_LOST                  │
└───────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────┐
│ Connect Threads (transient, 1 per outbound attempt)       │
│  • Blocking socket.connect()                              │
│  • On success: creates Link, emits CONNECTION_ESTABLISHED │
└───────────────────────────────────────────────────────────┘
```

### 6.2 Callback Delivery

All `TransportEvent` emissions must be posted to the **main thread** (via `Handler`) before reaching NineCore. This ensures:
- NineCore's internal state (RoutingEngine, DualPathManager) is only ever accessed from one thread.
- No concurrent mutation of the routing table, dedup buffer, or pending queue.
- Matches the existing Android app's pattern (`mainHandler.post(...)`).

### 6.3 Synchronization Points

| Resource | Guard | Access pattern |
|----------|-------|----------------|
| `neighbors` map (Link registry) | `ConcurrentHashMap` | Multi-thread read/write; safe without external lock |
| `DataOutputStream` (per Link) | `synchronized(out)` block inside write | Multiple callers may write (broadcast fan-out); serialized per-link |
| Discovered-peers map | `synchronized` or `ConcurrentHashMap` | Written by BroadcastReceiver (main thread), read by connect logic (background thread) |
| `TransportMetrics` counters | Atomic increments or `synchronized` | Written from Link threads and main thread |
| Event handler list | Copy-on-read or `CopyOnWriteArrayList` | Handlers registered once at init; rarely mutated |

### 6.4 Interaction with NineCore

NineCore in the TypeScript implementation uses a fire-and-forget sync bridge for send operations:
```typescript
send: (to, data) => { void this.transport.send(to as PeerID, data); return true; }
```

In the Java equivalent, this becomes:
- NineCore (or its Java port) calls `bluetoothTransport.send(peerId, bytes)` from the main thread.
- The write to the `DataOutputStream` is fast (buffered) and returns immediately.
- If the write throws, the `SendResult` reports failure and the link is removed.
- No blocking of the caller under normal conditions.

---

## 7. Required New Classes

### 7.1 `BluetoothTransport`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Implements `ITransport` for Bluetooth Classic RFCOMM |
| **Responsibilities** | Lifecycle management, discovery, connection registry, framed send/receive, event emission, metrics |
| **Dependencies** | `BluetoothAdapter` (system), `BluetoothLink` (own), `BluetoothAcceptLoop` (own), Android `Context` (for receiver registration), `Handler` (for main-thread posting) |
| **Public API** | All methods from `ITransport`: `initialize`, `shutdown`, `startDiscovery`, `stopDiscovery`, `advertise`, `connect`, `disconnect`, `getConnections`, `getConnection`, `isConnected`, `send`, `broadcast`, `on`, `off`, `getMetrics` |

### 7.2 `BluetoothLink`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Wraps a single `BluetoothSocket` with read/write framing and lifecycle |
| **Responsibilities** | Read loop (blocking), framed write (synchronized), socket close, error detection |
| **Dependencies** | `BluetoothSocket`, `DataInputStream`, `DataOutputStream` |
| **Public API** | `start()`, `writeFrame(byte[] data)`, `close()`, `getPeerId()`, `isAlive()` |
| **Notes** | Extracted refactor of the existing `Link` inner class. Thread-per-link model preserved. The key change: it reads/writes **opaque byte frames** and emits a callback instead of parsing JSON packets internally |

### 7.3 `BluetoothAcceptLoop`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Continuously accepts inbound RFCOMM connections |
| **Responsibilities** | Server socket management, spawning `BluetoothLink` for each accepted connection |
| **Dependencies** | `BluetoothAdapter`, `BluetoothTransport` (to register new links) |
| **Public API** | `start()`, `cancel()` |
| **Notes** | Extracted refactor of the existing `AcceptThread` inner class |

### 7.4 `BluetoothDiscoveryReceiver`

| Aspect | Detail |
|--------|--------|
| **Purpose** | BroadcastReceiver that translates Android discovery intents into `PEER_DISCOVERED` events |
| **Responsibilities** | Register/unregister with system, map `BluetoothDevice` → `PeerID`, maintain discovered-peers registry |
| **Dependencies** | Android `Context`, `IntentFilter`, `BluetoothTransport` (for event emission) |
| **Public API** | `register(Context)`, `unregister(Context)`, `getDiscoveredDevice(PeerID): BluetoothDevice` |

### 7.5 `PeerIdMapper`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Bidirectional mapping between Bluetooth addresses (`PeerID`) and NINE `NodeID` values |
| **Responsibilities** | Records the mapping established during the post-connect handshake; resolves in both directions |
| **Dependencies** | None (pure data structure) |
| **Public API** | `register(PeerID, NodeID)`, `getNodeId(PeerID): NodeID?`, `getPeerId(NodeID): PeerID?`, `remove(PeerID)` |
| **Notes** | The NineCore routing engine addresses packets by `NodeID`. The transport addresses links by `PeerID` (BT address). This mapper bridges the two. It replaces the implicit identity learned from the current HELLO packet |

### 7.6 `TransportHandshake`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Immediately after a raw RFCOMM socket connects, exchange a minimal handshake frame containing each side's `NodeID` |
| **Responsibilities** | Write own NodeID, read peer NodeID, register mapping in `PeerIdMapper` |
| **Dependencies** | `BluetoothLink` (for the underlying socket streams), `PeerIdMapper` |
| **Public API** | `perform(BluetoothLink, ownNodeId): PeerId` (blocking, called on the connect/accept thread) |
| **Notes** | Handshake frame format: `[1-byte version][16-byte NodeID UUID]` = 17 bytes total. No JSON. Replaces the current `Packet.hello()` exchange at the transport level |

---

## 8. Implementation Plan

### Phase 9.2 — BluetoothTransport Skeleton

- Create `BluetoothTransport.java` implementing all `ITransport` methods as stubs (throw `UnsupportedOperationException` or return empty defaults).
- Implement state machine transitions (`UNINITIALIZED → INITIALIZING → READY → ... → SHUTDOWN`).
- Create `PeerIdMapper.java` (pure data structure, fully testable without Bluetooth hardware).
- Create `TransportHandshake.java` (handshake frame encode/decode logic, testable with mock streams).
- Unit test the state machine and mapper locally (no Bluetooth required).

### Phase 9.3 — Connection Management

- Implement `BluetoothLink.java` (extracted from the existing `Link` inner class, reading/writing opaque byte frames instead of JSON packets).
- Implement `BluetoothAcceptLoop.java` (extracted from `AcceptThread`).
- Implement `connect()` and `disconnect()` in `BluetoothTransport`.
- Implement the post-connect `TransportHandshake` (NodeID exchange).
- Implement `getConnections()`, `getConnection()`, `isConnected()`.
- Test on two physical devices: verify RFCOMM socket connects, handshake completes, `PeerIdMapper` populates.

### Phase 9.4 — Discovery

- Implement `BluetoothDiscoveryReceiver.java`.
- Implement `startDiscovery()`, `stopDiscovery()`, `advertise()` in `BluetoothTransport`.
- Wire `PEER_DISCOVERED` event emission from the receiver.
- Test: verify discovered devices appear as `PeerID`s in the event stream.

### Phase 9.5 — Packet Transmission

- Implement `send(peerId, data)` and `broadcast(data)` in `BluetoothTransport`.
- Implement the `DATA_RECEIVED` event emission from `BluetoothLink`'s read loop.
- Implement `TransportMetrics` tracking (bytes sent/received, packet counts).
- Test: send a known byte sequence from device A → device B, verify it arrives intact.
- Test: broadcast to 3 connected devices, verify all receive.

### Phase 9.6 — Transport Tests

- Integration tests on physical devices:
  - 2-device: connect, send, receive, disconnect, reconnect.
  - 3-device linear relay: A→B→C packet delivery (B runs BluetoothTransport + NineCore routing).
  - Connection loss: kill a link mid-transfer, verify `CONNECTION_LOST` event and cleanup.
  - Discovery cycle: verify `PEER_DISCOVERED` events match visible devices.
- Stress: send 100 packets rapidly, verify none lost (RFCOMM is reliable).
- Measure latency per hop.

### Phase 9.7 — NineCore Integration

- Wire `BluetoothTransport` into `NineCoreBuilder` (or its Java equivalent).
- Replace `sendMessage()` in the Activity with `NineCore.sendBroadcast()` / `sendSecureMessage()`.
- Replace `onLinkPacket()` dispatch with NineCore event subscriptions (`onBroadcast`, `onSecureMessage`).
- Verify end-to-end: broadcast propagates through a 3-device mesh using NINE binary packets over Bluetooth RFCOMM.
- Verify: secure dual-path message from user to admin across 2+ hops.

---

## 9. Risks

### 9.1 Thread Safety

| Risk | Impact | Mitigation |
|------|--------|------------|
| NineCore state accessed from multiple Link threads simultaneously | Routing table corruption, dedup buffer race conditions | Deliver ALL `DATA_RECEIVED` events to the main thread via `Handler.post()`. NineCore processes packets sequentially on one thread. |
| Concurrent writes to the same `DataOutputStream` | Interleaved bytes on the wire = garbled frames | Existing `synchronized(out)` pattern in `Link.writePacket` — preserved in `BluetoothLink.writeFrame`. |
| Metrics counters incremented from multiple threads | Inaccurate counts | Use `AtomicLong` or `synchronized` increments. |

### 9.2 Packet Fragmentation / Bluetooth MTU

| Risk | Impact | Mitigation |
|------|--------|------------|
| NINE packets up to 4096 bytes may exceed the RFCOMM internal segment size | N/A — RFCOMM handles segmentation transparently | No application-level fragmentation needed. RFCOMM guarantees in-order, reliable delivery of the complete byte stream. The 4-byte length prefix delineates packet boundaries within the stream. |
| Very large payloads cause blocking writes | Main thread stalls if `send()` is called synchronously | Writes are fast (kernel-buffered). If this becomes measurable, move writes to a per-link write thread (not expected to be needed at 4 KB packet sizes). |

### 9.3 Connection Loss

| Risk | Impact | Mitigation |
|------|--------|------------|
| Bluetooth link drops mid-packet (IOException on read/write) | Partial frame in the stream; peer state inconsistent | Read loop catches IOException → emits `CONNECTION_LOST` → removes Link. NineCore's routing engine invalidates routes through the lost peer and re-discovers. |
| Device walks out of range gradually | Intermittent read timeouts before full disconnect | RFCOMM will eventually throw IOException. No explicit timeout needed at the application level — the OS handles it. HeartbeatState (if heartbeat emission is implemented) provides an additional liveness signal. |

### 9.4 Timeouts

| Risk | Impact | Mitigation |
|------|--------|------------|
| `socket.connect()` blocks indefinitely for unreachable devices | Connect thread hangs forever | Set a connect timeout: use `socket.connect()` with Android's internal timeout (~12s), or wrap in a `Future` with a configurable deadline. The existing code accepts this risk (relies on the OS timeout). |
| `accept()` blocks indefinitely when no peers connect | AcceptThread hangs (by design — this is the server pattern) | Not a risk; `cancel()` closes the server socket, which causes `accept()` to throw and the thread exits. |

### 9.5 Reconnection

| Risk | Impact | Mitigation |
|------|--------|------------|
| A previously-connected peer disappears and reappears | Stale NodeID mapping, stale routes | On `CONNECTION_LOST`: remove mapping from `PeerIdMapper`, NineCore invalidates routes via `notifyLinkBroken`. On reconnect: handshake establishes fresh mapping, fresh route discovery occurs naturally. |
| Relay Mode's `rescanTask` reconnects a device that was deliberately disconnected | Unwanted repeated connections | The `attemptedAddresses` set (existing logic) prevents re-connecting within a scan cycle. Between cycles, reconnection is intentional (Relay Mode's purpose). |

### 9.6 Duplicate Packets

| Risk | Impact | Mitigation |
|------|--------|------------|
| Same packet arrives via two paths (e.g., via two relay neighbors) | Double-delivery to application | NineCore's `DuplicatePacketCache` already handles this — dedup is at the protocol layer, not the transport layer. The transport only delivers raw bytes; duplicates are caught by the routing engine's `hasSeen(packetId)` check. |

### 9.7 Resource Cleanup

| Risk | Impact | Mitigation |
|------|--------|------------|
| Activity destroyed without `shutdown()` being called | Leaked threads, open sockets, registered receivers | `BluetoothTransport.shutdown()` must be called from the Activity's `onDestroy()`. Defensive: Link threads check `closed` flag, AcceptThread catches IOException from closed server socket. |
| Multiple `initialize()` calls | Duplicate AcceptThreads, duplicate receivers | Guard with state check: only allow transition from `UNINITIALIZED`. Subsequent calls are no-ops or throw. |
| `BroadcastReceiver` not unregistered | System exception on Activity restart | `shutdown()` must call `context.unregisterReceiver(receiver)`. Wrap in try-catch for `IllegalArgumentException` (if already unregistered). |

---

*End of Bluetooth Transport Design. No production code was modified. Implementation awaits approval.*
