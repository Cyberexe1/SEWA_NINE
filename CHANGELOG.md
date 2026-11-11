# Changelog

All notable changes to the NINE protocol are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.9.0-alpha] — 2026-07-18

### Added
- **Bluetooth Transport** (`core/transport/Bluetooth*.ts`): Full `ITransport` implementation for Bluetooth Classic RFCOMM — lifecycle, discovery, connection management, framed send/receive, event emission, metrics.
- **Connection Policy** (`core/transport/ConnectionPolicy.ts`): Max simultaneous peers (7), exponential backoff after failure, peer blacklisting, reconnect cooldown.
- **Discovery Manager** (`core/transport/BluetoothDiscovery.ts`): Device scan lifecycle with duplicate suppression, configurable timeout, and platform-agnostic event reporting.
- **PeerID Mapper** (`core/transport/PeerIdMapper.ts`): Bidirectional PeerID ↔ NodeID lookup for transport-to-protocol identity bridging.
- **Protocol Compliance Suite** (`tests/compliance/`): 123 tests verifying all 40 RFC Section 13 rules, malformed packet rejection, stress conditions, wire-format compatibility.
- **Regression Tests** (`tests/compliance/RegressionDefects.test.ts`): Prevent re-introduction of fixed defects (Rule 13, Rule 27).
- **Bluetooth NineCore Integration Tests** (`tests/integration/bluetooth-ninecore-integration.test.ts`): End-to-end proof that BluetoothTransport plugs into NineCore.
- **Documentation**: `BluetoothTransport.md`, `Bluetooth-Transport-Design.md`, `ProtocolComplianceReport.md`, `Documentation-Audit.md`, `File-Structure.md`, `RELEASE-v0.9.0-alpha.md`.

### Changed
- `core/messaging/DualPathManager.ts`: ENCRYPTED_MESSAGE and KEY_PACKET now set `PacketFlags.ENCRYPTED | PacketFlags.REQUIRES_ACK` (previously no flags were set).
- `core/routing/RoutingEngine.ts`: DISCOVERY, DISCOVERY_RESPONSE, and HEARTBEAT packets are now delivered locally but never forwarded (previously fell through to `handleUnicast` which would relay them — violating RFC Rule 13).
- `core/shared/Constants.ts`: Fixed stale `HEADER_SIZE: 66` → `71` (unused file, brought into consistency).
- `tests/routing/routing-engine.test.ts`: Changed unicast test packet type from HEARTBEAT to ENCRYPTED_MESSAGE (HEARTBEAT must never be multi-hop routed per RFC).
- `docs/NINE-PacketEncoding-v1.0.md`: Fixed max unsigned payload from 3961 → 4025.
- `docs/PacketFormat.md`: Fixed header size (66→71), field offsets, max payload figures, checksum offset.
- `docs/Protocol.md`: Added missing KEY_ANNOUNCE (0x0B) to packet type table.

### Fixed
- **RFC Rule 13 (forwarding)**: HEARTBEAT/DISCOVERY/DISCOVERY_RESPONSE no longer forwarded by RoutingEngine.
- **RFC Rule 27 (flags)**: ENCRYPTED_MESSAGE/KEY_PACKET now carry ENCRYPTED and REQUIRES_ACK flags (SIGNED deferred until Ed25519 implementation).

### Documentation
- Full repository file structure inventory (`docs/File-Structure.md`)
- Documentation audit with conflict analysis (`docs/Documentation-Audit.md`)
- Bluetooth transport design spec (`docs/Bluetooth-Transport-Design.md`)
- Bluetooth transport API reference (`docs/BluetoothTransport.md`)
- Protocol compliance report (`docs/ProtocolComplianceReport.md`)
- Updated `docs/PROJECT-STATE.md` to current milestone

### Testing
- Test count: 305 → 560 (+255 new tests)
- New test files: 8 (6 compliance, 1 bluetooth transport, 1 bluetooth integration)
- All 560 tests pass with zero TypeScript errors

### Known Limitations
- Ed25519 signing not implemented (SIGNED flag deferred)
- Discovery protocol (DISCOVERY/DISCOVERY_RESPONSE packets) is interface-only
- Heartbeat emission not wired into NineCore.tick()
- TransportHandshake (automatic PeerID→NodeID mapping) not implemented
- Real Android IBluetoothAdapter not yet implemented

## [0.7.6-alpha] — 2026-07-15

### Added
- Examples Suite (7 runnable scenarios demonstrating NineCore API)
- Multi-route RouteCache rewrite for genuine node-disjoint dual-path support

### Fixed
- `dualPathAchieved` now correctly reports `true` when disjoint paths are used

## [0.7.5-alpha] — 2026-07-15

### Added
- NineCore integration layer (composition root, builder, configuration, events, metrics)
- `docs/SDK.md` — public API documentation

## [0.7.0-alpha] — 2026-07-15

### Added
- Transport Abstraction Layer (ITransport, MockTransport, VirtualTransportAdapter, TransportManager, TransportSelector, TransportFactory, TransportCapabilities, TransportMetrics, TransportEvents, TransportState)

## [0.6.0-alpha] — 2026-07-15

### Added
- Dual-Path Messaging (DualPathManager, PathSelector, ReassemblyManager)

## [0.5.0-alpha] — 2026-07-15

### Added
- Security Engine (AES256GCM, RSA2048, SHA256, SessionKey, KeyManager, ReplayProtection)

## [0.4.0-alpha] — 2026-07-15

### Added
- Routing Engine (RoutingEngine, RouteDiscovery, RouteCache, DuplicatePacketCache, TTLManager, AckManager, PendingMessageQueue, LoopPrevention, IRouter)

## [0.3.0-alpha] — 2026-07-15

### Added
- Virtual Mesh Simulator (VirtualClock, VirtualTransport, NodeSimulator, SimulationController, SimulationEvents)

## [0.2.0-alpha] — 2026-07-15

### Added
- Node Layer (MeshNode, NeighborTable, RoutingTable, NodeRegistry, HeartbeatState, NodeStatus, NodeID)

## [0.1.0-alpha] — 2026-07-15

### Added
- Packet Engine (Serializer, Parser, Validator, Checksum, UuidUtils, PacketFactory, Packet model)
