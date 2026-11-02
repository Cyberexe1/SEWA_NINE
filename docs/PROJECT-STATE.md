# NINE — Project State & Session Handoff

## Document Metadata

| Field | Value |
|-------|-------|
| Purpose | Resume point for the next session |
| Date | 2026-07-15 |
| Current version | v0.7.6-alpha (tagged) |
| Next milestone | Phase 8 — Wi-Fi Direct Transport (BLOCKED on a decision) |

---

## 1. What NINE Is

**NINE** (No Infrastructure Network Exchange) — a BE final-year project: an
infrastructure-less, offline mesh communication protocol. No internet, cellular,
cloud, or server. Two modes: **Broadcast** (one-to-all) and **Secure** (one-to-Admin,
dual-path encrypted). Defining research contribution: **dual-path secure messaging**
(encrypted message and encrypted key travel two node-disjoint mesh paths, reassembled
only at the Admin).

The **protocol is the project** — Android and Desktop are just clients of the core.

---

## 2. Repository Facts

- Path: `e:\personal projects\Project_NINE`
- Remote: `https://github.com/Cyberexe1/Project_NINE.git` (origin)
- Branch: `main`
- Language/runtime: TypeScript, Node.js 20+, ESM (`NodeNext`), strict mode.
- Test runner: **vitest** (`npx vitest --run`). Type check: `npx tsc --noEmit`.
- Examples runner: `npm run demo <1-8>` (uses `tsx`).
- OS: Windows, shell is cmd/powershell. In tool calls use `cwd` param, `;` not `&&`.
- **IMPORTANT (Windows/vitest gotcha):** never name a source file `Node.ts` — it
  collides with Node internals in vitest resolution (the class is `MeshNode` in
  `core/node/MeshNode.ts`). Never use PowerShell `Set-Content` on test files (it
  writes UTF-16 and breaks vitest); use the fs_write tool instead.

### Current git state (uncommitted)
- `docs/Android-Context-Report.md` — untracked (analysis report, not committed).
- `docs/PROJECT-STATE.md` — this file (untracked).
- Local `main` is ~10 commits ahead of `origin/main` and NOT pushed.
- `app/` (Android) is untouched and must stay that way unless explicitly asked.

---

## 3. Completed Phases (all frozen, tag = git tag)

| Phase | Tag | Module | Location |
|-------|-----|--------|----------|
| 1 | v0.1.0-alpha | Packet Engine (serialize/parse/validate/CRC-32/UUID/factory) | `core/protocol/` |
| 2 | v0.2.0-alpha | Node Layer (MeshNode, NeighborTable, RoutingTable, NodeRegistry, HeartbeatState, NodeStatus, NodeID) | `core/node/` |
| 3 | v0.3.0-alpha | Virtual Mesh Simulator (VirtualClock, VirtualTransport, NodeSimulator, SimulationController, SimulationEvents) | `core/simulator/` |
| 4 | v0.4.0-alpha | Routing Engine (RoutingEngine, RouteDiscovery, RouteCache, DuplicatePacketCache, TTLManager, AckManager, PendingMessageQueue, LoopPrevention, IRouter) | `core/routing/` |
| 5 | v0.5.0-alpha | Security Engine (AES256GCM, RSA2048, SHA256, SessionKey, KeyManager, ReplayProtection) | `core/security/` |
| 6 | v0.6.0-alpha | Dual-Path Messaging (DualPathManager, PathSelector, ReassemblyManager) | `core/messaging/` |
| 7 | v0.7.0-alpha | Transport Abstraction (ITransport, MockTransport, VirtualTransportAdapter, TransportManager, TransportSelector, TransportFactory, TransportCapabilities, TransportMetrics, TransportEvents, TransportState) | `core/transport/` |
| 7.5 | v0.7.5-alpha | NineCore Integration Layer (NineCore, NineCoreBuilder, NineConfiguration, NineEvents, NineMetrics) | `core/` |
| 7.6 | v0.7.6-alpha | Examples Suite + **multi-route/node-disjoint dual-path defect fix** | `examples/` + routing/messaging |

**Test status:** 305 tests passing across 8 files. `npx tsc --noEmit` clean.

**Frozen rule:** Do NOT modify Packet Engine, Node Layer, Simulator, Routing,
Security, Dual-Path, Transport, or NineCore unless a protocol defect is found.

---

## 4. Key Architecture Facts

- **NineCore is the single public API.** Apps never touch internal engines.
  Public methods: `initialize, shutdown, sendBroadcast, sendSecureMessage,
  receive, discoverPeers, connect, disconnect, discoverRoute, getTopology,
  getNeighbors, getRoutes, getMetrics, getNodeInfo, getAdminPublicKey,
  setAdminPublicKey, onBroadcast, onSecureMessage, onNodeJoined, onNodeLeft,
  onTransportChanged, tick`.
- **Transport injection:** NineCore takes any `ITransport` via `NineCoreBuilder`.
  `MockTransport` (in-memory) and `VirtualTransportAdapter` (wraps frozen simulator)
  are the two implementations. Phase 8 adds Wi-Fi Direct behind the same interface.
