# NINE — Android Context Report

## Document Metadata

| Field | Value |
|-------|-------|
| Purpose | Read-only analysis of the existing Android app before Phase 8 |
| Status | Analysis only — NO Android code was modified |
| Date | 2026-07-15 |
| Scope | `app/` module (owned by other team members) |
| Author | Core/Protocol team |

> This report is analysis only. No Android code was modified, refactored, moved,
> or renamed. It documents the current state so the NINE protocol team can plan
> integration points without disturbing the Android team's work.

---

## 1. Project Structure

### 1.1 Packages

Single package: `com.p2pchat.app` (flat — no sub-packages).

### 1.2 Source Files (6 Java classes, ~2,655 lines)

| File | Lines | Role |
|------|-------|------|
| `MainActivity.java` | 115 | Launcher screen; Bluetooth permission gate |
| `BluetoothChatActivity.java` | 2,129 | The entire app: UI, mesh networking, map, relay |
| `Packet.java` | 137 | JSON mesh packet model + length-prefixed framing |
| `Crypto.java` | 133 | RSA-2048 + AES-256-GCM hybrid E2E encryption |
| `OfflineRouter.java` | 80 | GraphHopper offline road routing (map feature) |
| `RelayService.java` | 61 | Foreground service to keep relay alive |

### 1.3 Activities

- `MainActivity` — entry point, checks/requests Bluetooth permissions, launches chat.
- `BluetoothChatActivity` — everything else (chat, contacts, relay, map, settings) via a 4-tab bottom-nav single-activity design.

### 1.4 Fragments / ViewModels / Adapters

- **Fragments**: none. Tabs are `View` sections toggled with `setVisibility`.
- **ViewModels**: none. No `androidx.lifecycle` ViewModel usage — all state lives in the Activity.
- **Adapters**: `ArrayAdapter<String>` for messages, device list, and contacts (three simple adapters).

### 1.5 Services

- `RelayService` — a `START_STICKY` foreground service (type `connectedDevice`) with an ongoing notification. Currently only holds process priority; **networking still lives in the Activity**, not the service (documented gap in Relay.md).

### 1.6 Broadcast Receivers

- One anonymous `BroadcastReceiver` inside `BluetoothChatActivity` for `BluetoothDevice.ACTION_FOUND` and `BluetoothAdapter.ACTION_DISCOVERY_FINISHED` (device discovery + auto-connect in relay mode).

### 1.7 Networking / Bluetooth / Wi-Fi Classes

- **Bluetooth Classic (RFCOMM)** only. No Wi-Fi Direct, no BLE.
- Inner classes in `BluetoothChatActivity`:
  - `Link` (extends Thread) — one RFCOMM socket + its read loop.
  - `NeighborManager` — holds all links, broadcast/dedup helpers.
  - `AcceptThread` — server socket accept loop.
- Service UUID: `00001101-0000-1000-8000-00805F9B34FB` (standard SPP).

### 1.8 Storage

- `SharedPreferences` (`P2PChatPrefs`) — username, deviceId (UUID), RSA keypair (base64).
- `SharedPreferences` (`osmdroid`) — map tile config.
- Files dir — offline map data (`region.osm.pbf`, `region.osm`, `gh-graph/`).
- **No SQLite, no Room.**

### 1.9 Permissions (AndroidManifest)

Bluetooth (legacy + 12+ `CONNECT`/`SCAN`/`ADVERTISE`), `FOREGROUND_SERVICE`(+`CONNECTED_DEVICE`), `POST_NOTIFICATIONS`, `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_FINE/COARSE_LOCATION`.

### 1.10 Gradle / Dependencies

- `namespace com.p2pchat.app`, `minSdk 23`, `targetSdk 34`, `compileSdk 34`, Java 8, version 1.0.1 (code 2).
- Deps: appcompat, material, constraintlayout, recyclerview, **osmdroid 6.1.18**, **graphhopper-core 1.0**, **graphhopper-reader-osm 1.0**, junit/espresso.
- Packaging excludes for GraphHopper META-INF collisions.

---

## 2. Architecture

### 2.1 How the application starts

`MainActivity.onCreate` → checks Bluetooth permissions → single **Bluetooth** button → launches `BluetoothChatActivity`. The activity configures osmdroid, inflates the 4-tab layout, loads username + deviceId + RSA keys, initializes Bluetooth, and starts periodic tasks (presence, retry).

### 2.2 Navigation flow

Single-activity, 4 sections via `BottomNavigationView`: Chat, Relay, Map, Settings — toggled by `showSection(index)`.

### 2.3 How devices connect

- **Server side**: `AcceptThread` calls `listenUsingRfcommWithServiceRecord` and loops on `accept()`, adding each socket as an incoming `Link`.
- **Client side**: `connectToDevice()` creates an RFCOMM socket via `createRfcommSocketToServiceRecord(MY_UUID)`, connects, adds as an outgoing `Link`.
- **Discovery**: classic `startDiscovery()` + `ACTION_FOUND` receiver. In Relay Mode, `autoConnect` dials every discovered device automatically.
- **Multi-neighbor**: `NeighborManager` keeps many simultaneous links keyed by peer deviceId, with duplicate-link resolution (lower deviceId wins).

