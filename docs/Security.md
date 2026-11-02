# NINE Security Specification

## Document Metadata

| Field | Value |
|-------|-------|
| Version | 0.1.0 |
| Status | Draft |
| Date | 2026-07-15 |
| Authors | NINE Team |

---

## 1. Overview

The NINE security layer provides confidentiality, integrity, and authentication for secure communication within the mesh. It operates independently of routing and transport — the security engine encrypts/decrypts data without knowledge of how that data reaches its destination.

---

## 2. Threat Model

### 2.1 Assumptions

- **No trusted infrastructure**: No certificate authority, no PKI, no server.
- **Relay nodes are untrusted**: Any intermediate node may be compromised.
- **Physical access to devices is possible**: Devices may be captured.
- **No internet for key exchange**: All key material must be exchanged locally.

### 2.2 Threats Addressed

| Threat | Mitigation |
|--------|------------|
| Eavesdropping on relay nodes | End-to-end encryption (AES-256) |
| Single relay compromise reveals message | Dual-path routing (key and message travel separately) |
| Message tampering | SHA-256 integrity hash |
| Replay attacks | Packet timestamps + session IDs |
| Impersonation | RSA-2048 signatures (Admin verification) |

### 2.3 Threats NOT Addressed (Out of Scope)

- Traffic analysis (who talks to whom — metadata is visible)
- Denial of service (flooding the mesh)
- Physical device compromise (full key extraction)
- Side-channel attacks

---

## 3. Cryptographic Primitives

### 3.1 Symmetric Encryption

| Property | Value |
|----------|-------|
| Algorithm | AES-256 |
| Mode | GCM (preferred) or CBC |
| Key size | 256 bits |
| IV size | 96 bits (GCM) or 128 bits (CBC) |
| Purpose | Message payload encryption |

GCM is preferred because it provides authenticated encryption (confidentiality + integrity in one operation).

### 3.2 Asymmetric Encryption

| Property | Value |
|----------|-------|
| Algorithm | RSA-2048 |
| Padding | OAEP (SHA-256) |
| Key size | 2048 bits |
| Purpose | Encrypting AES session keys |

### 3.3 Hashing

| Property | Value |
|----------|-------|
| Algorithm | SHA-256 |
| Output | 256 bits (32 bytes) |
| Purpose | Integrity verification, key derivation |

### 3.4 Digital Signatures (Optional)

| Property | Value |
|----------|-------|
| Algorithm | Ed25519 |
| Key size | 256 bits |
| Signature size | 512 bits (64 bytes) |
| Purpose | Packet authentication |

---

## 4. Key Management

### 4.1 Admin Key Pair

The Admin node generates an RSA-2048 key pair at initialization:

- **Public key**: Distributed to all nodes during discovery.
- **Private key**: Stored only on the Admin device. Never transmitted.

### 4.2 Admin Public Key Distribution

When a node discovers the Admin (via DISCOVERY/DISCOVERY_RESPONSE), the Admin's public key is included in the discovery payload as an additional field.

Nodes cache the Admin's public key locally. If multiple Admin nodes exist (configuration error), nodes use the first Admin discovered.

### 4.3 Session Keys

For each secure message, a fresh AES-256 key is generated:

```
sessionKey = crypto.randomBytes(32)  // 256 bits
```

This key is used exactly once (one message), then discarded. This provides **perfect forward secrecy at the message level** — compromise of one key reveals only one message.

### 4.4 Key Storage

| Key Type | Storage Location | Lifetime |
|----------|-----------------|----------|
| Admin RSA private key | SQLite (encrypted at rest) | Permanent (until rotated) |
| Admin RSA public key | SQLite (all nodes) | Until Admin changes |
| AES session key (sender) | Memory only | Discarded after encryption |
| AES session key (Admin) | Memory only | Discarded after decryption |
| Node session ID | Memory only | Current session only |

---

## 5. Encryption Flow (Secure Message)

### 5.1 Sender Side

```
1. Generate random AES-256 session key (32 bytes)
2. Generate random IV (12 bytes for GCM)
3. Encrypt plaintext with AES-256-GCM:
     ciphertext = AES-GCM-Encrypt(sessionKey, iv, plaintext)
     tag = authentication tag from GCM
4. Encrypt session key with Admin's RSA public key:
     encryptedKey = RSA-OAEP-Encrypt(adminPublicKey, sessionKey)
5. Compute integrity hash:
     hash = SHA-256(ciphertext || encryptedKey || timestamp)
6. Construct ENCRYPTED_MESSAGE packet (contains ciphertext + IV + tag)
7. Construct KEY_PACKET (contains encryptedKey)
8. Hand both packets to routing layer for dual-path delivery
9. Securely erase sessionKey from memory
```

### 5.2 Admin Side (Decryption)

```
1. Receive ENCRYPTED_MESSAGE (may arrive first)
2. Receive KEY_PACKET (may arrive later, or vice versa)
3. Match packets using keyPacketId / messagePacketId cross-references
4. Decrypt session key:
     sessionKey = RSA-OAEP-Decrypt(adminPrivateKey, encryptedKey)
5. Decrypt message:
     plaintext = AES-GCM-Decrypt(sessionKey, iv, ciphertext, tag)
6. Verify integrity:
     If GCM tag verification fails → reject message
7. Securely erase sessionKey from memory
8. Deliver plaintext to application
```

