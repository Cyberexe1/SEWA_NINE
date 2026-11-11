# NINE — Documentation Audit

## Document Metadata

| Field | Value |
|-------|-------|
| Purpose | Consolidation audit of all project documentation |
| Phase | 8.1 (documentation-only) |
| Date | 2026-07-16 |
| Scope | `docs/` folder + root-level `.md` files |
| Constraint | No files moved, renamed, deleted, or modified |

---

## 1. Authoritative Documents

These are the **official source of truth** for each domain. When conflicts exist between these and any other document, these win.

| Domain | Authoritative Document | Version | Evidence |
|--------|------------------------|---------|----------|
| **Protocol specification** | `docs/NINE-RFC-v1.0.md` | v0.9.1-draft | Used as the compliance baseline in `ProtocolComplianceReport.md`; all 40 mandatory rules tested against it; `PROJECT-STATE.md` calls it "the RFC (frozen)" |
| **Wire format (byte layout)** | `docs/NINE-PacketEncoding-v1.0.md` | 1.0.0-draft | Companion to the RFC; `CompatibilityValidation.test.ts` verifies the implementation against it; `core/protocol/Packet.ts` constants match its Section 3 table |
| **Timing constants** | `docs/NINE-Timing-v1.0.md` | 1.0.0-draft | `NineConfiguration.ts` DEFAULT_CONFIGURATION values match its Section 11 summary table |
| **Error codes** | `docs/NINE-ErrorCodes-v1.0.md` | 1.0.0-draft | Defines the structured 16-bit error hierarchy; `core/protocol/Validator.ts` error codes align |
| **Versioning & compatibility** | `docs/NINE-Versioning-v1.0.md` | 1.0.0-draft | Defines reserved ranges, algorithm IDs, flag semantics |
| **Public SDK API** | `docs/SDK.md` | 0.7.5-alpha | Written alongside the `NineCore` implementation (Phase 7.5); method signatures match `core/NineCore.ts` |
| **Compliance verification** | `docs/ProtocolComplianceReport.md` | Phase 8.0 | Generated from real test results (422 tests); documents defects and gaps |
| **Android codebase analysis** | `docs/Android-Context-Report.md` | 2026-07-15 | Produced by reading all 6 Java source files; confirmed no code was modified |
| **Project state / handoff** | `docs/PROJECT-STATE.md` | 2026-07-15 | Contains git tag map, architecture facts, open decisions, resume checklist |
| **Repository structure** | `docs/File-Structure.md` | 2026-07-16 | Full recursive inventory with module-level detail and unused-code flags |
| **Architecture decisions** | `docs/ADR/ADR-001-CoreArchitecture.md` | Accepted | Defines "protocol-first" principle; implemented as described |
| **Routing decision** | `docs/ADR/ADR-002-Routing.md` | Accepted | Reactive routing + dual-path; matches `core/routing/` implementation |
| **Security decision** | `docs/ADR/ADR-003-Security.md` | Accepted | AES-256-GCM + RSA-2048 + dual-path; matches `core/security/` implementation |
| **Android relay design** | `Relay.md` (root) | Implemented | Authored by the Android team; describes the JSON mesh protocol running in `app/` |
| **Demo/showcase plan** | `docs/DemoPlan.md` | 0.1.0 draft | No conflicting successor exists |
| **Database schema** | `docs/Database.md` + `database/schema.sql` | 0.1.0 draft | Schema SQL matches the doc's DDL; neither is wired into runtime code yet |

---

## 2. Legacy Documents

These documents duplicate content now covered more completely or more accurately by authoritative documents listed above. They are **not deleted** — only identified as superseded.

