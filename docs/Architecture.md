# NINE Architecture Document

## Document Metadata

| Field | Value |
|-------|-------|
| Version | 0.1.0 |
| Status | Draft |
| Date | 2026-07-15 |
| Authors | NINE Team |

---

## 1. Architectural Philosophy

NINE is designed as a **protocol**, not an application.

The protocol defines how nodes discover each other, how packets are structured, how messages are routed through a mesh, and how encryption secures communication. Applications (Android, Desktop, CLI, Simulator) are **clients** that consume the protocol through a well-defined Core API.

This mirrors how TCP/IP works: the protocol stack is independent of the application layer. A web browser and an email client both use TCP/IP without the protocol caring about the application.

---

## 2. Layered Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                      │
│         (Android App, Desktop Admin, Simulator)          │
├─────────────────────────────────────────────────────────┤
│                      CORE API                            │
│              (Public interface to the core)              │
├─────────────────────────────────────────────────────────┤
│                    PROTOCOL LAYER                         │
│        (Packet construction, serialization,              │
│         validation, type dispatch)                       │
├─────────────────────────────────────────────────────────┤
│                    ROUTING LAYER                          │
│        (Path discovery, forwarding decisions,            │
│         neighbor management, topology)                   │
├─────────────────────────────────────────────────────────┤
│                   SECURITY LAYER                          │
│        (Encryption, key generation, signing,             │
│         integrity verification)                          │
├─────────────────────────────────────────────────────────┤
│                   TRANSPORT LAYER                         │
│        (Abstract send/receive over any medium:           │
│         Wi-Fi Direct, Bluetooth, LoRa, simulated)       │
├─────────────────────────────────────────────────────────┤
│                   STORAGE LAYER                           │
│        (SQLite, message persistence, routing             │
│         table persistence, key storage)                  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Module Independence

Each layer is a self-contained module with:

- **No upward dependencies**: A lower layer never imports from a higher layer.
- **Interface-driven communication**: Layers interact through TypeScript interfaces, not concrete implementations.
- **Replaceable implementations**: Any layer can be swapped without affecting others.

### Dependency Direction (strict)

```
Application → Core API → Protocol → Routing → Transport
                                  → Security
                                  → Storage
```

Security, Storage, and Transport are **peer modules** at the bottom. They do not depend on each other.

---

## 4. Module Responsibilities

### 4.1 Protocol Module (`core/protocol/`)

- Defines all packet types and their binary/JSON serialization
- Validates packet structure and integrity
- Dispatches packets to appropriate handlers
- Maintains protocol version compatibility

### 4.2 Routing Module (`core/routing/`)

- Maintains neighbor table and routing table
- Implements route discovery (RREQ/RREP/RERR)
- Makes forwarding decisions
- Handles TTL management and loop prevention
- Exposes a pluggable interface for routing algorithms

### 4.3 Security Module (`core/security/`)

- AES-256 symmetric encryption/decryption
- RSA-2048 asymmetric encryption/decryption
- SHA-256 hashing and integrity checks
- Session key generation and lifecycle
- Dual-path key distribution logic

### 4.4 Transport Module (`core/transport/`)

- Abstracts physical communication medium
- Exposes generic `send(bytes, peerId)` and `onReceive(callback)` APIs
- Implementations: Wi-Fi Direct adapter, Bluetooth adapter, Simulated adapter
- Handles connection lifecycle (connect, disconnect, reconnect)

### 4.5 Storage Module (`core/storage/`)

- SQLite-based local persistence
- Stores: messages, routing tables, keys, node state
- No network access, no cloud sync
- Schema migrations

### 4.6 Shared Module (`core/shared/`)

- Type definitions used across modules
- Constants and enumerations
- Utility types (NodeID, PacketID, Timestamp)
- Error type definitions

### 4.7 Simulation Module (`core/simulation/`)

