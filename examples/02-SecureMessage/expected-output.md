# Example 02 — Expected Output

```
=== NINE Example 02: Secure Messaging ===

Topology: Field <-> Admin (direct)
Admin RSA public key distributed to Field.

Field sends encrypted: "Field report: sector 7 secured, 3 civilians evacuated"

Admin decrypted: "Field report: sector 7 secured, 3 civilians evacuated"
Success: true
```

## Summary JSON

```json
{
  "example": "02-secure-message",
  "sessionId": "<random hex>",
  "decrypted": "Field report: sector 7 secured, 3 civilians evacuated",
  "matchesOriginal": true,
  "success": true
}
```
