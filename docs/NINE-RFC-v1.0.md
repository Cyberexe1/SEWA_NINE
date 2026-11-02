# NINE Protocol Specification — RFC v1.0

## Document Metadata

| Field | Value |
|-------|-------|
| Title | NINE Protocol (SAMT — Secure Adaptive Message Transfer) |
| Version | 0.9.1-draft |
| Status | DRAFT v0.9 — Accepted for Development |
| Date | 2026-07-15 |
| Authors | NINE Team |
| Category | Experimental Protocol Specification |

---

## Table of Contents

1. Protocol Overview
2. Network Architecture
3. Node Model
4. Packet Architecture
5. Packet Types
6. Discovery Protocol
7. Routing Protocol
8. Broadcast Protocol
9. Secure Communication Protocol
10. Security Model
11. State Machines
12. Failure Handling
13. Protocol Rules
14. Future Extensions
15. Open Questions
16. Appendix A: Packet Lifecycle State Diagram
17. Appendix B: Worked Examples for All Packet Types

---

## 1. Protocol Overview

### 1.1 Purpose

NINE (No Infrastructure Network Exchange) defines a communication protocol for mesh networks that operate without any centralized infrastructure. The protocol enables text message delivery between mobile devices using only local radio links (Wi-Fi Direct, Bluetooth) with automatic multi-hop relay.

The protocol addresses two communication patterns:
- **Broadcast**: One sender, all receivers. Used for emergency alerts and public messages.
- **Secure Unicast**: One sender, one Admin receiver. End-to-end encrypted with dual-path key separation.

### 1.2 Scope

This specification defines:
- Packet structure and types
- Node discovery and neighbor management
- Multi-hop routing behavior
- Broadcast propagation rules
- Secure message encryption and dual-path delivery
- State machines governing protocol behavior
- Failure detection and recovery

This specification does NOT define:
- Transport-layer implementation details (Bluetooth API calls, Wi-Fi Direct group formation)
- User interface behavior
- Application-layer message formatting
- Storage schema
- Wire encoding byte offsets (deferred to a companion Encoding Specification)

### 1.3 Design Philosophy

1. **Protocol-first**: NINE is a protocol, not an application. Any platform can implement it.
2. **Infrastructure-independent**: No internet, no cellular, no cloud, no central server.
3. **Best-effort delivery**: The protocol does not guarantee delivery. Reliability is layered on top through ACKs and retries.
4. **Stateless forwarding**: Relay nodes forward packets without maintaining per-flow state. They examine the header, make a forwarding decision, and forget.
5. **Loop-safe**: TTL decrement and packet deduplication prevent infinite propagation.
6. **Security by default**: Secure messages are encrypted before entering the protocol stack. The protocol transports opaque ciphertext.
7. **Transport-agnostic**: The protocol operates identically over any physical medium.
8. **Minimal overhead**: Headers are compact. Control traffic is minimized in small networks.

### 1.4 Assumptions

- Nodes are Android mobile devices or desktop computers with Bluetooth and/or Wi-Fi Direct capability.
- The network consists of 3 to 20 nodes deployed within a single building (multi-floor).
- All nodes run the same protocol version (no mixed-version meshes in v1).
- Clocks are not synchronized. Clock drift up to ±60 seconds is tolerated.
- Nodes may join or leave the mesh at any time without warning.
- At most one Admin node exists in the mesh at any time.
- Physical-layer connectivity is symmetric: if A can hear B, then B can hear A.

### 1.5 Constraints

- Maximum packet size: 4096 bytes.
- Maximum TTL: 255 hops.
- Maximum mesh diameter (longest shortest path): 20 hops.
- Maximum neighbors per node: 7 (Bluetooth Classic limit; Wi-Fi Direct allows more).
- No fragmentation at the protocol level in v1. Messages exceeding 4096 bytes must be split at the application layer.
- No multicast groups. Only broadcast (all nodes) or unicast (one destination).

---

## 2. Network Architecture

### 2.1 Mesh Topology

NINE operates as a **flat, unstructured mesh**. There is no hierarchy, no cluster heads, and no designated routers. Every node is equal at the protocol level (though roles differ at the application level).

The mesh is formed organically: nodes discover neighbors via local radio, exchange discovery messages, and build routing state on demand. The resulting topology depends entirely on physical placement and radio range.

Example topology (5 nodes, 2 floors):

```
Floor 2:    [D] -------- [E]
              \
               \
Floor 1:    [A] --- [B] --- [C/Admin]
```

Node D can only reach C through A or through E (if E has a path). The protocol discovers these paths automatically.

### 2.2 Node Roles

| Role | Description | Capabilities |
|------|-------------|--------------|
| **Common User** | Standard mesh participant | Send broadcasts, send secure messages to Admin, relay packets for others, receive broadcasts |
| **Admin** | Privileged receiver and monitor | All User capabilities + receive/decrypt secure messages, view mesh topology, access communication logs |

Role assignment is **static per session**. A node declares its role at initialization and cannot change it without restarting.

The protocol treats Admin as a regular node for routing and relay purposes. The only protocol-level difference is:
- Admin includes its RSA public key in DISCOVERY packets.
- Admin is the only valid destination for ENCRYPTED_MESSAGE and KEY_PACKET packets.
- Admin maintains decryption state for pairing message/key packets.

### 2.3 Communication Model

NINE supports two communication patterns:

**Broadcast (one-to-all)**
- Sender creates a BROADCAST packet with the broadcast address as destination.
- Every node in the mesh receives and displays the message.
- Propagation uses controlled flooding with TTL.
- No route discovery required.

**Secure Unicast (one-to-Admin)**
- Sender encrypts a message and splits it into two packets: ENCRYPTED_MESSAGE and KEY_PACKET.
- Each packet is routed independently to the Admin node.
- Only Admin can reconstruct the original message.
- Route discovery is required if no path to Admin is known.

There is no general-purpose unicast between two Common Users in v1.

### 2.4 Multi-Hop Communication

Nodes communicate beyond their direct radio range through **relay**. When node A wants to reach node C but only node B is within A's radio range:

```
A → B (relay) → C
```

B receives the packet, inspects the destination, determines it is not the intended recipient, and forwards it toward C.

Key multi-hop rules:
1. A relay node MUST NOT modify the packet payload.
2. A relay node MUST decrement TTL by 1.
3. A relay node MUST increment hop count by 1.
4. A relay node MUST check the deduplication buffer before forwarding.
5. A relay node MUST drop packets with TTL = 0.
6. The original sender's ID (senderId) NEVER changes during relay.

---

## 3. Node Model

### 3.1 Node Lifecycle

Every node progresses through a defined lifecycle:

```
UNINITIALIZED → INITIALIZING → IDLE → DISCOVERING → ACTIVE → SHUTTING_DOWN → TERMINATED
```

| State | Description |
|-------|-------------|
| UNINITIALIZED | Node has not been configured |
| INITIALIZING | Loading identity, opening storage, generating keys |
| IDLE | Ready but not participating in the mesh |
| DISCOVERING | Actively scanning for neighbors |
| ACTIVE | Participating in the mesh (sending, receiving, relaying) |
| SHUTTING_DOWN | Graceful departure (sending ROUTE_ERROR with shutdown code) |
| TERMINATED | All resources released |

A node MUST be in ACTIVE state to relay packets. A node MAY receive packets in DISCOVERING state but MUST NOT relay them until it transitions to ACTIVE.

### 3.2 Node Identity

Each node possesses two identities:

**Node ID**
- A 128-bit UUID v4 generated at first initialization.
- Persists across restarts (stored locally).
- Used as the source/destination address in all packets.
- Not tied to any hardware address (MAC, Bluetooth address).
- A node MAY regenerate its Node ID to achieve anonymity (identity reset).

**Session ID**
- A 64-bit cryptographically random value generated at each startup.
- Changes on every restart.
- Included in DISCOVERY and HEARTBEAT packets.
- Purpose: allows neighbors to detect restarts. If a known node reappears with a different Session ID, all stale routing state for that node MUST be invalidated.

### 3.3 Temporary IDs

NINE does not use temporary IDs for general communication. The Node ID is the sole addressing identifier.

However, at the transport layer, a **Peer ID** exists which maps to the transport-specific address (Bluetooth MAC, Wi-Fi Direct device address). The mapping between Peer ID and Node ID is established during discovery.

### 3.4 Neighbor Table

Every node maintains a **Neighbor Table** containing direct (1-hop) peers:

| Field | Description |
|-------|-------------|
| nodeId | The neighbor's Node ID |
| sessionId | The neighbor's current Session ID |
| role | USER or ADMIN |
| displayName | Human-readable name |
| lastHeartbeat | Timestamp of last heartbeat received |
| linkQuality | Estimated link quality (0.0 to 1.0) |
| transportType | Which transport connects to this neighbor |
| capabilities | Bitfield of supported features |

A neighbor is considered **alive** if `(now - lastHeartbeat) < HEARTBEAT_TIMEOUT`.

A neighbor is considered **dead** if the timeout is exceeded. Dead neighbors are removed from the table and a ROUTE_ERROR is generated for all routes that used them as next hop.

### 3.5 Routing Table

Every node maintains a **Routing Table** for multi-hop destinations:

| Field | Description |
|-------|-------------|
| destinationId | Target node's ID |
| nextHopId | First hop toward the destination (must be a current neighbor) |
| hopCount | Total hops to reach destination |
| routeMetric | Composite quality score (lower is better) |
| fullPath | Ordered list of node IDs from self to destination |
| sequenceNumber | Freshness indicator (higher = more recent) |
| discoveredAt | When this route was learned |
| expiresAt | When this route becomes invalid |

