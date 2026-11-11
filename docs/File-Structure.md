# Project NINE — Repository File Structure Inventory

Generated as a read-only documentation exercise. This document describes the repository **exactly as it currently exists**. No files were created, modified, moved, renamed, or deleted to produce this report (only this file itself was added).

Excluded from the tree per instructions: `node_modules/`, `.git/`, build outputs, `.gradle/` cache, `.idea/`, `.vscode/` internals beyond listing it exists, and other generated caches. Where excluded content is relevant (e.g. `node_modules` dependency names), it is summarized in prose instead of listed file-by-file.

---

## 1. Complete Recursive Directory Tree

```
Project_NINE/
├── .kiro/
│   └── steering/
│       └── rules.md
├── .vscode/
│   └── settings.json
├── admin/
│   ├── assets/
│   │   └── .gitkeep
│   ├── components/
│   │   └── .gitkeep
│   ├── electron/
│   │   └── .gitkeep
│   ├── graph/
│   │   └── .gitkeep
│   ├── hooks/
│   │   └── .gitkeep
│   ├── pages/
│   │   └── .gitkeep
│   ├── react/
│   │   └── .gitkeep
│   ├── services/
│   │   └── .gitkeep
│   ├── src/
│   │   └── .gitkeep
│   ├── utils/
│   │   └── .gitkeep
│   └── README.md
├── app/
│   ├── src/
│   │   └── main/
│   │       ├── java/
│   │       │   └── com/
│   │       │       └── p2pchat/
│   │       │           └── app/
│   │       │               ├── BluetoothChatActivity.java
│   │       │               ├── Crypto.java
│   │       │               ├── MainActivity.java
│   │       │               ├── OfflineRouter.java
│   │       │               ├── Packet.java
│   │       │               └── RelayService.java
│   │       ├── res/
│   │       │   ├── drawable/
│   │       │   │   ├── bg_input_bar.xml
│   │       │   │   ├── bg_input_field.xml
│   │       │   │   ├── logo.jpeg
│   │       │   │   └── startup_page.jpeg
│   │       │   ├── layout/
│   │       │   │   ├── activity_bluetooth_chat.xml
│   │       │   │   ├── activity_main.xml
│   │       │   │   ├── dialog_username.xml
│   │       │   │   ├── list_item_device.xml
│   │       │   │   └── list_item_message.xml
│   │       │   ├── menu/
│   │       │   │   └── bottom_nav_menu.xml
│   │       │   ├── mipmap-hdpi/
│   │       │   │   ├── ic_launcher.png
│   │       │   │   └── ic_launcher_round.png
│   │       │   ├── mipmap-mdpi/
│   │       │   │   ├── ic_launcher.png
│   │       │   │   └── ic_launcher_round.png
│   │       │   ├── mipmap-xhdpi/
│   │       │   │   ├── ic_launcher.png
│   │       │   │   └── ic_launcher_round.png
│   │       │   ├── mipmap-xxhdpi/
│   │       │   │   ├── ic_launcher.png
│   │       │   │   └── ic_launcher_round.png
│   │       │   ├── mipmap-xxxhdpi/
│   │       │   │   ├── ic_launcher.png
│   │       │   │   └── ic_launcher_round.png
│   │       │   ├── values/
│   │       │   │   ├── colors.xml
│   │       │   │   ├── strings.xml
│   │       │   │   └── themes.xml
│   │       │   └── xml/
│   │       │       ├── backup_rules.xml
│   │       │       └── data_extraction_rules.xml
│   │       └── AndroidManifest.xml
│   ├── build.gradle
│   └── proguard-rules.pro
├── assets/
│   ├── icons/
│   │   └── .gitkeep
│   ├── logo/
│   │   └── .gitkeep
│   └── screenshots/
│       └── .gitkeep
├── core/
│   ├── broadcast/
│   │   └── BroadcastEngine.ts
│   ├── discovery/
│   │   ├── DiscoveryService.ts
│   │   └── Heartbeat.ts
│   ├── messaging/
│   │   ├── DualPathManager.ts
│   │   ├── PathSelector.ts
│   │   └── ReassemblyManager.ts
│   ├── monitor/
│   │   ├── NetworkHealth.ts
│   │   └── TopologyMonitor.ts
│   ├── node/
│   │   ├── HeartbeatState.ts
│   │   ├── MeshNode.ts
│   │   ├── NeighborTable.ts
│   │   ├── NodeID.ts
│   │   ├── NodeRegistry.ts
│   │   ├── NodeStatus.ts
│   │   └── RoutingTable.ts
│   ├── protocol/
│   │   ├── Checksum.ts
│   │   ├── Packet.ts
│   │   ├── PacketFactory.ts
│   │   ├── Parser.ts
│   │   ├── Serializer.ts
│   │   ├── UuidUtils.ts
│   │   └── Validator.ts
│   ├── routing/
│   │   ├── AckManager.ts
│   │   ├── DuplicatePacketCache.ts
│   │   ├── IRouter.ts
│   │   ├── LoopPrevention.ts
│   │   ├── PendingMessageQueue.ts
│   │   ├── RouteCache.ts
│   │   ├── RouteDiscovery.ts
│   │   ├── RoutingEngine.ts
│   │   └── TTLManager.ts
│   ├── security/
│   │   ├── AES256GCM.ts
│   │   ├── KeyManager.ts
│   │   ├── ReplayProtection.ts
│   │   ├── RSA2048.ts
│   │   ├── SessionKey.ts
│   │   └── SHA256.ts
│   ├── shared/
│   │   ├── Config.ts
│   │   ├── Constants.ts
│   │   ├── Logger.ts
│   │   └── Types.ts
│   ├── simulator/
│   │   ├── NodeSimulator.ts
│   │   ├── SimulationController.ts
│   │   ├── SimulationEvents.ts
│   │   ├── VirtualClock.ts
│   │   └── VirtualTransport.ts
│   ├── storage/
│   │   ├── MessageStore.ts
│   │   ├── NodeStore.ts
│   │   └── SQLite.ts
│   ├── transport/
│   │   ├── ITransport.ts
│   │   ├── MockTransport.ts
│   │   ├── TransportCapabilities.ts
│   │   ├── TransportEvents.ts
│   │   ├── TransportFactory.ts
│   │   ├── TransportManager.ts
│   │   ├── TransportMetrics.ts
│   │   ├── TransportSelector.ts
│   │   ├── TransportState.ts
│   │   └── VirtualTransportAdapter.ts
│   ├── validation/
│   │   ├── ComplianceReport.ts
│   │   ├── ProtocolValidator.ts
│   │   └── RFCValidator.ts
│   ├── NineConfiguration.ts
│   ├── NineCore.ts
│   ├── NineCoreBuilder.ts
│   ├── NineEvents.ts
│   └── NineMetrics.ts
├── database/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   ├── seed/
│   │   └── README.md
│   └── schema.sql
├── docs/
│   ├── ADR/
│   │   ├── ADR-001-CoreArchitecture.md
│   │   ├── ADR-002-Routing.md
│   │   └── ADR-003-Security.md
│   ├── diagrams/
│   │   ├── Architecture.drawio
│   │   ├── DFD.drawio
│   │   ├── MeshTopology.drawio
│   │   └── Sequence.drawio
│   ├── Android-Context-Report.md
│   ├── API.md
│   ├── Architecture.md
│   ├── Database.md
│   ├── DemoPlan.md
│   ├── File-Structure.md                     (this document)
│   ├── NINE-ErrorCodes-v1.0.md
│   ├── NINE-PacketEncoding-v1.0.md
│   ├── NINE-RFC-v1.0.md
│   ├── NINE-Timing-v1.0.md
│   ├── NINE-Versioning-v1.0.md
│   ├── NineCore_Android_Integration.md
│   ├── PacketFormat.md
│   ├── PROJECT-STATE.md
│   ├── Protocol.md
│   ├── ProtocolComplianceReport.md
│   ├── Routing.md
│   ├── SDK.md
│   ├── Security.md
│   └── Transport.md
├── examples/
│   ├── 01-Broadcast/
│   │   ├── expected-output.md
│   │   ├── main.ts
│   │   └── README.md
│   ├── 02-SecureMessage/
│   │   ├── expected-output.md
│   │   ├── main.ts
│   │   └── README.md
│   ├── 03-DualPath/
│   │   ├── expected-output.md
│   │   ├── main.ts
│   │   └── README.md
│   ├── 04-RelayFailure/
│   │   ├── expected-output.md
│   │   ├── main.ts
│   │   └── README.md
│   ├── 05-ReplayAttack/
│   │   ├── expected-output.md
│   │   ├── main.ts
│   │   └── README.md
│   ├── 06-Benchmark/
│   │   ├── expected-output.md
│   │   ├── main.ts
│   │   └── README.md
│   ├── 07-MultiNodeMesh/
│   │   ├── expected-output.md
│   │   ├── main.ts
│   │   └── README.md
│   ├── assets/
│   │   └── .gitkeep
│   ├── results/
│   │   ├── logs/
│   │   │   ├── 01-broadcast.log
│   │   │   ├── 02-secure-message.log
│   │   │   ├── 03-dual-path.log
│   │   │   ├── 04-relay-failure.log
│   │   │   ├── 05-replay-attack.log
│   │   │   ├── 06-benchmark.log
│   │   │   └── 07-multi-node-mesh.log
│   │   ├── metrics/
│   │   │   ├── 01-broadcast.metrics.json
│   │   │   ├── 01-broadcast.summary.json
│   │   │   ├── 02-secure-message.metrics.json
│   │   │   ├── 02-secure-message.summary.json
│   │   │   ├── 03-dual-path.metrics.json
│   │   │   ├── 03-dual-path.summary.json
│   │   │   ├── 04-relay-failure.metrics.json
│   │   │   ├── 04-relay-failure.summary.json
│   │   │   ├── 05-replay-attack.metrics.json
│   │   │   ├── 05-replay-attack.summary.json
│   │   │   ├── 06-benchmark.metrics.json
│   │   │   ├── 06-benchmark.summary.json
│   │   │   ├── 07-multi-node-mesh.metrics.json
│   │   │   ├── 07-multi-node-mesh.summary.json
│   │   │   ├── benchmark.csv
│   │   │   ├── latency.csv
│   │   │   ├── packet-loss.csv
│   │   │   └── throughput.csv
│   │   ├── screenshots/
│   │   │   └── .gitkeep
│   │   └── traces/
│   │       ├── 01-broadcast.trace.json
│   │       ├── 02-secure-message.trace.json
│   │       ├── 03-dual-path.trace.json
│   │       ├── 04-relay-failure.trace.json
│   │       ├── 05-replay-attack.trace.json
│   │       ├── 06-benchmark.trace.json
│   │       └── 07-multi-node-mesh.trace.json
│   ├── shared/
│   │   ├── harness.ts
│   │   └── output.ts
│   ├── README.md
│   └── runner.ts
├── gateway/
│   ├── AndroidBridge/
│   │   └── README.md
│   ├── DesktopBridge/
│   │   └── README.md
│   └── PacketBridge.ts
├── gradle/
│   └── wrapper/
│       ├── gradle-wrapper.jar
│       └── gradle-wrapper.properties
├── scripts/
│   ├── build.sh
│   ├── demo.sh
│   └── setup.sh
├── tests/
│   ├── compliance/
│   │   ├── _perfLog.ts
│   │   ├── CompatibilityValidation.test.ts
│   │   ├── FailureValidation.test.ts
│   │   ├── PacketValidation.test.ts
│   │   ├── ProtocolCompliance.test.ts
│   │   ├── RFCCompliance.test.ts
│   │   └── StressValidation.test.ts
│   ├── encryption/
│   │   └── README.md
│   ├── integration/
│   │   ├── ninecore-integration.test.ts
│   │   └── README.md
│   ├── messaging/
│   │   └── dual-path.test.ts
│   ├── node/
│   │   └── node-layer.test.ts
│   ├── protocol/
│   │   ├── packet-engine.test.ts
│   │   └── README.md
│   ├── routing/
│   │   ├── README.md
│   │   └── routing-engine.test.ts
│   ├── security/
│   │   └── security-engine.test.ts
│   ├── simulator/
│   │   └── simulator.test.ts
│   ├── stress/
│   │   └── README.md
│   └── transport/
│       ├── README.md
│       └── transport-abstraction.test.ts
├── .gitignore
├── build.gradle
├── gradle.properties
├── gradlew.bat
├── LICENSE
├── package-lock.json
├── package.json
├── README.md
├── Relay.md
├── settings.gradle
├── tsconfig.json
└── vitest.config.ts
```

