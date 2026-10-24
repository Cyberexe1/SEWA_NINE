# NINE Protocol Timing Specification v1.0

## Document Metadata

| Field | Value |
|-------|-------|
| Title | NINE Protocol Timing Specification |
| Version | 1.0.0-draft |
| Status | DRAFT |
| Date | 2026-07-15 |
| Companion To | NINE-RFC-v1.0 |
| Category | Timing & Performance Specification |

---

## 1. Purpose

This document defines all timers, intervals, timeouts, retry policies,
and expiration rules in the NINE protocol. Each timing parameter includes
its default value, valid range, rationale, and behavioral impact.

Implementations MUST use the default values unless explicitly overridden
by configuration. All timers use millisecond resolution.

---

## 2. Timer Categories

Timers are organized into five categories:

1. **Periodic** — Recurring actions at fixed intervals.
2. **Timeout** — Maximum wait before declaring failure.
3. **Expiry** — Lifetime after which cached state is discarded.
4. **Retry** — Delay between retransmission attempts.
5. **Throttle** — Minimum interval between repeated actions.

---

## 3. Discovery Timers

### 3.1 DISCOVERY_INTERVAL_MS

| Property | Value |
|----------|-------|
| Category | Periodic |
| Default | 10000 ms (10 seconds) |
| Valid Range | 5000 — 60000 ms |
| Applies To | Beacon scanning for new peers |

**Rationale:** 10 seconds balances responsiveness (finding new nodes quickly)
against power consumption and radio interference. Shorter intervals waste
battery on mobile devices. Longer intervals delay mesh formation.

**Behavior:** Every DISCOVERY_INTERVAL_MS, the node performs a transport-level
scan for new peers. If new peers are found, the DISCOVERY handshake begins.

### 3.2 DISCOVERABLE_DURATION_MS

| Property | Value |
|----------|-------|
| Category | Timeout |
| Default | 30000 ms (30 seconds) |
| Valid Range | 10000 — 120000 ms |
| Applies To | How long a node remains visible after entering DISCOVERING |

**Rationale:** Android Bluetooth discoverability is typically limited to 120s
by the OS. 30s is sufficient for nearby devices to find each other without
keeping the radio in discoverable mode indefinitely.

### 3.3 DISCOVERY_HANDSHAKE_TIMEOUT_MS

| Property | Value |
|----------|-------|
| Category | Timeout |
| Default | 5000 ms (5 seconds) |
| Valid Range | 2000 — 15000 ms |
| Applies To | Time to wait for DISCOVERY_RESPONSE after sending DISCOVERY |

**Rationale:** If a peer doesn't respond within 5 seconds, the transport
connection is likely broken. Bluetooth connection setup takes ~2-3 seconds,
so 5s allows for slow connections.

**Behavior on timeout:** The pending handshake is aborted. The transport
connection may be closed. The peer is NOT added to the neighbor table.

---

## 4. Heartbeat Timers

### 4.1 HEARTBEAT_INTERVAL_MS

| Property | Value |
|----------|-------|
| Category | Periodic |
| Default | 5000 ms (5 seconds) |
| Valid Range | 2000 — 30000 ms |
| Applies To | Interval between HEARTBEAT emissions |

**Rationale:** 5 seconds provides timely failure detection (dead neighbor
detected within 15s = 3 missed heartbeats) while keeping control traffic
low. At 5s intervals with 7 neighbors, a node sends 1.4 heartbeats/second.

### 4.2 HEARTBEAT_TIMEOUT_MS

| Property | Value |
|----------|-------|
| Category | Timeout |
| Default | 15000 ms (15 seconds) |
| Valid Range | 3× HEARTBEAT_INTERVAL_MS — 60000 ms |
| Applies To | Time without heartbeat before declaring neighbor dead |

**Rationale:** 3× the heartbeat interval tolerates up to 2 consecutive
lost heartbeats before triggering failure. This accounts for radio
congestion and brief interference without false positives.

**Behavior on timeout:**
1. Neighbor removed from neighbor table.
2. All routes through the neighbor invalidated.
3. ROUTE_ERROR generated and propagated upstream.

**Constraint:** HEARTBEAT_TIMEOUT_MS MUST be ≥ 3 × HEARTBEAT_INTERVAL_MS.

---

## 5. Routing Timers

### 5.1 ROUTE_DISCOVERY_TIMEOUT_MS

