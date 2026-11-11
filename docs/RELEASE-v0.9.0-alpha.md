# NINE Protocol — Release Notes v0.9.0-alpha

## Release Summary

This release completes the **Bluetooth Transport layer** and the **Protocol Compliance & Validation Suite**, bringing the NINE protocol core from a simulator-only implementation to a hardware-ready transport stack. The protocol logic is unchanged; this is purely an infrastructure and verification milestone.

**Version**: v0.9.0-alpha
**Date**: 2026-07-18
**Previous release**: v0.7.6-alpha (Examples Suite + dual-path fix)
**Tag**: `v0.9.0-alpha`

---

## Major Completed Work

### Phase 8 — Protocol Compliance & Validation (8.0–8.2)
- Built a 117-test compliance suite verifying all 40 RFC Section 13 mandatory rules
- Discovered and fixed 2 protocol defects (Rule 13: HEARTBEAT forwarding, Rule 27: missing ENCRYPTED/REQUIRES_ACK flags)
- Produced `docs/ProtocolComplianceReport.md` with full RFC coverage matrix
- Corrected stale documentation (header sizes, packet counts, payload limits)
- Created documentation audit identifying authoritative vs legacy docs

### Phase 9 — Bluetooth Transport (9.1–9.10)
- Designed the integration architecture (`docs/Bluetooth-Transport-Design.md`)
- Implemented `BluetoothTransport` — full `ITransport` implementation for Bluetooth Classic RFCOMM
- Implemented `BluetoothLink` — per-connection socket wrapper with framed I/O
- Implemented `BluetoothAcceptLoop` — server socket accept loop
- Implemented `BluetoothDiscoveryManager` — discovery with duplicate suppression and timeout
- Implemented `ConnectionPolicy` — max peers, exponential backoff, blacklisting, cooldown
- Implemented `PeerIdMapper` — bidirectional PeerID ↔ NodeID mapping
- Proven end-to-end integration with NineCore (packets flow both directions)
- Frozen the Bluetooth Transport API (`docs/BluetoothTransport.md`)

---

## Architecture Overview

```
NineCore (protocol logic)
    ↕
TransportManager (multi-transport coordinator)
    ↕
┌─────────────┬─────────────────┬───────────────────┐
│MockTransport│VirtualTransport │BluetoothTransport │
│(unit tests) │(simulator)      │(RFCOMM — NEW)     │
└─────────────┴─────────────────┴───────────────────┘
```

All three transports implement `ITransport` identically. The protocol layer has zero awareness of which transport is active.

---

## Implemented Features

| Feature | Status |
|---------|--------|
| Binary packet engine (71-byte header, CRC-32) | ✅ Stable |
| On-demand multi-route discovery (AODV-style) | ✅ Stable |
| Node-disjoint dual-path secure messaging | ✅ Stable |
| AES-256-GCM + RSA-2048-OAEP encryption | ✅ Stable |
| Replay protection (ID + timestamp + sequence) | ✅ Stable |
| Transport abstraction (ITransport interface) | ✅ Stable |
| Bluetooth Classic RFCOMM transport | ✅ Stable (API frozen) |
| Connection policy (capacity, backoff, blacklist) | ✅ Stable |
| Device discovery with duplicate suppression | ✅ Stable |
| Length-prefixed framed packet I/O | ✅ Stable |
| Protocol compliance validation suite | ✅ Stable |
| 7 runnable examples (broadcast, secure, dual-path, failure, replay, benchmark, mesh) | ✅ Stable |

---

## Testing Summary

| Category | Tests |
|----------|-------|
| Protocol (packet engine) | 29 |
| Node layer | 69 |
| Simulator | 45 |
| Routing engine | 40 |
| Security engine | 48 |
| Dual-path messaging | 20 |
| Transport abstraction (original) | 36 |
| Bluetooth transport (unit) | 121 |
| NineCore integration (original) | 18 |
| Bluetooth NineCore integration | 11 |
| Compliance suite | 123 |
| **Total** | **560** |

All tests pass. Zero TypeScript compilation errors. Zero TODOs in source.

---

## Known Limitations

1. **Ed25519 signing not implemented** — SIGNED flag on ENCRYPTED_MESSAGE/KEY_PACKET is not set (ENCRYPTED + REQUIRES_ACK are set). RFC Rule 27 is partially addressed.
2. **Discovery protocol not implemented** — DISCOVERY/DISCOVERY_RESPONSE/KEY_ANNOUNCE packets are defined but no encoder/handler exists. Peer discovery uses transport-layer events.
3. **Heartbeat emission not wired** — `HeartbeatState` tracks liveness; nothing emits HEARTBEAT packets on a timer.
4. **TransportHandshake not implemented** — PeerID→NodeID mapping must be populated externally.
5. **No real Android adapter** — `IBluetoothAdapter` is the abstraction; a concrete Android implementation wrapping `BluetoothAdapter` is the next step.
6. **Android protocol decision pending** — Whether NineCore replaces the Android JSON protocol or runs alongside it via a gateway.

---

## Future Milestones

| Phase | Milestone |
|-------|-----------|
| 10 | Real Android `IBluetoothAdapter` implementation |
| 11 | Android activity integration (replace JSON protocol with NineCore) |
| 12 | Desktop Admin application (Electron + React) |
| 13 | Discovery protocol implementation (DISCOVERY/DISCOVERY_RESPONSE/KEY_ANNOUNCE) |
| 14 | Heartbeat emission and Ed25519 signing |

---

## Breaking Changes

None. The `ITransport` interface is unchanged from v0.7.0-alpha. The `NineCore` public API is unchanged from v0.7.5-alpha. All existing tests continue to pass.

---

## Repository Statistics

| Metric | Value |
|--------|-------|
| TypeScript source files (`core/`) | ~73 |
| Test files | 17 |
| Total tests | 560 |
| Documentation files (`docs/`) | 28 |
| Example scenarios | 7 |
| Git tags (existing) | 9 (v0.1.0-alpha through v0.7.6-alpha) |
| Lines of TypeScript (approx) | ~8,000 |
