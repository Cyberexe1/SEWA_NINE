# NINE — Android Application (Detailed Technical Documentation)

This document describes **how the NINE Android application works today**: its structure, how Android is used, how Bluetooth is used end to end, the lifecycle, permissions, threading, storage, and every major component. It reflects the current code, not future plans.

> Companion docs: `README.md` (overview), `Relay.md` (mesh design), `docs/NineCore_Android_Integration.md` (protocol-boundary analysis).

---

## 1. What the app is

NINE is an offline, infrastructure-less chat + mesh app for Android. Phones talk directly over **Bluetooth Classic (RFCOMM)**; messages can hop across intermediate phones (a relay mesh) to reach devices out of direct range. It also has an offline map with GPS position sharing.

- **Language:** Java
- **Build:** Gradle (AGP 8.2.2), Gradle wrapper 8.5
- **minSdk 23** (Android 6.0), **targetSdk 34** (Android 14), **compileSdk 34**
- **versionName 1.0.1**, versionCode 2
- **Package / applicationId:** `com.p2pchat.app` (internal identifier; the user-visible name is "NINE")

### Dependencies (`app/build.gradle`)
| Library | Purpose |
|--------|---------|
| `androidx.appcompat:appcompat:1.6.1` | Base activity + compat APIs |
| `com.google.android.material:material:1.10.0` | Bottom navigation (tabs) |
| `androidx.constraintlayout` / `androidx.recyclerview` | UI support |
| `org.osmdroid:osmdroid-android:6.1.18` | Offline OpenStreetMap map view + tile caching |
| `com.graphhopper:graphhopper-core:0.13.0` + `graphhopper-reader-osm:0.13.0` | Offline road routing |

The manifest sets `android:largeHeap="true"` — GraphHopper graph import is memory-heavy, so a larger heap reduces out-of-memory risk during routing preparation.

---

## 2. Android components (the moving parts)

### 2.1 `MainActivity` — launch screen
- Set as the launcher activity (`intent-filter` MAIN/LAUNCHER, `exported="true"`).
- Layout `activity_main.xml`: black background, the `logo`/startup image, and a **"Start Bluetooth Chat"** button.
- On create it calls `checkPermissions()` and requests Bluetooth (or location on older Android) permissions up front.
- The button:
  - checks `BluetoothAdapter.getDefaultAdapter()` is non-null (device supports Bluetooth),
  - if permissions are granted → `startActivity(BluetoothChatActivity)`,
  - otherwise shows a rationale dialog and re-requests.

### 2.2 `BluetoothChatActivity` — the whole app
This single activity hosts everything via a **four-tab layout** (`activity_bluetooth_chat.xml`) switched by a Material `BottomNavigationView`:
- **Chat** — Connect button, connection status line, "People Online" (mesh contacts), "Link a nearby device" (opens a device dialog), messages list, dark rounded input bar.
- **Relay** — Start/Stop Relaying button + live relay status.
- **Map** — osmdroid map, My Location, "Download area (map + routing)", "Download offline routing data", top-left pin button.
- **Settings** — username + edit, device ID, version, permission check.

It owns: Bluetooth adapter, discovery, connections, the mesh protocol, encryption hookup, presence/contacts, ACK/retry, relay mode, and the map/routing UI.

### 2.3 `Packet` — the wire format (app protocol)
- A message unit serialized to **JSON**, framed with a **4-byte big-endian length prefix**: `[len][json][len][json]…`.
- Types: `HELLO`, `PRESENCE`, `MSG`, `ACK`, `LOCATION`.
- Fields: `type, msgId, srcId, dstId, ttl, seq, name, pubKey, payload, lat, lon, timestamp`.
- `writeTo(DataOutputStream)` / `readFrom(DataInputStream)` handle framing; `MAX_FRAME_BYTES = 1,000,000` guards against bad frames.

### 2.4 `Crypto` — end-to-end encryption
- Per-install **RSA-2048** key pair, stored in `SharedPreferences`; public key shared via `PRESENCE`.
- Hybrid scheme: a random **AES-256-GCM** key encrypts the message; that AES key is RSA-encrypted for the recipient. Output tagged `ENC1:<encKey>:<iv>:<ciphertext>`.
- RSA uses OAEP with **SHA-256**. RSA+AES chosen because JCA X25519 isn't available at minSdk 23.
- Only addressed (targeted) messages are encrypted; broadcasts stay plaintext (no single recipient key).

### 2.5 `RelayService` — foreground service
- Keeps the process alive during Relay Mode via an ongoing notification ("NINE is relaying").
- `foregroundServiceType="connectedDevice"`; uses `startForeground(...)` with the connected-device type on Android 10+.

### 2.6 `OfflineRouter` — offline road routing
- Wraps GraphHopper 0.13. Builds a routing graph from a downloaded OSM extract (`.osm`/`.osm.pbf`), supports `car` and `foot`, CH disabled for flexible dual-mode routing.
- `route(...)` returns the road path as lat/lon points, or null if unavailable.

