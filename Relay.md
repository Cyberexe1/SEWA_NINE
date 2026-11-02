# NINE — Multi-Hop Relay Design (Relay.md)

This document is the detailed technical design for NINE's **multi-hop relay mesh**: how messages travel across several phones so that two people out of direct Bluetooth range can still chat. It covers the concept, network model, protocol, algorithms, Relay Mode behavior, encryption, failure handling, and a step-by-step implementation plan for the existing Android app.

> Status: **implemented** (pending on-device testing). The relay mesh described here is built: identity, packet protocol, multi-neighbor links, controlled-flooding forwarding, presence/contacts, targeted end-to-end encrypted messaging, delivery ACKs with retries, and hands-off Relay Mode with a foreground service. An offline map with GPS position sharing over the mesh has also been added (see section 19). The main remaining work is moving the networking into the service for true background relaying, and real-world testing across 4–5 phones.

---

## Table of Contents

1. [Goals and Non-Goals](#1-goals-and-non-goals)
2. [Background: Why Relaying](#2-background-why-relaying)
3. [Network Model](#3-network-model)
4. [Node Roles and States](#4-node-roles-and-states)
5. [Identity and Addressing](#5-identity-and-addressing)
6. [Neighbor Discovery and Connection](#6-neighbor-discovery-and-connection)
7. [Presence Propagation](#7-presence-propagation)
8. [Message Packet Format](#8-message-packet-format)
9. [Forwarding Algorithm (Controlled Flooding)](#9-forwarding-algorithm-controlled-flooding)
10. [Relay Mode: Hands-Off Forwarding](#10-relay-mode-hands-off-forwarding)
11. [End-to-End Encryption](#11-end-to-end-encryption)
12. [Reliability, ACKs, and Store-and-Forward](#12-reliability-acks-and-store-and-forward)
13. [Failure Handling and Edge Cases](#13-failure-handling-and-edge-cases)
14. [Worked Example: 5 Devices](#14-worked-example-5-devices)
15. [Constraints and Limitations](#15-constraints-and-limitations)
16. [Implementation Plan](#16-implementation-plan)
17. [Testing Plan](#17-testing-plan)
18. [Glossary](#18-glossary)

---

## 1. Goals and Non-Goals

### Goals
- Let a sender reach a receiver that is **not in direct Bluetooth range**, using 1–4 intermediate phones (total 4–5 devices in a line).
- Make a relay device **hands-off**: one button, then it forwards automatically.
- Ensure a relay **cannot read** the messages it forwards.
- Prevent message **loops** and **duplicate delivery** in a small mesh.
- Reuse the existing Bluetooth RFCOMM transport already in the app.

### Non-Goals (for the first version)
- Hiding routing metadata (who is talking to whom). Only message **content** is protected.
- Large-scale mesh (hundreds of nodes). The target is a handful of devices.
- Guaranteed delivery under heavy churn. Best-effort with simple retries only.
- File/media transfer. Text messages first.

---

## 2. Background: Why Relaying

Typical phone Bluetooth (Class 2) reaches ~10 meters and degrades through walls and human bodies. Two people 30–50 meters apart usually cannot connect directly.

A relay bridges the gap. Each device only has to reach its **immediate neighbor**; chaining devices multiplies the reachable distance:

```
Direct only:    A ─10m─► B                     (fails beyond ~10 m)

With relays:    A ─10m─► R1 ─10m─► R2 ─10m─► B  (~30 m end to end)
```

---

## 3. Network Model

- The mesh is an **undirected graph**. Nodes are phones running NINE; edges are active Bluetooth links between neighbors.
- A device connects **only** to devices within its own radio range (its neighbors).
- There is **no central server** and no fixed topology. Links form and break as devices move.
- Routing is **not** based on Bluetooth MAC addresses. It is based on **app-level IDs** carried inside each message.
- The first version uses **flooding** (spread to all neighbors) rather than computed routes, because it is simple and robust for 4–5 devices.

Two distinct "views" a device maintains:

| View | Source | Contains |
|------|--------|----------|
| **Neighbor list** | Live Bluetooth links | Devices in direct range right now |
| **Contact list ("people online")** | Presence propagation | Everyone reachable anywhere in the mesh |

A user picks a chat target from the **contact list**, not the neighbor list.

---

## 4. Node Roles and States

Every install can act in three roles simultaneously; they are not mutually exclusive:

- **Endpoint** — the user is actively sending/receiving their own messages.
- **Relay** — the device forwards messages for others.
- **Announcer** — the device periodically broadcasts its presence.

### App modes

| Mode | Behavior |
|------|----------|
| **Idle** | Not connected; no forwarding. |
| **Chat** | Connected as an endpoint; also relays and announces. |
| **Relay Mode** | Dedicated hands-off forwarding; auto-accept, auto-connect, forward, and (optionally) announce. UI shows a relay status screen only. |

A device in **Chat** mode still relays by default, so ordinary users passively extend the network. **Relay Mode** is for someone who only wants to be a bridge.

---

## 5. Identity and Addressing

- On first launch, each device generates a **stable unique ID** (`deviceId`), a random UUID stored in `SharedPreferences`.
- The user's **display name** is separate and can change freely; it is only for showing to humans.
- All routing uses `deviceId`. Names are never used for addressing (two users could pick the same name).

```
deviceId : "9f1c2a7e-..."   (permanent per install)
name     : "Vikas"          (editable, cosmetic)
```

A contact is the pair `{ deviceId, name, lastSeen }`.

---

## 6. Neighbor Discovery and Connection

Reusing the existing Bluetooth flow, extended for the mesh:

1. A device becomes **discoverable** and starts an **RFCOMM server socket** (accept loop) using the app's shared UUID.
2. It also **scans** for nearby devices advertising the same app UUID.
3. When it finds a NINE peer, it opens a client RFCOMM socket to it.
4. Both directions result in a **neighbor link** — a connected socket with a read loop.

Rules to keep the mesh stable:

- **Deduplicate links**: never keep two sockets to the same `deviceId`. If both sides connect at once, keep the link initiated by the **lower `deviceId`** and close the other.
- **Multiple neighbors**: a relay must hold several links at once (e.g., one to each side). RFCOMM/piconet realistically supports a handful of simultaneous links — enough for a 4–5 device line.
- **Handshake**: immediately after connecting, each side sends a small **HELLO** containing its `deviceId` and `name`, so the link is associated with an identity.

---

## 7. Presence Propagation

So users can see who is reachable beyond direct range:

- Each device emits a **PRESENCE** packet on a timer (e.g., every 15–30 s) and whenever its name changes.
- PRESENCE contains `{ deviceId, name, seq }`, where `seq` is a monotonically increasing counter.
- On receiving a PRESENCE, a node:
  1. ignores it if it has seen an equal or higher `seq` for that `deviceId` (dedupe),
  2. otherwise updates its contact list and **rebroadcasts** it to all other neighbors.
- Contacts are marked **offline** if no PRESENCE arrives within a timeout (e.g., 3 missed intervals).

This flood spreads every device's existence across the whole mesh, building the "people online" list.

---

## 8. Message Packet Format

All traffic is framed as length-prefixed packets so multiple messages can share one socket stream. The logical structure (serialized as JSON or a compact binary form):

```
Packet {
  type      : HELLO | PRESENCE | MSG | ACK
  msgId     : string   // UUID, unique per original message
  srcId     : string   // deviceId of the original sender
  dstId     : string   // deviceId of the intended recipient (empty for broadcast)
  ttl       : int       // hop limit, decremented per relay
  seq       : int       // used by PRESENCE
  name      : string    // used by HELLO/PRESENCE
  payload   : bytes      // encrypted message body (for MSG)
  timestamp : long
}
```

| Field | Meaning |
|-------|---------|
| `type` | What kind of packet this is |
| `msgId` | Identifies a message for dedupe/ACK; same across all hops |
| `srcId` / `dstId` | Original sender and final recipient (app IDs) |
| `ttl` | Prevents infinite forwarding; e.g., start at 5 |
| `payload` | Ciphertext; unreadable by relays |

Framing on the wire: `[4-byte length][packet bytes]`.

---

## 9. Forwarding Algorithm (Controlled Flooding)

Each node keeps a **seen-set** of recent `msgId`s (bounded, with expiry).

When a `MSG` packet arrives on a link:

```
onReceive(pkt, fromLink):
    if pkt.msgId in seenSet:          # already handled → drop (loop/dup guard)
        return
    seenSet.add(pkt.msgId)

    if pkt.dstId == myId:             # I am the recipient
        decryptAndDeliver(pkt)
        sendAck(pkt.msgId, toward pkt.srcId)
        return

    pkt.ttl -= 1                       # otherwise relay it
    if pkt.ttl <= 0:
        return                         # exhausted → drop

    for link in neighbors:
        if link != fromLink:           # don't echo back where it came from
            link.send(pkt)
```

Notes:
- **Loop prevention** comes from the seen-set plus TTL.
- **Duplicate delivery** at the recipient is prevented by the seen-set check.
- **Split-horizon** (not sending back to the source link) reduces redundant traffic.
- Flooding is chosen over routing tables because with 4–5 devices it is simpler and self-healing when links move.

Seen-set management: store `msgId → expiryTime`; evict after, say, 2 minutes to bound memory.

---

## 10. Relay Mode: Hands-Off Forwarding

Relay Mode makes a middle device a passive bridge with **one tap**.

### On entering Relay Mode
1. Verify/request Bluetooth permissions.
2. Ensure Bluetooth is on (prompt if off).
3. Request **discoverability** (Android system prompt — one "Allow").
4. Start the RFCOMM **accept loop** (auto-accept incoming links).
5. Start **scanning** and **auto-connect** to any NINE peers found.
6. Start a **foreground service** with a persistent notification ("NINE is relaying") so Android does not kill it when the screen locks.
7. Show a minimal status screen: relay on/off, neighbor count, messages forwarded.

### While relaying
- The device forwards `MSG` and `PRESENCE` per the flooding algorithm.
- It never displays message content (and cannot read it — see encryption).
- It may optionally announce its own presence so it appears as a reachable contact, or stay "silent" and only forward.

### What the relay user does
1. Tap **Relay Mode**.
2. Tap **Allow** on the discoverable prompt.
3. Stay positioned between endpoints; keep the phone powered.

That is all — no typing, reading, or device selection.

---

## 11. End-to-End Encryption

Relays must carry messages without reading them.

### Keys
- Each device generates a **key pair** on first launch (e.g., X25519 for key agreement, or RSA/EC).
- The **public key** is distributed with PRESENCE (or on first contact); the **private key** never leaves the device.

### Sending
1. Sender looks up the recipient's public key (from the contact list).
2. Sender derives a symmetric key and encrypts the message body (e.g., AES-GCM) → `payload`.
3. `srcId`, `dstId`, `msgId`, `ttl` stay in clear so relays can route.

### Relaying
- Relays see only ciphertext in `payload`. They cannot decrypt it.

### Receiving
- The recipient uses its private key to recover the symmetric key and decrypt `payload`.

### What is and isn't protected
- **Protected**: message content.
- **Not protected (v1)**: metadata — `srcId`/`dstId` are visible to relays. Hiding this would need onion routing (future work).

---

## 12. Reliability, ACKs, and Store-and-Forward

- **ACKs**: when the recipient delivers a `MSG`, it floods a small `ACK` packet back (addressed to `srcId`, referencing `msgId`). The sender marks the message delivered when the ACK arrives.
- **Retries**: if no ACK within a timeout, the sender re-sends up to N times with backoff. Because `msgId` is unchanged, duplicates are absorbed by seen-sets.
- **Store-and-forward (optional, later)**: a relay may briefly queue a `MSG` if the next hop is momentarily unavailable, and flush it when a neighbor appears. Kept minimal in v1 to avoid complexity.

---

## 13. Failure Handling and Edge Cases

| Situation | Handling |
|-----------|----------|
| Two devices connect to each other simultaneously | Keep the link from the lower `deviceId`; close the duplicate. |
| A relay walks away / link drops | Neighbor removed; messages flood via any remaining path. Contact goes offline after presence timeout. |
| Message loops in a ring topology | Seen-set + TTL stop rebroadcast. |
| Broadcast storm (too much rebroadcasting) | TTL cap, seen-set, and split-horizon bound total traffic. |
| Recipient offline / unreachable | Message expires (TTL/retries exhausted); sender shows "not delivered." |
| Same display name on two devices | Irrelevant — routing uses `deviceId`, names are cosmetic. |
| App killed in background | Foreground service keeps relay alive; without it, relaying stops until reopened. |
| Duplicate PRESENCE | Ignored via `seq` comparison. |

---

## 14. Worked Example: 5 Devices

Topology (a line): **Alice → Bob → Carol → Dave → Eve**, each ~10 m apart.

**Setup**
- Bob, Carol, Dave open NINE → tap **Relay Mode** → tap **Allow**. They do nothing more.
- Alice and Eve open NINE in normal Chat mode.

**Neighbor links formed**
```
Alice ↔ Bob ↔ Carol ↔ Dave ↔ Eve
```
Alice cannot see Carol/Dave/Eve in Bluetooth scan — only Bob.

**Presence**
- Eve's PRESENCE floods: Eve → Dave → Carol → Bob → Alice. Now Alice's contact list shows **Eve (online)**.

**Sending "hi" from Alice to Eve**
1. Alice encrypts "hi" with Eve's public key → `payload`. Builds `MSG { msgId, srcId=Alice, dstId=Eve, ttl=5, payload }`.
2. Alice → Bob. Bob: not for me, ttl 5→4, forward to Carol.
3. Carol: ttl 4→3, forward to Dave.
4. Dave: ttl 3→2, forward to Eve.
5. Eve: `dstId==me`, decrypts, shows "hi from Alice", floods `ACK`.
6. `ACK` travels Eve → Dave → Carol → Bob → Alice. Alice marks the message **delivered**.

Bob, Carol, and Dave forwarded ciphertext and never read "hi".

---

## 15. Constraints and Limitations

- **Range per hop** is still ~10 m; you need enough relays to cover the gap with no link exceeding range.
- **Simultaneous links** per device are limited by Bluetooth (a handful); fine for a line of 4–5, not for dense meshes.
- **The discoverable "Allow" prompt** cannot be removed — Android security requirement.
- **Background survival** depends on a foreground service and vendor battery settings.
- **Metadata privacy** is not provided in v1.
- **Latency** grows with hop count; each hop adds transfer + processing time.
- **Flooding overhead** grows if many devices are present; acceptable at this scale.

---

## 16. Implementation Plan

Incremental steps on top of `BluetoothChatActivity` (status marked):

1. [x] **Identity**: generate and persist `deviceId` (UUID) + editable `name`.
2. [x] **Packet layer**: `Packet` model + length-prefixed JSON framing replacing raw strings.
3. [x] **Multi-neighbor manager**: `NeighborManager` holding `deviceId → link` with a read loop per link and duplicate-link resolution.
4. [x] **Auto-connect / auto-accept**: continuous accept loop + periodic scan-and-connect (in Relay Mode), with link deduplication.
5. [x] **Presence**: timer-based PRESENCE emit + rebroadcast + contact list with online/offline timeouts.
6. [x] **Contact UI**: "People online" list separate from "Nearby devices"; choose chat target from it.
7. [x] **Forwarding**: seen-set + TTL flooding for `MSG`, `PRESENCE`, and `LOCATION`.
8. [x] **Relay Mode**: dedicated tab + foreground service + hands-off auto-forward with live status.
9. [x] **Encryption**: RSA key pairs, public keys via PRESENCE, AES-GCM payloads.
10. [x] **ACK + retries**: delivery confirmation with inline ✓✓ / ✗ status and re-send.
11. [x] **Offline map + location sharing**: osmdroid Map tab, area download, GPS position, `LOCATION` packets plotted as peer pins (see section 19).
12. [ ] **Move networking into `RelayService`** for true background relaying.
13. [ ] **(Optional) store-and-forward**, metadata hardening, encrypted location.

---

## 17. Testing Plan

- **2 devices, in range**: direct chat still works after the packet-layer refactor.
- **3 devices, line**: A ↔ R ↔ B with A and B out of direct range; verify relay forwards and A/B don't see each other in Bluetooth scan.
- **Presence**: confirm A lists B as online only after presence floods through R.
- **Loop test**: arrange a triangle (A-B-C all connected) and confirm no infinite rebrobroadcast (seen-set/TTL work).
- **Encryption**: confirm the relay logs/shows only ciphertext; recipient decrypts correctly.
- **Link drop**: remove a relay mid-conversation; confirm graceful failure and offline marking.
- **Background**: lock the relay phone; confirm forwarding continues via the foreground service.
- **5 devices, line**: full end-to-end delivery + ACK across four hops.

---

## 18. Glossary

- **Node**: a phone running NINE.
- **Neighbor**: a node within direct Bluetooth range with an active link.
- **Hop**: one neighbor-to-neighbor transfer.
- **TTL (time-to-live)**: max hops a message may travel before being dropped.
- **Flooding**: forwarding a message to all neighbors except the one it came from.
- **Seen-set**: recent message IDs used to drop duplicates/loops.
- **Presence**: periodic announcement of a device's ID and name.
- **Relay Mode**: hands-off mode where a device only forwards.
- **Endpoint**: a device that is an actual sender or recipient of a message.
- **E2E encryption**: encryption where only the final recipient can read the content.

---

## 19. Offline Map & Location Sharing

Built on top of the mesh, NINE includes an offline map (a **Map** tab) that plots mesh peers using positions shared over the same relay network.

### Components
- **Map rendering**: [osmdroid](https://github.com/osmdroid/osmdroid) with OpenStreetMap tiles. Configured before the `MapView` inflates; `onResume`/`onPause` are forwarded to the map.
- **Your position**: a `MyLocationNewOverlay` shows your GPS location. GPS works offline — it needs no internet or cell signal.
- **Offline area download**: osmdroid's `CacheManager.downloadAreaAsync(...)` caches the tiles currently in view across a few zoom levels, with progress shown in the status line. That area then renders with no connection.

### Location over the mesh
- A new packet type `LOCATION` carries `lat`/`lon` plus the sender's `srcId` and `name`.
- Every presence cycle (~20 s), if location permission is granted and a fix exists, the device floods a `LOCATION` packet (TTL + seen-set, exactly like PRESENCE/MSG).
- On receipt, each device updates that contact's stored position and adds/moves a **pin** on the map labeled `name #shortId`. Relays forward `LOCATION` onward, so peers several hops away still appear.

### Flow
```
Phone A GPS fix ──► LOCATION{srcId=A, lat, lon, ttl=5} ──flood──► ... ──► Phone C
                                                                         └─ plots pin "A #a3f1"
```

### Limitations / notes
- **Tile policy**: the built-in area download pulls from OpenStreetMap's public tile server, whose policy discourages bulk downloading. Use a proper provider (MapTiler/Mapbox) or self-hosted tiles for production.
- **Location privacy**: `LOCATION` packets are currently sent as mesh metadata (not end-to-end encrypted). Encrypting/authenticating location shares is future work.
- **Battery**: sharing GPS periodically and running the map both consume power.
- **Internet is needed once** to download the map tiles for an area; after that the map is fully offline.
