# Example 04 — Expected Output

```
=== NINE Example 04: Relay Failure Recovery ===

Topology: linear chain A - B - C - D - E

[Phase 1] Healthy chain — A broadcasts
  E received 1 message(s) via multi-hop relay

[Phase 2] Relay C fails (link C-B and C-D removed)
  E received 0 additional message(s) (chain severed)

Relay worked before failure: true
Delivery correctly stopped after failure: true
Success: true
```

## Summary JSON

```json
{
  "example": "04-relay-failure",
  "deliveredBeforeFailure": 1,
  "deliveredAfterFailure": 0,
  "relayDemonstrated": true,
  "failureIsolated": true,
  "success": true
}
```
