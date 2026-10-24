# NINE — Offline Bluetooth Chat with Multi-Hop Relay

NINE is an Android messaging app that lets people chat **without internet, Wi-Fi, or cellular service**. Devices talk directly to each other over Bluetooth. To reach people who are too far away for a direct connection, NINE uses a **multi-hop relay mesh**: other phones running NINE quietly pass messages along, extending the effective range across several devices.

---

## Table of Contents

1. [What NINE Does](#what-nine-does)
2. [Current Features](#current-features)
3. [The Range Problem](#the-range-problem)
4. [The Solution: Multi-Hop Relay Mesh](#the-solution-multi-hop-relay-mesh)
5. [How Devices Connect](#how-devices-connect)
6. [Relay Mode (Hands-Off Forwarding)](#relay-mode-hands-off-forwarding)
7. [Message Format and Routing](#message-format-and-routing)
8. [Privacy and Encryption](#privacy-and-encryption)
9. [Example: 5-Device Chain](#example-5-device-chain)
10. [Requirements](#requirements)
11. [Build and Install](#build-and-install)
12. [Usage](#usage)
13. [Permissions](#permissions)
14. [Technical Details](#technical-details)
15. [Troubleshooting](#troubleshooting)
16. [Project Structure](#project-structure)
17. [Roadmap](#roadmap)

---

## What NINE Does

NINE creates a local, off-grid chat network between Android phones. It is useful when there is no infrastructure — festivals, remote areas, disaster zones, or anywhere the internet is unavailable or untrusted. Communication happens entirely over Bluetooth radio between nearby devices.

---

## Current Features

These are implemented today:

- **One-tap Connect**: A single **Connect** button starts listening, becomes discoverable, and scans for peers all at once.
- **Multi-hop relay mesh**: Messages hop across intermediate phones (controlled flooding with TTL + duplicate detection) to reach people who are out of direct Bluetooth range.
- **Unique device identity**: Every install gets a permanent UUID (shown as a short `#XXXX` tag), so people with the same display name are never confused.
- **People Online (mesh contacts)**: Presence announcements propagate through the mesh, so you can see and message people you're not directly connected to.
- **Targeted, end-to-end encrypted messaging**: Pick a person and the message is encrypted (RSA + AES-GCM) so relays forward ciphertext they cannot read. A 🔒 marks encrypted messages.
- **Delivery confirmation**: Addressed messages show "(sending…)", then "✓✓ delivered" or "✗ not delivered", with automatic retries.
- **Relay Mode**: One button turns a phone into a hands-off forwarder (auto-connect, auto-accept, foreground service, live status).
- **Offline map**: A Map tab (OpenStreetMap via osmdroid) shows your GPS position, lets you download your area for offline use, and plots mesh peers as pins from location shared over the mesh.
- **Four-tab UI**: Chat / Relay / Map / Settings with a top-bar connection dot.
- **Editable username** and **connection status dot**.
- **Offline**: No internet, account, or server required (internet is used only to download map tiles for offline use).

---

## The Range Problem

Most phones use **Bluetooth Class 2**, which reaches roughly **10 meters** in practice, and less through walls or bodies. That means two people more than ~10 meters apart usually cannot connect directly.

The goal is to let people chat across longer distances (for example ~30 meters or more) by placing other NINE devices in between to carry the messages forward.

---

## The Solution: Multi-Hop Relay Mesh

NINE extends range by turning intermediate devices into **relays**. Instead of Sender → Receiver, messages travel:

```
Sender  →  Relay 1  →  Relay 2  →  Relay 3  →  Receiver
```

Each device only needs to reach its **immediate neighbor**. By chaining several devices, the network spans a distance far greater than any single Bluetooth link. With 4–5 devices you can cover a line of roughly 40–50 meters (about 10 meters per hop), or route around walls and obstacles.

Key ideas:

- **Every device is equal.** The same NINE app acts as sender, receiver, and relay. There is no special hardware or server.
- **Neighbors only.** A device connects over Bluetooth only to devices within its own radio range. It does not — and cannot — directly connect to distant devices.
- **App-level routing.** Messages are addressed to a person's **app ID**, not to a Bluetooth address. Relays forward each message toward its destination based on that ID.

---

## How Devices Connect

There are two separate concepts, and it is important to keep them apart:

**1. Nearby Bluetooth devices (physical neighbors)**
Bluetooth scanning can only see devices in direct radio range. If the sender and receiver are far apart, they will **not** appear in each other's scan lists. Each device only sees the relays physically near it. This is expected — it is the whole reason relays exist.

**2. People online (mesh contacts)**
To know who is reachable across the entire mesh, each device periodically broadcasts a small **presence announcement** ("I am Bob, ID xyz, online"). Neighbors rebroadcast it hop by hop, so the announcement spreads through the network. This builds an app-level contact list of everyone reachable — even people who are not direct Bluetooth neighbors.

So, when you want to message someone far away, you pick them from the **people-online list** (learned through the mesh), not from the raw Bluetooth device list. The message is then routed to them through the relays.

---

## Relay Mode (Hands-Off Forwarding)

A person in the middle should not have to do any work. NINE provides a single **Relay Mode** button. Once tapped, the device becomes a passive forwarding node:

- turns on discoverability and starts listening,
- automatically accepts connections from nearby NINE devices,
- automatically connects to other nearby NINE devices it discovers,
- forwards every message it receives toward the destination.

The relay user does not type, read, or select anything. The screen simply shows a status like "Relaying… X messages passed."

**What the relay user must do (the practical minimum):**

1. Tap **Relay Mode** once.
2. Tap **Allow** on Android's discoverable system prompt (a security requirement no app can bypass — one tap).
3. Stay physically positioned between the endpoints.
4. Keep NINE running. A **foreground service** (a small persistent notification) keeps the relay alive so the phone can be locked or pocketed while forwarding continues.

After that, forwarding is fully automatic.

---

## Message Format and Routing

Every message is wrapped in an envelope so relays know what to do with it:

| Field | Purpose |
|-------|---------|
| `messageId` | Unique ID, used to detect and drop duplicates |
| `sourceId` | App ID of the original sender |
| `destId` | App ID of the intended recipient |
| `ttl` | Hop limit; decremented at each relay, dropped at 0 |
| `payload` | The (encrypted) message content |

**Forwarding logic (controlled flooding):**

1. A device receives a message.
2. If it has already seen `messageId`, it drops it (prevents loops and broadcast storms).
3. If `destId` is this device, it delivers the message to the user.
4. Otherwise, it decrements `ttl`. If `ttl > 0`, it rebroadcasts the message to its other neighbors.

The `ttl` (for example, start at 5) guarantees a message cannot bounce around the network forever, which is important with 4–5 devices where loops are possible.

---

## Privacy and Encryption

The relay person carries messages but must not be able to read them:

- **End-to-end encryption**: The sender encrypts the message with the recipient's public key before it leaves. Only the recipient can decrypt it. Relays forward **ciphertext** they cannot read.
- **Blind forwarding**: A relay only needs the `destId` to route. It does not need to know who the users are personally.
- **Identity by ID, not name**: Each install generates a stable unique ID (UUID). Display names are only for showing to humans; routing uses the ID, so two people with the same name never get confused.

Relays can still see routing metadata (source/destination IDs). Hiding that too would require onion-style routing, which is out of scope for now.

---

## Example: 5-Device Chain

Suppose Alice wants to message Eve, and they are ~40 meters apart with three friends in between:

```
Alice (sender)
  └── 10 m ──► Bob (relay)
                 └── 10 m ──► Carol (relay)
                                └── 10 m ──► Dave (relay)
                                               └── 10 m ──► Eve (receiver)
```

1. Bob, Carol, and Dave each open NINE and tap **Relay Mode** (then **Allow**). They do nothing else.
2. Each device connects only to its immediate neighbors over Bluetooth.
3. Presence announcements flood the chain, so Alice's app lists **Eve** as online even though Eve is not a Bluetooth neighbor.
4. Alice selects Eve and sends an encrypted message addressed to Eve's ID.
5. The message hops Alice → Bob → Carol → Dave → Eve. Each relay forwards blindly and cannot read it.
6. Eve receives the message and sees it is from Alice.

Neither Alice nor Eve ever sees the other in their raw Bluetooth scan — only the relays they are physically near.

---

## Requirements

- Android 6.0 (API 23) or higher
- Bluetooth hardware
- 2 devices for direct chat; 3 or more for relay testing (4–5 recommended to demonstrate multi-hop)

---

## Build and Install

1. Build the debug APK:
   ```bash
   gradlew assembleDebug
   ```
2. Install on each device:
   ```
   app/build/outputs/apk/debug/app-debug.apk
   ```
3. Grant all requested permissions on first launch.

---

## Usage

### Direct chat (2 devices in range)
1. On both devices, open NINE and tap **Connect**.
2. Tap **Allow** on the discoverable prompt.
3. Each device lists the other under Available Devices; tap it to connect.
4. Start chatting.

### Relayed chat (3–5 devices) — *planned*
1. On the middle devices, open NINE and tap **Relay Mode**, then **Allow**.
2. Place the relay devices between the two endpoints, within ~10 meters of each neighbor.
3. On the sender, pick the recipient from the people-online list and send.

---

## Offline Map & Location Sharing

The **Map** tab uses OpenStreetMap (via the osmdroid library):

- **My Location** centers the map on your GPS position. GPS works fully offline — it needs no internet or cell signal.
- **Download this area** caches the tiles currently in view (across a few zoom levels) so that area works with no connection afterward. The map data download itself needs internet once; after that it is used offline.
- **Peer pins**: each device shares its GPS position through the mesh as a `LOCATION` packet (same flooding + TTL as everything else). Other devices plot those peers as pins, so you can see where people are — even ones several relay hops away — without any internet.

Note on tiles: the built-in "Download this area" uses OpenStreetMap's public tile server, whose policy discourages bulk downloading. For a production release, point it at a proper tile provider (MapTiler, Mapbox) or self-hosted tiles.

## Permissions

**Android 12+**
- Bluetooth Connect, Scan, Advertise
- Location (for showing your position on the map)

**Android 10–11**
- Location (required by Android for Bluetooth discovery, and for the map)

**All versions**
- Internet + Network State — used only to download map tiles for offline use
- Foreground Service (Connected Device) — keeps Relay Mode alive in the background
- Post Notifications — for the Relay Mode notification (Android 13+)

---

## Technical Details

- **Language**: Java
- **Min SDK**: 23 (Android 6.0)
- **Target SDK**: 34 (Android 14)
- **App version**: 1.0.1
- **Transport**: Classic Bluetooth over RFCOMM sockets
- **Direct link**: client-server socket model (one device listens, the other connects)
- **Mesh (planned)**: controlled flooding with message IDs, TTL-based hop limits, presence propagation, and end-to-end encryption

---

## Troubleshooting

**Devices not showing up?**
- Grant all permissions in Settings → Apps → NINE.
- Make sure both devices tapped **Connect** and allowed discoverability.
- Keep devices within ~10 meters for each hop.
- Allow up to ~30 seconds for Bluetooth discovery.

**Connection drops or app stops relaying?**
- Disable battery optimization for NINE.
- Keep the app in the foreground, or use Relay Mode's persistent notification.
- Restart Bluetooth on both devices.

**Messages not reaching a far device?**
- Confirm every relay in the chain is in Relay Mode and within range of its neighbors.
- Check that no gap between two devices exceeds Bluetooth range.

---

## Project Structure

```
app/src/main/
├── java/com/p2pchat/app/
│   ├── MainActivity.java              # Launch screen / entry point
│   ├── BluetoothChatActivity.java     # Tabs, mesh logic, chat, map
│   ├── Packet.java                    # Wire protocol (HELLO/PRESENCE/MSG/ACK/LOCATION)
│   ├── Crypto.java                    # End-to-end encryption (RSA + AES-GCM)
│   └── RelayService.java              # Foreground service for Relay Mode
├── res/
│   ├── layout/                        # UI layouts (tabs, dialogs, list items)
│   ├── menu/                          # Bottom navigation menu
│   ├── drawable/                      # Rounded input backgrounds
│   ├── values/                        # strings, colors, themes
│   └── mipmap-*/                      # App icons
└── AndroidManifest.xml                # App configuration and permissions
```

---

## Roadmap

Done:
- [x] Stable per-device app IDs (UUID) alongside display names
- [x] Message envelope with `messageId`, `sourceId`, `destId`, `ttl`
- [x] Duplicate detection and TTL-based loop prevention
- [x] Multi-neighbor connection manager (many links at once)
- [x] Controlled-flooding forwarding (multi-hop delivery)
- [x] Presence announcements that propagate through the mesh
- [x] "People online" contact list separate from nearby Bluetooth devices
- [x] Targeted messaging by device ID
- [x] End-to-end encryption (RSA + AES-GCM)
- [x] Delivery ACKs with retries and inline status
- [x] Relay Mode button with automatic accept/connect/forward + foreground service
- [x] Offline map (osmdroid) with area download, GPS position, and mesh peer pins

In progress / planned:
- [ ] Move the mesh networking into `RelayService` for true background relaying (currently the app must stay running)
- [ ] Encrypt/authenticate location shares (currently sent as mesh metadata)
- [ ] Metadata privacy (hide who is talking to whom)
- [ ] Device-type filter for Relay Mode auto-connect
- [ ] Production tile provider for offline map downloads

---

## License

Open source — free to modify and use for your own projects.

## References

- [Android Bluetooth Guide](https://developer.android.com/guide/topics/connectivity/bluetooth)
- [Bluetooth Mesh Networking](https://www.bluetooth.com/learn-about-bluetooth/recent-enhancements/mesh/)
