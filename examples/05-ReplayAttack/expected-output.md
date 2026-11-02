# Example 05 — Expected Output

```
=== NINE Example 05: Replay Attack Detection ===

Topology: Sender <-> Victim

Sender broadcasts a message (legitimate).
  Victim delivered count after legitimate send: 1

Attacker replays the captured packet 5 times...
  Victim delivered count after 5 replays: 1
  Duplicate deliveries prevented: true
  Routing duplicatesDetected: 5

Success: true
```

## Summary JSON

```json
{
  "example": "05-replay-attack",
  "legitimateDeliveries": 1,
  "replaysAttempted": 5,
  "deliveriesAfterReplay": 1,
  "duplicatesDetected": 5,
  "replaySuppressed": true,
  "success": true
}
```
