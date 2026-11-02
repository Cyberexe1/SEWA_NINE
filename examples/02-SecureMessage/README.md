# Example 02 — Secure Messaging

## Objective

Demonstrate encrypted user-to-Admin messaging through `NineCore`. The message
is encrypted with AES-256-GCM and the session key is wrapped with the Admin's
RSA-2048 public key. Only the Admin can decrypt.

## Network Topology

```mermaid
graph LR
    Field((Field User)) --- Admin((Admin))
```

## Message Flow

```mermaid
sequenceDiagram
    participant Field
    participant Admin
    Note over Field: Generate AES key, encrypt message
    Note over Field: RSA-wrap AES key with Admin public key
    Field->>Admin: ENCRYPTED_MESSAGE (ciphertext)
    Field->>Admin: KEY_PACKET (wrapped key)
    Note over Admin: RSA-unwrap key, AES-decrypt message
    Admin-->>Field: (plaintext delivered to app)
```

## Prerequisites

- Node.js 20+
- The Admin's public key must be distributed to the Field node (simulated via `distributeAdminKey()`).

## How to Run

```bash
npm run demo 2
```

## Expected Behaviour

The Field node encrypts a report and sends it. The Admin receives, decrypts,
and the plaintext exactly matches the original. No relay can read the content.

## Success Criteria

- Admin receives exactly one secure message.
- Decrypted plaintext equals the original.
- `summary.success === true`.

## Outputs

- `results/logs/02-secure-message.log`
- `results/traces/02-secure-message.trace.json`
- `results/metrics/02-secure-message.metrics.json`
- `results/metrics/02-secure-message.summary.json`