---

## 6. Dual-Path Security Analysis

### 6.1 Why Dual Paths?

If message and key travel the same path, a single compromised relay has access to both. Even though the AES key is RSA-encrypted (and the relay cannot decrypt it without Admin's private key), dual-path provides **defense in depth**:

- Layer 1: RSA encryption protects the key.
- Layer 2: Separate paths ensure a single compromised node never sees both packets.

Both layers must be broken simultaneously to compromise a message.

### 6.2 Degraded Mode

In linear topologies (only one path exists), dual-path is impossible. The system:

1. Logs a security warning.
2. Sends both packets on the same path.
3. Security relies solely on RSA encryption of the session key.

This is acceptable for the academic prototype. Production systems would require topology guarantees.

---

## 7. Integrity Verification

### 7.1 Packet-Level Integrity

Every packet has a CRC-32 checksum (see PacketFormat.md). This detects accidental corruption during transmission.

CRC-32 is NOT cryptographic — it does not protect against intentional tampering.

### 7.2 Message-Level Integrity

AES-GCM provides authenticated encryption. The GCM authentication tag ensures:

- The ciphertext has not been modified.
- The IV has not been modified.
- The associated data has not been modified.

If using AES-CBC (fallback), integrity is provided by a separate HMAC-SHA-256 over the ciphertext.

### 7.3 Packet Authentication (Optional)

For packets requiring sender authentication (e.g., Admin commands), Ed25519 signatures are appended. Receiving nodes verify the signature against the sender's known public key.

---

## 8. Replay Protection

### 8.1 Timestamp Validation

Packets with timestamps more than `MAX_PACKET_AGE_MS` (default: 60000ms) old are rejected.

This requires rough clock synchronization between nodes. In an offline mesh, clocks may drift. The tolerance window is intentionally generous.

### 8.2 Session ID Tracking

Each node tracks the session IDs of its neighbors. If a neighbor reappears with a new session ID, all old routing state for that neighbor is invalidated.

### 8.3 Deduplication Buffer

The packet deduplication buffer (see Protocol.md) also prevents replay — a replayed packet has the same packetId and is dropped.

---

## 9. Security Module Interface

```typescript
interface SecurityEngine {
  // Initialization
  initialize(config: SecurityConfig): Promise<void>;

  // Key generation
  generateRSAKeyPair(): Promise<RSAKeyPair>;
  generateAESKey(): Buffer;
  generateIV(algorithm: AESMode): Buffer;

  // Symmetric encryption
  encryptAES(key: Buffer, iv: Buffer, plaintext: Buffer, mode: AESMode): EncryptionResult;
  decryptAES(key: Buffer, iv: Buffer, ciphertext: Buffer, mode: AESMode, tag?: Buffer): Buffer;

  // Asymmetric encryption
  encryptRSA(publicKey: Buffer, data: Buffer): Buffer;
  decryptRSA(privateKey: Buffer, data: Buffer): Buffer;

  // Hashing
  hash(data: Buffer): Buffer;
  verify(data: Buffer, expectedHash: Buffer): boolean;

  // Signing (optional)
  sign(privateKey: Buffer, data: Buffer): Buffer;
  verifySignature(publicKey: Buffer, data: Buffer, signature: Buffer): boolean;

  // High-level operations
  encryptSecureMessage(plaintext: string, adminPublicKey: Buffer): SecureMessageBundle;
  decryptSecureMessage(bundle: SecureMessageBundle, adminPrivateKey: Buffer): string;

  // Key management
  storeAdminPublicKey(key: Buffer): Promise<void>;
  getAdminPublicKey(): Promise<Buffer | null>;
}

interface SecureMessageBundle {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;           // GCM auth tag
  encryptedKey: Buffer;  // RSA-encrypted AES key
  algorithm: AESMode;
  keyAlgorithm: RSAMode;
}
```

---

## 10. Security Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| AES_MODE | GCM | AES encryption mode |
| RSA_KEY_SIZE | 2048 | RSA key size in bits |
| RSA_PADDING | OAEP-SHA256 | RSA padding scheme |
| MAX_PACKET_AGE_MS | 60000 | Replay protection window |
| KEY_ROTATION_INTERVAL | never | Admin key rotation (manual) |
| SESSION_KEY_REUSE | false | Never reuse session keys |

---

## 11. Security Considerations for Implementation

1. **Use constant-time comparisons** for hash/signature verification to prevent timing attacks.
2. **Securely erase keys from memory** after use (zero the buffer).
3. **Use cryptographically secure random number generation** (`crypto.randomBytes`, not `Math.random`).
4. **Never log key material** — not even in debug mode.
5. **Validate all inputs** before cryptographic operations (key lengths, IV lengths, etc.).
6. **Handle errors without revealing internals** — decryption failures should not indicate which step failed.

---

## 12. Future Enhancements (Not in v1)

- Post-quantum key encapsulation (Kyber/ML-KEM)
- Forward secrecy via ephemeral Diffie-Hellman
- Onion routing for metadata protection
- Trust-on-first-use (TOFU) peer authentication
- Key revocation protocol