| Legacy Document | Superseded By | Why It Is Legacy |
|---|---|---|
| `docs/Protocol.md` (v0.1.0) | `docs/NINE-RFC-v1.0.md` | Covers the same ground (packet types, lifecycle, interaction sequences, dedup, TTL, reliability, configuration) but is an earlier draft with only 10 packet types (missing KEY_ANNOUNCE), a different header size (implicitly 66 bytes via its field table), and no Section 13 mandatory rules. The RFC is the version that was frozen, tagged, and compliance-tested. |
| `docs/PacketFormat.md` (v0.1.0) | `docs/NINE-PacketEncoding-v1.0.md` | Both define the byte-level wire format. `PacketFormat.md` specifies a 66-byte header (no `flags` field at offset 2; `packetId` at offset 2 instead of 3) which conflicts with the implemented 71-byte layout. `NINE-PacketEncoding-v1.0.md` matches the code. |
| `docs/Routing.md` (v0.1.0) | `docs/NINE-RFC-v1.0.md` Section 7 | Both describe route discovery, dual-path, route maintenance, and forwarding. `Routing.md` proposes a `RoutingAlgorithm` pluggable interface and a composite metric formula not present in the implementation; the RFC's description matches actual `core/routing/` behavior. |
| `docs/Security.md` (v0.1.0) | `docs/NINE-RFC-v1.0.md` Section 10 + `docs/ADR/ADR-003-Security.md` | Both describe AES-256-GCM, RSA-2048-OAEP, SHA-256, replay protection, and dual-path rationale. The RFC and ADR together cover all security concerns with more precision; `Security.md` adds no unique information beyond what exists in those two. |
| `docs/Transport.md` (v0.1.0) | `docs/NINE-RFC-v1.0.md` Section 1.3 principle 7 + `core/transport/ITransport.ts` (source code) | Describes a `TransportAdapter` interface that differs in naming and method signatures from the implemented `ITransport`. The code IS the authoritative transport interface; `Transport.md`'s design was never implemented as described. |
| `docs/API.md` (v0.1.0) | `docs/SDK.md` (v0.7.5-alpha) | Both document the public Core API. `API.md` describes an earlier Promise-heavy API shape (`broadcast()` returning `Promise<BroadcastResult>`, `startDiscovery(): void`) that does not match the implemented `NineCore` class (`sendBroadcast()` is synchronous void, `discoverPeers()` is async). `SDK.md` was written when `NineCore` was built (Phase 7.5) and matches the code. |
| `docs/Architecture.md` (v0.1.0) | `docs/ADR/ADR-001-CoreArchitecture.md` + actual `core/` structure | Proposes a directory layout (`core/src/protocol/`, a `core/package.json`, `core/tests/`) that was never adopted. The ADR captures the same architectural decision in a more concise, decision-focused format, and the actual repository structure is documented in `docs/File-Structure.md`. |
| `docs/NineCore_Android_Integration.md` | `docs/Android-Context-Report.md` | Both analyze the Android codebase for NineCore integration. `NineCore_Android_Integration.md` was written when the `ITransport` interface was speculated to not exist in the repo (its Section 4.1 says "Interface not present — searched"). `Android-Context-Report.md` was written after reading the entire Android app AND knowing the real `ITransport`, making it more accurate and complete. The earlier document's BluetoothTransport design is explicitly labelled `[Speculation]` throughout. |

---

## 3. Conflicting Information

Every conflict below was identified by comparing document text against either another document or the frozen implementation source (`core/`).

### 3.1 Header Size

| Document A | Document B | Conflict |
|---|---|---|
| `docs/PacketFormat.md` Section 2 | `docs/NINE-PacketEncoding-v1.0.md` Section 3 | **66 bytes** vs **71 bytes** |

- **Correct version:** 71 bytes (`NINE-PacketEncoding-v1.0.md`).
- **Reason:** `core/protocol/Packet.ts` exports `HEADER_SIZE = 71`. The 66-byte layout omits the `flags` field and uses slightly different offsets for all subsequent fields. The Serializer/Parser produce and consume 71-byte headers. Compliance tests verify this.

### 3.2 Maximum Unsigned Payload Size

| Document A | Document B | Conflict |
|---|---|---|
| `docs/NINE-PacketEncoding-v1.0.md` Section 11 | Implementation (`core/protocol/Packet.ts`) | Doc says **3961 bytes**; code computes **4025 bytes** (4096 − 71) |

- **Correct version:** The code (4025 bytes).
- **Reason:** `MAX_PACKET_SIZE(4096) - HEADER_SIZE(71) = 4025`. The doc's figure of 3961 appears to be based on an earlier (66-byte header + 5 additional bytes for something) calculation that was never updated when the header grew to 71 bytes. Flagged in `ProtocolComplianceReport.md` Known Limitations.

### 3.3 Packet Type Count