| Property | Value |
|----------|-------|
| Category | Timeout |
| Default | 10000 ms (10 seconds) |
| Valid Range | 5000 — 30000 ms |
| Applies To | Time to wait for ROUTE_REPLY after sending ROUTE_REQUEST |

**Rationale:** In a 20-hop mesh at worst case, a ROUTE_REQUEST needs time
to flood to the destination and the ROUTE_REPLY to return. At ~100ms per
hop (Bluetooth latency), 20 hops × 2 directions = 4 seconds. 10s provides
generous margin.

**Behavior on timeout:** Retry route discovery (up to MAX_RETRIES).
After all retries exhausted → report route-not-found to application.

### 5.2 ROUTE_EXPIRY_MS

| Property | Value |
|----------|-------|
| Category | Expiry |
| Default | 30000 ms (30 seconds) |
| Valid Range | 10000 — 300000 ms |
| Applies To | Cached route lifetime |

**Rationale:** 30 seconds is short enough to detect topology changes
(nodes moving, failing) but long enough that routes remain useful for
burst communication. A route refreshes each time it's successfully used.

**Behavior on expiry:** Route entry removed. Next packet to that destination
triggers fresh route discovery.

### 5.3 PENDING_PACKET_TIMEOUT_MS

| Property | Value |
|----------|-------|
| Category | Timeout |
| Default | 30000 ms (30 seconds) |
| Valid Range | 10000 — 120000 ms |
| Applies To | Packets in pending queue awaiting route discovery |

**Rationale:** Matches ROUTE_EXPIRY_MS so a packet won't outlive its route.
30 seconds is long enough for 3 route discovery attempts (10s each).

**Behavior on timeout:** Packet dropped. If the packet had REQUIRES_ACK,
the sender's retry logic handles retransmission from the application layer.

---

## 6. Retry Timers

### 6.1 RETRY_INTERVAL_MS

| Property | Value |
|----------|-------|
| Category | Retry |
| Default | 3000 ms (3 seconds) |
| Valid Range | 1000 — 10000 ms |
| Applies To | Delay before retransmitting a packet that wasn't ACKed |

**Rationale:** 3 seconds allows time for the packet to reach the destination
(~2s in a 10-hop path) and the ACK to return (~2s). A shorter interval
causes premature retransmissions that waste bandwidth.

### 6.2 MAX_RETRIES

| Property | Value |
|----------|-------|
| Category | Retry |
| Default | 3 attempts |
| Valid Range | 1 — 10 |
| Applies To | Maximum retransmission count before declaring failure |

**Behavior after exhaustion:** Report delivery failure to application.
Do NOT retry indefinitely — this would create unbounded traffic.

### 6.3 MAX_ROUTE_DISCOVERY_RETRIES

| Property | Value |
|----------|-------|
| Category | Retry |
| Default | 3 attempts |
| Valid Range | 1 — 5 |
| Applies To | Number of ROUTE_REQUEST floods before giving up |

**Rationale:** 3 attempts × 10s timeout = 30s maximum wait for route.
More attempts would exceed user patience for an academic prototype.

### 6.4 TRANSPORT_SEND_RETRIES

| Property | Value |
|----------|-------|
| Category | Retry |
| Default | 1 attempt |
| Valid Range | 0 — 3 |
| Applies To | Transport-level retransmission on send failure |

**Rationale:** One retry catches transient radio issues. More retries at
the transport level conflict with protocol-level retries and cause confusion.

---

## 7. Deduplication Timers

### 7.1 DEDUP_EXPIRY_MS

| Property | Value |
|----------|-------|
| Category | Expiry |
| Default | 60000 ms (60 seconds) |
| Valid Range | 30000 — 300000 ms |
| Applies To | Lifetime of entries in the deduplication buffer |

**Rationale:** Must be longer than the maximum time a packet could
circulate in the mesh (TTL=255 × ~100ms/hop = ~25s worst case). 60s
provides generous margin against delayed packets.

### 7.2 DEDUP_EVICTION_INTERVAL_MS

| Property | Value |
|----------|-------|
| Category | Periodic |
| Default | 10000 ms (10 seconds) |
| Valid Range | 5000 — 60000 ms |
| Applies To | How often to scan and evict expired dedup entries |

**Rationale:** Eviction doesn't need to be real-time. A 10s scan cycle
keeps memory bounded without excessive CPU usage.

---

## 8. Security Timers

