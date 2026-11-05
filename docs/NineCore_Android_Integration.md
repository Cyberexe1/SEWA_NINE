# NINE — Android ↔ NineCore Integration Analysis

**Scope:** Android application only. The NineCore protocol implementation is frozen and out of scope.
**Objective:** Understand the current Android communication pipeline and prepare (design only) for a future `BluetoothTransport implements ITransport` so NineCore can replace the app's built-in protocol with minimal change and zero behaviour change today.
**Constraint:** No code modified. No behaviour, UI, maps, or relay logic changed. Implementation waits for explicit approval.

Evidence basis: `Packet.java`, `Crypto.java`, `BluetoothChatActivity.java` (`sendMessage`, `NeighborManager`, `Link`, `AcceptThread`, `connectToDevice`, discovery receiver), read directly. Claims are tagged **[Fact]** (verified in code), **[Inference]** (derived), or **[Speculation]** (unverifiable without the NineCore SDK).

---

## Deliverable 1 — Android Integration Report (Pipeline)

### 1.1 Outbound pipeline (send)

```
UI (EditText message_input + Send button)
  → BluetoothChatActivity.sendMessage()                     // reads text, picks target
      → target/broadcast decision (currentTargetId)         // routing intent
      → Crypto.encryptFor(recipientPubKey, text)            // E2E encryption (addressed only)
      → Packet.message(deviceId, dst, name, payload, TTL)   // packet construction
      → NeighborManager.markSeen(msgId)                     // self-dedupe
      → NeighborManager.broadcast(packet, null)             // flood to all links
          → Link.writePacket(packet)                        // per-neighbor
              → Packet.writeTo(DataOutputStream)            // JSON + 4-byte length frame
                  → BluetoothSocket OutputStream            // RFCOMM bytes → remote device
```

**[Fact]** Confirmed in `sendMessage()` (line ~1580): it encrypts via `crypto.encryptFor(...)`, builds a `Packet` via `Packet.message(...)`, calls `neighborManager.markSeen(msg.msgId)` then `neighborManager.broadcast(msg, null)`, and (for addressed messages) registers a `Pending` entry for retry.

### 1.2 Inbound pipeline (receive)

```
Remote device → BluetoothSocket InputStream
  → Link.run() loop → Packet.readFrom(DataInputStream)      // deframe + JSON parse
      → onLinkPacket(link, packet)                          // protocol dispatch
          HELLO     → registerPeer + emitPresence
          PRESENCE  → updateContact + flood onward
          MSG       → dedupe(seen) → deliver (Crypto.decrypt) → ACK → flood onward
          ACK       → markDelivered / flood onward
          LOCATION  → updatePeerLocation → flood onward
```

**[Fact]** `Link` wraps the socket in `DataInputStream`/`DataOutputStream`, sends a HELLO on start, and its read loop calls `Packet.readFrom(...)` then `onLinkPacket(this, pkt)`. **[Fact]** `onLinkPacket` performs dedupe (`neighborManager.hasSeen`), TTL decrement, `crypto.decrypt`, ACK emission, and re-broadcast — verified earlier in this file.

### 1.3 Layer classification

| Layer | Responsibility | Class / method |
|-------|----------------|----------------|
| UI | Input, display, tabs | `BluetoothChatActivity` views |
| **App protocol** | packet format, routing, flooding, dedupe, ACK, retry, encryption | `Packet`, `Crypto`, `onLinkPacket`, `NeighborManager` (seen-set/broadcast), `Pending`/`retryTask` |
| **Transport** | RFCOMM sockets, byte streams, discovery, connection lifecycle | `Link` (socket + streams), `AcceptThread`, `connectToDevice`, discovery `BroadcastReceiver` |

**[Inference]** The clean seam for NineCore is exactly the boundary between the "App protocol" row and the "Transport" row: NineCore replaces the protocol row; the transport row becomes `BluetoothTransport`.

---

## Deliverable 2 — Bluetooth Communication Flow Diagram

### 2.1 Connection establishment (two devices)

```
Device A (initiator)                        Device B (listener)
────────────────────                        ───────────────────
connect() → makeDiscoverable()              AcceptThread.run()
discoverDevices() (ACTION_FOUND)            listenUsingRfcommWithServiceRecord(APP_NAME, MY_UUID)
connectToDevice(dev):                        serverSocket.accept()  ── blocks
  createRfcommSocketToServiceRecord(MY_UUID)
  socket.connect() ───────────RFCOMM─────────►  accepted socket
  neighborManager.addLink(sock,true)          neighborManager.addLink(sock,false)
      Link.start() → send HELLO ─────────────►  Link.run() reads HELLO
      reads HELLO  ◄───────────────────────── send HELLO
  registerPeer (dedupe by lower deviceId)     registerPeer
```

**[Fact]** Server side uses `bluetoothAdapter.listenUsingRfcommWithServiceRecord(APP_NAME, MY_UUID)`; client side uses `device.createRfcommSocketToServiceRecord(MY_UUID)`. Both hand the connected `BluetoothSocket` to `NeighborManager.addLink(socket, initiatedByUs)`.