### 2.4 How messages are sent

`sendMessage()` → if addressed and recipient public key known, `Crypto.encryptFor()` → build `Packet.message(...)` with `TTL=5` → `neighborManager.broadcast()` to all links → addressed messages tracked in a `pending` map for ACK/retry (max 4 attempts, 5s interval).

### 2.5 How messages are received

`Link.run()` reads length-prefixed JSON packets → `onLinkPacket()` dispatches by type:
- `HELLO` → learn peer identity, register link.
- `MSG` → if addressed to me: ACK + deliver; else dedup + TTL-decrement + re-flood (controlled flooding). Broadcasts delivered by everyone.
- `ACK` → mark delivered or relay onward.
- `PRESENCE` → learn mesh contacts + re-flood.
- `LOCATION` → plot peer on map + re-flood.

### 2.6 Current transport implementation

Bluetooth Classic RFCOMM streams (`DataInputStream`/`DataOutputStream`), one thread per link.

### 2.7 Current packet format

JSON object, length-prefixed with a 4-byte big-endian frame length. Fields: `type, msgId, srcId, dstId, ttl, seq, name, pubKey, payload, lat, lon, timestamp`. (See §3.4 for how this differs from the NINE binary packet.)

### 2.8 Current threading model

- Main thread: UI + `Handler` periodic tasks (presence, retry, rescan).
- One thread per `Link` (blocking read loop).
- `AcceptThread` for server accept.
- Ad-hoc `new Thread` for connect, downloads, and routing.
- Shared state guarded by `ConcurrentHashMap`, `synchronized`, and `mainHandler.post`.

### 2.9 Current lifecycle

Activity-scoped. `onDestroy` unregisters the receiver, cancels handlers, closes all links, stops the accept thread and relay service. Networking is **not** yet moved into the service (so true background relay is incomplete).

---

## 3. Existing Implementations (Overlap with NineCore)

| Capability | Android (existing) | NineCore (our stack) | Overlap |
|-----------|--------------------|-----------------------|---------|
| Bluetooth transport | `Link`/`AcceptThread` RFCOMM | (none — Phase 8 target) | Android is the real transport |
| Wi-Fi Direct | none | `ITransport` abstraction ready | No conflict |
| Socket code | RFCOMM streams | n/a | Android-only |
| Packet serialization | JSON + 4-byte length frame | 71-byte binary header + CRC-32 | **Incompatible wire formats** |
| Encryption | RSA-2048 + AES-256-GCM (`Crypto`) | RSA-2048 + AES-256-GCM (`KeyManager`) | **Same primitives, different framing** |
| Discovery | BT discovery + PRESENCE flood | DISCOVERY/HEARTBEAT (spec) | Functional overlap |
| Routing | Controlled flooding + TTL + dedup + ACK | AODV-style multi-route + dual-path | **Both implement mesh routing** |
| Dual-path | none | node-disjoint dual-path | NineCore-only (research contribution) |
| Identity | UUID deviceId + RSA keys | NodeID + SessionID + RSA | Same idea |

### 3.4 Critical Finding — Two Parallel Protocols

The Android app already contains a **complete, working mesh protocol** (identity,
JSON packets, controlled flooding, presence, E2E encryption, ACK/retry, relay
mode). NineCore is a **second, independently-designed protocol** with a binary
wire format, multi-route AODV-style routing, and node-disjoint dual-path.

They share cryptographic primitives and concepts but are **wire-incompatible**:
- Android packet = JSON, fields `srcId/dstId/ttl/msgId`, 4-byte length frame.
- NINE packet = 71-byte binary header, CRC-32, `PacketType` enum, big-endian.
- Android encryption = `ENC1:encKey:iv:ct` base64 string prefix.
- NINE encryption = split `ENCRYPTED_MESSAGE` + `KEY_PACKET` with sessionId.

**This is the central integration decision for Phase 8+** (see §7).

---

## 4. Where NineCore Should Eventually Integrate (identification only)

These are candidate integration points — **not** instructions to integrate now.

| # | Integration Point | Android location | Rationale |
|---|-------------------|------------------|-----------|
| A | **Transport adapter** | `Link` + `AcceptThread` + `NeighborManager` | The RFCOMM link layer is exactly what a NINE `ITransport` implementation needs to wrap (send bytes to a peer, receive bytes, connection events). Cleanest, lowest-risk seam. |
| B | **Message send pipeline** | `sendMessage()` | Where the app decides to encrypt + build + flood a packet; a NINE-backed path would call `NineCore.sendBroadcast` / `sendSecureMessage`. |
| C | **Message receive pipeline** | `onLinkPacket()` | Where inbound packets are dispatched; a NINE-backed path would call `NineCore.receive(bytes)` and subscribe to `onBroadcast` / `onSecureMessage`. |
| D | **Packet processing** | `Packet.readFrom/writeTo` | The framing boundary where JSON could be swapped for the NINE binary format. |
| E | **Connection management** | `NeighborManager` | Neighbor set + broadcast/dedup maps to NINE's neighbor table + transport connections. |

