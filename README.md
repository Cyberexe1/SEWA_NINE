# P2P Chat - Android Offline Messaging App

A peer-to-peer messaging application for Android that enables direct communication between devices without internet connectivity using Bluetooth and Wi-Fi Direct.

## Features

- **Bluetooth Communication**: Device-to-device messaging via Bluetooth
- **Wi-Fi Direct**: High-speed peer-to-peer connection without router
- **Offline Messaging**: No internet or cellular connection required
- **Real-time Communication**: Instant message delivery
- **Android 10-15 Support**: Compatible with all modern Android versions

## Requirements

- Android 6.0 (API 23) or higher
- Bluetooth and Wi-Fi hardware
- Two Android devices for testing

## Installation

1. Build the project:
   ```bash
   gradlew assembleDebug
   ```

2. Install APK on both devices:
   ```
   app/build/outputs/apk/debug/app-debug.apk
   ```

3. Grant all requested permissions

## Usage

### Bluetooth Chat
1. **Device 1**: Open app → Bluetooth Chat → Start Server
2. **Device 2**: Open app → Bluetooth Chat → Find Devices → Select Device 1
3. Send messages between devices

### Wi-Fi Direct Chat
1. **Both devices**: Open app → Wi-Fi Direct Chat → Discover Peers
2. **Device 2**: Select Device 1 from peer list
3. Send messages between devices

## Permissions

### Android 10-11
- Location (required for Bluetooth discovery)

### Android 12+
- Bluetooth Connect, Scan, Advertise
- Location (for Wi-Fi Direct)

### Android 13+
- All above + Nearby Wi-Fi Devices

## Technical Details

- **Language**: Java
- **Min SDK**: 23 (Android 6.0)
- **Target SDK**: 34 (Android 14)
- **Architecture**: Client-server socket-based communication
- **Bluetooth**: Classic Bluetooth with RFCOMM
- **Wi-Fi Direct**: TCP socket communication

## Troubleshooting

**Devices not showing up?**
- Grant all permissions in Settings → Apps → P2P Chat
- Make Bluetooth discoverable on server device
- Keep devices within 10 meters (Bluetooth) or 200 meters (Wi-Fi Direct)
- Wait 30 seconds for Bluetooth discovery

**Connection failed?**
- Restart Bluetooth/Wi-Fi on both devices
- Clear app data and reinstall
- Disable battery optimization for the app

## Project Structure

```
app/src/main/
├── java/com/p2pchat/app/
│   ├── MainActivity.java              # Main entry point
│   ├── BluetoothChatActivity.java     # Bluetooth implementation
│   ├── WiFiDirectActivity.java        # Wi-Fi Direct implementation
│   └── WiFiDirectBroadcastReceiver.java
├── res/
│   ├── layout/                        # UI layouts
│   ├── values/                        # Strings, colors, themes
│   └── mipmap-*/                      # App icons
└── AndroidManifest.xml                # App configuration
```

## License

Open source - feel free to modify and use for your projects.

## References

- [Android Bluetooth Guide](https://developer.android.com/guide/topics/connectivity/bluetooth)
- [Wi-Fi Direct Overview](https://developer.android.com/guide/topics/connectivity/wifip2p)