### 8.1 MAX_PACKET_AGE_MS

| Property | Value |
|----------|-------|
| Category | Timeout |
| Default | 60000 ms (60 seconds) |
| Valid Range | 30000 — 300000 ms |
| Applies To | Maximum age of a packet before it's rejected as stale |

**Rationale:** Without synchronized clocks, timestamps cannot be precise.
60s tolerance accounts for clock drift between devices. Packets older than
this are likely replays or severely delayed.

### 8.2 KEY_REASSEMBLY_TIMEOUT_MS

| Property | Value |
|----------|-------|
| Category | Timeout |
| Default | 30000 ms (30 seconds) |
| Valid Range | 10000 — 120000 ms |
| Applies To | Admin waiting for the second half of a dual-path message |

**Rationale:** If ENCRYPTED_MESSAGE arrives but KEY_PACKET doesn't within
30 seconds (or vice versa), the other half is likely lost. Admin discards
the partial and reports timeout.

---

## 9. Transport Timers

### 9.1 FRAME_TIMEOUT_MS

| Property | Value |
|----------|-------|
| Category | Timeout |
| Default | 5000 ms (5 seconds) |
| Valid Range | 2000 — 15000 ms |
| Applies To | Incomplete frame assembly timeout |

**Rationale:** If a frame start marker is received but the full frame doesn't
arrive within 5 seconds, the stream is likely corrupted. Discard partial
data and scan for the next frame marker.

### 9.2 CONNECTION_TIMEOUT_MS

| Property | Value |
|----------|-------|
| Category | Timeout |
| Default | 10000 ms (10 seconds) |
| Valid Range | 5000 — 30000 ms |
| Applies To | Maximum time to establish a transport connection |

**Rationale:** Bluetooth pairing and Wi-Fi Direct group formation can take
several seconds. 10s accommodates slow connections without hanging forever.

---

## 10. Timer Interaction Constraints

The following relationships MUST hold:

1. `HEARTBEAT_TIMEOUT_MS ≥ 3 × HEARTBEAT_INTERVAL_MS`
2. `PENDING_PACKET_TIMEOUT_MS ≥ ROUTE_DISCOVERY_TIMEOUT_MS`
3. `DEDUP_EXPIRY_MS > MAX_PACKET_AGE_MS`
4. `ROUTE_EXPIRY_MS ≤ DEDUP_EXPIRY_MS`
5. `RETRY_INTERVAL_MS < ROUTE_DISCOVERY_TIMEOUT_MS`
6. `KEY_REASSEMBLY_TIMEOUT_MS ≤ PENDING_PACKET_TIMEOUT_MS`

---

## 11. Timer Summary Table

| Timer | Default | Category | Module |
|-------|---------|----------|--------|
| DISCOVERY_INTERVAL_MS | 10000 | Periodic | Discovery |
| DISCOVERABLE_DURATION_MS | 30000 | Timeout | Discovery |
| DISCOVERY_HANDSHAKE_TIMEOUT_MS | 5000 | Timeout | Discovery |
| HEARTBEAT_INTERVAL_MS | 5000 | Periodic | Discovery |
| HEARTBEAT_TIMEOUT_MS | 15000 | Timeout | Discovery |
| ROUTE_DISCOVERY_TIMEOUT_MS | 10000 | Timeout | Routing |
| ROUTE_EXPIRY_MS | 30000 | Expiry | Routing |
| PENDING_PACKET_TIMEOUT_MS | 30000 | Timeout | Routing |
| RETRY_INTERVAL_MS | 3000 | Retry | Messaging |
| MAX_RETRIES | 3 | Retry | Messaging |
| MAX_ROUTE_DISCOVERY_RETRIES | 3 | Retry | Routing |
| TRANSPORT_SEND_RETRIES | 1 | Retry | Transport |
| DEDUP_EXPIRY_MS | 60000 | Expiry | Protocol |
| DEDUP_EVICTION_INTERVAL_MS | 10000 | Periodic | Protocol |
| MAX_PACKET_AGE_MS | 60000 | Timeout | Security |
| KEY_REASSEMBLY_TIMEOUT_MS | 30000 | Timeout | Security |
| FRAME_TIMEOUT_MS | 5000 | Timeout | Transport |
| CONNECTION_TIMEOUT_MS | 10000 | Timeout | Transport |

---

*End of NINE Protocol Timing Specification v1.0*
