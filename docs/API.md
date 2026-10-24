# NINE Core API Specification

## Document Metadata

| Field | Value |
|-------|-------|
| Version | 0.1.0 |
| Status | Draft |
| Date | 2026-07-15 |
| Authors | NINE Team |

---

## 1. Overview

The Core API is the **single entry point** for any application (Android, Desktop Admin, CLI, Simulator) to interact with the NINE protocol. Applications never reach into internal modules directly.

This document defines every public method, its parameters, return types, and behavior.

---

## 2. Core Initialization

### `initialize(config: NodeConfig): Promise<void>`

Initializes the NINE node with the given configuration. Must be called before any other operation.

**Parameters:**
```typescript
interface NodeConfig {
  role: NodeRole;              // USER or ADMIN
  displayName: string;         // Human-readable name
  storagePath: string;         // SQLite database path
  nodeId?: NodeID;             // Resume existing identity (optional)
  transports: TransportSelection[];  // Which adapters to enable
}
```

**Behavior:**
1. Generates or restores Node ID and Session ID.
2. Initializes storage (creates database/tables if needed).
3. Initializes security engine (generates/loads Admin keys if ADMIN role).
4. Registers transport adapters.
5. Starts heartbeat emission.

**Errors:**
- `InvalidConfigError` — Missing required fields.
- `StorageError` — Database initialization failed.

---

### `shutdown(): Promise<void>`

Gracefully shuts down the node.

**Behavior:**
1. Stops heartbeat and discovery.
2. Sends NODE_SHUTDOWN route error to neighbors.
3. Persists routing state to storage.
4. Closes all transport connections.
5. Closes database.
6. Securely erases keys from memory.

---

## 3. Discovery

### `startDiscovery(): void`

Begins scanning for nearby nodes on all registered transport adapters.

Emits `NEIGHBOR_DISCOVERED` events as new nodes are found.

### `stopDiscovery(): void`

Stops scanning.

### `getNeighbors(): NodeInfo[]`

Returns all direct (1-hop) neighbors currently alive.

### `getKnownNodes(): NodeInfo[]`

Returns all nodes known to the mesh (including multi-hop nodes discovered via route propagation).

---

## 4. Broadcast Communication

### `broadcast(message: string, isEmergency?: boolean): Promise<BroadcastResult>`

Sends a broadcast message to all reachable nodes in the mesh.

**Parameters:**
- `message` — UTF-8 text content (max 3900 bytes after encoding).
- `isEmergency` — If true, sets content type to EMERGENCY_ALERT (higher relay priority).

**Returns:**
```typescript
interface BroadcastResult {
  success: boolean;
  packetId: PacketID;
  reachedNeighbors: number;
}
```

**Behavior:**
1. Constructs BROADCAST packet with broadcast destination address.
2. Floods to all neighbors via transport layer.
3. Returns immediately — delivery is best-effort.

### `onBroadcastReceived(callback): void`

Registers a callback invoked when a broadcast is received.

```typescript
interface BroadcastReceivedEvent {
  packetId: PacketID;
  senderId: NodeID;
  senderName: string;
  message: string;
  hopCount: number;
  timestamp: Timestamp;
  isEmergency: boolean;
}
```

---

## 5. Secure Communication

### `sendSecureMessage(message: string, adminId: NodeID): Promise<SecureMessageResult>`

Encrypts and sends a message to the Admin node using dual-path routing.

**Parameters:**
- `message` — Plaintext message for Admin.
- `adminId` — Node ID of the intended Admin recipient.

**Returns:**
```typescript
interface SecureMessageResult {
  success: boolean;
  messagePacketId: PacketID;
  keyPacketId: PacketID;
  dualPathUsed: boolean;
}
```

**Behavior:**
1. Generates AES-256 session key.
2. Encrypts message with AES-256-GCM.
3. Encrypts session key with Admin's RSA-2048 public key.
4. Constructs ENCRYPTED_MESSAGE and KEY_PACKET.
5. Routes each on independent paths (if available).
6. Returns result (does not wait for Admin ACK).

### `onSecureMessageReceived(callback): void` (Admin only)

Registers a callback for when a secure message is fully received and decrypted.

### `decryptMessage(encryptedPayload, keyPayload): Promise<string>` (Admin only)

Manually decrypts a secure message using the Admin's private key.

---

## 6. Mesh Information

### `getTopology(): TopologyView`

Returns the current known mesh topology for visualization.

```typescript
interface TopologyView {
  nodes: KnownNodeEntry[];
  edges: TopologyEdge[];
}
```

### `getRoutingTable(): RoutingEntry[]`

Returns the current routing table entries.

---

## 7. Event System

### `on(event: NineEvent, callback): void`

Subscribe to protocol events.

### `off(event: NineEvent, callback): void`

Unsubscribe from protocol events.

**Available Events:**
| Event | Description |
|-------|-------------|
| BROADCAST_RECEIVED | Incoming broadcast message |
| SECURE_MESSAGE_RECEIVED | Incoming secure message (Admin) |
| NEIGHBOR_DISCOVERED | New direct neighbor found |
| NEIGHBOR_LOST | Direct neighbor timed out |
| ROUTE_DISCOVERED | New route to a distant node |
| ROUTE_BROKEN | Route to a node failed |
| NODE_JOINED_MESH | New node appeared in known nodes |
| NODE_LEFT_MESH | Node disappeared from mesh |
| ERROR | Internal error occurred |

---

## 8. Error Handling

All API methods may throw `NineError` subclasses. Applications should catch:

- `NodeNotInitializedError` — Called methods before `initialize()`.
- `RouteNotFoundError` — No path to destination.
- `EncryptionError` — Crypto operation failed.
- `TransportSendError` — All transport adapters failed.
- `StorageError` — Database operation failed.