- Creates virtual nodes in a single process
- Simulates transport delays and failures
- Configurable topologies
- Used for testing routing algorithms before hardware deployment

### 4.8 Utils Module (`core/utils/`)

- ID generation (UUID v4)
- Timestamp utilities
- Byte manipulation helpers
- Logging infrastructure

---

## 5. Core API Surface

The Core API is the single entry point for any application. Applications never reach into internal modules directly.

```typescript
interface NineCore {
  // Node lifecycle
  initialize(config: NodeConfig): Promise<void>;
  shutdown(): Promise<void>;

  // Discovery
  startDiscovery(): void;
  stopDiscovery(): void;
  getNeighbors(): NodeInfo[];
  getKnownNodes(): NodeInfo[];

  // Broadcast
  broadcast(message: string): Promise<BroadcastResult>;
  onBroadcastReceived(callback: BroadcastCallback): void;

  // Secure messaging (to Admin)
  sendSecureMessage(message: string, adminId: NodeID): Promise<SecureMessageResult>;
  onSecureMessageReceived(callback: SecureMessageCallback): void;

  // Admin-specific
  decryptMessage(encryptedPacket: EncryptedPacket, keyPacket: KeyPacket): Promise<string>;

  // Mesh info
  getTopology(): MeshTopology;
  getRoutingTable(): RoutingEntry[];

  // Events
  on(event: NineEvent, callback: EventCallback): void;
  off(event: NineEvent, callback: EventCallback): void;
}
```

---

## 6. Communication Flow: Broadcast

```
User calls core.broadcast("Emergency alert")
    │
    ▼
Protocol layer constructs BROADCAST packet
    │
    ▼
Routing layer determines: flood to all neighbors
    │
    ▼
Transport layer sends packet bytes to each neighbor
    │
    ▼
Receiving node's transport delivers bytes
    │
    ▼
Protocol layer deserializes and validates
    │
    ▼
Routing layer checks TTL, deduplicates, re-floods
    │
    ▼
Application layer receives broadcast callback
```

---

## 7. Communication Flow: Secure Message (Dual-Path)

```
User calls core.sendSecureMessage("intel", adminId)
    │
    ▼
Security layer generates one-time AES session key
    │
    ▼
Security layer encrypts message with AES key
Security layer encrypts AES key with Admin's RSA public key
    │
    ▼
Protocol layer constructs two packets:
  - ENCRYPTED_MESSAGE (contains ciphertext)
  - KEY_PACKET (contains encrypted AES key)
    │
    ▼
Routing layer computes TWO INDEPENDENT PATHS to Admin
  - Path A for the message
  - Path B for the key
    │
    ▼
Transport layer sends each packet along its respective path
    │
    ▼
Admin node receives both packets (potentially at different times)
    │
    ▼
Admin's Security layer:
  - Decrypts AES key using Admin's RSA private key
  - Decrypts message using AES key
    │
    ▼
Admin application receives plaintext
```

**Why dual-path?** If an intermediate node is compromised, it only captures either the ciphertext OR the key — never both. Without both, the message is unreadable.

---

## 8. Node State Machine

```
┌──────────┐    initialize()    ┌──────────────┐
│   IDLE   │ ─────────────────► │  INITIALIZED │
└──────────┘                    └──────┬───────┘
                                       │ startDiscovery()
                                       ▼
                                ┌──────────────┐
                                │  DISCOVERING │◄────┐
                                └──────┬───────┘     │
                                       │             │ peer lost
                                       ▼             │
                                ┌──────────────┐     │
                                │   CONNECTED  │─────┘
                                └──────┬───────┘
                                       │ shutdown()
                                       ▼
                                ┌──────────────┐
                                │   SHUTDOWN   │
                                └──────────────┘
```

---

