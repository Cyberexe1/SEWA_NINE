# NINE Demonstration Plan

## Document Metadata

| Field | Value |
|-------|-------|
| Version | 0.1.0 |
| Status | Draft |
| Date | 2026-07-15 |
| Authors | NINE Team |

---

## 1. Demonstration Objective

Prove that NINE enables reliable, secure, infrastructure-less communication across multiple floors of a building using only Android devices and one Admin laptop, with zero internet connectivity.

---

## 2. Environment

| Parameter | Value |
|-----------|-------|
| Location | College building (multi-floor) |
| Floors | 2-3 |
| Devices | 5-8 Android phones + 1 Laptop (Admin) |
| Internet | Disabled on ALL devices |
| Cellular | Disabled (airplane mode with BT/Wi-Fi enabled) |

---

## 3. Demo Scenarios

### Scenario 1: Broadcast Propagation

**Goal:** Demonstrate one-to-all message delivery across a multi-hop mesh.

**Setup:**
```
Floor 3:  [Node E]
              |
Floor 2:  [Node C] --- [Node D]
              |
Floor 1:  [Node A] --- [Node B] --- [Admin]
```

**Steps:**
1. All devices start NINE and enter discovery mode.
2. Mesh forms automatically (verify via Admin dashboard topology view).
3. Node E (Floor 3) sends a broadcast: "Building evacuation in progress."
4. Verify the message reaches ALL nodes including Admin.
5. Show hop count on Admin dashboard (E → C → A → Admin = 3 hops).

**Success Criteria:**
- Message reaches Admin within 5 seconds.
- All intermediate nodes show the message.
- Admin dashboard shows the propagation path.

---

### Scenario 2: Secure Message (Dual-Path)

**Goal:** Demonstrate encrypted communication where message and key travel separate routes.

**Setup:**
```
                [Node C]
               /        \
[Node A] ---              --- [Admin]
               \        /
                [Node D]
```

**Steps:**
1. Node A sends a secure message to Admin.
2. ENCRYPTED_MESSAGE travels through Node C.
3. KEY_PACKET travels through Node D.
4. Both arrive at Admin.
5. Admin decrypts and displays the plaintext.

**Success Criteria:**
- Node C cannot read the message (show its relay log — only ciphertext).
- Node D cannot reconstruct the message (only has encrypted key, no ciphertext).
- Admin successfully decrypts and shows plaintext.
- Admin dashboard shows both paths on the topology graph.

---

### Scenario 3: Relay Failure and Recovery

**Goal:** Demonstrate mesh resilience when a relay node goes offline.

**Steps:**
1. Establish a working route: A → B → C → Admin.
2. Node A sends a broadcast — verify delivery.
3. KILL Node B (turn off the device).
4. Wait for heartbeat timeout (15 seconds).
5. Node A sends another broadcast.
6. Verify ROUTE_ERROR is generated.
7. Verify route discovery finds alternative path (if one exists).
8. If no alternative path → demonstrate "store-carry-forward" concept.

**Success Criteria:**
- ROUTE_ERROR appears on Admin dashboard.
- If alternate path exists: message delivered via new route.
- If no alternate path: message queued, delivered when connectivity restored.

---

### Scenario 4: Multi-Hop Range Extension

**Goal:** Prove communication between two devices beyond Bluetooth/Wi-Fi Direct range.

**Setup:**
- Place Node A and Node E ~50 meters apart (different floors, out of direct range).
- Place 3 relay nodes between them.

**Steps:**
1. Demonstrate that Node A CANNOT see Node E in raw Bluetooth scan.
2. Start all relay nodes.
3. Show that Node A's "Known Nodes" list includes Node E (via mesh discovery).
4. Node A sends message to Node E.
5. Message arrives via relays.

**Success Criteria:**
- Direct Bluetooth scan shows no connection between A and E.
- Mesh routing successfully delivers the message.
- Hop count shows 3-4 hops.

---

## 4. Admin Dashboard Visualization

During all scenarios, the Admin laptop shows:

- **Live mesh topology graph** — Nodes as circles, connections as edges.
- **Packet flow animation** — Highlight path as packets traverse.
- **Routing table** — Current known routes.
- **Message log** — All received broadcasts and decrypted secure messages.
- **Network health** — Per-node heartbeat status, link quality.

---

## 5. Pre-Demo Checklist

- [ ] All Android devices have NINE app installed
- [ ] Admin laptop has desktop application running
- [ ] All devices in airplane mode (Wi-Fi and Bluetooth manually re-enabled)
- [ ] Verify no internet connectivity on any device
- [ ] Battery > 80% on all devices
- [ ] Position relay devices at planned locations
- [ ] Test each scenario once before live demo

---

## 6. Fallback Plans

| Issue | Fallback |
|-------|----------|
| Bluetooth range too short | Move devices closer, reduce hop count |
| Wi-Fi Direct fails | Fall back to Bluetooth Classic |
| Dual-path unavailable | Demo with single path + explain degraded mode |
| Device crashes | Have 2 spare devices ready |
| Admin laptop fails | Demo from secondary laptop |

---

## 7. Metrics to Collect

| Metric | Target |
|--------|--------|
| Broadcast delivery time (3 hops) | < 5 seconds |
| Secure message delivery (dual-path) | < 10 seconds |
| Route recovery after failure | < 20 seconds |
| Discovery time (mesh formation) | < 30 seconds |
| Packet loss rate | < 5% |
