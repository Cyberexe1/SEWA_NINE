# Desktop Bridge

This module will contain the integration layer between the NINE core
and the Electron-based Admin desktop application.

## Responsibility

- Initialize the NINE core within the Electron main process
- Expose core API to the React renderer via IPC
- Manage platform-specific transport adapters (Wi-Fi Direct, Bluetooth)
- Handle native module bindings for SQLite and crypto

## Integration Approach

The Desktop Admin runs Node.js natively (Electron main process),
so the NINE core TypeScript modules run directly without a bridge protocol.

The bridge handles:
1. Electron IPC between main process (core) and renderer (React UI)
2. Native Bluetooth/Wi-Fi Direct bindings for the desktop platform
3. Database file management
