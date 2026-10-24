# NINE Protocol Specification

## Document Metadata

| Field | Value |
|-------|-------|
| Version | 0.1.0 |
| Status | Draft |
| Date | 2026-07-15 |
| Authors | NINE Team |

---

## 1. Overview

The NINE Protocol (SAMT — Secure Adaptive Message Transfer) defines how nodes in an infrastructure-less mesh network communicate. It specifies packet structure, message types, state management, and interaction sequences.

This document serves as the **RFC** of NINE. All implementations must conform to this specification.

---

## 2. Protocol Version

Current version: `1`

The version field is a single unsigned 8-bit integer included in every packet header. Nodes must reject packets with incompatible versions.

---

## 3. Design Principles

1. **Stateless forwarding**: Relay nodes forward packets based on routing tables without maintaining per-flow state.
2. **Best-effort delivery**: The protocol does not guarantee delivery. ACKs provide optional confirmation.
3. **Loop prevention**: TTL decrement and packet ID deduplication prevent infinite loops.
4. **Separation of concerns**: Encryption is handled before packet construction. The protocol layer transmits opaque payloads.
5. **Minimal overhead**: Packet headers are compact to minimize transmission time over low-bandwidth links.

---

## 4. Node Identity

Each node is identified by a **Node ID** — a 128-bit UUID v4 generated at first initialization.

- Node IDs are permanent for the lifetime of a session.
- Node IDs are not tied to any hardware address.
- A node may regenerate its ID to maintain anonymity (session rotation).

### Session ID

In addition to the permanent Node ID, each node generates a **Session ID** at startup — a 64-bit random value. The Session ID changes on every restart and is used for:

- Detecting node restarts (stale routing entries)
- Preventing replay attacks across sessions

---

## 5. Packet Types

| Type Code | Name | Purpose |
|-----------|------|---------|
| 0x01 | DISCOVERY | Announce presence to neighbors |
| 0x02 | DISCOVERY_RESPONSE | Reply to a discovery announcement |
| 0x03 | HEARTBEAT | Periodic liveness signal |
| 0x04 | BROADCAST | One-to-all message propagation |
| 0x05 | ENCRYPTED_MESSAGE | Encrypted payload for secure communication |
| 0x06 | KEY_PACKET | Encrypted session key (travels separate path) |
| 0x07 | ACK | Acknowledgement of packet receipt |
| 0x08 | ROUTE_REQUEST | Request a path to a destination |
| 0x09 | ROUTE_REPLY | Reply with a discovered path |
| 0x0A | ROUTE_ERROR | Notify that a route has broken |

---

## 6. Packet Lifecycle

```
Construction → Serialization → Transmission → Reception → Deserialization → Validation → Dispatch
```

1. **Construction**: The sending module builds a packet struct.
2. **Serialization**: The packet is converted to bytes (protocol buffer or custom binary format).
3. **Transmission**: Bytes are handed to the transport layer.
4. **Reception**: The receiving transport delivers raw bytes.
5. **Deserialization**: Bytes are parsed back into a packet struct.
6. **Validation**: Checksum, version, and structural integrity are verified.
7. **Dispatch**: The packet is routed to the appropriate handler based on type.

---

## 7. Interaction Sequences

### 7.1 Discovery Sequence

```
Node A                          Node B
  │                                │
  │──── DISCOVERY ────────────────►│
  │                                │
  │◄─── DISCOVERY_RESPONSE ────────│
  │                                │
  │  (A adds B to neighbor table)  │
  │  (B adds A to neighbor table)  │
```

### 7.2 Broadcast Sequence

```
Node A          Node B (relay)      Node C
  │                 │                  │
  │── BROADCAST ──►│                  │
  │                 │── BROADCAST ──►│
  │                 │                  │
  │  (B decrements TTL, checks      │
  │   dedup, forwards)               │
```

### 7.3 Route Discovery Sequence

```
Source          Intermediate        Destination
  │                 │                    │
  │── ROUTE_REQUEST ►│                    │
  │                 │── ROUTE_REQUEST ──►│
  │                 │                    │
  │                 │◄── ROUTE_REPLY ────│
  │◄── ROUTE_REPLY ─│                    │
  │                 │                    │
  │  (Source now has route to Dest)      │
```

### 7.4 Secure Message Sequence (Dual-Path)

```
Sender              Relay A         Relay B         Admin
  │                    │               │              │
  │── ENCRYPTED_MSG ──►│               │              │
  │                    │── ENCRYPTED ─────────────────►│
  │                    │               │              │
  │── KEY_PACKET ──────────────────────►│              │
  │                    │               │── KEY ──────►│
  │                    │               │              │
  │                    │               │  (Admin has both,
  │                    │               │   decrypts)   │
```

### 7.5 Heartbeat Sequence

```
Node A                    All Neighbors
  │                            │
  │──── HEARTBEAT ────────────►│  (periodic, every N seconds)
  │                            │
  │  (Neighbors update A's     │
  │   liveness timestamp)      │
```

---

## 8. Deduplication

Every node maintains a **seen packet buffer** (bounded circular buffer).

- When a packet arrives, its `packetId` is checked against the buffer.
- If already seen → drop silently.
- If new → process and add to buffer.

Buffer size: configurable, default 1024 entries.
Entry expiry: entries older than 60 seconds are evicted.

---

## 9. TTL Management

- Every packet starts with a TTL value (default: 10 for broadcast, 20 for routed).
- Each forwarding hop decrements TTL by 1.
- When TTL reaches 0, the packet is dropped.
- TTL prevents infinite propagation in cyclic topologies.

---

## 10. Reliability

The protocol is **best-effort** by default.

Optional reliability is achieved through:

- **ACK packets**: The destination sends an ACK back to the source.
- **Retry logic**: The source retransmits if no ACK is received within a timeout.
- **ACK TTL**: ACK packets also have TTL to prevent ACK storms.

ACK is optional for BROADCAST packets (fire-and-forget).
ACK is required for ENCRYPTED_MESSAGE and KEY_PACKET.

---

## 11. Flow Control

No explicit flow control at the protocol level.

Transport-level backpressure is handled by the transport adapter (e.g., Bluetooth RFCOMM has its own flow control).

The protocol trusts the transport to manage bandwidth constraints.

---

## 12. Error Handling

| Error Condition | Response |
|----------------|----------|
| Invalid version | Drop packet, log warning |
| Checksum mismatch | Drop packet, log warning |
| TTL exhausted | Drop packet silently |
| Unknown packet type | Drop packet, log warning |
| Duplicate packet ID | Drop packet silently |
| Deserialization failure | Drop packet, log error |
| Route not found | Buffer packet, initiate ROUTE_REQUEST |

---

## 13. Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| PROTOCOL_VERSION | 1 | Current protocol version |
| DEFAULT_BROADCAST_TTL | 10 | TTL for broadcast packets |
| DEFAULT_ROUTED_TTL | 20 | TTL for unicast packets |
| HEARTBEAT_INTERVAL_MS | 5000 | Heartbeat emission interval |
| HEARTBEAT_TIMEOUT_MS | 15000 | Time before neighbor is considered dead |
| DEDUP_BUFFER_SIZE | 1024 | Maximum seen-packet entries |
| DEDUP_EXPIRY_MS | 60000 | Time before dedup entries expire |
| ROUTE_REQUEST_TIMEOUT_MS | 10000 | Time to wait for ROUTE_REPLY |
| MAX_RETRIES | 3 | Retransmission attempts for reliable packets |
| RETRY_INTERVAL_MS | 3000 | Time between retries |
