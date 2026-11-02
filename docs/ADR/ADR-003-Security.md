# ADR-003: Security — Dual-Path Encryption with AES-256 + RSA-2048

## Status

Accepted

## Date

2026-07-15

## Context

Secure messages must travel through untrusted relay nodes. A compromised relay should not be able to read message content. Standard end-to-end encryption (E2E) already prevents this, but NINE adds a second layer: **dual-path delivery**.

## Decision

### Encryption Stack

| Layer | Algorithm | Purpose |
|-------|-----------|---------|
| Message encryption | AES-256-GCM | Fast symmetric encryption with authentication |
| Key encapsulation | RSA-2048-OAEP | Encrypt the AES key for Admin |
| Integrity | SHA-256 (via GCM tag) | Detect tampering |
| Signing (optional) | Ed25519 | Packet authentication |

### Dual-Path Design

1. Each secure message generates a one-time AES-256 session key.
2. The message is encrypted → becomes ENCRYPTED_MESSAGE packet.
3. The session key is RSA-encrypted → becomes KEY_PACKET.
4. The routing layer sends these two packets on **independent paths**.
5. Only Admin (with the RSA private key) can reassemble.

### Why Dual-Path on top of RSA?

RSA alone prevents relay nodes from reading the key. Dual-path adds **defense in depth**:

- **If RSA is broken** (quantum computing, implementation flaw): The attacker still needs to intercept BOTH paths.
- **If one path is fully compromised** (all nodes on it are hostile): They only get one half.
- **Academic contribution**: The dual-path mechanism is a key differentiator for the research paper.

### Key Distribution

- Admin generates RSA-2048 key pair at initialization.
- Admin's public key is distributed during DISCOVERY handshake.
- No PKI. No certificate authority. Trust-on-first-use model.
- Session keys are ephemeral (one per message, never reused).

## Consequences

**Positive:**
- Two independent layers of protection.
- Strong academic contribution (dual-path + standard crypto).
- Session keys provide per-message forward secrecy.
- GCM provides authenticated encryption (no separate HMAC needed).

**Negative:**
- Dual-path requires sufficient topology diversity (may degrade in linear networks).
- RSA-2048 key generation is slow (~100ms on mobile). Done once at init, so acceptable.
- No user-to-user encryption (only user-to-Admin). This is by design for the prototype.

## Alternatives Considered

1. **Diffie-Hellman key exchange** — Rejected for v1. Would enable user-to-user encryption but adds complexity. Possible future enhancement.
2. **Post-quantum crypto (Kyber/ML-KEM)** — Noted as future work. Not available in Node.js native crypto without external libraries.
3. **Onion routing (Tor-like)** — Rejected. Hides metadata but requires multiple encryption layers per hop. Excessive for an academic prototype.
4. **Single-path E2E only** — Rejected. Loses the dual-path academic contribution and defense-in-depth property.
