# ADR-001: Core Architecture — Protocol-First Design

## Status

Accepted

## Date

2026-07-15

## Context

NINE requires communication across Android mobile devices and a Desktop admin node. The natural instinct is to build "an Android app" and "a Desktop app" independently. This creates fragmented, incompatible implementations that cannot share logic.

## Decision

**The NINE Core is a protocol, not an application.**

- The core defines packet formats, routing logic, encryption, and state management as platform-independent TypeScript modules.
- Android and Desktop are **clients** that consume the core through a Gateway/Bridge layer.
- The core never imports platform-specific code (no Android APIs, no Electron APIs).

## Architecture

```
┌─────────────────────┐    ┌─────────────────────┐
│   Android Client    │    │   Desktop Admin      │
└─────────┬───────────┘    └─────────┬───────────┘
          │                          │
          ▼                          ▼
┌─────────────────────────────────────────────────┐
│                  Gateway Layer                    │
│   (AndroidBridge / DesktopBridge / PacketBridge) │
├─────────────────────────────────────────────────┤
│                   NINE CORE                      │
│  Protocol │ Routing │ Security │ Transport       │
│  Node     │ Discovery │ Broadcast │ Messaging   │
│  Storage  │ Monitor │ Simulator                  │
└─────────────────────────────────────────────────┘
```

## Consequences

**Positive:**
- Single source of truth for protocol logic.
- Any new client (iOS, web, CLI) only needs a bridge layer.
- Testing happens at the core level, independent of platforms.
- Protocol changes propagate to all clients simultaneously.

**Negative:**
- Gateway layer adds integration complexity.
- TypeScript core cannot run natively on Android (requires bridge).
- Initial setup is more work than building platform-specific code directly.

## Alternatives Considered

1. **Platform-specific implementations** — Rejected. Creates divergence, double maintenance, and inconsistency.
2. **Shared C/C++ library** — Rejected. Higher complexity, harder to iterate during academic prototyping.
3. **Kotlin Multiplatform** — Rejected. Desktop admin uses Electron/React; KMP doesn't fit that stack.
