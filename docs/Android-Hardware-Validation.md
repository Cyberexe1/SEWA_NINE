# NINE — Android Hardware Validation Plan

## Document Metadata

| Field | Value |
|-------|-------|
| Phase | 10.0 (planning only — no code changes) |
| Date | 2026-07-18 |
| Baseline | v0.9.0-alpha |
| Prerequisite | Real `IBluetoothAdapter` implementation wrapping Android APIs |
| Status | Plan — not yet executed |

---

## 1. Hardware Requirements

### 1.1 Minimum Android Version

| Requirement | Value | Rationale |
|-------------|-------|-----------|
| Minimum SDK | API 23 (Android 6.0) | Matches `app/build.gradle` minSdk; Bluetooth Classic RFCOMM available |
| Target SDK | API 34 (Android 14) | Matches `app/build.gradle` targetSdk |
| Recommended | API 31+ (Android 12+) | Simplified Bluetooth permission model (`BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, `BLUETOOTH_ADVERTISE`) |

### 1.2 Bluetooth Version

| Requirement | Value | Rationale |
|-------------|-------|-----------|
| Minimum | Bluetooth 4.0 (Classic + LE) | RFCOMM requires Bluetooth Classic; all modern Android devices include this |
| Recommended | Bluetooth 5.0+ | Improved range (~40m indoor), higher throughput, better coexistence with Wi-Fi |
| Profile | SPP (Serial Port Profile) via RFCOMM | UUID `00001101-0000-1000-8000-00805F9B34FB` — standard SPP |

### 1.3 Required Permissions

| Permission | API Level | Purpose |
|-----------|-----------|---------|
| `BLUETOOTH_CONNECT` | 31+ | Connect to paired/discovered devices |
| `BLUETOOTH_SCAN` | 31+ | Discover nearby devices |
| `BLUETOOTH_ADVERTISE` | 31+ | Make device discoverable |
| `ACCESS_FINE_LOCATION` | 23–30 | Required for BT discovery on older APIs |
| `ACCESS_COARSE_LOCATION` | 23–30 | Fallback location permission |
| `FOREGROUND_SERVICE` | 26+ | Keep relay mode alive in background |
| `FOREGROUND_SERVICE_CONNECTED_DEVICE` | 34+ | Foreground service type for BT |
| `POST_NOTIFICATIONS` | 33+ | Relay mode notification |

### 1.4 Device Recommendations

| Role | Recommendation | Quantity |
|------|---------------|----------|
| Admin node | Any device API 31+, good battery | 1 |
| User nodes | Any device API 23+, Bluetooth Classic | 3–5 |
| Relay nodes | Same as user, can be older/cheaper | 2–3 |
| **Total minimum** | | **5 devices** |
| **Recommended** | | **7–8 devices** |

Suggested models (widely available, known good BT Classic):
- Samsung Galaxy A-series (A14, A24, A54)
- Google Pixel 4a/5a/6a
- Xiaomi Redmi Note series
- Any device with Android 12+ for simplified permissions

### 1.5 Battery Requirements

| Requirement | Value |
|-------------|-------|
| Minimum charge at test start | 80% |
| For long-duration tests | 100% or connected to power |
| Expected consumption rate | ~5–10% per hour with active BT (varies by device) |
| Relay mode battery impact | Higher due to continuous scanning + foreground service |

---

## 2. Test Environment

### 2.1 Physical Topology

```
Scenario A: Linear chain (range testing)
  [A] ─── 5m ─── [B] ─── 5m ─── [C] ─── 5m ─── [D] ─── 5m ─── [E]

Scenario B: Star (broadcast testing)
           [B]
            │ 3m
  [C] ── 3m ── [A/Admin] ── 3m ── [D]
            │ 3m
           [E]

Scenario C: Diamond (dual-path testing)
              [B]
             / 5m \
  [A] ─ 5m ─       ─ 5m ─ [D/Admin]
             \ 5m /
              [C]

Scenario D: Multi-floor (building demo)
  Floor 2: [D] ─── [E]
              \
  Floor 1: [A] ─── [B] ─── [C/Admin]
```

### 2.2 Distance Between Devices

| Configuration | Distance | Expected behavior |
|---------------|----------|-------------------|
| Close range | 1–3 meters | Reliable, fast connection |
| Normal range | 5–8 meters | Standard operation |
| Extended range | 10–15 meters | Edge of BT Classic range; possible packet loss |
| Out of range | >15 meters (no line of sight) | Connection drops expected |

### 2.3 Indoor/Outdoor

| Environment | Considerations |
|-------------|----------------|
| Indoor (lab/room) | Walls reduce range; multipath reflections; consistent |
| Indoor (multi-room) | Doors/walls attenuate signal; tests relay necessity |
| Indoor (multi-floor) | Floor/ceiling attenuate heavily; relay required |
| Outdoor | Extended range possible; fewer reflections; variable |

**Primary test environment**: Indoor laboratory/classroom (controlled, repeatable).

### 2.4 Interference Considerations

| Source | Impact | Mitigation |
|--------|--------|------------|
| Wi-Fi (2.4 GHz) | BT Classic shares 2.4 GHz band; may cause interference | Test with Wi-Fi on and off; document differences |
| Other BT devices | May slow discovery; unlikely to block RFCOMM | Remove unnecessary BT peripherals during testing |
| Microwave ovens | Strong 2.4 GHz interference | Avoid testing near active microwaves |
| USB 3.0 | Known to emit 2.4 GHz noise | Use USB 2.0 cables near test devices |
| Crowded lecture halls | Many phones with BT on | Test in low-occupancy environments |

### 2.5 Wi-Fi Coexistence

Bluetooth Classic and Wi-Fi share the 2.4 GHz ISM band. Modern devices use Adaptive Frequency Hopping (AFH) to avoid occupied Wi-Fi channels.

| Test condition | Purpose |
|---------------|---------|
| Wi-Fi OFF on all devices | Baseline (best BT performance) |
| Wi-Fi ON, connected to AP | Realistic scenario; measure degradation |
| Wi-Fi ON, active streaming | Worst case; heavy 2.4 GHz congestion |

---

## 3. Validation Matrix

| ID | Scenario | Devices | Topology | Pass Criteria | Priority |
|----|----------|---------|----------|---------------|----------|
| V01 | Single device startup | 1 | N/A | App launches, BT initializes, accept loop starts, state reaches READY | P0 |
| V02 | Two-device discovery | 2 | A↔B (3m) | Both devices discover each other via `PEER_DISCOVERED` event within 15s | P0 |
| V03 | Two-device connection | 2 | A↔B (3m) | RFCOMM connection established, `CONNECTION_ESTABLISHED` event fires on both | P0 |
| V04 | Two-device send/receive | 2 | A↔B (3m) | Framed packet sent from A arrives intact at B via `DATA_RECEIVED` event | P0 |
| V05 | Two-device broadcast | 2 | A↔B (3m) | NineCore broadcast from A is delivered to B's `onBroadcast` callback | P0 |
| V06 | Three-device relay | 3 | A─B─C (linear, 5m gaps) | Broadcast from A reaches C via relay through B | P0 |
| V07 | Multi-hop routing | 4 | A─B─C─D (linear) | Unicast from A to D discovered and delivered via route discovery | P1 |
| V08 | Broadcast delivery (star) | 5 | Star (A center) | Broadcast from A reaches all 4 leaf nodes | P1 |
| V09 | Connection loss detection | 2 | A↔B | Power off B → A detects `CONNECTION_LOST` within heartbeat timeout | P0 |
| V10 | Reconnect after loss | 2 | A↔B | After B returns, A re-discovers and reconnects successfully | P1 |
| V11 | Node join (mesh grows) | 3→4 | Linear, D joins | D powers on, is discovered, connects, receives subsequent broadcasts | P1 |
| V12 | Node leave (mesh shrinks) | 4→3 | Linear, B leaves | Routes through B invalidated, messages via alternate path (if available) or queued | P1 |
| V13 | Large packet transfer | 2 | A↔B | 4096-byte packet (MAX_PACKET_SIZE) transmitted and received intact | P1 |
| V14 | Continuous traffic (100 msgs) | 2 | A↔B | 100 sequential broadcasts, all delivered, zero loss, correct order | P1 |
| V15 | Long-duration stability (30 min) | 3 | A─B─C | Periodic broadcasts every 10s for 30 minutes; zero crashes, <5% loss | P2 |
| V16 | Secure message delivery | 3 | A─B─Admin | User A sends encrypted message to Admin; Admin decrypts correctly | P1 |
| V17 | Dual-path delivery | 4 | Diamond (A,B,C,Admin) | ENCRYPTED_MESSAGE and KEY_PACKET travel disjoint paths; Admin decrypts | P2 |
| V18 | Max connections (7 peers) | 8 | Star (center connects to 7) | Center maintains 7 simultaneous links; 8th is rejected by policy | P2 |
| V19 | Range boundary | 2 | A↔B (increasing distance) | Determine actual max reliable range; document at what distance loss begins | P2 |
| V20 | Background relay (screen off) | 3 | A─B(relay)─C | B in relay mode with screen off; messages still relay via foreground service | P1 |

---

## 4. Performance Metrics

### 4.1 Measurement Methods

| Metric | How to Measure |
|--------|---------------|
| **Connection establishment time** | Timestamp at `connect()` call → timestamp at `CONNECTION_ESTABLISHED` event. Measure 10 times, report min/avg/max. |
| **Discovery time** | Timestamp at `startDiscovery()` → timestamp of first `PEER_DISCOVERED` event. Repeat 5 times per device pair. |
| **Packet latency (one-way)** | Embed send timestamp in payload; receiver computes `receiveTime - sendTime`. Requires clock sync (or use round-trip / 2). |
| **Round-trip latency** | Send a packet, receiver echoes back immediately. Measure `echo_received - original_sent`. Report over 50 samples. |
| **Throughput** | Send N packets of known size, measure total transfer time. `throughput = (N × packetSize) / elapsed`. |
| **Hop latency** | In a linear chain A→B→C, measure end-to-end latency and divide by hop count. Compare with direct (1-hop) latency. |
| **Packet loss** | Send N packets with sequence numbers. Count received. `loss = (N - received) / N × 100%`. |
| **Reconnect time** | Timestamp at `CONNECTION_LOST` → timestamp at next `CONNECTION_ESTABLISHED` for the same peer. |
| **Battery consumption** | Record battery % at start and end of a fixed-duration test. Normalize to %/hour. |
| **Memory usage** | Use Android Studio profiler or `adb shell dumpsys meminfo <package>`. Record RSS at start, after 100 messages, after 30 min. |
| **CPU usage** | Use `adb shell top` or Android profiler. Record average CPU% during active mesh communication. |

### 4.2 Target Performance Ranges

| Metric | Target | Acceptable | Failure |
|--------|--------|------------|---------|
| Connection time | <3s | <5s | >10s |
| Discovery time | <5s | <12s | >15s |
| One-hop latency | <100ms | <200ms | >500ms |
| Three-hop latency | <400ms | <800ms | >2000ms |
| Throughput (1-hop) | >50 KB/s | >20 KB/s | <10 KB/s |
| Packet loss (1-hop, close range) | 0% | <2% | >5% |
| Packet loss (3-hop) | <2% | <5% | >10% |
| Reconnect time | <5s | <15s | >30s |
| Battery (%/hour, relay mode) | <5% | <10% | >15% |

---

## 5. Failure Scenarios

| ID | Failure | Injection Method | Expected Behavior | Verification |
|----|---------|-----------------|-------------------|--------------|
| F01 | Device powered off | Turn off peer device | `CONNECTION_LOST` emitted within 15s (heartbeat timeout equivalent); routes invalidated | Check event log; send a message afterward — should trigger route rediscovery |
| F02 | Bluetooth disabled | Toggle BT off in settings | Transport detects adapter disabled; emits ERROR event; existing connections lost | Verify `CONNECTION_LOST` for each active link; verify transport enters ERROR state |
| F03 | Out of range | Walk device beyond ~15m | RFCOMM socket eventually throws IOException; `CONNECTION_LOST` emitted | Measure time to detection; verify cleanup |
| F04 | Rapid reconnect | Disconnect and immediately reconnect | ConnectionPolicy cooldown enforced; second attempt delayed by `reconnectCooldownMs` | Verify denial with `RECONNECT_COOLDOWN` reason; verify success after cooldown |
| F05 | Simultaneous disconnects | Power off 2 relay nodes at once | All routes through both nodes invalidated; pending messages dropped after timeout | Verify all `CONNECTION_LOST` events fire; verify NineCore remains stable |
| F06 | Packet corruption | N/A — RFCOMM is reliable | RFCOMM guarantees integrity; CRC-32 at protocol level is a second check | If somehow corrupted: verify `verifyChecksum()` rejects and packet is dropped |
| F07 | Transport restart | Call `shutdown()` then `initialize()` | All connections lost; accept loop restarted; state returns to READY; new connections possible | Verify full lifecycle; verify subsequent send/receive works |
| F08 | Application restart | Force-kill and relaunch app | Fresh `initialize()`; new session; old peers must re-discover | Verify no stale state from previous session; verify new discovery succeeds |
| F09 | Backoff exhaustion (blacklist) | Fail connection 5 consecutive times | Peer blacklisted; `CONNECTION_DENIED: PEER_BLACKLISTED` on subsequent attempts | Verify `resetPeer()` clears blacklist and allows connection |
| F10 | Server socket failure | N/A (rare; simulated in unit tests) | Accept loop exits; no new inbound connections accepted | Verify existing connections unaffected; verify error logged |

---

## 6. Acceptance Criteria

### 6.1 Mandatory (must pass for release approval)

| Criterion | Threshold |
|-----------|-----------|
| V01–V06 (basic connectivity) | 100% pass rate |
| V09 (connection loss detection) | Detected within 15 seconds |
| Two-device packet delivery | Zero loss at close range (3m) over 100 packets |
| Three-device relay delivery | ≥95% delivery rate over 100 broadcasts |
| Connection establishment | ≤5 seconds average |
| Application stability | Zero crashes in 30-minute continuous test |
| Memory stability | No unbounded growth (RSS increase <20 MB over 30 min) |

### 6.2 Desirable (should pass, minor issues acceptable)

| Criterion | Threshold |
|-----------|-----------|
| V07–V08, V16 (multi-hop, secure) | ≥90% pass rate |
| Four-hop latency | ≤1000ms average |
| Background relay (V20) | Messages relay with screen off for ≥10 minutes |
| Max connections (V18) | Successfully maintains 7 links simultaneously |
| Reconnect time | ≤15 seconds average |

### 6.3 Informational (measure and document, no pass/fail)

| Criterion | Purpose |
|-----------|---------|
| V19 (range boundary) | Determine real-world max range |
| V17 (dual-path) | Verify dual-path works on hardware topology |
| V15 (long-duration) | Characterize stability over time |
| Battery per hour | Characterize power consumption |
| CPU average | Characterize processing overhead |

---

## 7. Known Limitations (v0.9.0-alpha)

| Limitation | Impact on hardware validation |
|-----------|-------------------------------|
| TransportHandshake not implemented | PeerID → NodeID mapping must be done manually (or use PeerID as NodeID directly for testing) |
| Discovery protocol (DISCOVERY/DISCOVERY_RESPONSE) not implemented | Peer discovery relies on transport-layer `PEER_DISCOVERED` events only; no protocol-level handshake |
| Heartbeat emission not wired | Neighbor liveness detection depends on read-loop EOF rather than periodic heartbeat packets |
| Ed25519 signing absent | SIGNED flag not set on secure packets; does not affect delivery — only means relay nodes cannot verify sender authenticity |
| No reconnection scheduler | After connection loss, reconnection must be triggered manually or via periodic discovery scans |
| Auto-connect not built into BluetoothTransport | Relay Mode's auto-connect behavior (connecting to every discovered device) must be implemented at the application layer on top of the transport |
| `IBluetoothAdapter` is an abstraction only | The actual Android implementation wrapping `BluetoothAdapter`, `BroadcastReceiver`, and `BluetoothSocket` must be built before hardware testing can begin |

---

## 8. Execution Checklist

### Pre-Test Setup

- [ ] Flash/install NINE APK on all test devices
- [ ] Verify all devices meet minimum SDK requirement (API 23+)
- [ ] Grant all required Bluetooth + location permissions on each device
- [ ] Disable battery optimization for NINE on each device
- [ ] Charge all devices to ≥80%
- [ ] Clear any paired Bluetooth devices from prior sessions
- [ ] Disable Wi-Fi on all devices (for baseline tests; re-enable for coexistence tests)
- [ ] Prepare a stopwatch/timer for latency measurements
- [ ] Prepare a spreadsheet matching the data collection templates (Section 9)
- [ ] Designate one device as Admin, assign node IDs
- [ ] Position devices according to the required topology (Section 2.1)
- [ ] Verify adb access to all devices (for logs and profiling)

### Test Execution Order

**Day 1: Basic Connectivity (est. 2 hours)**
- [ ] V01: Single device startup — verify READY state
- [ ] V02: Two-device discovery — measure discovery time (5 trials)
- [ ] V03: Two-device connection — measure connection time (5 trials)
- [ ] V04: Two-device send/receive — verify framed data arrives intact
- [ ] V05: Two-device broadcast — verify NineCore broadcast delivery
- [ ] V09: Connection loss — power off peer, verify detection
- [ ] F01: Device powered off — verify cleanup
- [ ] F02: Bluetooth disabled — verify error state

**Day 2: Relay & Multi-Hop (est. 3 hours)**
- [ ] V06: Three-device relay — broadcast propagation via intermediate node
- [ ] V07: Multi-hop routing — 4-device route discovery + delivery
- [ ] V08: Broadcast star topology — 5-device broadcast to all
- [ ] V10: Reconnect after loss — verify re-discovery and reconnection
- [ ] V11: Node join — verify new node integrates into mesh
- [ ] V12: Node leave — verify route invalidation and recovery
- [ ] V20: Background relay — verify relay works with screen off
- [ ] F04: Rapid reconnect — verify cooldown enforcement
- [ ] F05: Simultaneous disconnects — verify stability

**Day 3: Performance & Stress (est. 3 hours)**
- [ ] V13: Large packet (4096 bytes) — verify max-size delivery
- [ ] V14: Continuous traffic (100 msgs) — measure loss rate
- [ ] V15: Long-duration stability (30 min) — monitor for crashes/leaks
- [ ] V16: Secure message delivery — verify encryption end-to-end
- [ ] V18: Max connections (7 peers) — verify piconet limit
- [ ] V19: Range boundary — incrementally increase distance
- [ ] Collect latency data (50 samples per hop count)
- [ ] Collect throughput data
- [ ] Collect battery data (30-min relay session)
- [ ] F07: Transport restart — verify lifecycle recovery
- [ ] F08: Application restart — verify fresh session

**Day 4 (optional): Dual-Path & Edge Cases (est. 2 hours)**
- [ ] V17: Dual-path delivery — diamond topology, verify disjoint paths
- [ ] Wi-Fi coexistence test (BT performance with Wi-Fi active)
- [ ] Multi-floor test (if available)
- [ ] F03: Out-of-range walkaway — measure detection time vs distance
- [ ] F09: Backoff exhaustion — verify blacklisting and reset

### Post-Test

- [ ] Collect all data templates into a single report
- [ ] Note any unexpected behaviors or crashes
- [ ] Record device models, Android versions, and Bluetooth versions used
- [ ] Calculate pass/fail for each acceptance criterion (Section 6)
- [ ] Produce a summary table: tests run / passed / failed / informational
- [ ] File bugs for any failures with reproduction steps

---

## 9. Data Collection Templates

### 9.1 Latency Data

| Trial | Hops | Send Time | Receive Time | Latency (ms) | Notes |
|-------|------|-----------|--------------|---------------|-------|
| 1 | 1 | | | | |
| 2 | 1 | | | | |
| 3 | 1 | | | | |
| ... | | | | | |
| 1 | 2 | | | | |
| 2 | 2 | | | | |
| ... | | | | | |
| 1 | 3 | | | | |
| ... | | | | | |

**Summary**: min=___ avg=___ max=___ (per hop count)

### 9.2 Throughput Data

| Trial | Packet Size (bytes) | Packets Sent | Duration (ms) | Throughput (KB/s) | Loss % |
|-------|--------------------:|-------------:|--------------:|------------------:|-------:|
| 1 | 256 | 100 | | | |
| 2 | 1024 | 100 | | | |
| 3 | 4096 | 100 | | | |
| ... | | | | | |

### 9.3 Packet Loss Data

| Trial | Topology | Packets Sent | Packets Received | Loss % | Duration | Notes |
|-------|----------|-------------:|----------------:|-------:|---------:|-------|
| 1 | 1-hop (3m) | 100 | | | | |
| 2 | 1-hop (8m) | 100 | | | | |
| 3 | 2-hop (5m each) | 100 | | | | |
| 4 | 3-hop (5m each) | 100 | | | | |
| ... | | | | | | |

### 9.4 Battery Data

| Device | Role | Start % | End % | Duration (min) | Drain %/hr | BT Mode | Notes |
|--------|------|--------:|------:|--------------:|-----------:|---------|-------|
| | User | | | | | Active chat | |
| | Relay | | | | | Relay mode | |
| | Admin | | | | | Active receive | |
| ... | | | | | | | |

### 9.5 Connection Time Data

| Trial | Initiator | Target | Discovery (ms) | Connect (ms) | Total (ms) | Notes |
|-------|-----------|--------|---------------:|-------------:|-----------:|-------|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

**Summary**: Discovery avg=___ Connect avg=___ Total avg=___

### 9.6 Observations Log

| Time | Device | Event | Observation | Severity |
|------|--------|-------|-------------|----------|
| | | | | |
| | | | | |
| | | | | |

---

*End of Android Hardware Validation Plan. No source code was modified.*