Routes expire after ROUTE_EXPIRY_MS (default 30 seconds). Expired routes MUST be removed. If a packet needs to be sent to a destination with no valid route, route discovery MUST be initiated.

### 3.6 Heartbeat

Every node in ACTIVE state periodically emits a HEARTBEAT packet to all direct neighbors.

- Emission interval: HEARTBEAT_INTERVAL_MS (default 5000ms).
- Timeout threshold: HEARTBEAT_TIMEOUT_MS (default 15000ms, i.e., 3 missed heartbeats).
- Heartbeats are NOT relayed. They travel exactly 1 hop.
- Heartbeats carry the sender's Session ID, current neighbor count, and load indicator.

The heartbeat serves three purposes:
1. **Liveness detection**: If heartbeats stop, the neighbor is considered dead.
2. **Session change detection**: A new Session ID from a known Node ID means restart.
3. **Load awareness**: The load field informs routing decisions.

---

## 4. Packet Architecture

### 4.1 Generic Packet Format

Every NINE packet consists of a **fixed header** followed by a **variable-length payload** and an **optional signature**.

```
┌──────────────────────────────────────┐
│            PACKET HEADER             │  (fixed size)
├──────────────────────────────────────┤
│            PAYLOAD                   │  (variable, 0 to MAX_PAYLOAD bytes)
├──────────────────────────────────────┤
│            SIGNATURE (optional)      │  (fixed 64 bytes when present)
└──────────────────────────────────────┘
```

### 4.2 Required Packet Fields (Header)

> **STATUS: DRAFT** — This header layout is under active design.
> Field offsets, sizes, and order may change before protocol freeze.
> See companion document NINE-PacketEncoding-v1.0.md for wire format details.

Every packet header MUST contain:

| Field | Size | Description |
|-------|------|-------------|
| version | 1 byte | Protocol version. Current: 1 |
| packetType | 1 byte | Identifies the packet type (see Section 5) |
| flags | 1 byte | Bitfield for packet properties (see 4.5) |
| packetId | 16 bytes | UUID v4 uniquely identifying this packet |
| senderId | 16 bytes | Node ID of the original sender |
| destinationId | 16 bytes | Node ID of the intended recipient |
| sequenceNumber | 4 bytes | Per-sender monotonic counter |
| timestamp | 8 bytes | Creation time (ms since Unix epoch) |
| ttl | 1 byte | Time-to-live (decremented per hop) |
| hopCount | 1 byte | Hops traversed (incremented per hop) |
| payloadLength | 2 bytes | Length of payload in bytes |
| checksum | 4 bytes | CRC-32 over entire packet |

Total fixed header size: **71 bytes**.

### 4.3 Packet Metadata

Beyond the header fields, the protocol tracks per-packet metadata that is NOT transmitted on the wire but maintained locally:

| Metadata | Description |
|----------|-------------|
| receivedFrom | Peer ID of the neighbor that delivered this packet |
| receivedAt | Local timestamp when packet arrived |
| receivedVia | Transport type used (WiFi/BT) |
| relayedTo | List of peers this packet was forwarded to |
| processingResult | Delivered / Relayed / Dropped / Buffered |

This metadata exists only in memory for debugging and monitoring.

### 4.4 TTL (Time-to-Live)

- Initial value is set by the sender based on packet type.
- Each relay node decrements TTL by exactly 1 before forwarding.
- If TTL reaches 0, the packet MUST be dropped silently (no error generated).
- Default TTL values:
  - BROADCAST: 10
  - Routed unicast: 20
  - ROUTE_REQUEST: 20 (must be able to reach entire mesh)
  - ACK: 20
  - HEARTBEAT: 1 (never relayed)
  - DISCOVERY / DISCOVERY_RESPONSE: 1 (never relayed)

### 4.5 Packet Flags

The flags field is a 1-byte bitfield:

| Bit | Name | Meaning |
|-----|------|---------|
| 0 | PRIORITY | High priority — jumps to front of send queue |
| 1 | REQUIRES_ACK | Sender expects an ACK for this packet |
| 2 | SIGNED | A 64-byte signature is appended after the payload |
| 3 | ENCRYPTED | Payload contains encrypted data |
| 4 | RESERVED_4 | Reserved for future use |
| 5 | RESERVED_5 | Reserved for future use |
| 6 | RESERVED_6 | Reserved for future use |
| 7 | RESERVED_7 | Reserved for future use |

Flags affect forwarding behavior:
- PRIORITY packets bypass normal queue ordering at relay nodes.
- REQUIRES_ACK packets trigger an ACK from the destination (not from relays).
- SIGNED packets have an additional 64-byte signature after the payload.

### 4.6 Sequence Number

Every node maintains a per-destination monotonically increasing counter.

- Incremented each time a new packet is sent to a given destination (or broadcast).
- Used for ordering messages at the receiver.
- Used for replay detection: a packet with a sequence number ≤ the last received from that sender MAY be dropped as a replay (in combination with timestamp checking).
- Sequence numbers wrap at 2^32 (4,294,967,295). After wrap, both sides reset.

### 4.7 Checksum

CRC-32 computed over the entire packet (header + payload + signature if present), with the checksum field itself set to zero during computation.

Purpose: Detect accidental corruption during transmission.

CRC-32 is NOT cryptographically secure. It does not protect against intentional tampering. Intentional tampering protection is provided by the signature field (for packets that require authentication) and by AES-GCM authenticated encryption (for encrypted payloads).

### 4.8 Signature

An optional 64-byte Ed25519 digital signature over (header + payload), with the checksum and signature fields zeroed during computation.

Present only when the SIGNED flag is set. Required for:
- ENCRYPTED_MESSAGE
- KEY_PACKET

The signature proves the packet was created by the claimed sender. Relay nodes MAY verify signatures before forwarding (but this is not required in v1 — verification at destination only).

---

## 5. Packet Types

### 5.1 DISCOVERY (0x01)

**Purpose:** Announce presence to immediate neighbors and initiate the discovery handshake.

**Fields (payload):**
| Field | Description |
|-------|-------------|
| sessionId | Current 64-bit session identifier |
| role | Node role (0 = User, 1 = Admin) |
| displayName | UTF-8 string, human-readable name |
| capabilities | Bitfield (Wi-Fi Direct, BT Classic, BLE, willing to relay) |
| publicKey | Admin's RSA-2048 public key (present only if role = Admin) |

**Generated by:** Any node entering DISCOVERING or ACTIVE state.
**Consumed by:** All nodes within direct radio range.
**Forwarding rules:** NEVER forwarded. TTL is always 1. If a relay receives a DISCOVERY with TTL > 1, it MUST drop it.
**Lifetime:** The discovery handshake has no timeout. The node simply waits for DISCOVERY_RESPONSE.
**Example:** Node A powers on, enters DISCOVERING state, broadcasts DISCOVERY on all transport adapters. Node B receives it, adds A to its neighbor table, and replies with DISCOVERY_RESPONSE.

---

### 5.2 DISCOVERY_RESPONSE (0x02)

**Purpose:** Reply to a DISCOVERY packet, completing the two-way handshake.

**Fields (payload):** Identical to DISCOVERY payload.

**Generated by:** A node that receives a valid DISCOVERY packet from a new or returning peer.
**Consumed by:** The node that sent the original DISCOVERY.
**Forwarding rules:** NEVER forwarded. TTL is always 1.
**Lifetime:** Sent once per DISCOVERY received.
**Example:** Node B receives DISCOVERY from A. B responds with DISCOVERY_RESPONSE containing B's own identity. A adds B to its neighbor table.

After the DISCOVERY / DISCOVERY_RESPONSE exchange, both nodes have each other in their neighbor tables and the link is bidirectionally established.

---

### 5.3 HEARTBEAT (0x03)

**Purpose:** Periodic liveness signal to maintain neighbor table freshness.

**Fields (payload):**
| Field | Description |
|-------|-------------|
| sessionId | Current session (for restart detection) |
| neighborCount | How many neighbors this node currently has |
| load | Node load indicator (0-255, representing queue depth or resource pressure) |

**Generated by:** Every ACTIVE node, periodically (every HEARTBEAT_INTERVAL_MS).
**Consumed by:** All direct neighbors.
**Forwarding rules:** NEVER forwarded. TTL is always 1.
**Lifetime:** Each heartbeat supersedes the previous one from the same sender.
**Example:** Node A is ACTIVE. Every 5 seconds, A sends HEARTBEAT to all neighbors. If B does not receive A's heartbeat for 15 seconds, B marks A as dead.

---

### 5.4 BROADCAST (0x04)

**Purpose:** Deliver a message to every reachable node in the mesh.

**Fields (payload):**
| Field | Description |
|-------|-------------|
| contentType | 0 = text message, 1 = emergency alert |
| message | UTF-8 encoded message body |

**Generated by:** Any ACTIVE node wishing to send a public message.
**Consumed by:** Every node in the mesh (application layer delivers to user).
**Forwarding rules:** Flooded to ALL neighbors except the one that delivered it. Subject to deduplication and TTL. Relays MUST decrement TTL and increment hopCount.
**Lifetime:** Propagates until TTL exhaustion or until all reachable nodes have seen it.
**Example:** Node E sends an emergency broadcast. The packet floods through the mesh: E→D→A→B→C. Each node displays the message AND relays it (if TTL > 0 and not seen before).

---

### 5.5 ENCRYPTED_MESSAGE (0x05)

**Purpose:** Carry encrypted message content from a Common User to the Admin.