## 9. Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript | Type safety, cross-platform, strong async support |
| Runtime | Node.js 20 LTS | Stable, long-term support, native crypto |
| Database | SQLite (via better-sqlite3) | Embedded, zero-config, no server |
| Crypto | Node.js native `crypto` module | No external dependencies for core crypto |
| Build | tsup or tsc | Fast TypeScript compilation |
| Testing | Vitest | Fast, TypeScript-native, modern |
| Package Manager | npm | Standard, widely available |

---

## 10. Directory Structure

```
Project_NINE/
├── app/                        # Android application (UNTOUCHED)
├── core/                       # NINE Protocol Core
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts            # Core API entry point
│   │   ├── protocol/           # Packet definitions and serialization
│   │   │   ├── index.ts
│   │   │   ├── packet.ts
│   │   │   ├── serializer.ts
│   │   │   └── validator.ts
│   │   ├── routing/            # Mesh routing engine
│   │   │   ├── index.ts
│   │   │   ├── interfaces.ts
│   │   │   ├── router.ts
│   │   │   ├── neighbor-table.ts
│   │   │   └── routing-table.ts
│   │   ├── security/           # Encryption engine
│   │   │   ├── index.ts
│   │   │   ├── interfaces.ts
│   │   │   ├── aes.ts
│   │   │   ├── rsa.ts
│   │   │   ├── hash.ts
│   │   │   └── key-manager.ts
│   │   ├── transport/          # Abstract transport layer
│   │   │   ├── index.ts
│   │   │   ├── interfaces.ts
│   │   │   ├── wifi-direct.ts
│   │   │   ├── bluetooth.ts
│   │   │   └── simulated.ts
│   │   ├── storage/            # Local persistence
│   │   │   ├── index.ts
│   │   │   ├── interfaces.ts
│   │   │   ├── sqlite.ts
│   │   │   └── schema.ts
│   │   ├── shared/             # Cross-module types
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── constants.ts
│   │   │   └── errors.ts
│   │   ├── simulation/         # Virtual node simulator
│   │   │   ├── index.ts
│   │   │   ├── virtual-node.ts
│   │   │   ├── topology.ts
│   │   │   └── runner.ts
│   │   └── utils/              # Utilities
│   │       ├── index.ts
│   │       ├── id-generator.ts
│   │       ├── timestamp.ts
│   │       └── logger.ts
│   └── tests/
│       ├── protocol/
│       ├── routing/
│       ├── security/
│       ├── transport/
│       └── simulation/
├── docs/                       # Protocol specification (RFC-style)
│   ├── Architecture.md
│   ├── Protocol.md
│   ├── PacketFormat.md
│   ├── Routing.md
│   ├── Security.md
│   └── Transport.md
├── gradle/                     # Android build (UNTOUCHED)
├── build.gradle                # Android build (UNTOUCHED)
├── settings.gradle             # Android build (UNTOUCHED)
└── README.md
```

---

## 11. What Applications Do vs What Core Does

| Responsibility | Core | Application |
|---------------|------|-------------|
| Packet construction | ✓ | |
| Encryption/Decryption | ✓ | |
| Route computation | ✓ | |
| Byte transmission | ✓ | |
| Local storage | ✓ | |
| UI rendering | | ✓ |
| Platform-specific Bluetooth API calls | | ✓ (via transport adapter) |
| User interaction | | ✓ |
| Push notifications | | ✓ |

The transport adapter is the boundary: the core defines the interface, the application provides the platform-specific implementation (Android Bluetooth APIs, Electron Wi-Fi Direct APIs, etc.).

---

## 12. Future Extensibility

The architecture supports:

- **New transport mediums**: Implement `TransportAdapter` interface for LoRa, ZigBee, etc.
- **New routing algorithms**: Implement `RoutingAlgorithm` interface for DSR, OLSR, etc.
- **New encryption schemes**: Implement `CipherSuite` interface for post-quantum crypto.
- **New storage backends**: Implement `StorageEngine` interface for IndexedDB, LevelDB, etc.
- **New application clients**: Any platform can consume the Core API.
