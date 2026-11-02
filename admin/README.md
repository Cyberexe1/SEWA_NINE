# NINE Admin Desktop Application

Electron + React.js admin dashboard for the NINE mesh network.

## Status: Not yet implemented

The admin application will be built AFTER the core protocol is stable and tested.

## Planned Structure

```
admin/
├── electron/       - Electron main process (Node.js, core integration)
├── react/          - React renderer (UI components)
├── assets/         - Icons, images, fonts
├── src/            - Application source
├── components/     - React UI components
├── pages/          - Application pages/views
├── hooks/          - React hooks
├── services/       - API services (IPC to main process)
├── graph/          - Mesh topology visualization (Cytoscape.js)
└── utils/          - Frontend utilities
```

## Features (Planned)

- Live mesh topology graph visualization
- Real-time message log (broadcasts + decrypted secure messages)
- Routing table inspector
- Network health dashboard
- Packet flow animation
- Node status indicators