- **Async/sync bridge:** RoutingEngine expects synchronous send; ITransport is async.
  NineCore bridges with fire-and-forget (`void transport.send(...)`) — matches
  best-effort delivery semantics.
- **Packet header:** 71 bytes, big-endian, CRC-32. 11 packet types (0x01–0x0B incl.
  KEY_ANNOUNCE). See `docs/NINE-PacketEncoding-v1.0.md`.
- **Multi-route (Phase 7.6 fix):** RouteCache stores multiple routes per destination;
  RREQ dedup is path-aware (destination answers each distinct path so one flood finds
  multiple disjoint routes). Methods: `getPrimaryRoute, getSecondaryRoute,
  getDisjointRoutes, getBestRoute`. DualPathManager queues sends until a disjoint
  pair is discovered (retryPending on route-add), single-path fallback on tick.
  **Dual-path example now reports `dualPathAchieved: true`.**

---

## 5. Documentation Map (`docs/`)

- `NINE-RFC-v1.0.md` — the RFC (v0.9.1, frozen). Includes packet types, routing,
  security, state machines, failure handling, 40 protocol rules, worked examples.
- `NINE-PacketEncoding-v1.0.md` — binary wire format.
- `NINE-Timing-v1.0.md` — all timers/defaults.
- `NINE-ErrorCodes-v1.0.md` — error code registry.
- `NINE-Versioning-v1.0.md` — version/compat/reserved values.
- `SDK.md` — NineCore public SDK docs.
- `Android-Context-Report.md` — **read this before Phase 8** (Android analysis).
- Older docs: Architecture.md, Protocol.md, Routing.md, Security.md, Transport.md,
  PacketFormat.md, API.md, Database.md, DemoPlan.md, ADR/ADR-00{1,2,3}.

---

## 6. THE OPEN DECISION (blocks Phase 8)

The Android app (`app/`, owned by other team members, **do not modify**) already
contains a COMPLETE, WORKING mesh protocol in Java that is **wire-incompatible**
with NineCore:

- Android: JSON packets + 4-byte length frame, controlled flooding, RSA+AES
  (`Crypto.java`), presence/ACK/relay, `NeighborManager`/`Link`/`AcceptThread`
  over Bluetooth Classic RFCOMM. Also has an offline map (osmdroid + GraphHopper).
- NineCore: 71-byte binary packets, AODV-style multi-route + node-disjoint dual-path.

**Decision needed from the user before ANY Android integration or Phase 8:**
> Does NineCore become the single protocol (Android tunnels NINE binary packets,
> retires its JSON protocol), OR does NineCore run only on the Desktop Admin and
> interoperate with Android's existing protocol via a gateway/translator?

**Recommended integration seam (if Android adopts NineCore):** implement
`BluetoothTransport implements ITransport` wrapping the existing `NeighborManager`/
`Link` RFCOMM layer — leaves Android UI, map, and relay service untouched.

Full details, class-by-class disposition (never-modify / adapter / replace /
call-NineCore), and duplication analysis are in `docs/Android-Context-Report.md`.

---

## 7. Android App Quick Facts (read-only)

- Package `com.p2pchat.app`, 6 Java files (~2,655 lines).
- `MainActivity` (launcher/permissions) → `BluetoothChatActivity` (2,129 lines: UI,
  mesh, map, relay, settings — 4-tab single activity).
- `Packet.java` (JSON mesh packet), `Crypto.java` (RSA-2048+AES-256-GCM),
  `OfflineRouter.java` (GraphHopper — DO NOT TOUCH), `RelayService.java` (foreground svc).
- Bluetooth Classic RFCOMM only. No Wi-Fi Direct, no BLE, no SQLite.
- minSdk 23, targetSdk 34, GraphHopper pinned to 1.0 (last Android-compatible).
- `Relay.md` at repo root documents the Android team's relay design.

---

## 8. How To Resume (next session checklist)

1. `cd` to `e:\personal projects\Project_NINE`.
2. Verify green baseline: `npx tsc --noEmit` then `npx vitest --run` (expect 305 pass).
3. Optional: `npm run demo 8` (expect all 7 examples PASS, dual-path `dualPathUsed=1`).
4. Read `docs/Android-Context-Report.md` and `docs/PROJECT-STATE.md` (this file).
5. **Ask the user the protocol-authority decision** (Section 6) before Phase 8.
6. Consider committing the two untracked docs if the user approves
   (`docs/Android-Context-Report.md`, `docs/PROJECT-STATE.md`).
7. Respect freezes; only touch frozen modules for a genuine protocol defect.

---

## 9. Working Conventions (learned this project)

- Present a design and WAIT for approval before implementing each phase.
- After each approved phase: commit + `git tag vX.Y.Z-alpha`, then build the next.
- Never modify `app/` (Android) unless explicitly told.
- Keep `fs_write` chunks ≤ ~50 lines; use `fs_append` for the rest.
- Every phase: implement → `tsc --noEmit` clean → tests pass → summarize.
- Do not push to remote unless explicitly asked.

---

*End of handoff. Next action: get the protocol-authority decision, then Phase 8.*
