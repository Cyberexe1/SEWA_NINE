# NINE Core SDK

## Document Metadata

| Field | Value |
|-------|-------|
| Version | 0.7.5-alpha |
| Status | Stable |
| Date | 2026-07-15 |

---

## 1. Overview

`NineCore` is the **single public entry point** into the NINE protocol.
Applications (Android, Desktop Admin, CLI, Web) interact only through it.
They never touch `PacketEngine`, `RoutingEngine`, `SecurityEngine`, or
`TransportManager` directly.

```
┌─────────────────────────────────────────┐
│   Application (Android / Desktop / CLI)   │
└────────────────────┬──────────────────────┘
                     │  (only allowed dependency)
              ┌──────▼───────┐
              │   NineCore    │  ← composition root
              └──────┬───────┘
     ┌───────────────┼────────────────┬──────────────┐
     ▼               ▼                ▼              ▼
  Protocol       Routing          Security       Transport
  Node Layer   Dual-Path        (AES/RSA)      (ITransport)
```

---

## 2. Quick Start

```typescript
import { NineCoreBuilder } from '@nine/core/NineCoreBuilder';
import { createConfiguration } from '@nine/core/NineConfiguration';
import { NodeRole } from '@nine/core/shared/Types';
import { MockTransport, MockMedium } from '@nine/core/transport/MockTransport';

// 1. Build a node
const medium = new MockMedium();
const transport = new MockTransport(myPeerId, medium);

const core = new NineCoreBuilder()
  .withConfiguration(createConfiguration(NodeRole.USER, 'Alpha'))
  .withTransport(transport)
  .build();

// 2. Initialize
await core.initialize();

// 3. Subscribe to events
core.onBroadcast((e) => console.log('Broadcast:', e.message));
core.onSecureMessage((e) => console.log('Secure:', e.plaintext));

// 4. Communicate
core.sendBroadcast('Emergency alert', /* isEmergency */ true);
core.sendSecureMessage('classified', adminNodeId);

// 5. Shutdown
await core.shutdown();
```

---

## 3. Public API Reference

### 3.1 Lifecycle

| Method | Description |
|--------|-------------|
| `initialize(): Promise<void>` | Initialize the protocol stack. Admin generates RSA keys here. |
| `shutdown(): Promise<void>` | Gracefully shut down and erase key material. |
| `tick(): void` | Periodic maintenance (evict stale routes, keys, partials). |

### 3.2 Messaging

| Method | Description |
|--------|-------------|
| `sendBroadcast(message, isEmergency?)` | Flood a message to all reachable nodes. |
| `sendSecureMessage(message, adminId)` | Dual-path encrypted delivery to Admin. Returns `{ sessionId, dualPathAchieved }`. |
| `receive(from, data)` | Feed raw incoming bytes (used by transport integration). |

### 3.3 Discovery & Connection

| Method | Description |
|--------|-------------|
| `discoverPeers(): Promise<void>` | Start peer discovery on all transports. |
| `connect(peerId): Promise<void>` | Connect to a peer. |
| `disconnect(peerId): Promise<void>` | Disconnect and invalidate routes. |

### 3.4 Queries

| Method | Returns |
|--------|---------|
| `getTopology()` | `{ self, neighbors[], knownNodes[], routes[] }` |
| `getNeighbors()` | Direct neighbor Node IDs |
| `getRoutes()` | Current routing entries |
| `getMetrics()` | Unified metrics (see 3.6) |
| `getNodeInfo()` | `{ nodeId, displayName, role, lifecycleState }` |
| `getAdminPublicKey()` | Admin's RSA public key (Admin only) |

### 3.5 Events

| Subscription | Event payload |
|--------------|---------------|
| `onBroadcast(handler)` | `{ senderId, message, hopCount, timestamp, isEmergency }` |
| `onSecureMessage(handler)` | `{ senderId, plaintext, sessionId, timestamp }` |
| `onNodeJoined(handler)` | `{ nodeId, displayName? }` |
| `onNodeLeft(handler)` | `{ nodeId }` |
| `onTransportChanged(handler)` | `{ transportType, status }` |

### 3.6 Unified Metrics

`getMetrics()` returns an aggregate from all subsystems:

```typescript
{
  routing: { routesCreated, routesInvalidated, packetsForwarded,
             packetsDropped, duplicatesDetected, ttlExpired,
             routeDiscoveries, routeRepliesSent, routeErrorsSent,
             acksSent, acksReceived, pendingQueueSize },
  dualPath: { messagesSent, messagesDelivered, messagesTimedOut,
              duplicatesSuppressed, averageReconstructionMs,
              dualPathUsed, singlePathFallback },
  transport: { bytesSent, bytesReceived, packetsSent, packetsReceived },
  node: { neighborCount, knownNodeCount, routeCount }
}
```

---

## 4. Configuration

All runtime tunables live in `NineConfiguration`. Use `createConfiguration()`
with overrides — never hardcode values.

```typescript
const config = createConfiguration(NodeRole.ADMIN, 'Admin', {
  heartbeatIntervalMs: 2000,
  broadcastTTL: 15,
  simulationMode: true,
});
```

Key parameters: `heartbeatIntervalMs`, `heartbeatTimeoutMs`, `packetTimeoutMs`,
`ackTimeoutMs`, `ackMaxRetries`, `routeExpiryMs`, `routeDiscoveryTimeoutMs`,
`reassemblyTimeoutMs`, `duplicateCacheSize`, `maxTTL`, `broadcastTTL`,
`routedTTL`, `pendingQueueSize`, `sessionKeyMaxAgeMs`, `maxPacketAgeMs`,
`preferredTransports`, `simulationMode`.

---

## 5. NineCoreBuilder

The builder handles dependency wiring only. No protocol logic.

```typescript
new NineCoreBuilder()
  .withRole(NodeRole.USER)
  .withDisplayName('Alpha')
  .withNodeId(existingId)              // optional — resume identity
  .withConfiguration(config)           // or .withConfigOverrides({...})
  .withTransport(transport)            // required — any ITransport
  .withClock(() => virtualClock.now()) // optional — for simulation
  .build();
```

---

## 6. Transport Injection

`NineCore` accepts any `ITransport` implementation:

- `MockTransport` — in-memory, for testing
- `VirtualTransportAdapter` — wraps the simulator's VirtualTransport
- (Future) Wi-Fi Direct, Bluetooth, LoRa — plug in without core changes

---

## 7. Encapsulation Guarantee

The following are **NOT** accessible from applications:

- `PacketEngine` serialize/parse
- `RoutingEngine` internals
- `AES` / `RSA` / `KeyManager`
- `TransportManager` raw send

All access flows through `NineCore`'s public methods. This is enforced by
the module boundary and verified by integration tests.