| Document A | Document B | Conflict |
|---|---|---|
| `docs/Protocol.md` Section 5 | `docs/NINE-RFC-v1.0.md` Section 5 | **10 types** vs **11 types** |

- **Correct version:** 11 types (RFC).
- **Reason:** `Protocol.md` omits `KEY_ANNOUNCE (0x0B)`. The enum in `core/shared/Types.ts` defines all 11, and compliance tests verify all 11 round-trip correctly.

### 3.4 Public API Method Names

| Document A | Document B | Conflict |
|---|---|---|
| `docs/API.md` Section 4 | `docs/SDK.md` Section 3.2 + `core/NineCore.ts` | `broadcast(message, isEmergency?)` vs `sendBroadcast(message, isEmergency?)` |

- **Correct version:** `sendBroadcast` (SDK.md / source code).
- **Reason:** `NineCore.ts` exports `sendBroadcast()`. `API.md` was written before implementation.

| Document A | Document B | Conflict |
|---|---|---|
| `docs/API.md` Section 3 | `docs/SDK.md` Section 3.3 + `core/NineCore.ts` | `startDiscovery(): void` (sync) vs `discoverPeers(): Promise<void>` (async) |

- **Correct version:** `discoverPeers()` (SDK.md / source code).
- **Reason:** `NineCore.ts` exports `discoverPeers()` as the public discovery trigger. No method named `startDiscovery` exists on `NineCore`.

### 3.5 Transport Interface Name

| Document A | Document B | Conflict |
|---|---|---|
| `docs/Transport.md` Section 3 | `core/transport/ITransport.ts` | Interface called `TransportAdapter` (with methods `makeDiscoverable`, `getConnections(): Connection[]`) vs `ITransport` (with `advertise(durationMs)`, `getConnections(): PeerConnection[]`) |

- **Correct version:** `ITransport` (source code + SDK.md Section 6).
- **Reason:** The `Transport.md` design was never implemented. The real interface was built in Phase 7 and is the one NineCore depends on.

### 3.6 Header Field at Offset 2

| Document A | Document B | Conflict |
|---|---|---|
| `docs/PacketFormat.md` Section 2 | `docs/NINE-PacketEncoding-v1.0.md` Section 3 | Offset 2 = `packetId` (16 bytes) vs offset 2 = `flags` (1 byte), offset 3 = `packetId` |

- **Correct version:** Offset 2 = `flags` (1 byte) per `NINE-PacketEncoding-v1.0.md`.
- **Reason:** `core/protocol/Serializer.ts` writes flags at offset 2, then packetId at offset 3. Compliance tests (`CompatibilityValidation.test.ts`) independently assemble buffers at these offsets and confirm byte-identity with the Serializer's output.

### 3.7 Folder Structure (planned vs actual)

| Document A | Document B | Conflict |
|---|---|---|
| `docs/Architecture.md` Section 10 | `docs/File-Structure.md` Section 1 | Proposed `core/src/protocol/`, `core/package.json`, `core/tests/` vs actual `core/protocol/`, root `package.json`, top-level `tests/` |

- **Correct version:** `File-Structure.md` (documents reality).
- **Reason:** The nested `src/` layout was never adopted. The project evolved directly into the flat `core/protocol/` pattern during Phase 1.

### 3.8 Admin Public Key Distribution Mechanism

| Document A | Document B | Conflict |
|---|---|---|
| `docs/Security.md` Section 4.2 | `docs/NINE-RFC-v1.0.md` Section 6.7 | "Admin's public key is included in the discovery payload" vs "Dedicated KEY_ANNOUNCE packet (type 0x0B)" |

- **Correct version:** KEY_ANNOUNCE (RFC Section 6.7).
- **Reason:** RFC Section 15 Q1 explicitly marks this as RESOLVED in favour of KEY_ANNOUNCE. However, neither mechanism is implemented in code — the current codebase uses `setAdminPublicKey()` out-of-band (compliance report Rule 34 gap).

### 3.9 `PacketFormat.md` Maximum Payload

| Document A | Document B | Conflict |
|---|---|---|
| `docs/PacketFormat.md` Section 6 | `docs/NINE-PacketEncoding-v1.0.md` Section 11 | Max payload "4030 bytes (without signature) or 3966 bytes (with signature)" vs "3961 bytes (unsigned)" |

