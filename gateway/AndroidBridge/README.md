# Android Bridge

This module will contain the integration layer between the NINE core
and the Android application.

## Responsibility

- Receive raw bytes from Android's Bluetooth/Wi-Fi Direct APIs
- Feed them into the NINE core protocol engine via PacketBridge
- Receive outgoing bytes from the core and pass to Android transport
- Map Android peer identifiers to NINE PeerIDs

## Integration Approach (TBD)

Options under consideration:

1. **WebSocket bridge** — Android app connects to a local Node.js server
   running the NINE core. Simple but requires Node.js on the device.

2. **Native module** — Compile core TypeScript to native code via
   wasm or embed V8. Complex but fully integrated.

3. **JSON-RPC over stdin/stdout** — If running as a subprocess.

4. **Shared protocol only** — Android implements core logic in Java/Kotlin
   following the same spec. Core TypeScript is reference implementation.

The most practical approach for the BE prototype is likely option 4:
the TypeScript core is the reference, and the Android app implements
the same packet format and protocol in Java.