---

## 3. How Bluetooth is used (end to end)

NINE uses **Bluetooth Classic RFCOMM** (serial-style sockets), not BLE. Every device is simultaneously a server (listening) and a client (scanning) — a peer model.

### 3.1 The service UUID
- `MY_UUID = 00001101-0000-1000-8000-00805F9B34FB` — the **standard Serial Port Profile (SPP)** UUID.
- **Caveat:** this is a generic UUID, not NINE-specific. It means the app cannot reliably tell which nearby devices run NINE from discovery alone; non-NINE devices simply fail to connect at the socket stage.

### 3.2 Becoming discoverable
- `makeDiscoverable()` fires `ACTION_REQUEST_DISCOVERABLE` (300 s). This shows an **Android system dialog** the user must accept — no app can bypass it.

### 3.3 Listening (server side) — `AcceptThread`
- `bluetoothAdapter.listenUsingRfcommWithServiceRecord(APP_NAME, MY_UUID)` opens a server socket.
- Loops on `serverSocket.accept()`; each accepted `BluetoothSocket` becomes an **incoming** neighbor link via `neighborManager.addLink(socket, false)`.
- Keeps accepting, so multiple simultaneous connections are supported (required for relaying).

### 3.4 Discovery + connecting (client side)
- `discoverDevices()` → `bluetoothAdapter.startDiscovery()`. Discovered devices arrive via a `BroadcastReceiver` on `ACTION_FOUND`.
- **Important:** the receiver adds *every* discoverable Bluetooth device to the list (no app filter). The "Link a nearby device" dialog therefore shows all nearby devices; only NINE devices actually connect.
- Tapping a device → `connectToDevice(device)` → `device.createRfcommSocketToServiceRecord(MY_UUID)` → `socket.connect()` → `neighborManager.addLink(socket, true)` (**outgoing** link).

### 3.5 A connection = one `Link`
Each `Link` (a `Thread`) owns:
- the `BluetoothSocket`,
- a `DataInputStream` and `DataOutputStream` over the socket streams.

On start it sends a `HELLO` (device id + name). Its read loop calls `Packet.readFrom(dataIn)` and dispatches each packet to `onLinkPacket(...)`. `writePacket(p)` serializes via `Packet.writeTo(dataOut)`. On stream error it removes itself from the manager.

### 3.6 `NeighborManager` — many links at once
- `ConcurrentHashMap<deviceId, Link>` of active neighbors + a set of pending (pre-HELLO) links.
- `registerPeer(link)` keys a link by peer id after HELLO and resolves duplicate links (keeps the one initiated by the lower device id).
- `broadcast(pkt, exclude)` fans a packet out to all neighbors except the source (split-horizon).
- Bounded **seen-set** (`LinkedHashMap`, cap 512) for message-id deduplication / loop prevention.

### 3.7 Message routing (app protocol in `onLinkPacket`)
- **MSG:** if seen → drop; if addressed to me → decrypt + display + send ACK; else decrement `ttl`, and if > 0 re-broadcast (flood) to other neighbors. Broadcasts are delivered to everyone and keep flooding.
- **ACK:** delivered to the original sender (updates the "✓✓ delivered" status) or relayed onward.
- **PRESENCE / LOCATION:** update contacts / map pins, then flood onward (TTL + dedupe).
- **Reliability:** addressed messages are tracked in `Pending`; `retryTask` resends unacked messages up to `MAX_ATTEMPTS` (4) every `RETRY_INTERVAL_MS` (5 s). UI shows "(sending…)" → "✓✓ delivered" / "✗ not delivered".

### 3.8 Range / relaying
- Bluetooth Class 2 ≈ 10 m per hop. Relaying chains hops (A → M → B) so total reach ≈ hop count × per-hop range. TTL default 5 caps hops.

---

## 4. Permissions (manifest + runtime)