**Fields (payload):**
| Field | Description |
|-------|-------------|
| keyPacketId | UUID of the corresponding KEY_PACKET |
| algorithm | Encryption algorithm identifier (e.g., AES-256-GCM) |
| iv | Initialization vector |
| ciphertext | Encrypted message content |
| authTag | GCM authentication tag |

**Generated by:** A Common User sending a secure message.
**Consumed by:** The Admin node (and only the Admin node).
**Forwarding rules:** Routed unicast toward the Admin. Relayed by intermediate nodes. Requires a known route. If no route exists, triggers route discovery. The SIGNED and ENCRYPTED flags MUST be set.
**Lifetime:** Until delivered to Admin or TTL exhausted.
**Example:** Node A encrypts "mission report" → creates ENCRYPTED_MESSAGE (packet X) and KEY_PACKET (packet Y). X references Y's ID. X is routed to Admin via Path A.

---

### 5.6 KEY_PACKET (0x06)

**Purpose:** Carry the encrypted session key corresponding to an ENCRYPTED_MESSAGE. Travels a DIFFERENT path than the message.

**Fields (payload):**
| Field | Description |
|-------|-------------|
| messagePacketId | UUID of the corresponding ENCRYPTED_MESSAGE |
| algorithm | Key encryption algorithm (e.g., RSA-2048-OAEP) |
| encryptedKey | The AES session key, encrypted with Admin's RSA public key |

**Generated by:** The same node that generated the ENCRYPTED_MESSAGE, at the same time.
**Consumed by:** The Admin node.
**Forwarding rules:** Same as ENCRYPTED_MESSAGE — routed unicast to Admin. BUT the routing layer MUST attempt to send KEY_PACKET on a DIFFERENT path than the ENCRYPTED_MESSAGE.
**Lifetime:** Until delivered to Admin or TTL exhausted.
**Example:** KEY_PACKET Y is routed to Admin via Path B (different from Path A used for ENCRYPTED_MESSAGE X). Only Admin receives both and can decrypt.

---

### 5.7 ACK (0x07)

**Purpose:** Acknowledge receipt of a packet that had the REQUIRES_ACK flag set.

**Fields (payload):**
| Field | Description |
|-------|-------------|
| ackedPacketId | UUID of the packet being acknowledged |
| status | 0 = success, 1 = error |

**Generated by:** The destination node upon receiving a packet with REQUIRES_ACK.
**Consumed by:** The original sender of the acknowledged packet.
**Forwarding rules:** Routed unicast back to the original sender. Uses reverse path if known, otherwise triggers route discovery.
**Lifetime:** Single transmission. No retries for ACKs themselves.
**Example:** Admin receives ENCRYPTED_MESSAGE from Node A. Admin sends ACK back to A (status=0). If A doesn't receive ACK within RETRY_INTERVAL_MS, A retransmits.

---

### 5.8 ROUTE_REQUEST (0x08)

**Purpose:** Discover a path to a destination node by flooding the mesh.

**Fields (payload):**
| Field | Description |
|-------|-------------|
| targetNodeId | The node we are trying to reach |
| requestSequence | Monotonic counter for this discovery attempt |
| hopList | Ordered list of Node IDs this request has traversed |

**Generated by:** A node that needs to send a packet to a destination with no known route.
**Consumed by:** The target node (which replies with ROUTE_REPLY) or any intermediate node with a fresh route to the target.
**Forwarding rules:** Flooded to all neighbors (like BROADCAST) with deduplication. Each relay appends its own Node ID to the hopList before re-flooding.
**Lifetime:** Until target is reached, or TTL exhausts, or timeout (ROUTE_DISCOVERY_TIMEOUT_MS).
**Example:** A needs to reach C but has no route. A floods ROUTE_REQUEST(target=C, hopList=[A]). B receives it, appends itself: hopList=[A,B], re-floods. C receives it: hopList=[A,B,C]. C generates ROUTE_REPLY.

---

### 5.9 ROUTE_REPLY (0x09)

**Purpose:** Respond to a ROUTE_REQUEST with the discovered path.

**Fields (payload):**
| Field | Description |
|-------|-------------|
| targetNodeId | The destination that was sought |
| requestSequence | Matches the ROUTE_REQUEST |
| route | Full ordered path from source to destination |
| routeMetric | Composite quality score for this route |

**Generated by:** The target node (or an intermediate with a cached route).
**Consumed by:** The node that originated the ROUTE_REQUEST.
**Forwarding rules:** Source-routed BACK along the reverse of the hopList. Each intermediate node forwards to the previous node in the path. NOT flooded.
**Lifetime:** Single delivery. The source caches the route upon receipt.
**Example:** C received ROUTE_REQUEST with hopList=[A,B,C]. C creates ROUTE_REPLY(route=[A,B,C], metric=200). ROUTE_REPLY is sent C→B→A (reverse path).

---

### 5.10 ROUTE_ERROR (0x0A)

**Purpose:** Notify upstream nodes that a route has broken.

**Fields (payload):**
| Field | Description |
|-------|-------------|
| unreachableNodeId | The node that can no longer be reached |
| reporterNodeId | The node that detected the failure |
| errorCode | Reason: LINK_BROKEN (1), NODE_UNREACHABLE (2), NODE_SHUTDOWN (3) |

**Generated by:** A node that detects a neighbor has died (heartbeat timeout or send failure).
**Consumed by:** All nodes that had routes through the broken link.
**Forwarding rules:** Propagated upstream — sent to all nodes that had the unreachable node as a next-hop in any route. This is NOT flooded; it is directed to affected nodes.
**Lifetime:** Single propagation wave. Nodes that receive ROUTE_ERROR invalidate affected routes and re-propagate if they have upstream dependents.
**Example:** B detects that C has died. B sends ROUTE_ERROR(unreachable=C, reporter=B, code=LINK_BROKEN) to A. A invalidates its route to C (which used B as next-hop). If A needs to reach C again, it initiates new route discovery.

---

### 5.11 KEY_ANNOUNCE (0x0B)

**Purpose:** Distribute the Admin's RSA public key throughout the mesh.

**Fields (payload):**
| Field | Description |
|-------|-------------|
| adminNodeId | Node ID of the Admin this key belongs to |
| publicKey | DER-encoded RSA-2048 public key |
| keyFingerprint | CRC-32 of the public key bytes (for quick comparison) |

**Generated by:** The Admin node after completing discovery with a new neighbor.
**Consumed by:** All nodes in the mesh (cache the key for future secure messaging).
**Forwarding rules:** Flooded to all neighbors (like BROADCAST). TTL = 20. Subject to deduplication. Nodes that already have a key with matching fingerprint do NOT re-flood.
**Lifetime:** Propagates until all nodes have the key or TTL exhausts.
**Example:** Admin connects to Node B. Admin sends KEY_ANNOUNCE(key=<294 bytes>, fingerprint=0xA1B2C3D4). B stores the key and re-floods to A and D. A and D store and re-flood to their neighbors. Eventually all nodes have the Admin's public key.

---

## 6. Discovery Protocol

### 6.1 Node Discovery

When a node transitions to DISCOVERING state, it initiates the discovery process:

1. Node begins advertising on all available transport adapters (makes itself discoverable).
2. Node begins scanning on all available transport adapters.
3. When a transport-level peer is detected (via Bluetooth scan or Wi-Fi Direct service discovery), a transport connection is established.
4. Once connected at the transport level, the node sends a DISCOVERY packet.
5. The receiving node validates the DISCOVERY packet and replies with DISCOVERY_RESPONSE.
6. Both nodes add each other to their neighbor tables.
7. Discovery is bidirectional: BOTH sides send DISCOVERY independently. The first to arrive triggers a DISCOVERY_RESPONSE; the other DISCOVERY received is treated as confirmation.

### 6.2 Advertisement

A node advertises its presence using transport-layer mechanisms:

- **Bluetooth**: Makes device discoverable with a NINE-specific service UUID.
- **Wi-Fi Direct**: Registers a NINE service using DNS-SD service discovery.

The advertisement contains no protocol-level data. Its only purpose is to make the node visible at the transport layer so other nodes can establish a connection and exchange DISCOVERY packets.

### 6.3 Beaconing

Once in ACTIVE state, a node periodically repeats discovery (beaconing) to detect new neighbors:

- Beacon interval: DISCOVERY_INTERVAL_MS (default 10000ms).
- During beaconing, the node briefly scans for new transport-level peers.
- If a new peer is found, the DISCOVERY handshake is performed.
- Existing neighbors are NOT re-discovered; the heartbeat handles liveness.

Beaconing allows the mesh to grow dynamically as new nodes arrive.

### 6.4 Heartbeat

(See Section 3.6 for full heartbeat specification.)

Heartbeat is the mechanism that maintains an existing neighbor relationship after discovery establishes it. It runs continuously in ACTIVE state.

### 6.5 Timeout

If HEARTBEAT_TIMEOUT_MS elapses without receiving a heartbeat from a neighbor:

1. The neighbor is marked as DEAD.
2. The neighbor is removed from the neighbor table.
3. All routing entries using that neighbor as next-hop are invalidated.
4. A ROUTE_ERROR packet is generated for each invalidated route and sent to affected upstream nodes.
5. If the lost neighbor was the Admin, nodes with cached Admin public key retain it — Admin may rejoin later.

### 6.6 Neighbor Updates

The neighbor table is updated on the following events:

| Event | Action |
|-------|--------|
| DISCOVERY received from new peer | Add to neighbor table |
| DISCOVERY_RESPONSE received | Confirm neighbor entry |
| HEARTBEAT received from known neighbor | Update lastHeartbeat, load, neighborCount |
| HEARTBEAT received with new Session ID | Invalidate all stale routes through this neighbor, update sessionId |
| HEARTBEAT timeout | Remove from neighbor table, generate ROUTE_ERROR |
| Transport-level disconnection | Immediate removal, generate ROUTE_ERROR |

### 6.7 Admin Public Key Distribution (KEY_ANNOUNCE)

The Admin's RSA public key is distributed using a dedicated **KEY_ANNOUNCE**
packet (type 0x0B) rather than being embedded in DISCOVERY payloads.

**Procedure:**

1. Admin completes DISCOVERY handshake with a neighbor.
2. Immediately after, Admin sends KEY_ANNOUNCE to that neighbor.
3. KEY_ANNOUNCE contains: Admin's Node ID, RSA public key (DER-encoded), and a CRC-32 fingerprint of the key.
4. The receiving node validates the key, stores it locally, and propagates KEY_ANNOUNCE to ITS neighbors (controlled flood with TTL).
5. Nodes that already have the Admin's key (matching fingerprint) do NOT re-flood.

**Rationale for dedicated packet:**
- Keeps DISCOVERY payloads small and fast (important for initial connection).
- Makes key distribution explicit and auditable.
- Allows re-announcement if Admin rotates keys in the future.
- Nodes can request the key by sending a ROUTE_REQUEST to the Admin, which triggers KEY_ANNOUNCE in response.

**Forwarding rules for KEY_ANNOUNCE:**
- Flooded like BROADCAST (all neighbors, TTL-limited, dedup).
- Default TTL: 20 (must reach entire mesh).
- Subject to deduplication (same packetId = same announcement).

**OPEN QUESTION (RESOLVED):** Q1 from Section 15 is now resolved — KEY_ANNOUNCE is the chosen mechanism.

---

## 7. Routing Protocol

### 7.1 Route Discovery

Route discovery is **reactive** (on-demand). Routes are NOT proactively maintained. A route is discovered only when a packet needs to be sent to a destination with no known path.

**Procedure:**

1. Source has a packet for destination D but no route.
2. Source buffers the packet in a pending queue.
3. Source constructs ROUTE_REQUEST(target=D, sequence=N, hopList=[self]).
4. Source floods ROUTE_REQUEST to all neighbors.
5. Source starts a timer: ROUTE_DISCOVERY_TIMEOUT_MS (default 10000ms).
6. Each intermediate node that receives the ROUTE_REQUEST:
   a. Checks dedup buffer. If seen → drop.
   b. If this node IS D → generate ROUTE_REPLY (step 7).
   c. If this node has a fresh cached route to D → generate ROUTE_REPLY with appended path.
   d. Otherwise → append own ID to hopList, decrement TTL, re-flood.
7. D (or intermediate with route) constructs ROUTE_REPLY:
   - route = reverse of hopList (gives path from source to D)
   - metric = hopCount * 100 (simple metric for v1)
8. ROUTE_REPLY is source-routed back along the reverse path.
9. Source receives ROUTE_REPLY, caches route, dequeues pending packets, sends them.

If the timer expires without a ROUTE_REPLY:
- Source retries (up to MAX_ROUTE_DISCOVERY_RETRIES, default 3).
- After all retries fail, pending packets for that destination are dropped and an error is reported to the application layer.

### 7.2 Route Maintenance

Routes are ephemeral. They expire after ROUTE_EXPIRY_MS (default 30 seconds).

Maintenance rules:
1. A route is refreshed (expiry extended) every time it is successfully used to forward a packet AND the relay receives confirmation that the next-hop accepted the packet (transport-level success).
2. If a send to the next-hop fails at the transport level, the route is immediately invalidated.
3. If a ROUTE_ERROR is received reporting a link break, all routes through the broken link are invalidated.
4. The routing table is periodically scanned for expired entries (every ROUTE_EXPIRY_MS / 2).

### 7.3 Relay Selection

When a node needs to forward a packet to a destination:

1. Check if destination is a direct neighbor → send directly.
2. Look up routing table for destination → send to next-hop.
3. If no route exists → buffer packet, initiate route discovery.

When multiple routes to the same destination exist (from multiple ROUTE_REPLY responses):
- Select the route with the lowest routeMetric.
- If metrics are equal, select the most recently discovered route.

### 7.4 TTL Decrement

- Every node that relays a packet MUST decrement TTL by exactly 1.
- A packet with TTL = 0 MUST be dropped.
- A packet with TTL = 1 will be forwarded to the next hop but cannot travel beyond it (the next hop will receive it with TTL = 0 after decrement, meaning the next hop processes it but doesn't relay further — actually: the RELAY decrements BEFORE sending, so it arrives with TTL=0 at next hop which means next hop can process if it's the destination but cannot forward further).

**Clarification:** The TTL decrement happens at the RELAYING node BEFORE forwarding. The packet is transmitted with the decremented value. The receiving node sees the already-decremented TTL.

### 7.5 Duplicate Suppression

Every node maintains a **Deduplication Buffer** — a bounded set of recently seen packet IDs.

- When a packet arrives, its packetId is checked against the buffer.
- If present → drop silently (duplicate).
- If not present → process the packet and add the packetId to the buffer.
- Buffer entries expire after DEDUP_EXPIRY_MS (default 60 seconds).
- Buffer maximum size: DEDUP_BUFFER_SIZE (default 1024 entries). When full, oldest entries are evicted.

This prevents broadcast storms and routing loops.

### 7.6 Loop Prevention

Three mechanisms prevent routing loops:

1. **TTL**: Guarantees eventual packet death regardless of topology.
2. **Deduplication**: A packet traversing a loop will be seen again by a node that already forwarded it → dropped.
3. **Source routing for unicast**: The full path is in the packet. If the same node appears twice in the path, the packet is malformed and MUST be dropped.

### 7.7 Store-and-Forward Behavior

When a packet cannot be immediately forwarded (no route, neighbor temporarily unavailable):

1. The packet is placed in a **Pending Queue** (max size: MAX_PENDING_QUEUE_SIZE, default 64).
2. A timer is set: PENDING_PACKET_TIMEOUT_MS (default 30000ms).
3. If a route becomes available before timeout → dequeue and send.
4. If timeout expires → drop the packet and report failure to the application layer (if the sender is local).

This provides limited DTN (Delay-Tolerant Networking) behavior. True store-carry-forward (physical mobility of relay devices) is not explicitly supported in v1 but naturally emerges if a node carries buffered packets to a new location and discovers new peers.

---

## 8. Broadcast Protocol

### 8.1 Complete Message Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        BROADCAST PROPAGATION                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Sender              Relay B            Relay C           Destination D  │
│    │                    │                  │                    │        │
│    │── BROADCAST ──────►│                  │                    │        │
│    │   (TTL=10,hop=0)   │                  │                    │        │
│    │                    │                  │                    │        │
│    │                    │ [deliver to app] │                    │        │
│    │                    │ [check dedup: new]                    │        │
│    │                    │ [TTL=9, hop=1]   │                    │        │
│    │                    │── BROADCAST ────►│                    │        │
│    │                    │                  │                    │        │
│    │                    │                  │ [deliver to app]   │        │
│    │                    │                  │ [check dedup: new] │        │
│    │                    │                  │ [TTL=8, hop=2]     │        │
│    │                    │                  │── BROADCAST ──────►│        │
│    │                    │                  │                    │        │
│    │                    │                  │              [deliver to app]│
│    │                    │                  │              [check dedup]   │
│    │                    │                  │              [TTL=7: could   │
│    │                    │                  │               relay further] │
│    │                    │                  │                    │        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Broadcast Algorithm (at each node)

```
ON RECEIVE(packet) WHERE packet.type == BROADCAST:

  1. IF dedup.hasSeen(packet.packetId) → DROP, RETURN
  2. dedup.markSeen(packet.packetId)
  3. DELIVER packet.payload to application layer
  4. IF packet.ttl <= 1 → RETURN (cannot relay further)
  5. packet.ttl = packet.ttl - 1
  6. packet.hopCount = packet.hopCount + 1
  7. Recompute checksum
  8. FOR EACH neighbor N (excluding the peer that delivered this packet):
       transport.send(N, packet)
```

### 8.3 Broadcast Properties

- **Delivery guarantee**: Best-effort. Nodes that are unreachable (no path) will not receive the broadcast.
- **Ordering**: Not guaranteed. A later broadcast may arrive before an earlier one if paths differ in length.
- **Duplicate delivery**: Impossible at a single node (dedup prevents it). But different relay paths may cause a node to ATTEMPT delivery — the dedup buffer catches it.
- **Emergency priority**: If contentType = EMERGENCY_ALERT, the packet has the PRIORITY flag set and jumps send queues at relay nodes.

---

## 9. Secure Communication Protocol

### 9.1 Complete Message Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SECURE MESSAGE (DUAL-PATH)                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Sender A          Relay B         Relay C          Relay D       Admin │
│    │                  │               │                │            │   │
│    │ [generate AES session key]       │                │            │   │
│    │ [encrypt message with AES]       │                │            │   │
│    │ [encrypt AES key with RSA]       │                │            │   │
│    │                  │               │                │            │   │
│    │── ENCRYPTED_MSG ►│               │                │            │   │
│    │   (via Path 1)   │───────────────────────────────────────────►│   │
│    │                  │               │                │            │   │
│    │── KEY_PACKET ────────────────────►               │            │   │
│    │   (via Path 2)   │               │───────────────────────────►│   │
│    │                  │               │                │            │   │
│    │                  │               │                │   [receive │   │
│    │                  │               │                │    both]   │   │
│    │                  │               │                │   [match   │   │
│    │                  │               │                │    by ID]  │   │
│    │                  │               │                │   [decrypt │   │
│    │                  │               │                │    key]    │   │
│    │                  │               │                │   [decrypt │   │
│    │                  │               │                │    msg]    │   │
│    │                  │               │                │            │   │
│    │◄──────────────── ACK (for ENCRYPTED_MSG) ────────────────────│   │
│    │◄──────────────── ACK (for KEY_PACKET) ───────────────────────│   │
│    │                  │               │                │            │   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Sender Procedure

