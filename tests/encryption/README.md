# Encryption Tests

Unit tests for:
- AES-256-GCM encrypt/decrypt roundtrip
- AES-256-CBC encrypt/decrypt roundtrip
- RSA-2048 key pair generation
- RSA encrypt/decrypt roundtrip
- SHA-256 hashing and verification
- Constant-time hash comparison
- Key Manager orchestration (full secure message flow)
- Invalid key rejection
- Tampered ciphertext detection (GCM tag failure)
- Edge cases (empty plaintext, max-size plaintext)
