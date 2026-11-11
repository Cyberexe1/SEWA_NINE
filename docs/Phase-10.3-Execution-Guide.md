# Phase 10.3 — Hardware Validation Execution Guide

## Prerequisites

Before you can run Phase 10.3:

1. **Android SDK** must be installed (`ANDROID_HOME` set, or `local.properties` with `sdk.dir`)
2. **Two Android phones** (API 23+, Bluetooth Classic), charged to ≥80%
3. **USB debugging** enabled on both devices, or Wi-Fi ADB configured
4. **Grant permissions** on both devices after first install

---

## Step 1: Build the APK

```bash
cd "e:\personal projects\Project_NINE"

# Create local.properties if missing
echo "sdk.dir=C:\\Users\\<YOU>\\AppData\\Local\\Android\\Sdk" > local.properties

# Build debug APK
.\gradlew.bat assembleDebug
```

The APK will be at: `app/build/outputs/apk/debug/app-debug.apk`

---

## Step 2: Install on Both Devices

```bash
adb -s <device-A-serial> install app/build/outputs/apk/debug/app-debug.apk
adb -s <device-B-serial> install app/build/outputs/apk/debug/app-debug.apk
```

---

## Step 3: Integration Point

The existing `BluetoothChatActivity` uses its own JSON mesh protocol.
To test `NineTransportService` specifically, you have two options:

### Option A: Minimal Test Activity (recommended for first validation)
Create a temporary test Activity that:
1. Creates `NineTransportService`
2. Calls `initialize()`
3. Calls `startDiscovery()`
4. On peer found → calls `connect(address)`
5. On connected → calls `send(address, testPacket)`
6. Logs all `TransportListener` callbacks

### Option B: Integrate into existing app
Wire `NineTransportService` into the existing relay/chat flow by
replacing the `NeighborManager`/`Link`/`Packet` layer with NINE transport
calls. This is the full integration (Phase 11 scope).

---

## Step 4: Execute Validation Cases

### V01 — Single device startup
1. Launch the app on Device A
2. Verify logcat shows: `NineTransport: Transport initialized. Accept loop running.`
3. ✅ PASS if no crash and state = READY

### V02 — Permission request
1. Fresh install (clear app data)
2. Launch → verify permission dialog appears
3. Grant all → verify `hasAllPermissions()` returns true in logcat
4. ✅ PASS if transport initializes after grant

### V03 — Bluetooth disabled
1. Turn off Bluetooth on Device A
2. Call `initialize()`
3. Verify logcat shows: `BLUETOOTH_DISABLED`
4. ✅ PASS if error reported, no crash

### V04 — Discovery
1. Both devices initialized
2. Device A calls `startDiscovery()`
3. Verify logcat shows: `Discovered: <DeviceB-name> [<address>]`
4. Record time from startDiscovery → first onPeerDiscovered callback
5. ✅ PASS if Device B appears within 15 seconds

### V05 — Connection establishment
1. Device A calls `connect(deviceB_address)`
2. Verify logcat shows: `Connected to <address>` on A
3. Verify logcat shows: `Accepted inbound connection from <address>` on B
4. Record connection time (from connect call to onPeerConnected callback)
5. ✅ PASS if both sides report connected

### V06 — Bidirectional packet exchange
1. Device A calls `send(B_address, testBytes)`
2. Verify Device B's `onDataReceived` callback fires with identical bytes
3. Device B calls `send(A_address, responseBytes)`
4. Verify Device A's `onDataReceived` callback fires with identical bytes
5. Record round-trip time
6. ✅ PASS if both directions deliver intact data

### V07 — Clean disconnect
1. Device A calls `disconnect(B_address)`
2. Verify Device A logs: `Disconnected from <address>`
3. Verify Device B's `onPeerDisconnected` fires (read loop EOF)
4. Verify `getConnectionCount()` returns 0 on both
5. ✅ PASS if cleanup is complete, no crash

---

## Step 5: Collect Data

Fill in `docs/Benchmarks.md` with measured values from Steps V04–V06.

---

## Step 6: Record Results

Update `docs/Android-Hardware-Validation.md`:
- Check off completed items in the execution checklist
- Add the validation date
- Record device models and Android versions used
- Note any unexpected behaviors

---

## Step 7: Logcat Commands

```bash
# Filter for NINE transport logs
adb -s <serial> logcat -s NineTransport:* NineDiscovery:* NineBluetoothAdapter:*

# Full log (verbose, for debugging)
adb -s <serial> logcat | findstr "p2pchat\|NineTransport"
```

---

## Expected Outcome

If V01–V07 all pass with no crashes and reasonable latencies (<5s connect, <200ms packet), the transport layer is validated and ready for v0.9.1-alpha tagging.

If issues are found, document them in `docs/Benchmarks.md` Section 7 (Issues Discovered) with root cause and recommended fix.

---

*This guide is for human execution on physical hardware. No automated CI can run Bluetooth Classic tests.*