1. Retrieve Admin's RSA public key (from local cache, obtained during discovery).
2. Generate a random AES-256 session key (32 bytes, cryptographically secure).
3. Generate a random IV (12 bytes for GCM mode).
4. Encrypt the plaintext message: `ciphertext, tag = AES-256-GCM(sessionKey, iv, plaintext)`.
5. Encrypt the session key: `encKey = RSA-2048-OAEP(adminPublicKey, sessionKey)`.
6. Securely erase the session key from memory.
7. Generate packetId for ENCRYPTED_MESSAGE (call it M).
8. Generate packetId for KEY_PACKET (call it K).
9. Construct ENCRYPTED_MESSAGE packet: destination=Admin, keyPacketId=K, ciphertext, iv, tag.
10. Construct KEY_PACKET packet: destination=Admin, messagePacketId=M, encKey.
11. Request routing layer for two independent paths to Admin.
12. Send ENCRYPTED_MESSAGE on Path 1.
13. Send KEY_PACKET on Path 2.
14. If only one path exists, send both on the same path (degraded mode — log warning).

### 9.3 Dual-Path Transmission

The routing layer is asked for two **node-disjoint paths** — paths that share no intermediate nodes.

Algorithm:
1. Discover Path 1 (standard route discovery).
2. Discover Path 2 (exclude all intermediate nodes from Path 1).
3. If Path 2 discovery fails → fall back to edge-disjoint (share nodes but not links).
4. If that also fails → use the same path for both (degraded security, warning emitted).
5. Assignment of which packet goes on which path is randomized (50/50) to prevent prediction.

### 9.4 Admin Reception and Reassembly

1. Admin receives ENCRYPTED_MESSAGE. Buffers it, keyed by keyPacketId.
2. Admin receives KEY_PACKET. Checks if the corresponding ENCRYPTED_MESSAGE (by messagePacketId) is already buffered.
3. If both are present:
   a. Decrypt session key: `sessionKey = RSA-2048-OAEP-Decrypt(adminPrivateKey, encKey)`.
   b. Decrypt message: `plaintext = AES-256-GCM-Decrypt(sessionKey, iv, ciphertext, tag)`.
   c. If GCM tag verification fails → reject message, report integrity error.
   d. Securely erase session key from memory.
   e. Deliver plaintext to application layer.
4. If only one half arrives, buffer it for PENDING_PACKET_TIMEOUT_MS. If the other half never arrives → discard and report timeout.

### 9.5 Why Relay Nodes Cannot Read the Message

- Relay on Path 1 sees ENCRYPTED_MESSAGE: has ciphertext but no key.
- Relay on Path 2 sees KEY_PACKET: has RSA-encrypted key but no ciphertext.
- Even if a relay on Path 2 captures the encrypted key, it cannot decrypt it because only Admin has the RSA private key.
- Even if a relay intercepts BOTH packets (possible in degraded single-path mode), it still cannot decrypt the session key without Admin's RSA private key.

Dual-path provides defense-in-depth on top of RSA encryption.

---

## 10. Security Model

### 10.1 AES-256 (Symmetric Encryption)

- **Purpose**: Encrypt message content.
- **Mode**: GCM (Galois/Counter Mode) — provides authenticated encryption.
- **Key size**: 256 bits (32 bytes).
- **IV size**: 96 bits (12 bytes) for GCM.
- **Tag size**: 128 bits (16 bytes).
- **Usage**: One fresh key per message. Never reused.
- **Fallback**: AES-256-CBC with HMAC-SHA-256 (if GCM is unavailable on a platform).

### 10.2 RSA-2048 (Asymmetric Encryption)

- **Purpose**: Encrypt AES session keys so only Admin can read them.
- **Padding**: OAEP with SHA-256.
- **Key size**: 2048 bits.
- **Max plaintext per operation**: ~190 bytes (sufficient for a 32-byte AES key).
- **Key generation**: Once at Admin initialization (~100-500ms).
- **Public key distribution**: Via DISCOVERY packets.
- **Private key storage**: Only on Admin device, encrypted at rest.

### 10.3 SHA-256 (Hashing)

- **Purpose**: Integrity verification, key derivation, HMAC.
- **Output**: 256 bits (32 bytes).
- **Used for**: HMAC in CBC fallback mode, general integrity checks.
- **NOT used for**: The packet checksum (that uses CRC-32 for speed).

### 10.4 Key Generation

| Key Type | When Generated | Lifetime |
|----------|---------------|----------|
| Admin RSA key pair | Admin initialization | Permanent until manual rotation |
| AES session key | Each secure message | Single use, erased after encryption |
| Node Session ID | Each startup | Current session only |

All key generation MUST use cryptographically secure random number generation (e.g., `crypto.randomBytes` in Node.js, `SecureRandom` in Java).

### 10.5 Session Keys

A session key is a one-time AES-256 key generated for a single secure message:

1. Generated immediately before encryption.
2. Used to encrypt exactly one message.
3. Encrypted with Admin's RSA public key.
4. Original key erased from sender's memory immediately after encryption.
5. On Admin's side, erased from memory immediately after decryption.

This provides **per-message forward secrecy**: compromise of one session key reveals only one message.

### 10.6 Integrity Verification

Integrity is verified at multiple levels:

| Level | Mechanism | Protects Against |
|-------|-----------|-----------------|
| Transport | CRC-32 (packet checksum) | Accidental bit corruption |
| Message | AES-GCM authentication tag | Intentional content tampering |
| Sender | Ed25519 signature (optional) | Impersonation, packet forgery |

### 10.7 Replay Protection

Three mechanisms prevent replay attacks:

1. **Deduplication buffer**: A replayed packet has the same packetId → dropped.
2. **Timestamp validation**: Packets older than MAX_PACKET_AGE_MS (default 60s) are rejected.
3. **Sequence numbers**: A packet with sequence ≤ last received from that sender is suspicious (though clock drift may cause legitimate out-of-order delivery — sequence numbers are advisory in v1).

**OPEN QUESTION**: Should sequence number enforcement be strict (drop if ≤ last seen) or advisory (log warning but deliver)? See Section 15.

---

## 11. State Machines

### 11.1 Discovery State Machine

```
                 ┌──────────┐
          ┌─────►│  IDLE    │◄────────────────────┐
          │      └────┬─────┘                     │
          │           │ startDiscovery()           │ timeout / stopDiscovery()
          │           ▼                            │
          │      ┌──────────────┐                 │
          │      │  SCANNING    │─────────────────┘
          │      └────┬─────────┘
          │           │ peer found
          │           ▼
          │      ┌──────────────┐
          │      │ HANDSHAKING  │───── handshake failed ──►┐
          │      └────┬─────────┘                          │
          │           │ DISCOVERY_RESPONSE received         │
          │           ▼                                    │
          │      ┌──────────────┐                          │
          └──────│  COMPLETED   │◄─────────────────────────┘
                 └──────────────┘         (return to SCANNING for more)
```

States:
- **IDLE**: Not discovering.
- **SCANNING**: Transport-level scan active, looking for new peers.
- **HANDSHAKING**: Transport connection established, DISCOVERY sent, awaiting response.
- **COMPLETED**: Neighbor added. Machine returns to SCANNING (to find more neighbors) or IDLE (if discovery stopped).

### 11.2 Connection State Machine (per neighbor)

```
┌───────────────┐
│ DISCONNECTED  │
└──────┬────────┘
       │ transport.connect()
       ▼
┌───────────────┐
│  CONNECTING   │──── timeout ──► DISCONNECTED
└──────┬────────┘
       │ connection established
       ▼
┌───────────────┐
│  CONNECTED    │──── heartbeat timeout ──► DISCONNECTING
└──────┬────────┘                    ▲
       │ send failure / disconnect   │ reconnect success
       ▼                             │
┌───────────────┐                    │
│ RECONNECTING  │────────────────────┘
└──────┬────────┘
       │ max retries exceeded
       ▼
┌───────────────┐
│ DISCONNECTED  │
└───────────────┘
```

A connection MUST be in CONNECTED state for data to be sent. Packets queued during RECONNECTING are held in the send buffer.

### 11.3 Routing State Machine (per destination)

```
┌───────────────┐
│   UNKNOWN     │  (no route exists)
└──────┬────────┘
       │ packet needs to reach this destination
       ▼
┌───────────────┐
│  DISCOVERING  │──── timeout (all retries) ──► UNREACHABLE
└──────┬────────┘
       │ ROUTE_REPLY received
       ▼
┌───────────────┐
│    KNOWN      │──── route expired ──► UNKNOWN
└──────┬────────┘          ▲
       │ ROUTE_ERROR        │ new ROUTE_REPLY
       ▼                    │
┌───────────────┐           │
│   BROKEN      │───────────┘
└──────┬────────┘
       │ no new route found
       ▼
┌───────────────┐
│ UNREACHABLE   │──── new discovery attempt ──► DISCOVERING
└───────────────┘
```

### 11.4 Encryption State Machine (per secure message)