### 2.2 Message flooding across a relay (A → M → B)

```
A: sendMessage → Packet(MSG,dst=B,ttl=5) → broadcast → Link(A→M)
M: onLinkPacket(MSG): not for me, seen?no → mark seen → ttl=4 → broadcast(exclude A) → Link(M→B)
B: onLinkPacket(MSG): dst==me → deliver(decrypt) → sendAck(dst=A) → (stop)
ACK floods back B → M → A ; A.markDelivered(msgId)
```

**[Fact]** Split-horizon (`broadcast(pkt, exclude)`), TTL decrement, and seen-set dedupe are all present. Loop/duplicate protection = bounded `seen` LinkedHashMap (cap 512) + TTL.

### 2.3 Frame format on the wire (current)

```
[ 4-byte big-endian length ][ UTF-8 JSON of Packet ] ...repeated...
```

**[Fact]** Implemented in `Packet.writeTo`/`readFrom`; `MAX_FRAME_BYTES = 1_000_000` guard.

---

## Deliverable 3 — Integration Point Report

These are the **exact** methods that will change when NineCore is adopted. **They are not modified now** — only identified.

### 3.1 Outbound integration point

- **Method:** `BluetoothChatActivity.sendMessage()`
- **Current tail:** `Crypto.encryptFor(...)` → `Packet.message(...)` → `NeighborManager.broadcast(...)`
- **Future tail [Speculation, pending ITransport]:**
  `sendMessage()` → `NineCore.sendSecureMessage(destNodeId, plaintextBytes)` → (NineCore does packet + crypto + routing) → `BluetoothTransport.send(nextHop, frameBytes)`
- **Change surface:** replace the 3 lines that build/encrypt/broadcast the `Packet` with a single NineCore call. UI, target selection, and the `Pending`/retry UI feedback can remain until NineCore's own delivery callbacks are wired.

### 3.2 Inbound integration point

- **Method:** `Link.run()` read loop + `onLinkPacket(link, packet)`
- **Current:** `Packet.readFrom(...)` → `onLinkPacket(...)` (dedupe, TTL, decrypt, ACK, flood, deliver)
- **Future [Speculation]:** `Link.run()` reads a raw byte frame → `BluetoothTransport` hands `frameBytes` to `NineCore.onFrameReceived(fromNodeId, frameBytes)` → NineCore decrypts/routes and invokes a delivery callback → UI shows plaintext.
- **Change surface:** `onLinkPacket` (all protocol branches) becomes dead once NineCore owns routing; replaced by an opaque byte handoff.

### 3.3 Protocol logic marked as future-replacement candidates (do NOT replace now)

| Concern | Location | Replaced by NineCore |
|---------|----------|----------------------|
| Packet serialization / framing | `Packet.toJson/fromJson/writeTo/readFrom` | Packet Engine |
| Encryption (RSA-2048 + AES-256-GCM, SHA-256 OAEP) | `Crypto.encryptFor/decrypt` | Security Engine |
| Routing by `dstId` / broadcast | `sendMessage`, `onLinkPacket` | Routing Engine / multi-route |
| Flooding + split-horizon | `NeighborManager.broadcast`, `onLinkPacket` | Routing Engine |
| Deduplication (seen-set) | `NeighborManager.seen/hasSeen/markSeen` | Packet/Routing Engine |
| Acknowledgements + retransmission | `Pending`, `retryTask`, `sendAck`, `markDelivered` | Routing/Reliability |
| Presence / node discovery announcements | `emitPresence`, `updateContact` | NineCore presence (if any) |

### 3.4 Lowest transport layer (what NineCore should eventually talk to)

**[Fact]** The only classes touching the radio/bytes:
- `Link` — owns `BluetoothSocket`, `DataInputStream dataIn`, `DataOutputStream dataOut`; raw read/write.
- `NeighborManager.addLink / broadcast / registerPeer / remove / closeAll` — connection registry + fan-out.
- `AcceptThread` — RFCOMM server accept loop.
- `connectToDevice(BluetoothDevice)` — RFCOMM client connect.
- discovery `BroadcastReceiver` + `discoverDevices()` + `makeDiscoverable()` — neighbour discovery.

This set is the intended `BluetoothTransport` surface.

---

## Deliverable 4 — BluetoothTransport Design Proposal (design only, NOT implemented)

> **Blocking dependency [Fact]:** The `ITransport` interface signature from the protocol team is **not present in this repository** (searched; only `Packet.java`/`Crypto.java`/app classes exist). The contract below is a **[Speculation]** placeholder and MUST be reconciled with the real `ITransport` before any implementation. Per engineering discipline, implementation should not begin until that interface is provided.

### 4.1 Assumed `ITransport` contract (to be confirmed)

```java
// [SPECULATION] — replace with the protocol team's real interface before coding.
public interface ITransport {
    void start();                                  // begin listening + discovery
    void stop();                                   // tear down all connections
    void send(String nodeId, byte[] frame);        // unicast opaque frame to a neighbour
    void broadcast(byte[] frame);                  // fan out to all neighbours
    void setReceiveCallback(TransportReceiver cb); // inbound opaque frames
    java.util.Set<String> neighbors();             // currently reachable node ids
}

public interface TransportReceiver {
    void onFrame(String fromNodeId, byte[] frame);
    void onNeighborUp(String nodeId);
    void onNeighborDown(String nodeId);
}
```