**Recommended seam:** Point A (transport adapter). Wrapping the existing RFCOMM
link layer as a NINE `ITransport` lets the whole NineCore stack run on Android
with the least disruption and without touching the Android UI or the map/routing
features.

---

## 5. Class Disposition (recommendation, not action)

### 5.1 Never modify
- `OfflineRouter.java` — map/GraphHopper feature, unrelated to protocol.
- `RelayService.java` — foreground-service scaffolding; reusable as-is.
- `MainActivity.java` — launcher/permissions; no protocol logic.
- All `res/` layouts, drawables, menu, map code inside the Activity.

### 5.2 May need small adapters
- `NeighborManager` / `Link` — could expose a thin "send raw bytes to peer / on bytes received" surface that a NINE `ITransport` implementation consumes. Adapter around, not rewrite.
- `Packet.writeTo/readFrom` — a framing shim if NINE binary packets are tunneled over the existing stream.

### 5.3 Potentially replaced (long term, with Android team's consent)
- The controlled-flooding logic in `onLinkPacket()` (MSG/ACK/PRESENCE relay) overlaps with NineCore's routing engine. Only replace if the team decides NineCore becomes the single source of truth.
- `Crypto.java` overlaps with NineCore security; keep one to avoid dual crypto.

### 5.4 Should simply call NineCore (target end-state)
- `sendMessage()` → `NineCore.sendBroadcast` / `sendSecureMessage`.
- `onLinkPacket()` inbound bytes → `NineCore.receive`, with UI updated from `NineCore.onBroadcast` / `onSecureMessage`.

---

## 6. Conflicts, Duplication, Dead Code, Incomplete Modules

### 6.1 Potential merge conflicts
- **Low risk.** Android files live under `app/`; NineCore lives under `core/`. The recent sync merged cleanly (only `README.md`, `Relay.md`, `app/` from remote; no overlap with `core/`, `docs/`, `examples/`).

### 6.2 Architectural conflicts
- **Two protocols** (JSON mesh vs NINE binary). Running both simultaneously would put two incompatible packet formats on the same RFCOMM stream. A decision is required: tunnel NINE packets over the existing transport, or keep the Android protocol and treat NineCore as a reference/desktop-admin stack.

### 6.3 Duplicate functionality
- Encryption (RSA+AES) implemented twice (Android `Crypto`, NINE `KeyManager`).
- Mesh routing implemented twice (Android flooding, NINE routing engine).
- Identity/keys implemented twice.
- Deduplication implemented twice (`seen` LinkedHashMap vs `DuplicatePacketCache`).

### 6.4 Dead / incomplete code
- `RelayService` holds priority but **networking is not yet in the service** (Relay.md flags this as remaining work).
- `startServer()` sets `isServer=true` but the field is largely informational (multi-neighbor design makes client/server symmetric).
- Straight-line fallback + OSRM online routing are map niceties, not protocol.

### 6.5 Version / build notes
- GraphHopper pinned to 1.0 (last Android-compatible release) — do not bump casually.
- `minSdk 23` constrains crypto (why RSA+AES rather than X25519) — NINE's Node crypto choices already align (RSA-2048/AES-256-GCM).

---

## 7. Summary — What Must Be Decided Before Implementation

1. **Protocol authority.** Does NineCore become the single protocol (Android
   tunnels NINE binary packets and drops its JSON protocol), or does NineCore
   run only on the Desktop Admin while Android keeps its own protocol and the
   two interoperate via a gateway/translation layer? This is the pivotal call.

2. **Integration seam.** If Android adopts NineCore, the recommended seam is a
   `BluetoothTransport implements ITransport` that wraps `NeighborManager`/`Link`
   — keeping UI, map, and relay service untouched.

3. **Crypto/identity unification.** Pick one crypto + identity source to avoid
   two key systems on one device.

4. **Wire compatibility.** The Android JSON packet and the NINE binary packet
   are incompatible. Any cross-talk needs either a shared format or a translator.

5. **Scope guard.** The map/offline-routing features (`OfflineRouter`, osmdroid,
   GraphHopper) are orthogonal to the protocol and must remain untouched.

### Bottom line

The Android app is a **self-contained, working mesh chat** with its own protocol
that conceptually mirrors NINE but is wire-incompatible. NineCore's strongest,
lowest-risk entry is as an `ITransport`-wrapped adapter over the existing RFCOMM
link layer, leaving Android UI/map/relay code alone. No integration should begin
until the protocol-authority decision (item 1) is made.

---

*End of Android Context Report — analysis only, no code modified.*