```
┌─────────────────┐
│  PLAINTEXT      │  (message created by application)
└──────┬──────────┘
       │ encrypt()
       ▼
┌─────────────────┐
│  ENCRYPTED      │  (ciphertext + encrypted key ready)
└──────┬──────────┘
       │ hand to routing
       ▼
┌─────────────────┐
│  IN_TRANSIT     │  (both packets sent, awaiting ACK)
└──────┬──────────┘
       │ ACK received for both
       ▼
┌─────────────────┐
│  DELIVERED      │
└─────────────────┘

       │ (if timeout without ACK)
       ▼
┌─────────────────┐
│  FAILED         │
└─────────────────┘
```

On the Admin (receiver) side:

```
┌─────────────────┐
│  AWAITING       │  (nothing received yet)
└──────┬──────────┘
       │ ENCRYPTED_MESSAGE or KEY_PACKET arrives
       ▼
┌─────────────────┐
│  PARTIAL        │  (one half received, waiting for other)
└──────┬──────────┘
       │ other half arrives
       ▼
┌─────────────────┐
│  REASSEMBLED    │  (both halves present)
└──────┬──────────┘
       │ decrypt()
       ▼
┌─────────────────┐          ┌─────────────────┐
│  DECRYPTED      │          │  INTEGRITY_FAIL │
└─────────────────┘          └─────────────────┘
```

---

## 12. Failure Handling

### 12.1 Node Failure

**Detection:** Heartbeat timeout (HEARTBEAT_TIMEOUT_MS elapsed without heartbeat from neighbor).

**Response:**
1. Remove the failed node from the neighbor table.
2. Invalidate all routes using the failed node as next-hop.
3. Generate ROUTE_ERROR(unreachableNodeId=failed, reporterId=self, errorCode=LINK_BROKEN).
4. Send ROUTE_ERROR to all upstream nodes (nodes that had routes through the failed node).
5. Any packets in the pending queue destined for the failed node → drop after PENDING_PACKET_TIMEOUT_MS.

**Recovery:**
- If the failed node comes back, it will re-enter discovery. Its new Session ID will differ from the cached one, so all stale state is automatically invalidated.

### 12.2 Relay Failure

**Scenario:** Node B is relaying packets between A and C. B fails.

**Detection:** A detects B's absence via heartbeat timeout.

**Response:**
1. A invalidates routes to C (and any other destination through B).
2. A generates ROUTE_ERROR for C.
3. A buffers any pending packets for C.
4. A initiates new route discovery for C.
5. If an alternate path exists (e.g., A→D→C), the new route is used.
6. If no alternate path exists, packets remain buffered until PENDING_PACKET_TIMEOUT_MS.

### 12.3 Packet Loss

**Scenario:** A packet is lost in transit (radio interference, buffer overflow at transport layer).

**Detection:** 
- For packets with REQUIRES_ACK: No ACK received within RETRY_INTERVAL_MS.
- For packets without REQUIRES_ACK: No detection at the protocol level (best-effort).

**Response (when ACK-based):**
1. Sender retransmits after RETRY_INTERVAL_MS.
2. Up to MAX_RETRIES attempts.
3. After all retries exhausted → report delivery failure to application layer.

**Response (for broadcasts):**
- No retransmission. If a broadcast packet is lost on one link, it may still reach the destination via other paths (flooding provides redundancy).

### 12.4 Duplicate Packets

**Scenario:** Flooding creates multiple copies of the same packet arriving at a node.

**Detection:** Deduplication buffer check — same packetId already seen.

**Response:** Drop silently. No error, no log at INFO level (this is expected behavior in a flood-based protocol).

### 12.5 TTL Expiration

**Scenario:** A packet has been relayed through the maximum number of hops without reaching its destination.

**Detection:** TTL = 0 at a relaying node.

**Response:** Drop the packet. No ROUTE_ERROR generated (TTL expiration is silent). The sender will detect failure via ACK timeout (if REQUIRES_ACK) or not at all (for broadcasts).

### 12.6 Transport-Level Failure

**Scenario:** The underlying Bluetooth or Wi-Fi Direct connection drops unexpectedly.

**Response:**
1. Transport adapter emits a CONNECTION_LOST event.
2. The connection state machine transitions to RECONNECTING.
3. Reconnection is attempted up to SEND_RETRY_COUNT times.
4. If reconnection fails → transition to DISCONNECTED → trigger heartbeat timeout logic → neighbor removal.
5. All packets in the send queue for that peer → held during RECONNECTING, dropped if DISCONNECTED.

---

## 13. Protocol Rules

The following rules are MANDATORY for any conforming implementation:

### Packet Rules

1. A packet MUST NOT exceed 4096 bytes total (header + payload + signature).
2. A packet MUST contain all required header fields as defined in Section 4.2.
3. A packet with an invalid checksum MUST be dropped.
4. A packet with a version number different from the local node's version MUST be dropped.
5. A packet with an unknown packetType MUST be dropped.
6. A packet with TTL = 0 MUST NOT be forwarded (it may be delivered if this node is the destination).
7. A packet's senderId MUST NOT be modified by any relay node.
8. Sequence numbers MUST be monotonically increasing per sender.

### Forwarding Rules

9. A relay node MUST decrement TTL by exactly 1 before forwarding.
10. A relay node MUST increment hopCount by exactly 1 before forwarding.
11. A relay node MUST check the deduplication buffer before processing.
12. A relay node MUST NOT forward a packet it has already seen (by packetId).
13. DISCOVERY, DISCOVERY_RESPONSE, and HEARTBEAT packets MUST NOT be forwarded under any circumstances.
14. BROADCAST packets MUST be forwarded to all neighbors except the delivering peer.
15. ROUTE_REQUEST packets MUST be forwarded to all neighbors except the delivering peer (flood behavior).
16. ROUTE_REPLY packets MUST be forwarded only to the next node in the reverse path.
17. ROUTE_ERROR packets MUST be forwarded only to affected upstream nodes.

### Timing Rules

18. Heartbeats MUST be sent at intervals no greater than HEARTBEAT_INTERVAL_MS.
19. A neighbor MUST be declared dead after HEARTBEAT_TIMEOUT_MS without a heartbeat.
20. Route discovery MUST timeout after ROUTE_DISCOVERY_TIMEOUT_MS.
21. Pending packets MUST be dropped after PENDING_PACKET_TIMEOUT_MS.
22. Dedup buffer entries MUST be evicted after DEDUP_EXPIRY_MS.
23. Routing entries MUST be invalidated after ROUTE_EXPIRY_MS.

### Security Rules

24. Session keys MUST be generated using cryptographically secure random.
25. Session keys MUST be used exactly once and then erased.
26. Admin's RSA private key MUST never be transmitted over the network.
27. ENCRYPTED_MESSAGE and KEY_PACKET MUST have the SIGNED flag set.
28. A node MUST NOT decrypt ENCRYPTED_MESSAGE unless it is the Admin.
29. Hash comparisons MUST use constant-time algorithms.
30. Key material MUST be zeroed from memory after use.

### Discovery Rules

31. A node MUST send DISCOVERY when it first detects a new transport-level peer.
32. A node MUST respond with DISCOVERY_RESPONSE when it receives a valid DISCOVERY.
33. A node MUST update its neighbor table upon successful discovery handshake.
34. Admin MUST include its RSA public key in DISCOVERY and DISCOVERY_RESPONSE packets.

### Routing Rules

35. A node MUST initiate route discovery when it has a packet for a destination with no known route.
36. A node MUST buffer packets during route discovery (up to MAX_PENDING_QUEUE_SIZE).
37. A node MUST generate ROUTE_ERROR when it detects a link break.
38. A node MUST invalidate routes when it receives a ROUTE_ERROR.
39. ROUTE_REQUEST hopList MUST NOT exceed MAX_HOP_LIST_SIZE.
40. A node MUST NOT appear more than once in a ROUTE_REQUEST hopList (loop detected → drop).

---

## 14. Future Extensions

The following capabilities are explicitly out of scope for v1 but the architecture is designed to accommodate them in future versions:

### 14.1 Voice Communication

- Would require a new packet type: VOICE_FRAME.
- Requires real-time streaming with small packets (~20ms frames).
- Would use UDP-like best-effort at the protocol level (no ACKs for voice frames).
- Codec: Opus (low bitrate, designed for lossy networks).
- Jitter buffer at the receiver.
- Challenge: Bluetooth Classic bandwidth may be insufficient for real-time audio.

### 14.2 Image/File Transfer

- Would require application-layer fragmentation (split file into ≤4KB chunks).
- New packet types: FILE_FRAGMENT, FILE_METADATA.
- Reassembly at destination with missing-chunk retransmission.
- Flow control needed for large transfers to avoid flooding the mesh.

### 14.3 LoRa Transport

- Extremely low bandwidth (~300 bps to 50 kbps).
- Very long range (1-15 km line of sight).
- Would require aggressive payload compression.
- New transport adapter implementing ITransport.
- Protocol remains unchanged — transport is abstracted.

### 14.4 Satellite Transport

- High latency (250-600ms RTT for LEO).
- Potentially high bandwidth.
- Would function as a "long-range relay hop."
- Interesting for connecting mesh islands (e.g., building A mesh to building B mesh).

### 14.5 Additional Transport Mediums

The protocol is designed so that ANY transport that can send/receive byte buffers between identified peers can be integrated:

- ZigBee (IEEE 802.15.4)
- NFC (Near-Field Communication) — for initial key exchange or pairing
- Infrared
- Sound (ultrasonic data transmission)
- Mesh over existing LAN (for testing without Bluetooth/WiFi Direct)

Each new transport implements the transport adapter interface. Zero protocol changes required.

