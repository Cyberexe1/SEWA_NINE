# NINE Routing Specification

## Document Metadata

| Field | Value |
|-------|-------|
| Version | 0.1.0 |
| Status | Draft |
| Date | 2026-07-15 |
| Authors | NINE Team |

---

## 1. Overview

The NINE routing layer is responsible for discovering paths through the mesh and making forwarding decisions. It operates independently of the physical transport (Bluetooth, Wi-Fi Direct) and the security layer.

The routing engine is **pluggable** — different routing algorithms can be swapped without affecting any other layer.

---

## 2. Routing Modes

### 2.1 Flooding (Broadcast)

Used for BROADCAST packets and ROUTE_REQUEST propagation.

- Packet is sent to ALL neighbors.
- Each neighbor checks deduplication buffer.
- If unseen, decrements TTL and re-floods.
- No routing table required.

### 2.2 Source Routing (Secure Messages)

Used when a path is known (from prior ROUTE_REPLY).

- Source embeds the complete path in the packet.
- Each intermediate node forwards to the next hop in the path list.
- No routing table lookup at intermediate nodes.
- Failed hops trigger ROUTE_ERROR back to source.

### 2.3 Reactive Routing (On-Demand Path Discovery)

Used when no path to destination is currently known.

- Source floods ROUTE_REQUEST.
- Destination (or a node with a fresh route) replies with ROUTE_REPLY.
- Source caches the route and sends data.

This is conceptually based on **DSR (Dynamic Source Routing)** and **AODV (Ad hoc On-Demand Distance Vector)**.

---

## 3. Node State

Every node maintains:

### 3.1 Neighbor Table

Direct physical neighbors (within radio range).

```typescript
interface NeighborEntry {
  nodeId: NodeID;
  sessionId: SessionID;
  role: NodeRole;
  displayName: string;
  lastHeartbeat: Timestamp;
  linkQuality: number;       // 0.0 to 1.0
  transportType: TransportType;
  capabilities: number;      // Bitfield
}
```

A neighbor is considered **alive** if `lastHeartbeat` is within `HEARTBEAT_TIMEOUT_MS`.

### 3.2 Routing Table

Known routes to non-neighbor nodes.

```typescript
interface RoutingEntry {
  destinationId: NodeID;
  nextHopId: NodeID;
  hopCount: number;
  routeMetric: number;
  route: NodeID[];           // Full path (source routing)
  discoveredAt: Timestamp;
  expiresAt: Timestamp;
  sequenceNumber: number;
}
```

Routes expire after `ROUTE_EXPIRY_MS` (default: 30000ms) and must be re-discovered.

### 3.3 Known Nodes Table

All nodes the mesh is aware of (learned from discovery propagation, route requests, heartbeats).

```typescript
interface KnownNodeEntry {
  nodeId: NodeID;
  role: NodeRole;
  displayName: string;
  lastSeen: Timestamp;
  reachable: boolean;
  hopDistance: number;       // Estimated minimum hops
}
```

### 3.4 Pending Queue

Packets waiting for route discovery to complete.

```typescript
interface PendingEntry {
  packet: Packet;
  destinationId: NodeID;
  enqueuedAt: Timestamp;
  retryCount: number;
}
```

If route discovery fails after `MAX_RETRIES`, the packet is dropped and an error is reported to the application layer.

---

## 4. Route Discovery Process

### 4.1 Initiating Route Discovery

When a node needs to send a packet to a destination with no known route:

1. Buffer the packet in the pending queue.
2. Construct a ROUTE_REQUEST packet with:
   - `targetNodeId` = destination
   - `requestSeqNum` = monotonically increasing counter
   - `hopList` = [self]
3. Flood the ROUTE_REQUEST to all neighbors.
4. Start a timer (`ROUTE_REQUEST_TIMEOUT_MS`).

### 4.2 Processing ROUTE_REQUEST (Intermediate Node)

When an intermediate node receives a ROUTE_REQUEST:

1. Check dedup buffer — if seen, drop.
2. Add self to `hopList`.
3. If this node IS the target:
   - Construct ROUTE_REPLY (see 4.3).
4. If this node has a fresh route to target:
   - Construct ROUTE_REPLY with the cached route appended.
5. Otherwise:
   - Decrement TTL, re-flood to all neighbors (except the one it came from).

### 4.3 Constructing ROUTE_REPLY

The destination (or intermediate with cached route) constructs:

```
ROUTE_REPLY {
  targetNodeId: destination
  requestSeqNum: matches the request
  routeLength: length of hopList
  route: reverse of hopList (path from source to destination)
  routeMetric: hopCount (or weighted metric)
}
```

The ROUTE_REPLY is sent **back along the reverse path** (source-routed using the reversed hopList).

### 4.4 Processing ROUTE_REPLY (Source)

When the source receives a ROUTE_REPLY:

1. Cache the route in the routing table.
2. Dequeue pending packets for that destination.
3. Send pending packets using the discovered route.

---

## 5. Forwarding Algorithm

