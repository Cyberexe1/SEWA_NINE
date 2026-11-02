# Example 01 — Expected Output

```
=== NINE Example 01: Broadcast Messaging ===

Topology: star (Alpha at center, 4 peers)

Alpha broadcasts: "EMERGENCY: Building evacuation in progress"

Delivery results:
  Bravo: RECEIVED
  Charlie: RECEIVED
  Delta: RECEIVED
  Admin: RECEIVED

Delivered to 4/4 peers. Success: true
```

## Summary JSON

```json
{
  "example": "01-broadcast",
  "topology": "star",
  "totalPeers": 4,
  "delivered": 4,
  "deliveryRate": 1,
  "success": true
}
```
