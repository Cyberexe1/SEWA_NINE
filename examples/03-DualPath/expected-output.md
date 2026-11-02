# Example 03 — Expected Output

```
=== NINE Example 03: Dual-Path Secure Messaging ===

Topology: diamond (Source -> RelayA/RelayB -> Admin)

Source sends secure message: "Dual-path payload: only Admin can reconstruct this message"

Admin reconstructed: "Dual-path payload: only Admin can reconstruct this message"
Dual-path achieved (node-disjoint): true
  (dualPathUsed=1, singlePathFallback=0)
Message + key delivered independently and reassembled: true
```

## Summary JSON

```json
{
  "example": "03-dual-path",
  "sessionId": "<random hex>",
  "dualPathAchieved": true,
  "reconstructed": true,
  "success": true
}
```

The message traverses RelayA and the key traverses RelayB — two node-disjoint
paths. A single compromised relay never holds both halves.
