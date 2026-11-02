# Example 07 — Multi-Node Mesh Communication

## Objective

Demonstrate a realistic multi-floor building mesh (8 nodes) with:
- A far-node broadcast reaching every node across multiple hops.
- A multi-hop encrypted message to the Admin.

## Network Topology

```mermaid
graph TD
    F3c((F3c)) --- F3b((F3b)) --- F3a((F3a))
    F3a --- F2a((F2a))
    F2a --- F2b((F2b))
    F2a --- F1a((F1a))
    F1a --- F1b((F1b))
    F1b --- Admin((Admin))
```

## Message Flow

```mermaid
sequenceDiagram
    participant F3c
    participant F3a
    participant F2a
    participant F1a
    participant Admin
    Note over F3c: [A] emergency broadcast
    F3c->>F3a: BROADCAST (relayed floor by floor)
    F3a->>F2a: relay
    F2a->>F1a: relay
    F1a->>Admin: relay (all nodes reached)
    Note over F3a: [B] secure message
    F3a->>Admin: SECURE_DATA + SECURE_KEY (multi-hop)
    Note over Admin: decrypt
```

## Prerequisites

- Node.js 20+

## How to Run

```bash
npm run demo 7
```

## Expected Behaviour

- Scenario A: F3c's emergency broadcast reaches all 7 other nodes.
- Scenario B: F3a's encrypted message is routed multi-hop and decrypted by the Admin.

## Success Criteria

- Broadcast reaches all 7 nodes.
- Admin receives exactly 1 decrypted secure message.
- `summary.success === true`.

## Outputs

- `results/logs/07-multi-node-mesh.log`
- `results/traces/07-multi-node-mesh.trace.json`
- `results/metrics/07-multi-node-mesh.{metrics,summary}.json`