```
function forward(packet: Packet): void {
  // Step 1: Is this packet for me?
  if (packet.destinationId === self.nodeId) {
    deliverToApplication(packet);
    return;
  }

  // Step 2: Is this a broadcast?
  if (packet.destinationId === BROADCAST_ADDRESS) {
    deliverToApplication(packet);
    floodToNeighbors(packet, excludeSender);
    return;
  }

  // Step 3: Check TTL
  if (packet.ttl <= 0) {
    drop(packet, "TTL exhausted");
    return;
  }

  // Step 4: Check dedup
  if (seenBefore(packet.packetId)) {
    drop(packet, "duplicate");
    return;
  }
  markSeen(packet.packetId);

  // Step 5: Decrement TTL, increment hopCount
  packet.ttl--;
  packet.hopCount++;

  // Step 6: Look up next hop
  const route = routingTable.get(packet.destinationId);
  if (route) {
    sendToNeighbor(packet, route.nextHopId);
  } else {
    // No route known — initiate discovery
    bufferAndDiscover(packet);
  }
}
```

---

## 6. Dual-Path Routing for Secure Messages

For ENCRYPTED_MESSAGE and KEY_PACKET pairs, the routing layer must find **two disjoint paths** to the Admin node.

### 6.1 Path Disjointness

Two paths are **node-disjoint** if they share no intermediate nodes (only the source and destination are common).

If node-disjoint paths are unavailable (sparse topology), the system falls back to **edge-disjoint** paths (different links, but may share nodes).

If only one path exists (linear topology), both packets travel the same path. Security relies solely on encryption in this case.

### 6.2 Dual-Path Discovery

1. Perform standard route discovery → get Path A.
2. Perform a second route discovery with Path A's intermediate nodes **excluded**.
3. If a second path is found → Path B.
4. If not, use the same path for both (degraded security mode — log warning).

### 6.3 Path Assignment

- ENCRYPTED_MESSAGE → Path A
- KEY_PACKET → Path B

The assignment is random (50% chance of swap) to prevent predictability.

---

## 7. Route Maintenance

### 7.1 Link Failure Detection

A link is considered broken when:

- Heartbeat from neighbor times out (`HEARTBEAT_TIMEOUT_MS`).
- Transport layer reports send failure.

### 7.2 ROUTE_ERROR Propagation

When a link breaks:

1. Remove the neighbor from the neighbor table.
2. Invalidate all routes that use this neighbor as next hop.
3. Construct ROUTE_ERROR packet with the unreachable node.
4. Send ROUTE_ERROR to all nodes that had routes through the broken link (backward propagation).

### 7.3 Route Repair

After receiving a ROUTE_ERROR:

- The source re-initiates route discovery.
- Buffered packets for the broken route are held until a new route is found or MAX_RETRIES is exhausted.

---

## 8. Routing Algorithm Interface

The routing engine must implement this interface. Different algorithms (flooding, DSR, AODV, OLSR) can be plugged in.

```typescript
interface RoutingAlgorithm {
  readonly name: string;
  readonly version: string;

  // Initialize with node context
  initialize(context: RoutingContext): void;

  // Find next hop for a destination
  getNextHop(destinationId: NodeID): NodeID | null;

  // Get full route to destination (if available)
  getRoute(destinationId: NodeID): NodeID[] | null;

  // Find two disjoint paths for dual-path routing
  getDualPaths(destinationId: NodeID): [NodeID[], NodeID[]] | null;

  // Handle incoming routing control packets
  handleRouteRequest(packet: RouteRequestPacket): void;
  handleRouteReply(packet: RouteReplyPacket): void;
  handleRouteError(packet: RouteErrorPacket): void;

  // Notification hooks
  onNeighborAdded(neighbor: NeighborEntry): void;
  onNeighborRemoved(neighborId: NodeID): void;
  onLinkQualityChanged(neighborId: NodeID, quality: number): void;

  // Cleanup
  shutdown(): void;
}
```

---

## 9. Metrics and Route Selection

When multiple routes exist, selection is based on:

| Metric | Weight | Description |
|--------|--------|-------------|
| Hop count | Primary | Fewer hops preferred |
| Link quality | Secondary | Higher quality links preferred |
| Node load | Tertiary | Less loaded nodes preferred |
| Route freshness | Tiebreaker | More recent routes preferred |

Composite metric:

```
routeMetric = (hopCount * 100) + ((1 - avgLinkQuality) * 50) + (avgLoad * 10)
```

Lower metric = better route.

---

## 10. Topology Awareness

The routing layer maintains a **partial topology view** based on:

- Direct neighbor observations
- ROUTE_REQUEST hop lists (reveals path segments)
- ROUTE_REPLY routes (reveals full paths)
- ROUTE_ERROR reports (reveals broken links)

This partial view is exposed to the Admin dashboard for visualization. It is NOT a complete network map — only paths that have been actively discovered are known.

---

## 11. Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| ROUTE_EXPIRY_MS | 30000 | Route cache lifetime |
| MAX_ROUTE_DISCOVERY_RETRIES | 3 | Route discovery attempts |
| ROUTE_DISCOVERY_TIMEOUT_MS | 10000 | Time to wait for reply |
| MAX_PENDING_QUEUE_SIZE | 64 | Packets awaiting routes |
| PENDING_PACKET_TIMEOUT_MS | 30000 | Max time in pending queue |
| MAX_HOP_LIST_SIZE | 20 | Max nodes in a route |
| DUAL_PATH_REQUIRED | false | Fail if dual path unavailable |