- **Correct version:** Neither matches the code exactly (code: 4025 unsigned, 3961 signed). `NINE-PacketEncoding-v1.0.md`'s "3961 unsigned" appears to be the signed figure mislabelled. See conflict 3.2.
- **Reason:** Both docs are slightly wrong. The implementation is internally consistent: `4096 - 71 = 4025` (unsigned), `4096 - 71 - 64 = 3961` (signed).

### 3.10 `Constants.ts` Header Size vs `Packet.ts` Header Size

| Document A | Document B | Conflict |
|---|---|---|
| `core/shared/Constants.ts` | `core/protocol/Packet.ts` | `PROTOCOL.HEADER_SIZE = 66` vs `HEADER_SIZE = 71` |

- **Correct version:** `Packet.ts` (`HEADER_SIZE = 71`).
- **Reason:** `Constants.ts` is an unused legacy file (zero importers found — confirmed in `File-Structure.md` Section 9). It reflects the old 66-byte design from `PacketFormat.md`. The Serializer/Parser/Validator all import from `Packet.ts`.

---

## 4. Documentation Dependency Graph

```
                    NINE-RFC-v1.0.md
                   (protocol authority)
                          │
          ┌───────────────┼───────────────────────┐
          │               │                       │
          ▼               ▼                       ▼
  NINE-PacketEncoding  NINE-Timing         NINE-Versioning
  (wire format)        (timers)            (compat rules)
          │               │                       │
          └───────┬───────┘                       │
                  │                               │
                  ▼                               │
          NINE-ErrorCodes                         │
          (error taxonomy)                        │
                  │                               │
                  └───────────┬───────────────────┘
                              │
                              ▼
                          SDK.md
                  (public NineCore API)
                              │
                              ▼
                       NineCore.ts
                    (implementation)
                              │
              ┌───────────────┼─────────────────┐
              │               │                 │
              ▼               ▼                 ▼
         examples/       tests/           ProtocolCompliance
         (7 demos)     (422 tests)          Report.md
                                          (verification)
                                               │
                                               ▼
                                       Documentation-Audit.md
                                          (this document)

        ─── Lateral references (not dependencies) ───

  ADR-001 ←→ RFC (architecture philosophy)
  ADR-002 ←→ RFC Section 7 (routing decisions)
  ADR-003 ←→ RFC Section 10 (security decisions)

  Android-Context-Report.md ←→ Relay.md (Android mesh design)
  Android-Context-Report.md ←→ SDK.md (integration points)
  NineCore_Android_Integration.md ←→ Android-Context-Report.md (superseded analysis)

  PROJECT-STATE.md → all of the above (resume index)
  File-Structure.md → all of the above (structural inventory)
  DemoPlan.md → RFC + SDK (demonstration scenarios)
  Database.md → database/schema.sql (schema documentation)
```

---

## 5. Recommended Future Documentation Structure

The following is a recommendation only. No files have been moved.

```
docs/
├── spec/                          # Authoritative protocol specifications
│   ├── NINE-RFC-v1.0.md
│   ├── NINE-PacketEncoding-v1.0.md
│   ├── NINE-Timing-v1.0.md
│   ├── NINE-ErrorCodes-v1.0.md
│   └── NINE-Versioning-v1.0.md
├── sdk/                           # Developer-facing API docs
│   └── SDK.md
├── adr/                           # Architecture Decision Records (keep)
│   ├── ADR-001-CoreArchitecture.md
│   ├── ADR-002-Routing.md
│   └── ADR-003-Security.md
├── reports/                       # Generated/analysis reports
│   ├── ProtocolComplianceReport.md
│   ├── Android-Context-Report.md
│   ├── File-Structure.md
│   ├── Documentation-Audit.md
│   └── DemoPlan.md
├── integration/                   # Platform integration docs
│   ├── NineCore_Android_Integration.md  (mark as superseded by Android-Context-Report)
│   └── Database.md
├── legacy/                        # Superseded docs (preserved, clearly labelled)
│   ├── Protocol.md
│   ├── PacketFormat.md
│   ├── Routing.md
│   ├── Security.md
│   ├── Transport.md
│   ├── API.md
│   └── Architecture.md
├── diagrams/                      # Visual assets (keep as-is)
│   ├── Architecture.drawio
│   ├── DFD.drawio
│   ├── MeshTopology.drawio
│   └── Sequence.drawio
└── PROJECT-STATE.md               # Session handoff (keep at docs root)
```