### 14.6 Post-Quantum Cryptography

- Replace RSA-2048 with ML-KEM (Kyber) for key encapsulation.
- Replace Ed25519 with ML-DSA (Dilithium) for signatures.
- Larger key sizes will affect packet payload constraints.
- Cipher suite negotiation would need to be added to DISCOVERY.

### 14.7 Multi-Admin Support

- Multiple Admin nodes with load balancing.
- Secure message sent to nearest Admin.
- Requires Admin coordination protocol (out of scope for v1).

### 14.8 Group Messaging

- Named groups with membership.
- Multicast routing (more efficient than broadcast for targeted groups).
- Group key management.

---

## 15. Open Questions

The following areas require design decisions before the protocol can be considered fully specified. These are flagged for review and discussion:

### Q1: Admin Public Key Propagation — RESOLVED

**Decision:** Dedicated KEY_ANNOUNCE packet (type 0x0B) is used. See Section 5.11 and Section 6.7. Admin public key is NOT embedded in DISCOVERY payloads.

### Q2: Sequence Number Enforcement

**Problem:** Should out-of-order or duplicate sequence numbers be strictly dropped or just logged?

**Options:**
- A) Strict: Drop packets with seq ≤ last seen from that sender.
- B) Advisory: Log but deliver (rely on dedup buffer for true duplicates).
- C) Window-based: Accept if within a sliding window (±W) of expected.

**Trade-offs:** Option A prevents replay but may drop legitimate packets delayed in the mesh. Option B is permissive but weakens replay protection. Option C is a reasonable middle ground.

### Q3: Route Metric Computation

**Problem:** The spec defines `routeMetric` but does not fully specify how it is computed at intermediate nodes.

**Decision needed:** Should metric include only hop count? Or should it factor in link quality reported by heartbeats? If link quality is included, how is it aggregated across a multi-hop path?

### Q4: Maximum Mesh Size

**Problem:** What is the practical upper limit for the number of nodes?

**Decision needed:** Should the protocol impose a hard limit (e.g., 32 nodes) or leave it unbounded? Dedup buffer size and flooding overhead scale with node count. For the demo (5-8 nodes) this is irrelevant, but for the paper we should specify design limits.

### Q5: Packet ID Generation

**Problem:** UUID v4 is 16 bytes per packet — significant overhead on small packets like HEARTBEAT.

**Options:**
- A) Always use UUID v4 (current design, simple, collision-proof).
- B) Use shorter IDs (8 bytes) for non-flooded packets (HEARTBEAT, ACK).
- C) Use a compound ID: (senderId + sequenceNumber) for dedup instead of a separate packetId.

**Trade-offs:** Option C eliminates 16 bytes from the header but makes dedup dependent on sequence number integrity.

### Q6: Graceful Shutdown Propagation

**Problem:** When a node shuts down gracefully, should it send ROUTE_ERROR to all neighbors, or a dedicated GOODBYE packet?

**Options:**
- A) ROUTE_ERROR with errorCode=NODE_SHUTDOWN (current design).
- B) New GOODBYE packet type (explicit, cleaner semantics).

**Trade-offs:** Option A avoids a new packet type. Option B is semantically clearer and could carry a reason string.

### Q7: Clock Synchronization

**Problem:** Timestamp-based replay protection assumes clocks are roughly synchronized. In an offline mesh with no NTP, clocks will drift.

**Decision needed:** How much drift is acceptable? Current tolerance is 60 seconds. Should nodes exchange timestamps during discovery to estimate offset?

### Q8: Transport Failover Behavior

**Problem:** If a node is reachable via both Wi-Fi Direct and Bluetooth, and Wi-Fi Direct drops, how quickly should the protocol failover?

**Decision needed:** Immediate (first send failure triggers switch)? Or delayed (wait for reconnection attempt)?

### Q9: Broadcast Storm Mitigation

**Problem:** In dense meshes, a broadcast creates O(N) transmissions per node. With 20 nodes fully connected, a single broadcast generates potentially hundreds of redundant transmissions.

**Options:**
- A) Rely solely on TTL and dedup (current design — acceptable for 5-8 nodes).
- B) Probabilistic rebroadcast (each node forwards with probability P < 1).
- C) Counter-based scheme (only rebroadcast if heard fewer than K copies).

**Decision needed for scalability beyond demo scope.**

### Q10: Dual-Path Verification — RESOLVED

**Decision:** The Routing Engine maintains multiple candidate routes per
destination and computes node-disjoint pairs (`getDisjointRoutes`). The
DualPathManager reports whether a genuine node-disjoint pair was used
(`dualPathUsed`) versus single-path fallback (`singlePathFallback`). The sender
is notified via the send result and metrics. Route discovery replies to each
distinct-path RREQ so multiple disjoint routes are learned in one flood. If no
disjoint pair exists, the system falls back to the minimum-overlap pair and
records the overlap score.

---

*End of NINE Protocol Specification RFC v1.0*

---

## 16. Appendix A: Packet Lifecycle State Diagram

Every packet in NINE passes through a defined lifecycle from creation to final disposition:

```
                    ┌──────────────────┐
                    │    CREATED       │  (sender builds packet)
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │   SERIALIZED     │  (converted to bytes, checksum computed)
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │    QUEUED        │  (in transport send queue)
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  TRANSMITTED     │  (bytes sent to transport)
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │    LOST    │  │  RECEIVED  │  │  CORRUPTED │
     └────────────┘  └─────┬──────┘  └────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │   VALIDATED      │  (checksum OK, version OK)
                    └────────┬─────────┘
                             │
                    ┌────────┼────────────────┐
                    │        │                │
                    ▼        ▼                ▼
          ┌──────────┐ ┌──────────┐   ┌──────────────┐
          │ DUPLICATE│ │DELIVERED │   │   RELAYED    │
          │ (dropped)│ │(to app)  │   │  (forwarded) │
          └──────────┘ └──────────┘   └──────┬───────┘
                                             │
                                             ▼
                                      (re-enters QUEUED
                                       at relay node)
```

**Terminal states:** LOST, CORRUPTED, DUPLICATE, DELIVERED.
**Recursive state:** RELAYED → QUEUED (at the next node).

**State descriptions:**

| State | Location | Trigger |
|-------|----------|---------|
| CREATED | Sender memory | Application API call |
| SERIALIZED | Sender memory | Protocol engine serialization |
| QUEUED | Sender transport queue | Handed to transport manager |
| TRANSMITTED | On the wire | Transport adapter send() |
| LOST | Nowhere | Radio interference, out-of-range |
| RECEIVED | Receiver memory | Transport adapter data event |
| CORRUPTED | Receiver (discarded) | Checksum mismatch |
| VALIDATED | Receiver memory | Passes all validation checks |
| DUPLICATE | Receiver (discarded) | Dedup buffer hit |
| DELIVERED | Receiver application | Destination matches self |
| RELAYED | Receiver → sender | Destination doesn't match, TTL > 0 |

---


## 17. Appendix B: Worked Examples for All Packet Types

Each example shows the logical fields of a concrete packet instance.
Binary encoding details are in NINE-PacketEncoding-v1.0.md.

### B.1 DISCOVERY Example

**Scenario:** Node "Alpha" (User) powers on and announces itself.

```
HEADER:
  version:         1
  packetType:      0x01 (DISCOVERY)
  flags:           0x00 (none)
  packetId:        a3f1c2d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d
  senderId:        11111111-aaaa-4bbb-8ccc-dddddddddddd  (Alpha's Node ID)
  destinationId:   00000000-0000-0000-0000-000000000000  (broadcast)
  sequenceNumber:  1
  timestamp:       1752537600000  (2026-07-15T00:00:00Z)
  ttl:             1
  hopCount:        0
  payloadLength:   17
  checksum:        0x7A3B1C4D

PAYLOAD:
  sessionId:       0xABCDEF0123456789
  role:            0 (User)
  capabilities:    0x000B (WiFi + BT + willing to relay)
  nameLength:      5
  displayName:     "Alpha"
```

---

### B.2 DISCOVERY_RESPONSE Example

**Scenario:** Node "Bravo" (Admin) responds to Alpha's discovery.

```
HEADER:
  version:         1
  packetType:      0x02 (DISCOVERY_RESPONSE)
  flags:           0x00
  packetId:        b4e2d3c5-6f7a-4b9c-0d1e-2f3a4b5c6d7e
  senderId:        22222222-bbbb-4ccc-8ddd-eeeeeeeeeeee  (Bravo's Node ID)
  destinationId:   11111111-aaaa-4bbb-8ccc-dddddddddddd  (Alpha)
  sequenceNumber:  1
  timestamp:       1752537600500
  ttl:             1
  hopCount:        0
  payloadLength:   18
  checksum:        0x5E2A9F01

PAYLOAD:
  sessionId:       0x9876543210FEDCBA
  role:            1 (Admin)
  capabilities:    0x001B (WiFi + BT + relay + has Admin key)
  nameLength:      5
  displayName:     "Bravo"
```

---

### B.3 HEARTBEAT Example

**Scenario:** Alpha sends periodic heartbeat with 3 neighbors, moderate load.

```
HEADER:
  version:         1
  packetType:      0x03 (HEARTBEAT)
  flags:           0x00
  packetId:        c5f3e4d6-7a8b-4c0d-1e2f-3a4b5c6d7e8f
  senderId:        11111111-aaaa-4bbb-8ccc-dddddddddddd
  destinationId:   00000000-0000-0000-0000-000000000000  (all neighbors)
  sequenceNumber:  47
  timestamp:       1752537625000  (25 seconds after startup)
  ttl:             1
  hopCount:        0
  payloadLength:   10
  checksum:        0x3C1D4E5F

PAYLOAD:
  sessionId:       0xABCDEF0123456789
  neighborCount:   3
  load:            64  (25% capacity: 64/255)
```

