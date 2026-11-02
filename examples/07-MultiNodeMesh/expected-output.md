# Example 07 — Expected Output

```
=== NINE Example 07: Multi-Node Mesh Communication ===

Topology: 8-node multi-floor mesh

[A] F3c broadcasts an emergency alert across all floors
  Broadcast reached 7/7 other nodes

[B] F3a sends a secure message to Admin (multi-hop)
  Admin received secure messages: 1

Broadcast reached all nodes: true
Secure message delivered to Admin: true
Success: true
```

## Summary JSON

```json
{
  "example": "07-multi-node-mesh",
  "nodes": 8,
  "broadcastReached": 7,
  "broadcastReachedAll": true,
  "secureDelivered": 1,
  "secureSuccess": true,
  "success": true
}
```