### 4.2 Proposed `BluetoothTransport` (thin wrapper over existing transport classes)

- Wraps (does not replace) `AcceptThread`, `connectToDevice`, the discovery receiver, and a `NeighborManager`/`Link` pair operating on **opaque `byte[]` frames** instead of `Packet` JSON.
- **Framing:** reuse the existing 4-byte length-prefix scheme, but treat the body as opaque bytes owned by NineCore (no JSON, no `Packet`). This keeps `Link`'s stream handling essentially unchanged while removing protocol knowledge from it.
- **Node identity mapping [Inference]:** current `deviceId` is a per-install UUID string exchanged via HELLO. `BluetoothTransport.neighbors()` returns those ids. NineCore's node-addressing scheme must map onto these (see Risk R3).
- **Threading:** one read thread per `Link` (as today); inbound frames posted to NineCore via `TransportReceiver.onFrame`. NineCore's threading/reentrancy expectations are unknown (Risk R2).

### 4.3 Migration strategy (staged, behaviour-preserving)

1. Introduce `BluetoothTransport` alongside existing code, behind a feature flag, initially unused. **No behaviour change.**
2. Add a raw-byte send/receive path in `Link` (opaque frames) without removing the `Packet` path.
3. Route `sendMessage()` through NineCore only when the flag is on; keep the current path as default.
4. Once validated, retire `onLinkPacket`/`Packet`/`Crypto` protocol branches. This is the only step that changes behaviour and requires explicit approval.

**[Inference]** This staging satisfies the "minimum methods change" goal: only `sendMessage()` (outbound) and `Link.run()`/`onLinkPacket` (inbound) are re-pointed; transport classes are reused.

---

## Deliverable 5 — Risk Assessment

| ID | Risk | Severity | Evidence / Reasoning | Mitigation |
|----|------|----------|----------------------|------------|
| R1 | **`ITransport` contract unknown** — design is speculative | High (blocking) | Interface not in repo | Obtain the real `ITransport`/`NineCore` API before implementing; treat §4.1 as placeholder |
| R2 | **Threading model mismatch** — per-`Link` read threads post to `mainHandler`; NineCore threading unknown | High | `Link extends Thread`; UI updates via `mainHandler.post` | Confirm NineCore concurrency contract; add an explicit executor boundary in `BluetoothTransport` |
| R3 | **Node identity mismatch** — Android uses UUID-string `deviceId`; NineCore addressing scheme unknown | High | `deviceId` UUID exchanged in HELLO | Define a bijective id mapping; do not assume equality |
| R4 | **Double protocol / double encryption** — Android already floods + encrypts; if NineCore also does, running both corrupts/duplicates | High | `Crypto`, `onLinkPacket`, `NeighborManager` all active | Disable Android protocol branches when NineCore active (feature flag); never encrypt twice |
| R5 | **Framing ownership** — length-prefix currently lives in `Packet.writeTo/readFrom` | Medium | `Packet` couples framing to JSON | Move framing into `BluetoothTransport` as opaque bytes; keep the 4-byte scheme |
| R6 | **Frame size limits** — `MAX_FRAME_BYTES = 1_000_000`; RFCOMM practical MTU is far smaller | Medium | Constant in `Packet` | Confirm NineCore max frame; chunk if needed |
| R7 | **Background lifecycle** — mesh networking lives in the Activity; dies when swiped (RelayService only holds a notification) | Medium | Prior analysis; networking in `BluetoothChatActivity` | Pre-existing; unaffected by this task, but relevant if NineCore expects a service-hosted transport |
| R8 | **Auto-connect noise** — Relay Mode connects to every discovered device | Low | discovery receiver auto-connect | Pre-existing; out of scope |

### Adversarial notes
- **Flawed assumption to avoid:** "NineCore can drop into `sendMessage` directly." It cannot until R1/R3/R4 are resolved; assuming so would create a dual-protocol, double-encrypting client.
- **No performance claims made:** routing/flooding complexity is unchanged by this analysis (O(neighbors) fan-out per hop, bounded by TTL and the 512-entry seen-set). Any NineCore performance comparison requires the SDK and benchmarks — not available here.

---

## Success-criteria checklist (this task)
- [x] Complete Android pipeline documented (Deliverable 1–2)
- [x] Lowest transport layer identified (`Link`, `AcceptThread`, `connectToDevice`, discovery)
- [x] In-Android protocol logic marked as replacement candidates (§3.3) — **not replaced**
- [x] `BluetoothTransport` designed against `ITransport` (§4) — **not implemented**
- [x] Minimum changing methods identified: `sendMessage()` (out), `Link.run()`/`onLinkPacket` (in)
- [x] No code, behaviour, UI, maps, or relay logic changed

**Awaiting:** the real `ITransport`/`NineCore` API and explicit approval before implementation.