---

### B.4 BROADCAST Example

**Scenario:** Node "Echo" sends an emergency evacuation alert.

```
HEADER:
  version:         1
  packetType:      0x04 (BROADCAST)
  flags:           0x01 (PRIORITY)
  packetId:        d6a4f5e7-8b9c-4d0e-1f2a-3b4c5d6e7f8a
  senderId:        55555555-eeee-4fff-8aaa-bbbbbbbbbbbb  (Echo's Node ID)
  destinationId:   00000000-0000-0000-0000-000000000000  (broadcast)
  sequenceNumber:  12
  timestamp:       1752538000000
  ttl:             10
  hopCount:        0
  payloadLength:   47
  checksum:        0x9A8B7C6D

PAYLOAD:
  contentType:     1 (EMERGENCY_ALERT)
  messageLength:   44
  message:         "EMERGENCY: Building evacuation in progress"
```

**After one relay hop (at intermediate node):**
```
  ttl:             9   (decremented)
  hopCount:        1   (incremented)
  checksum:        0x2F3E4D5C  (recomputed)
  [all other fields unchanged]
```

---

### B.5 ENCRYPTED_MESSAGE Example

**Scenario:** Alpha sends "Mission status: complete" to Admin (Bravo).

```
HEADER:
  version:         1
  packetType:      0x05 (ENCRYPTED_MESSAGE)
  flags:           0x0E (REQUIRES_ACK + SIGNED + ENCRYPTED)
  packetId:        e7b5c6d8-9c0d-4e1f-2a3b-4c5d6e7f8a9b  (= M)
  senderId:        11111111-aaaa-4bbb-8ccc-dddddddddddd  (Alpha)
  destinationId:   22222222-bbbb-4ccc-8ddd-eeeeeeeeeeee  (Bravo/Admin)
  sequenceNumber:  13
  timestamp:       1752538100000
  ttl:             20
  hopCount:        0
  payloadLength:   72
  checksum:        0x1A2B3C4D

PAYLOAD:
  keyPacketId:     f8c6d7e9-0d1e-4f2a-3b4c-5d6e7f8a9b0c  (= K)
  algorithm:       0x02 (AES-256-GCM)
  ivLength:        12
  iv:              [12 random bytes]
  cipherLength:    24  (encrypted "Mission status: complete")
  ciphertext:      [24 bytes of AES-GCM ciphertext]
  tagLength:       16
  authTag:         [16 bytes GCM tag]

SIGNATURE:         [64 bytes Ed25519 signature]
```

---

### B.6 KEY_PACKET Example

**Scenario:** Corresponding key for B.5, sent on a DIFFERENT path.

```
HEADER:
  version:         1
  packetType:      0x06 (KEY_PACKET)
  flags:           0x0E (REQUIRES_ACK + SIGNED + ENCRYPTED)
  packetId:        f8c6d7e9-0d1e-4f2a-3b4c-5d6e7f8a9b0c  (= K)
  senderId:        11111111-aaaa-4bbb-8ccc-dddddddddddd  (Alpha)
  destinationId:   22222222-bbbb-4ccc-8ddd-eeeeeeeeeeee  (Bravo/Admin)
  sequenceNumber:  14
  timestamp:       1752538100001  (1ms after message)
  ttl:             20
  hopCount:        0
  payloadLength:   275
  checksum:        0x4D5E6F70

PAYLOAD:
  messagePacketId: e7b5c6d8-9c0d-4e1f-2a3b-4c5d6e7f8a9b  (= M)
  algorithm:       0x01 (RSA-2048-OAEP)
  encKeyLength:    256
  encryptedKey:    [256 bytes RSA-encrypted AES session key]

SIGNATURE:         [64 bytes Ed25519 signature]
```

**Cross-reference:** KEY_PACKET.messagePacketId == ENCRYPTED_MESSAGE.packetId (M).
ENCRYPTED_MESSAGE.keyPacketId == KEY_PACKET.packetId (K).

---

### B.7 ACK Example

**Scenario:** Bravo acknowledges receipt of the ENCRYPTED_MESSAGE.

```
HEADER:
  version:         1
  packetType:      0x07 (ACK)
  flags:           0x00
  packetId:        a9d7e8f0-1e2f-4a3b-4c5d-6e7f8a9b0c1d
  senderId:        22222222-bbbb-4ccc-8ddd-eeeeeeeeeeee  (Bravo)
  destinationId:   11111111-aaaa-4bbb-8ccc-dddddddddddd  (Alpha)
  sequenceNumber:  8
  timestamp:       1752538102000  (2 seconds after message)
  ttl:             20
  hopCount:        0
  payloadLength:   18
  checksum:        0x8F9A0B1C

PAYLOAD:
  ackedPacketId:   e7b5c6d8-9c0d-4e1f-2a3b-4c5d6e7f8a9b  (the ENCRYPTED_MESSAGE)
  status:          0 (OK)
  errorCode:       0x00
```

---

### B.8 ROUTE_REQUEST Example

**Scenario:** Alpha needs a route to "Delta" (unknown node).

```
HEADER:
  version:         1
  packetType:      0x08 (ROUTE_REQUEST)
  flags:           0x00
  packetId:        b0e8f9a1-2f3a-4b4c-5d6e-7f8a9b0c1d2e
  senderId:        11111111-aaaa-4bbb-8ccc-dddddddddddd  (Alpha)
  destinationId:   00000000-0000-0000-0000-000000000000  (broadcast/flood)
  sequenceNumber:  15
  timestamp:       1752538200000
  ttl:             20
  hopCount:        0
  payloadLength:   37
  checksum:        0x2C3D4E5F

PAYLOAD:
  targetNodeId:    44444444-dddd-4eee-8fff-aaaaaaaaaaaa  (Delta)
  requestSeqNum:   1
  hopListCount:    1
  hopList:         [11111111-aaaa-4bbb-8ccc-dddddddddddd]  (just Alpha)
```

**After relay through Charlie:**
```
  hopListCount:    2
  hopList:         [11111111-..., 33333333-cccc-4ddd-8eee-ffffffffffff]
  ttl:             19
  hopCount:        1
```

---

### B.9 ROUTE_REPLY Example

**Scenario:** Delta replies with the discovered path Alpha→Charlie→Delta.

```
HEADER:
  version:         1
  packetType:      0x09 (ROUTE_REPLY)
  flags:           0x00
  packetId:        c1f9a0b2-3a4b-4c5d-6e7f-8a9b0c1d2e3f
  senderId:        44444444-dddd-4eee-8fff-aaaaaaaaaaaa  (Delta)
  destinationId:   11111111-aaaa-4bbb-8ccc-dddddddddddd  (Alpha)
  sequenceNumber:  3
  timestamp:       1752538201000
  ttl:             20
  hopCount:        0
  payloadLength:   71
  checksum:        0x6F7A8B9C

PAYLOAD:
  targetNodeId:    44444444-dddd-4eee-8fff-aaaaaaaaaaaa  (Delta)
  requestSeqNum:   1  (matches the request)
  routeMetric:     300  (3 hops × 100)
  routeLength:     3
  route:           [11111111-..., 33333333-..., 44444444-...]
                   (Alpha → Charlie → Delta)
```

---

### B.10 ROUTE_ERROR Example

**Scenario:** Charlie detects Delta has gone offline.

```
HEADER:
  version:         1
  packetType:      0x0A (ROUTE_ERROR)
  flags:           0x00
  packetId:        d2a0b1c3-4b5c-4d6e-7f8a-9b0c1d2e3f4a
  senderId:        33333333-cccc-4ddd-8eee-ffffffffffff  (Charlie)
  destinationId:   11111111-aaaa-4bbb-8ccc-dddddddddddd  (Alpha — affected upstream)
  sequenceNumber:  22
  timestamp:       1752538300000
  ttl:             20
  hopCount:        0
  payloadLength:   33
  checksum:        0x0A1B2C3D

PAYLOAD:
  unreachableNodeId: 44444444-dddd-4eee-8fff-aaaaaaaaaaaa  (Delta)
  reporterNodeId:    33333333-cccc-4ddd-8eee-ffffffffffff  (Charlie)
  errorCode:         0x01 (LINK_BROKEN)
```

---

### B.11 KEY_ANNOUNCE Example

**Scenario:** Admin (Bravo) distributes its RSA public key after joining.

```
HEADER:
  version:         1
  packetType:      0x0B (KEY_ANNOUNCE)
  flags:           0x00
  packetId:        e3b1c2d4-5c6d-4e7f-8a9b-0c1d2e3f4a5b
  senderId:        22222222-bbbb-4ccc-8ddd-eeeeeeeeeeee  (Bravo/Admin)
  destinationId:   00000000-0000-0000-0000-000000000000  (broadcast/flood)
  sequenceNumber:  2
  timestamp:       1752537601000
  ttl:             20
  hopCount:        0
  payloadLength:   316
  checksum:        0x5B6C7D8E

PAYLOAD:
  adminNodeId:     22222222-bbbb-4ccc-8ddd-eeeeeeeeeeee
  keyLength:       294  (DER-encoded RSA-2048 public key)
  publicKey:       [294 bytes of DER-encoded RSA public key]
  keyFingerprint:  0xA1B2C3D4  (CRC-32 of the 294 key bytes)
```

---

*End of NINE Protocol Specification RFC v0.9*
