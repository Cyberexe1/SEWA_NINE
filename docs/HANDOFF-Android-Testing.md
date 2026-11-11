# NINE — Android Hardware Testing Handoff

## For: Android team member with Android Studio access
## From: Protocol/Core team
## Date: 2026-07-18

---

## TL;DR

We built a complete Bluetooth transport layer for the NINE mesh protocol. It's fully tested in software (560 automated tests pass). Now we need someone with **two Android phones + Android Studio** to verify it works over real Bluetooth. Your job is:

1. Build the APK
2. Install on 2 phones
3. Run 7 simple tests
4. Record the numbers
5. Report back any crashes or failures

Estimated time: **1–2 hours**.

---

## What Already Exists

The repository now has a new package: `com.p2pchat.nine` (6 Java classes). These are **separate from the existing chat app** — they don't touch `BluetoothChatActivity`, `Packet.java`, `Crypto.java`, or any existing code.

| Class | What it does |
|-------|-------------|
| `NineTransportService` | The main entry point. Manages connections, discovery, send/receive. |
| `AndroidBluetoothAdapter` | Wraps Android's `BluetoothAdapter` |
| `AndroidBluetoothSocket` | Wraps `BluetoothSocket` for read/write |
| `AndroidBluetoothServerSocket` | Wraps server socket for accepting connections |
| `BluetoothPermissionHelper` | Checks runtime BT permissions (API 23-34) |
| `BluetoothDiscoveryCallback` | BroadcastReceiver for device discovery events |

All files are at: `app/src/main/java/com/p2pchat/nine/`

---

## What You Need To Do

### Step 1: Setup

1. Pull the latest `main` branch
2. Open the project in Android Studio
3. Create `local.properties` in the project root if it doesn't exist:
   ```
   sdk.dir=C:\\Users\\<YOUR_USERNAME>\\AppData\\Local\\Android\\Sdk
   ```
4. Sync Gradle — it should resolve all dependencies

### Step 2: Create a Test Activity

Create a **temporary** test activity to exercise `NineTransportService`. Here's what it needs to do:

```java
package com.p2pchat.nine;

import android.os.Bundle;
import android.util.Log;
import android.widget.Button;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

/**
 * Temporary test activity for validating NineTransportService
 * on real Bluetooth hardware. Delete after validation.
 */
public class NineTestActivity extends AppCompatActivity {

    private static final String TAG = "NineTest";
    private NineTransportService transport;
    private TextView logView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Simple UI: a text log + buttons for init/discover/send
        // (You can design this however you want — the important part
        //  is calling the transport methods and logging results)

        transport = new NineTransportService(this);
        transport.setListener(new NineTransportService.TransportListener() {
            @Override
            public void onDataReceived(String peerId, byte[] data) {
                log("RECEIVED from " + peerId + ": " + data.length + " bytes");
                // Echo back for round-trip test
                transport.send(peerId, data);
            }

            @Override
            public void onPeerConnected(String peerId) {
                log("CONNECTED: " + peerId);
            }

            @Override
            public void onPeerDisconnected(String peerId, String reason) {
                log("DISCONNECTED: " + peerId + " reason=" + reason);
            }

            @Override
            public void onPeerDiscovered(String address, String name, int rssi) {
                log("DISCOVERED: " + name + " [" + address + "] rssi=" + rssi);
            }

            @Override
            public void onDiscoveryFinished() {
                log("DISCOVERY FINISHED");
            }

            @Override
            public void onTransportError(String message) {
                log("ERROR: " + message);
            }
        });
    }

    // Call this from a button
    private void doInitialize() {
        // Request permissions first!
        String[] missing = transport.getAdapter().getPermissions().getMissingPermissions();
        if (missing.length > 0) {
            requestPermissions(missing, 100);
            return;
        }
        transport.initialize();
        log("Transport state: " + transport.getState());
    }

    // Call this from a button
    private void doDiscover() {
        boolean started = transport.startDiscovery();
        log("Discovery started: " + started);
    }

    // Call after a peer is discovered — pass the address
    private void doConnect(String address) {
        transport.connect(address);
    }

    // Call after connected — sends a test packet
    private void doSendTest(String address) {
        byte[] testPacket = "NINE-TEST-PACKET-HELLO".getBytes();
        boolean sent = transport.send(address, testPacket);
        log("Send result: " + sent);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        transport.shutdown();
    }

    private void log(String msg) {
        Log.i(TAG, msg);
        // Also append to your logView if you have one
    }
}
```

