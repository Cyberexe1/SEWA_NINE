# NINE — Project State & Session Handoff

## Document Metadata

| Field | Value |
|-------|-------|
| Purpose | Resume point for the next session |
| Date | 2026-07-18 |
| Current version | v0.9.0-alpha (pending tag) |
| Previous tag | v0.7.6-alpha |
| Next milestone | Phase 10 — Android Integration |

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
  collides with Node internals in vitest resolution. Never use PowerShell
  `Set-Content` on test files (writes UTF-16, breaks vitest).

---

## 3. Completed Phases

| Phase | Tag | Module | Location |
|-------|-----|--------|----------|
| 1 | v0.1.0-alpha | Packet Engine | `core/protocol/` |
| 2 | v0.2.0-alpha | Node Layer | `core/node/` |
| 3 | v0.3.0-alpha | Virtual Mesh Simulator | `core/simulator/` |
| 4 | v0.4.0-alpha | Routing Engine | `core/routing/` |
| 5 | v0.5.0-alpha | Security Engine | `core/security/` |
| 6 | v0.6.0-alpha | Dual-Path Messaging | `core/messaging/` |
| 7 | v0.7.0-alpha | Transport Abstraction | `core/transport/` |
| 7.5 | v0.7.5-alpha | NineCore Integration Layer | `core/NineCore*.ts` |
| 7.6 | v0.7.6-alpha | Examples Suite + dual-path defect fix | `examples/` |
| 8.0 | — | Protocol Compliance & Validation Suite | `core/validation/`, `tests/compliance/` |
| 8.1 | — | Documentation Audit | `docs/Documentation-Audit.md` |
| 8.2 | — | Protocol defect fixes (Rule 13, Rule 27 partial) | `core/routing/`, `core/messaging/` |
| 9.1 | — | Bluetooth Transport Design | `docs/Bluetooth-Transport-Design.md` |
| 9.2 | — | BluetoothTransport skeleton | `core/transport/Bluetooth*.ts` |
| 9.3 | — | Connection management | `BluetoothLink.ts`, `BluetoothAcceptLoop.ts` |
| 9.4 | — | Discovery & advertisement | `BluetoothDiscovery.ts` |
| 9.5 | — | Connection policy | `ConnectionPolicy.ts` |
| 9.6 | — | Packet transmission | `BluetoothLink.writeFrame()` |
| 9.7 | — | Packet reception | `BluetoothLink.startReadLoop()` |
| 9.8 | — | NineCore integration | integration tests |
| 9.9 | — | API freeze & documentation | `docs/BluetoothTransport.md` |
| 9.10 | — | Release preparation | this update |

**Test status:** 560 tests passing across 17 test files. `npx tsc --noEmit` clean.

---

## 4. Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                          │
│         (Android App, Desktop Admin — future)                │
├─────────────────────────────────────────────────────────────┤
│                       NineCore SDK                           │
│              (Public API — docs/SDK.md)                      │
├─────────────────────────────────────────────────────────────┤
│  Protocol    │  Routing    │  Security    │  Messaging       │
│  (packets)   │  (AODV)    │  (AES+RSA)   │  (dual-path)    │
├──────────────┼─────────────┼──────────────┼─────────────────┤
│                    Transport Abstraction                      │
│        ITransport interface (pluggable)                      │
├──────────────┬──────────────┬────────────────────────────────┤
│ MockTransport│ VirtualTrans │ BluetoothTransport (NEW)       │
│ (tests)      │ (simulator)  │ (RFCOMM — stable API)         │
└──────────────┴──────────────┴────────────────────────────────┘
```

---

## 5. Bluetooth Transport Status

- **API**: STABLE, frozen, documented in `docs/BluetoothTransport.md`
- **Classes**: 6 (`BluetoothTransport`, `BluetoothLink`, `BluetoothAcceptLoop`, `BluetoothDiscoveryManager`, `ConnectionPolicy`, `PeerIdMapper`)
- **Tests**: 121 unit + 11 integration = 132 Bluetooth-specific tests
- **Integration**: Proven via NineCore — packets flow in both directions through the full stack
- **Platform bridge**: `IBluetoothAdapter` / `IBluetoothSocket` / `IBluetoothServerSocket` abstractions ready for Android implementation
- **Remaining**: Real Android `IBluetoothAdapter` implementation (wrapping `BluetoothAdapter` + `BroadcastReceiver`)

---

## 6. Protocol Status

- 40 RFC Section 13 mandatory rules: 36 pass, 2 fixed (Rule 13, Rule 27 partial), 4 N/A (discovery not implemented)
- Known remaining defect: SIGNED flag requires Ed25519 signing implementation (documented)
- Known gaps: Discovery protocol (DISCOVERY/DISCOVERY_RESPONSE packets), Heartbeat emission, KEY_ANNOUNCE — all interface-only scaffolding

---

## 7. Open Decision (still blocking)

The Android app (`app/`) has its own JSON mesh protocol. The decision remains:
> Does NineCore become the single protocol (Android tunnels NINE binary packets),
> OR does NineCore run only on Desktop Admin with a gateway?

See `docs/Android-Context-Report.md` for full analysis.

---

## 8. How To Resume

1. `cd` to `e:\personal projects\Project_NINE`
2. Verify: `npx tsc --noEmit` then `npx vitest --run` (expect 560 pass)
3. Read this file + `docs/BluetoothTransport.md`
4. If Android integration approved → implement real `IBluetoothAdapter` wrapping Android APIs
5. Respect freezes; do not modify frozen modules without verified defect

---

## 9. Working Conventions

- Present a design and WAIT for approval before implementing each phase.
- After each approved phase: commit + `git tag vX.Y.Z-alpha`, then build the next.
- Never modify `app/` (Android) unless explicitly told.
- Every phase: implement → `tsc --noEmit` clean → tests pass → summarize.
- Do not push to remote unless explicitly asked.