**Excluded from this tree** (per instructions): `node_modules/` (Node.js dependency tree — see Section 2 dependency notes instead), `.git/` (Git internal object database, refs, hooks), and any `.gradle`/`.idea`/build/dist caches (none were found materialized in this repository at inventory time beyond the `node_modules` install).

---

## 2. Top-Level Folder Summary

### `.kiro/`
- **Purpose**: Kiro IDE steering configuration — persistent guidance rules injected into every AI assistant session for this workspace.
- **Approximate file count**: 1 (`steering/rules.md`)
- **Main technologies**: Markdown with YAML front matter.
- **Dependencies**: None (consumed by the Kiro IDE, not by the codebase).

### `.vscode/`
- **Purpose**: Editor workspace settings for VS Code / Kiro's VS Code-based shell.
- **Approximate file count**: 1 (`settings.json`)
- **Main technologies**: JSON.
- **Dependencies**: None.

### `admin/`
- **Purpose**: Reserved location for the future NINE Admin Desktop application (Electron + React dashboard for mesh visualization). Per `admin/README.md`, this is explicitly **not yet implemented** — every subfolder contains only a `.gitkeep` placeholder.
- **Approximate file count**: 11 (10 `.gitkeep` files + 1 `README.md`)
- **Main technologies (planned, not present)**: Electron, React.js, Cytoscape.js (per README's stated plan).
- **Dependencies**: None currently declared; no `package.json` exists inside this folder.

### `app/`
- **Purpose**: The Android application — a real, working Bluetooth mesh chat app (Java). This is the only fully implemented client application in the repository and is explicitly documented elsewhere (`docs/Android-Context-Report.md`) as owned by other team members / read-only for protocol work.
- **Approximate file count**: ~36 (6 Java source files, 1 manifest, 2 Gradle files, ~27 Android resource files across drawable/layout/menu/mipmap/values/xml)
- **Main technologies**: Java, Android SDK (min SDK 23 / target SDK 34 per root `README.md`), Android Gradle Plugin, Bluetooth Classic RFCOMM.
- **Dependencies**: Declared in `app/build.gradle` (Android Gradle plugin dependencies; osmdroid for the offline map feature per `README.md`, standard AndroidX libraries implied by manifest/resources — exact dependency versions are only visible inside `app/build.gradle` and were not exhaustively re-parsed for this inventory beyond confirming its existence).

### `assets/`
- **Purpose**: Repository-level (non-Android) static asset holding area for icons, logo, and screenshots — likely for `README.md`/documentation use.
- **Approximate file count**: 3 (all `.gitkeep` placeholders)
- **Main technologies**: N/A (empty placeholder folder set).
- **Dependencies**: None.

### `core/`
- **Purpose**: The NINE Protocol core implementation in TypeScript — packet engine, node/routing/security/messaging/transport engines, the `NineCore` public SDK, and the new (Phase 8.0) validation/compliance module. This is the actively developed, fully tested heart of the project.
- **Approximate file count**: ~67 TypeScript files across 14 subfolders plus 5 root-level files.
- **Main technologies**: TypeScript (ES2022 target, NodeNext module resolution per `tsconfig.json`), Node.js `crypto` module (AES-256-GCM, RSA-2048, SHA-256), `node:crypto` `randomUUID`/`randomBytes`.
- **Dependencies**: `better-sqlite3`, `@types/better-sqlite3`, `uuid` (from root `package.json`); no external runtime dependency for crypto (uses Node's native `crypto`).

### `database/`
- **Purpose**: SQLite schema definition and migration files for local, on-device persistence (per `docs/Database.md`). Currently only the schema/migration files exist; there is no corresponding runtime SQLite integration code wired into `core/storage/` yet (those files are interface-only, see Section 3).
- **Approximate file count**: 3 (`schema.sql`, `migrations/001_initial_schema.sql`, `seed/README.md`)
- **Main technologies**: SQL (SQLite 3 dialect, WAL mode).
- **Dependencies**: `better-sqlite3` (declared in root `package.json`, not yet consumed by any `core/storage/*.ts` implementation).

### `docs/`
- **Purpose**: All project documentation — RFC-style protocol specs, architecture decision records, integration analyses, compliance reports, and diagrams.
- **Approximate file count**: 26 (19 top-level `.md` files, 3 ADR files, 4 `.drawio` diagram files)
- **Main technologies**: Markdown, draw.io XML diagram format.
- **Dependencies**: None (pure documentation).

### `examples/`
- **Purpose**: The official NINE Examples Suite — 7 runnable reference scenarios demonstrating the public `NineCore` API only, plus generated logs/metrics/traces from prior runs.
- **Approximate file count**: ~59 (21 example files across 7 example folders, 2 shared harness files, 2 root files, 1 `.gitkeep`, and 33 generated result artifacts: 7 logs, 18 metrics/CSV files, 1 `.gitkeep`, 7 traces)
- **Main technologies**: TypeScript, executed via `tsx` (per root `package.json` `demo` script).
- **Dependencies**: Consumes `core/NineCore.ts` and `core/transport/MockTransport.ts` exclusively — no external packages beyond the root TypeScript toolchain.

### `gateway/`
- **Purpose**: Reserved integration-bridge layer between the TypeScript `core/` and platform clients (Android, Desktop). Contains one real interface file (`PacketBridge.ts`) and two placeholder README-only subfolders describing planned (not implemented) bridge strategies.
- **Approximate file count**: 3 (1 `.ts` interface file, 2 `README.md` files)
- **Main technologies**: TypeScript (interface declarations only — no concrete implementation).
- **Dependencies**: Imports `PeerID` type from `core/shared/Types.ts`; otherwise no external dependencies.

### `gradle/`
- **Purpose**: Gradle Wrapper files enabling the Android build (`app/`) to run without a separately installed Gradle version.
- **Approximate file count**: 2 (`gradle-wrapper.jar`, `gradle-wrapper.properties`)
- **Main technologies**: Gradle Wrapper (Java-based build tool binary + properties).
- **Dependencies**: None beyond the JVM/Gradle toolchain itself.

### `node_modules/` (excluded from tree, summarized here)
- **Purpose**: Installed npm dependency tree for the TypeScript/Node.js side of the project (`core/`, `tests/`, `examples/`, `scripts/`).
- **Approximate size**: ~190 top-level packages observed (including transitive dependencies of `vitest`, `eslint`, `typescript`, `tsx`, `ts-node`, `better-sqlite3`, `uuid`, `rimraf`).
- **Main technologies**: Standard npm package layout.
- **Dependencies**: N/A — this folder *is* the resolved dependency graph; not inventoried file-by-file per the exclusion instructions.

### `scripts/`
- **Purpose**: Shell scripts for build, demo, and setup automation (referenced conceptually by root project tooling; distinct from the root `package.json` npm scripts, which invoke `tsc`/`vitest`/`tsx` directly).
- **Approximate file count**: 3 (`build.sh`, `demo.sh`, `setup.sh`)
- **Main technologies**: POSIX shell script.
- **Dependencies**: None declared beyond assumed shell/npm/gradle availability on the host.

### `tests/`
- **Purpose**: The full Vitest test suite for `core/` — unit tests per subsystem plus the Phase 8.0 compliance/validation suite.
- **Approximate file count**: 21 (14 `.test.ts` files, 1 non-test helper `_perfLog.ts`, 6 `README.md` placeholder/description files for folders that currently have no test files of their own: `encryption/`, `stress/` — see Section 9 for placeholder folder detail)
- **Main technologies**: TypeScript, Vitest.
- **Dependencies**: `vitest`, `@types/node`, plus whatever `core/` modules each suite imports directly (no additional test-only libraries beyond Vitest's built-ins).

---

## 3. Major Module Detail (`core/`)

### `core/protocol/`
- **Purpose**: The Packet Engine — binary wire format serialization/parsing, CRC-32 checksums, structural/semantic validation, UUID conversion, and a factory for constructing packets.
- **Main files**: `Packet.ts` (types/constants), `Serializer.ts`, `Parser.ts`, `Validator.ts`, `Checksum.ts`, `UuidUtils.ts`, `PacketFactory.ts`.
- **Dependencies**: `core/shared/Types.ts` only (zero other internal dependencies; this is the lowest layer).
- **Who uses it**: `core/routing/RoutingEngine.ts`, `core/messaging/DualPathManager.ts`, `core/simulator/NodeSimulator.ts`, `core/NineCore.ts`, `core/validation/*`, and nearly every test suite.

### `core/node/`
- **Purpose**: Node identity, lifecycle state machine, neighbor/routing/registry tables, and heartbeat liveness tracking.
- **Main files**: `MeshNode.ts`, `NodeID.ts`, `NeighborTable.ts`, `RoutingTable.ts`, `NodeRegistry.ts`, `NodeStatus.ts`, `HeartbeatState.ts`.
- **Dependencies**: `core/shared/Types.ts`.
- **Who uses it**: `core/NineCore.ts` (constructs `MeshNode`, `NeighborTable`, `NodeRegistry`), `core/NineCoreBuilder.ts`.

### `core/simulator/`
- **Purpose**: The Virtual Mesh Simulator — deterministic clock, in-memory transport with configurable latency/jitter/loss, per-node simulation wrapper, and an event bus for tracing.
- **Main files**: `VirtualClock.ts`, `VirtualTransport.ts`, `NodeSimulator.ts`, `SimulationController.ts`, `SimulationEvents.ts`.
- **Dependencies**: `core/shared/Types.ts`, `core/protocol/*`, `core/node/MeshNode.ts`.
- **Who uses it**: `core/transport/VirtualTransportAdapter.ts`, extensive use across `tests/simulator/`, `tests/routing/`, `tests/compliance/*`.

### `core/routing/`
- **Purpose**: The Routing Engine — on-demand route discovery (ROUTE_REQUEST/REPLY/ERROR), multi-route cache with node-disjoint dual-path selection, duplicate suppression, TTL handling, ACK tracking, pending-message queueing, and loop prevention.
- **Main files**: `RoutingEngine.ts` (orchestrator), `RouteCache.ts`, `RouteDiscovery.ts`, `DuplicatePacketCache.ts`, `TTLManager.ts`, `AckManager.ts`, `PendingMessageQueue.ts`, `LoopPrevention.ts`, `IRouter.ts` (public interface).
- **Dependencies**: `core/protocol/*`, `core/shared/Types.ts`, `core/node/RoutingTable.ts` (type import only).
- **Who uses it**: `core/NineCore.ts`, `core/messaging/DualPathManager.ts` (via `PathSelector`'s injected provider), `core/validation/RFCValidator.ts` (verification helpers), all routing/compliance test suites.

### `core/security/`
- **Purpose**: The Security Engine — AES-256-GCM authenticated encryption, RSA-2048-OAEP key wrapping, SHA-256/HMAC hashing with constant-time comparison, one-time session key lifecycle, replay protection, and the `KeyManager` orchestrator.
- **Main files**: `AES256GCM.ts`, `RSA2048.ts`, `SHA256.ts`, `SessionKey.ts`, `KeyManager.ts`, `ReplayProtection.ts`.
- **Dependencies**: Node.js native `node:crypto` module only; `core/shared/Types.ts` for branded types.
- **Who uses it**: `core/messaging/DualPathManager.ts`, `core/NineCore.ts`, `core/NineCoreBuilder.ts`, `tests/security/`, `tests/compliance/RFCCompliance.test.ts`.

### `core/messaging/`
- **Purpose**: Dual-Path Messaging — splits secure messages into an encrypted-data packet and a wrapped-key packet, routes them over independent (ideally node-disjoint) paths, and reassembles/decrypts at the Admin node.
- **Main files**: `DualPathManager.ts` (orchestrator), `PathSelector.ts` (route-pair selection abstraction), `ReassemblyManager.ts` (buffers partial dual-path messages).
- **Dependencies**: `core/protocol/*`, `core/security/KeyManager.ts`, `core/shared/Types.ts`.
- **Who uses it**: `core/NineCore.ts` (constructs and wires `DualPathManager` with a `PathSelector` backed by the `RoutingEngine`).

### `core/transport/`
- **Purpose**: The Transport Abstraction Layer — the `ITransport` interface all physical/simulated transports implement, plus `MockTransport` (fully in-memory), `VirtualTransportAdapter` (wraps the frozen simulator), a `TransportManager` for multi-transport coordination, selection/capabilities/metrics/state/event support types, and a `TransportFactory`.
- **Main files**: `ITransport.ts`, `MockTransport.ts`, `VirtualTransportAdapter.ts`, `TransportManager.ts`, `TransportSelector.ts`, `TransportCapabilities.ts`, `TransportMetrics.ts`, `TransportEvents.ts`, `TransportState.ts`, `TransportFactory.ts`.
- **Dependencies**: `core/shared/Types.ts`, `core/simulator/VirtualTransport.ts` (only for the adapter).
- **Who uses it**: `core/NineCore.ts` (all node-to-node I/O goes through an injected `ITransport`), `core/NineCoreBuilder.ts`, `tests/transport/`, `tests/integration/`, `tests/compliance/*`.

### `core/validation/` (new, Phase 8.0)
- **Purpose**: Compliance/verification helpers — a packet-pipeline classifier (checksum → parse → validate), malformed-buffer builders for negative testing, an RFC Section 13 rule registry with rule-check functions, and a Markdown compliance-report renderer.
- **Main files**: `ProtocolValidator.ts`, `RFCValidator.ts`, `ComplianceReport.ts`.
- **Dependencies**: `core/protocol/*`, `core/NineConfiguration.ts` (type import for config-default checks).
- **Who uses it**: Exclusively `tests/compliance/*.test.ts` — no production runtime code (`NineCore`, etc.) depends on this module. It is verification-only tooling.

### `core/discovery/`, `core/broadcast/`, `core/monitor/`, `core/storage/`
- **Purpose**: These four directories are **interface-only scaffolding**. Every file in them exports TypeScript interfaces/types describing planned behavior (Discovery Service, Heartbeat Service, Broadcast Engine, Network Health Monitor, Topology Monitor, Message Store, Node Store, SQLite Engine) but contains **no concrete class implementing those interfaces**, and no other file in `core/` imports from any of them.
- **Main files**: `discovery/DiscoveryService.ts`, `discovery/Heartbeat.ts`, `broadcast/BroadcastEngine.ts`, `monitor/NetworkHealth.ts`, `monitor/TopologyMonitor.ts`, `storage/MessageStore.ts`, `storage/NodeStore.ts`, `storage/SQLite.ts`.
- **Dependencies**: `core/shared/Types.ts`, `core/node/*` (type imports only).
- **Who uses it**: Nothing currently (confirmed via repository-wide search for imports from these paths — zero matches). This is documented as a known gap in `docs/ProtocolComplianceReport.md`.

### `core/shared/`
- **Purpose**: Foundation types/enums (`Types.ts`, zero imports), plus configuration/constants/logger interfaces used elsewhere.
- **Main files**: `Types.ts` (actively used everywhere), `Config.ts`, `Constants.ts`, `Logger.ts` (all three currently unreferenced by any other file — see Section 9).
- **Dependencies**: None (`Types.ts`) or `Types.ts` only (the other three).
- **Who uses it**: `Types.ts` is imported by nearly every file in `core/`. `Config.ts`, `Constants.ts`, and `Logger.ts` have no current importers.

---

## 4. Android Package Listing (`app/`)

There is a single Java package in this repository:

### `app/src/main/java/com/p2pchat/app`
The entire Android application lives in one flat package. Classes:

| Class | Brief description |
|---|---|
| `MainActivity.java` | Launch screen / entry point activity; handles initial username dialog and navigation into the main chat activity. |
| `BluetoothChatActivity.java` | The largest class in the app (~2,100+ lines). Hosts the tabbed UI (Chat / Relay / Map / Settings), Bluetooth device discovery and connection management, the mesh forwarding logic (`NeighborManager`/`Link`/`AcceptThread` per `docs/Android-Context-Report.md`), message list rendering, and the offline map (osmdroid) integration. |
| `Crypto.java` | End-to-end encryption utilities — RSA key pair generation/use and AES-GCM message encryption, per the app's own wire protocol (distinct from and wire-incompatible with the `core/` TypeScript protocol). |
| `OfflineRouter.java` | Multi-hop forwarding / routing support logic for the Bluetooth mesh (TTL, duplicate detection, relay decisions), complementing the flooding algorithm described in `Relay.md`. |
| `Packet.java` | The Android app's own JSON-based packet/envelope model (`messageId`, `sourceId`, `destId`, `ttl`, `payload`, etc. — see `Relay.md` Section 8), unrelated to the binary `core/protocol/Packet.ts` format. |
| `RelayService.java` | Android foreground service that keeps hands-off "Relay Mode" forwarding alive when the app is backgrounded or the screen is locked. |

No other Android packages, activities, fragments, ViewModels, or additional Java packages exist beyond this single `com.p2pchat.app` package.

---

## 5. Documentation Inventory (grouped)

### RFC
- `docs/NINE-RFC-v1.0.md` — the primary protocol specification (17 sections: Protocol Overview, Network Architecture, Node Model, Packet Architecture, Packet Types, Discovery Protocol, Routing Protocol, Broadcast Protocol, Secure Communication Protocol, Security Model, State Machines, Failure Handling, Protocol Rules, Future Extensions, Open Questions, and two appendices).
- `docs/NINE-PacketEncoding-v1.0.md` — companion wire-format encoding spec (byte offsets, endianness, payload layouts per packet type).
- `docs/NINE-ErrorCodes-v1.0.md` — protocol error code specification.
- `docs/NINE-Timing-v1.0.md` — timing/interval constant specification.
- `docs/NINE-Versioning-v1.0.md` — protocol versioning & compatibility rules.

### Architecture
- `docs/Architecture.md` — layered architecture document (an earlier/parallel design doc; see Section 9 note on overlap with the RFC).
- `docs/ADR/ADR-001-CoreArchitecture.md`
- `docs/ADR/ADR-002-Routing.md`
- `docs/ADR/ADR-003-Security.md`
- `docs/diagrams/Architecture.drawio`
- `docs/diagrams/DFD.drawio`
- `docs/diagrams/MeshTopology.drawio`
- `docs/diagrams/Sequence.drawio`

### Research / Analysis
- `docs/Android-Context-Report.md` — full Android codebase analysis (structure, architecture, overlap with `core/`, integration recommendations).
- `docs/NineCore_Android_Integration.md` — Android ↔ NineCore integration analysis.
- `docs/PROJECT-STATE.md` — cross-session project state and resume checklist.

### Examples
- `examples/README.md` — Examples Suite overview.
- `examples/01-Broadcast/README.md`, `examples/01-Broadcast/expected-output.md`
- `examples/02-SecureMessage/README.md`, `examples/02-SecureMessage/expected-output.md`
- `examples/03-DualPath/README.md`, `examples/03-DualPath/expected-output.md`
- `examples/04-RelayFailure/README.md`, `examples/04-RelayFailure/expected-output.md`
- `examples/05-ReplayAttack/README.md`, `examples/05-ReplayAttack/expected-output.md`
- `examples/06-Benchmark/README.md`, `examples/06-Benchmark/expected-output.md`
- `examples/07-MultiNodeMesh/README.md`, `examples/07-MultiNodeMesh/expected-output.md`

### Reports
- `docs/ProtocolComplianceReport.md` — Phase 8.0 compliance & validation report (RFC coverage, verified features, known limitations, test statistics, performance summary, rule-by-rule checklist).
- `docs/DemoPlan.md` — demonstration/showcase plan with scenarios and success criteria.

### SDK
- `docs/SDK.md` — NINE Core SDK documentation (the `NineCore` public API reference).
- `docs/API.md` — a separate, earlier Core API specification document (see Section 9 overlap note).

### Integration
- `docs/NineCore_Android_Integration.md` (also listed under Research — it serves both purposes).
- `gateway/AndroidBridge/README.md` — planned Android integration bridge approaches.
- `gateway/DesktopBridge/README.md` — planned Desktop/Electron integration bridge approach.

### Other
- `docs/PacketFormat.md` — an earlier/parallel packet format document (see Section 9 overlap note with `NINE-PacketEncoding-v1.0.md`).
- `docs/Protocol.md` — an earlier/parallel protocol document (see Section 9 overlap note with `NINE-RFC-v1.0.md`).
- `docs/Routing.md` — an earlier/parallel routing design document (see Section 9 overlap note with the RFC's Routing Protocol section).
- `docs/Security.md` — an earlier/parallel security design document (see Section 9 overlap note with the RFC's Security Model section).
- `docs/Transport.md` — an earlier/parallel transport design document describing an adapter interface shape that differs from the implemented `ITransport` in `core/transport/ITransport.ts` (see Section 9).
- `docs/Database.md` — SQLite schema documentation, matching `database/schema.sql`.
- `README.md` (root) — the public-facing project README, describing the Android app's Bluetooth mesh chat features.
- `Relay.md` (root) — detailed Android multi-hop relay design document.
- `admin/README.md` — Admin Desktop app placeholder status/plan.
- `database/seed/README.md` — purpose note for the (currently empty) seed folder.
- `tests/*/README.md` (6 files: `encryption/`, `integration/`, `protocol/`, `routing/`, `stress/`, `transport/`) — per-suite test-plan descriptions.

---

## 6. Test Suite Inventory (grouped)

### Protocol
- `tests/protocol/packet-engine.test.ts` — serializer/parser round-trip, CRC-32, validator, UUID utils.
- `tests/protocol/README.md` — description-only (no additional test file).

### Routing
- `tests/routing/routing-engine.test.ts` — dedup cache, TTL manager, loop prevention, route cache (including multi-route/disjoint-path scenarios), pending queue, ACK manager, route discovery, plus 8 integration scenarios and stress cases run through the simulator.
- `tests/routing/README.md` — description-only.

### Security
- `tests/security/security-engine.test.ts` — AES-256-GCM, RSA-2048, SHA-256/HMAC, session key manager, replay protection, `KeyManager`, plus 7 "Demo" scenarios and 4 benchmark cases.

### Messaging
- `tests/messaging/dual-path.test.ts` — `DualPathManager`/`PathSelector`/`ReassemblyManager` behavior.

### Transport
- `tests/transport/transport-abstraction.test.ts` — `ITransport` conformance (`MockTransport`, `VirtualTransportAdapter`), `TransportManager`, benchmarks.
- `tests/transport/README.md` — description-only.

### Integration
- `tests/integration/ninecore-integration.test.ts` — full-stack `NineCore` tests: lifecycle, broadcast messaging, secure messaging via dual-path, queries/metrics, node management events, configuration, and an encapsulation guarantee check.
- `tests/integration/README.md` — description-only.

### Compliance (Phase 8.0)
- `tests/compliance/PacketValidation.test.ts` — packet serialization/parsing/header/CRC/size-limit/sequence-number compliance.
- `tests/compliance/FailureValidation.test.ts` — malformed-packet categories (invalid version/type/flags/checksum, corrupted payload, invalid length, TTL edge cases, expired timestamp, duplicate/replay detection, missing fields, seeded random byte streams).
- `tests/compliance/ProtocolCompliance.test.ts` — end-to-end behavior verification (route discovery/invalidation/recovery, ACK handling, broadcast/dual-path delivery, secure messaging, metrics consistency).
- `tests/compliance/RFCCompliance.test.ts` — all 40 RFC Section 13 mandatory rules individually exercised.
- `tests/compliance/StressValidation.test.ts` — 1000x serialize/parse/broadcast/secure-message loops, large payloads, rapid node joins/failures/route discoveries/invalidations.
- `tests/compliance/CompatibilityValidation.test.ts` — independent hand-assembled wire-format buffers cross-checked against `Serializer`/`Parser` output for future cross-platform interop.
- `tests/compliance/_perfLog.ts` — shared performance-measurement recorder used by `StressValidation.test.ts` (not itself a test file).

### Stress
- `tests/stress/README.md` — description-only; no dedicated stress test file exists at this path (stress scenarios currently live inside `tests/routing/routing-engine.test.ts` and `tests/compliance/StressValidation.test.ts` instead).

### Simulator
- `tests/simulator/simulator.test.ts` — `VirtualClock`, `VirtualTransport`, `NodeSimulator`, `SimulationController`, `SimulationEvents` behavior.

### Node (not explicitly requested as a group, included for completeness)
- `tests/node/node-layer.test.ts` — `MeshNode`, `NodeID`, `NeighborTable`, `RoutingTable`, `NodeRegistry`, `HeartbeatState`.

### Encryption
- `tests/encryption/README.md` — description-only; no dedicated file exists at this path (equivalent coverage currently lives in `tests/security/security-engine.test.ts`).

---

## 7. Scripts Inventory

| Script | Location |
|---|---|
| `build.sh` | `scripts/build.sh` |
| `demo.sh` | `scripts/demo.sh` |
| `setup.sh` | `scripts/setup.sh` |

Additionally, the root `package.json` defines npm scripts that are the ones actually referenced in this session's workflow: `build` (`tsc`), `dev` (`tsc --watch`), `test` (`vitest --run`), `test:watch` (`vitest`), `lint` (`eslint core/ gateway/ --ext .ts`), `clean` (`rimraf dist`), `demo` (`tsx examples/runner.ts`). These are declared in `package.json`, not as separate files, and are listed here because they are part of the project's script tooling.

Android build tooling scripts (not shell scripts, but script-like build entry points): `gradlew.bat` (root) and `gradle/wrapper/gradle-wrapper.properties` (Gradle Wrapper).

---

## 8. Generated Assets Inventory

These are artifacts produced by running project tooling (not hand-authored source):

### Examples Suite results (`examples/results/`)
- **Logs** (`examples/results/logs/`): `01-broadcast.log`, `02-secure-message.log`, `03-dual-path.log`, `04-relay-failure.log`, `05-replay-attack.log`, `06-benchmark.log`, `07-multi-node-mesh.log`
- **Metrics** (`examples/results/metrics/`): 14 per-example JSON files (`<name>.metrics.json` + `<name>.summary.json` for each of the 7 examples) plus 4 CSV files: `benchmark.csv`, `latency.csv`, `packet-loss.csv`, `throughput.csv`
- **Traces** (`examples/results/traces/`): 7 `<name>.trace.json` files, one per example
- **Screenshots** (`examples/results/screenshots/`): empty except `.gitkeep`

### Node/npm tooling caches
- `node_modules/.package-lock.json` — npm's resolved lockfile mirror inside `node_modules` (generated by `npm install`).
- `node_modules/.vite/vitest/results.json` — Vitest/Vite's internal cache of the last test run (generated automatically; not committed source).

### Android build artifacts
- `gradle/wrapper/gradle-wrapper.jar` — a checked-in binary required by the Gradle Wrapper mechanism (technically a build tool binary, not application output, but noted here as a non-source generated/vendored binary).
- No `app/build/` output directory was found materialized in this repository at inventory time (consistent with `.gitignore` excluding build outputs).

### Documentation-adjacent generated artifact
- `docs/ProtocolComplianceReport.md` — generated by a one-off reporting script during the Phase 8.0 work (the generator script itself was deleted after use; the report is checked in as documentation).

---

## 9. Structural Observations (Report Only — No Changes Made)

Per instructions, the following are reported for visibility only. Nothing below has been acted upon.

### Duplicated / overlapping documents
- **`docs/Protocol.md` vs `docs/NINE-RFC-v1.0.md`**: Both describe the protocol's packet types, lifecycle, and interaction sequences. `NINE-RFC-v1.0.md` is the more recent, more detailed, and versioned document (explicitly referenced by `docs/ProtocolComplianceReport.md` and used as the compliance baseline); `Protocol.md` appears to be an earlier draft covering similar ground with a different packet type table (10 vs 11 types — `Protocol.md` omits `KEY_ANNOUNCE`) and a different header size figure (implicitly 66 bytes via its field table vs the RFC/implementation's 71 bytes).
- **`docs/PacketFormat.md` vs `docs/NINE-PacketEncoding-v1.0.md`**: Both define the byte-level wire format. They disagree with each other on header size: `PacketFormat.md` states a 66-byte header (no `flags` byte broken out separately, offsets shifted accordingly), while `NINE-PacketEncoding-v1.0.md` states 71 bytes, matching the actual `HEADER_SIZE = 71` constant in `core/protocol/Packet.ts`.
- **`docs/Routing.md` vs `NINE-RFC-v1.0.md` Section 7 ("Routing Protocol")**: Overlapping content on route discovery, dual-path routing, and route maintenance, written independently with differing interface sketches (`docs/Routing.md` proposes a `RoutingAlgorithm` pluggable interface not present anywhere in `core/routing/`).
- **`docs/Security.md` vs `NINE-RFC-v1.0.md` Section 10 ("Security Model")**: Overlapping cryptographic primitive descriptions (AES-256, RSA-2048, SHA-256), written independently.
- **`docs/Transport.md` vs `core/transport/ITransport.ts`**: The document describes a `TransportAdapter` interface shape (`makeDiscoverable`, `TransportEvent` enum values, a `Connection` object with `LinkQuality`) that differs in naming and shape from the actually implemented `ITransport` interface (`advertise`, `TransportEventType`, `PeerConnection`). They describe the same concept but are not the same interface.
- **`docs/API.md` vs `docs/SDK.md`**: Both document a "Core API" surface for consuming the protocol. `docs/API.md` describes an earlier, `Promise`-heavy API shape (`broadcast()` returning `Promise<BroadcastResult>`, `startDiscovery(): void` synchronous) that does not match the actually implemented `NineCore` class in `core/NineCore.ts` (e.g., `sendBroadcast()` is synchronous and returns `void`; `discoverPeers()` is the async method, not `startDiscovery()`). `docs/SDK.md` is the document that was produced alongside the `NineCore` implementation itself (Phase 7.5) and is more likely to reflect current behavior, though this inventory did not diff every method signature.
- **`docs/Architecture.md`**: Its proposed directory structure (Section 10) — `core/src/protocol/`, `core/src/routing/`, a `core/package.json`, `core/tests/` — does not match the actual repository layout (`core/protocol/` with no nested `src/`, no `core/package.json`, tests live in top-level `tests/` not `core/tests/`). This document describes an earlier planned layout that predates the current structure.

### Obsolete / superseded folders
- No folder was found to be definitively "obsolete" in the sense of being replaced and abandoned mid-repository (e.g., no `core_old/` or `v1_backup/` directories exist). The overlapping documents above are the main evidence of superseded planning artifacts; the folders that hold them (`docs/`) are still active and not themselves obsolete.

### Placeholder folders (contain only `.gitkeep` and/or a status README, no real implementation)
- `admin/assets/`, `admin/components/`, `admin/electron/`, `admin/graph/`, `admin/hooks/`, `admin/pages/`, `admin/react/`, `admin/services/`, `admin/src/`, `admin/utils/` — all 10 subfolders of `admin/` contain only `.gitkeep`; `admin/README.md` itself states "Status: Not yet implemented."
- `assets/icons/`, `assets/logo/`, `assets/screenshots/` — top-level asset folders, `.gitkeep` only.
- `examples/assets/` — `.gitkeep` only.
- `examples/results/screenshots/` — `.gitkeep` only.
- `database/seed/` — contains only a `README.md` describing intended future seed files; no actual seed data files exist.
- `gateway/AndroidBridge/`, `gateway/DesktopBridge/` — each contains only a `README.md` describing planned (not implemented) bridge approaches.
- `tests/encryption/`, `tests/stress/` — each contains only a `README.md` describing planned test coverage; no `.test.ts` file exists in either folder (equivalent coverage exists elsewhere, per Section 6).

### Empty folders (zero files, not even `.gitkeep`)
- None were found. Every leaf directory in the tree contains at least one file (most placeholder folders use `.gitkeep` specifically to keep the otherwise-empty directory tracked in Git).

### Unused / dormant source directories (files exist, but nothing in the codebase imports from them)
- `core/discovery/` (`DiscoveryService.ts`, `Heartbeat.ts`) — interface-only, zero importers found repository-wide.
- `core/broadcast/` (`BroadcastEngine.ts`) — interface-only, zero importers found. (Actual broadcast behavior is implemented directly inside `core/routing/RoutingEngine.ts` and `core/NineCore.ts` instead.)
- `core/monitor/` (`NetworkHealth.ts`, `TopologyMonitor.ts`) — interface-only, zero importers found.
- `core/storage/` (`MessageStore.ts`, `NodeStore.ts`, `SQLite.ts`) — interface-only, zero importers found. (`better-sqlite3` is a declared dependency in `package.json` but is not currently imported by any file in `core/`.)
- `core/shared/Config.ts`, `core/shared/Constants.ts`, `core/shared/Logger.ts` — each defines types/constants but is not imported by any other file in the repository (confirmed via repository-wide import search). `core/shared/Types.ts`, by contrast, is heavily used everywhere.
- `database/` — `schema.sql` and `migrations/001_initial_schema.sql` exist and are self-consistent with `docs/Database.md`, but no runtime code path in `core/storage/` (itself unused, per above) actually opens or queries this schema. The database layer is fully designed on paper but not wired into any running code.
- `gateway/` — `PacketBridge.ts` defines the `IPacketBridge` interface; no class implements it and nothing in `core/` or `tests/` imports it.

### Duplicated folders (same or near-identical purpose in two places)
- No two folders were found serving an identical purpose. The closest case is conceptual rather than structural: `docs/` contains both the authoritative versioned specs (`NINE-*-v1.0.md`) and several earlier, non-versioned documents covering the same subject matter (`Protocol.md`, `PacketFormat.md`, `Routing.md`, `Security.md`, `Transport.md`, `API.md`, `Architecture.md`) — see the overlap notes above. These are separate files, not separate folders, so they are not "duplicated folders" in the literal sense, but are flagged here since they are the closest match to that category.