Register it in `AndroidManifest.xml`:
```xml
<activity android:name=".nine.NineTestActivity" android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
</activity>
```

(Temporarily make it the launcher, or launch it via adb: `adb shell am start -n com.p2pchat.app/.nine.NineTestActivity`)

### Step 3: Run the Tests

With the app installed on **both phones**:

| Test | Steps | Pass if |
|------|-------|---------|
| V01 | Tap "Initialize" on Device A | Logcat shows `Transport initialized. Accept loop running.` No crash. |
| V02 | Fresh install → launch → check permission dialog | Permissions granted, transport initializes |
| V03 | Turn BT OFF → tap Initialize | Logcat shows `BLUETOOTH_DISABLED`, no crash |
| V04 | Both initialized → tap "Discover" on A | Device B's address appears in the log within 15 seconds |
| V05 | Tap "Connect" with B's address | Both devices log `CONNECTED` / `Accepted inbound connection` |
| V06 | Tap "Send Test" on Device A | Device B logs `RECEIVED: 22 bytes`. Device A gets the echo back. |
| V07 | Tap "Disconnect" or kill Device B | Device A logs `DISCONNECTED` with a reason. No crash. |

### Step 4: Record Numbers

Fill in this table and send it back:

```
Connection time (connect call → onPeerConnected): ___ ms
Discovery time (startDiscovery → first onPeerDiscovered): ___ ms  
Round-trip packet time (send → receive echo): ___ ms
Packet loss over 100 sends: ___/100 received
Any crashes: YES / NO
Any ANRs: YES / NO
Device A model + Android version: ___
Device B model + Android version: ___
Distance between devices: ___ meters
```

### Step 5: Report Issues

If anything fails, grab:
1. The **full logcat** filtered to `NineTransport` tag: 
   ```
   adb logcat -s NineTransport:* NineTest:* NineDiscovery:*
   ```
2. The **stack trace** if there's a crash
3. **What you did** right before it failed

---

## Important Notes

- **Don't modify the existing chat app** (`BluetoothChatActivity`, `Packet.java`, etc.) — those are unchanged and working.
- **The new code is in `com.p2pchat.nine`** — a completely separate package.
- **The test activity is temporary** — we'll remove it after validation and do proper integration in a later phase.
- **The framing format** is `[4-byte big-endian length][payload bytes]`. If you need to debug wire format issues, look at `NineTransportService.send()`.
- **Max 7 simultaneous connections** — this is a Bluetooth Classic piconet limit, enforced in `NineTransportService`.

---

## What Success Looks Like

If V01–V07 all pass with no crashes and connection happens in <5s, we're good. Report back and we'll tag `v0.9.1-alpha`.

If there are issues, document them and we'll fix them in the next iteration — don't try to debug the transport layer yourself, just report what happened.

---

## Quick Reference: File Locations

```
app/src/main/java/com/p2pchat/nine/
├── AndroidBluetoothAdapter.java       (wraps BluetoothAdapter)
├── AndroidBluetoothServerSocket.java  (wraps server socket)
├── AndroidBluetoothSocket.java        (wraps client socket)
├── BluetoothDiscoveryCallback.java    (BroadcastReceiver)
├── BluetoothPermissionHelper.java     (permission checks)
└── NineTransportService.java          (THE MAIN CLASS — start here)
```

The TypeScript protocol core (`core/` folder) is irrelevant for this test — you're only testing the Java transport layer.