**Rationale:**
- `spec/` isolates the frozen, versioned protocol documents that compliance tests are written against.
- `legacy/` makes it immediately obvious which docs are superseded without deleting them (preserves git history and any external links).
- `sdk/` separates developer-facing content from internal specs.
- `reports/` groups generated outputs and analyses.
- `adr/` is already a conventional directory name for Architecture Decision Records.

---

## 6. Missing Documentation

Areas that have **no authoritative document** and are not adequately covered by any existing file:

| Area | Current State | What's Missing |
|---|---|---|
| **Wi-Fi Direct transport** | `docs/Transport.md` describes a planned Wi-Fi Direct adapter in abstract terms; `ITransport` interface exists in code. No implementation exists. | Implementation guide, Android `WifiP2pManager` integration specifics, group owner negotiation strategy, service discovery format (DNS-SD). |
| **Bluetooth transport (NineCore side)** | `docs/Android-Context-Report.md` describes the existing Android RFCOMM code. `ITransport` interface exists. No `BluetoothTransport implements ITransport` exists. | A concrete design doc for `BluetoothTransport` (beyond the speculative §4 in `NineCore_Android_Integration.md`), framing strategy for NINE binary packets over RFCOMM streams, and the node-identity mapping between `PeerID` and `NodeID`. |
| **Desktop Admin application** | `admin/README.md` states "not yet implemented." | No architecture doc, no wireframes, no IPC protocol between Electron main process and React renderer, no data model for the topology graph UI. |
| **Gateway / bridge runtime** | `gateway/PacketBridge.ts` is an interface with no implementation. `gateway/AndroidBridge/README.md` lists 4 candidate approaches without choosing one. | A decision on the bridge mechanism (chosen from the 4 options listed), and a concrete design for the selected approach. |
| **Database runtime integration** | `docs/Database.md` and `database/schema.sql` fully define the schema. `core/storage/*.ts` define interfaces. | No concrete `SQLiteEngine` class implementing `ISQLiteEngine`; no documentation of when/how the database is opened, migrated, and closed in the node lifecycle. |
| **Discovery protocol implementation** | RFC Section 6 fully specifies it. `core/discovery/*.ts` are interfaces only. | An implementation plan or design note explaining when (which phase) the DISCOVERY/DISCOVERY_RESPONSE/KEY_ANNOUNCE packet exchange will be built, and how it interacts with the existing transport-layer `PEER_DISCOVERED` event pathway. |
| **Heartbeat emission** | RFC Section 3.6 fully specifies it. `core/node/HeartbeatState.ts` tracks liveness. | No document explains why heartbeat *emission* was deferred, or what the implementation plan is for wiring `NineCore.tick()` to periodically construct and broadcast HEARTBEAT packets. |
| **Ed25519 signing** | RFC Section 4.8 + Rule 27 require it for ENCRYPTED_MESSAGE/KEY_PACKET. `PacketFlags.SIGNED` exists. | No document explains the planned implementation of Ed25519 key generation, signing at send time, and verification at receive time. The compliance report flags Rule 27 as a defect but offers no remediation plan. |
| **Android ↔ NineCore protocol authority decision** | `docs/Android-Context-Report.md` Section 7 + `docs/PROJECT-STATE.md` Section 6 both flag the decision as **blocking**. | The decision itself has not been made or documented. No ADR exists for it. |
| **Examples Suite internal design** | `examples/README.md` describes what each example demonstrates. | No documentation of `examples/shared/harness.ts` or `examples/shared/output.ts` internals (how the harness builds meshes, how output formatting works). |
| **CI/CD and deployment** | None. | No documentation of any build pipeline, APK signing, or release process. |
| **Contributing / developer onboarding** | `README.md` covers Android build instructions. | No contributor guide for the TypeScript `core/` side (how to run tests, how to add a new module, coding conventions beyond the steering file). |

---

*End of Documentation Audit. No source code, tests, or existing documents were modified.*