| Permission | When | Why |
|-----------|------|-----|
| `BLUETOOTH`, `BLUETOOTH_ADMIN` (`maxSdkVersion=30`) | ≤ Android 11 | Legacy Bluetooth on/scan/connect |
| `BLUETOOTH_CONNECT` | Android 12+ | Connect, name, RFCOMM |
| `BLUETOOTH_SCAN` (`neverForLocation`) | Android 12+ | Device discovery without location derivation |
| `BLUETOOTH_ADVERTISE` | Android 12+ | Be discoverable |
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | All versions | Bluetooth discovery on 10–11 **and** GPS position on the map |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CONNECTED_DEVICE` | Relay Mode | Keep relaying alive in background |
| `POST_NOTIFICATIONS` | Android 13+ | Relay Mode notification |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Map/routing download only | Fetch map tiles + OSM routing data (one-time) |

- `uses-feature android.hardware.bluetooth required="false"` — installable on devices without Bluetooth (feature degrades gracefully).
- Runtime requests: `MainActivity.checkPermissions()` up front; `BluetoothChatActivity` re-requests as needed (Bluetooth on connect, location for the map, notifications for relay).

---

## 5. Android lifecycle & threading

### Lifecycle
- `onCreate`: configures osmdroid (before inflating the MapView), builds the UI, loads identity + keys, initializes Bluetooth, starts the presence/retry timers, loads any saved routing graph.
- `onResume` / `onPause`: forwarded to the osmdroid `MapView` (required by osmdroid).
- `onDestroy`: removes handler callbacks (presence/retry/rescan), stops the relay service if active, closes all neighbor links, unregisters the discovery receiver, cancels discovery.

### Threading model
- **Main thread:** UI, `Handler mainHandler` for posting UI updates and periodic tasks (presence every 20 s, retry every 5 s, relay rescan every 40 s).
- **Per-Link read threads:** each `Link` runs its own blocking read loop; results are posted back to `mainHandler`.
- **AcceptThread:** blocks on `accept()` off the main thread.
- **Ad-hoc worker threads:** outgoing `connectToDevice`, tile/OSM downloads, GraphHopper import, and OSRM route fetches all run on background threads to keep the UI responsive.

---

## 6. Data storage
- **`SharedPreferences` (`P2PChatPrefs`):** username, stable `deviceId` (UUID), RSA key pair (base64).
- **osmdroid prefs (`osmdroid`):** map/tile cache configuration.
- **App files dir (`getFilesDir()`):** downloaded routing data (`region.osm` / `region.osm.pbf`) and the built GraphHopper graph folder (`gh-graph`); osmdroid tile cache.

---

## 7. UI structure
- **Theme:** `Theme.MaterialComponents.Light.NoActionBar` (custom dark top bar instead of the system action bar).
- **Top bar:** "NINE" + connection dot (green connected / red not) + short device-id tag.
- **Bottom navigation:** Chat / Relay / Map / Settings, switching four `LinearLayout` sections in a `FrameLayout`.
- **Input bar:** dark, rounded (`bg_input_bar` / `bg_input_field` drawables), `adjustResize` so it rises above the keyboard.
- **Lists:** `ListView` + `ArrayAdapter` for contacts, messages, and the nearby-devices dialog.

---

## 8. Feature summary (current)
- One-tap Connect (listen + discoverable + scan).
- Multi-hop relay mesh with TTL + dedupe + split-horizon flooding.
- Per-install UUID identity + short tag; presence-propagated "People Online" list.
- Targeted, end-to-end encrypted messaging (RSA-2048 + AES-256-GCM); 🔒 indicator.
- Delivery ACKs + retries with inline status.
- Relay Mode (auto-connect/accept/forward) + foreground service + live status.
- Offline map (osmdroid): My Location, download area (tiles) + routing (OSM/GraphHopper), pin + Direction (Drive/Walk), peer pins from mesh `LOCATION` shares.

---

## 9. Known limitations (as built)
- **Background relaying is incomplete:** networking lives in `BluetoothChatActivity`, so if the activity is destroyed (swiped away) links stop; the foreground service only holds the notification. True background relaying needs the mesh moved into the service.
- **No NINE-only device filter:** discovery lists all Bluetooth devices; the generic SPP UUID can't identify NINE peers pre-connection.
- **Metadata not private:** only message content is encrypted; `srcId`/`dstId` and `LOCATION` are visible to relays.
- **Relay auto-connect noise:** in Relay Mode it attempts to connect to every discovered device; non-NINE ones fail.
- **Routing/tiles need one-time internet** and the two downloads (tiles vs road graph) are region-independent unless the unified "Download area" button is used.
- **GraphHopper import is heavy:** keep offline routing regions small (city-scale), aided by `largeHeap`.
- **The app's protocol is not NineCore:** the built-in `Packet`/`Crypto`/flooding is a separate, self-contained protocol (see `docs/NineCore_Android_Integration.md`).

---

## 10. File map
```
app/src/main/
├── java/com/p2pchat/app/
│   ├── MainActivity.java            # launcher screen + initial permissions
│   ├── BluetoothChatActivity.java   # tabs, Bluetooth mesh, chat, relay, map
│   ├── Packet.java                  # JSON + length-prefixed wire format
│   ├── Crypto.java                  # RSA-2048 + AES-256-GCM E2E encryption
│   ├── OfflineRouter.java           # GraphHopper offline routing wrapper
│   └── RelayService.java            # foreground service for Relay Mode
├── res/
│   ├── layout/                      # activity_main, activity_bluetooth_chat, dialogs, list items
│   ├── menu/bottom_nav_menu.xml     # Chat / Relay / Map / Settings
│   ├── drawable/                    # logo, startup image, rounded input backgrounds
│   ├── values/                      # strings (app_name=NINE), colors, themes
│   └── mipmap-*/                    # legacy launcher icons
└── AndroidManifest.xml              # permissions, activities, RelayService
```
