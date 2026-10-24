# NINE Packet Encoding Specification v1.0

## Document Metadata

| Field | Value |
|-------|-------|
| Title | NINE Packet Encoding Specification |
| Version | 1.0.0-draft |
| Status | DRAFT |
| Date | 2026-07-15 |
| Companion To | NINE-RFC-v1.0 |
| Category | Wire Format Specification |

---

## 1. Purpose

This document defines the exact binary encoding of NINE protocol packets
for transmission over physical transport layers. It specifies byte offsets,
field sizes, data types, endianness, and serialization rules.

All implementations MUST produce identical byte sequences for identical
logical packets regardless of platform (Android/Java, Desktop/TypeScript,
or any future implementation).

---

## 2. General Encoding Rules

### 2.1 Byte Order

All multi-byte integer fields are encoded in **big-endian** (network byte
order) as per Internet protocol convention (RFC 1700).

### 2.2 UUID Encoding

UUIDs (128-bit) are encoded as 16 raw bytes in RFC 4122 binary layout:

```
time_low (4 bytes) | time_mid (2 bytes) | time_hi_and_version (2 bytes) |
clock_seq_hi_and_reserved (1 byte) | clock_seq_low (1 byte) | node (6 bytes)
```

String representation (e.g., "550e8400-e29b-41d4-a716-446655440000") is
used only in JSON debug serialization, never on the wire.

### 2.3 String Encoding

All strings are encoded as UTF-8 with an explicit length prefix:

```
[length: uint8 or uint16] [utf8_bytes: N bytes]
```

No null terminator. The length field specifies byte count, not character count.

### 2.4 Boolean Values

Booleans are encoded as a single byte: 0x00 = false, 0x01 = true.

### 2.5 Variable-Length Fields

Variable-length fields are always preceded by a length indicator.
The size of the length indicator depends on the maximum expected size:
- ≤ 255 bytes: uint8 length prefix
- ≤ 65535 bytes: uint16 length prefix

### 2.6 Alignment

No alignment padding is used. Fields are packed contiguously.

---

## 3. Packet Header Layout (DRAFT — Subject to Change)

The header is currently 71 bytes. This layout is DRAFT and may be revised
before protocol freeze.

```
Offset  Size    Field              Type        Notes
──────  ──────  ─────────────────  ──────────  ──────────────────────────
0       1       version            uint8       Protocol version (0x01)
1       1       packetType         uint8       See type codes below
2       1       flags              uint8       Bitfield (Section 4)
3       16      packetId           uuid        Unique packet identifier
19      16      senderId           uuid        Original sender Node ID
35      16      destinationId      uuid        Target node or broadcast
51      4       sequenceNumber     uint32      Per-sender counter
55      8       timestamp          uint64      ms since Unix epoch
63      1       ttl                uint8       Time-to-live
64      1       hopCount           uint8       Hops traversed
65      2       payloadLength      uint16      Payload byte count
67      4       checksum           uint32      CRC-32
──────  ──────  ─────────────────  ──────────  ──────────────────────────
Total: 71 bytes
```

After the header:
```
71      N       payload            bytes       (N = payloadLength)
71+N    64      signature          bytes       (present only if SIGNED flag set)
```

Total packet size: 71 + payloadLength + (64 if signed, else 0)

---

## 4. Flags Field Encoding

Byte offset 2. Single uint8 interpreted as bitfield:

```
Bit 7   Bit 6   Bit 5   Bit 4   Bit 3   Bit 2   Bit 1   Bit 0
─────   ─────   ─────   ─────   ─────   ─────   ─────   ─────
RSVD    RSVD    RSVD    RSVD    ENCRYP  SIGNED  REQ_ACK PRIORITY
```

| Bit | Mask | Name | Description |
|-----|------|------|-------------|
| 0 | 0x01 | PRIORITY | High priority packet |
| 1 | 0x02 | REQUIRES_ACK | Sender expects acknowledgement |
| 2 | 0x04 | SIGNED | 64-byte signature appended |
| 3 | 0x08 | ENCRYPTED | Payload is encrypted |
| 4-7 | 0xF0 | RESERVED | Must be zero in v1 |

Receivers MUST ignore reserved bits. Senders MUST set reserved bits to zero.

---

## 5. Packet Type Codes

| Code | Name | Hex |
|------|------|-----|
| 1 | DISCOVERY | 0x01 |
| 2 | DISCOVERY_RESPONSE | 0x02 |
| 3 | HEARTBEAT | 0x03 |
| 4 | BROADCAST | 0x04 |
| 5 | ENCRYPTED_MESSAGE | 0x05 |
| 6 | KEY_PACKET | 0x06 |
| 7 | ACK | 0x07 |
| 8 | ROUTE_REQUEST | 0x08 |
| 9 | ROUTE_REPLY | 0x09 |
| 10 | ROUTE_ERROR | 0x0A |
| 11 | KEY_ANNOUNCE | 0x0B |
| 12-127 | RESERVED | 0x0C-0x7F |
| 128-255 | EXPERIMENTAL | 0x80-0xFF |

Codes 12-127 are reserved for future standard packet types.
Codes 128-255 are available for experimental/vendor extensions.

---

## 6. Payload Encoding by Packet Type

### 6.1 DISCOVERY Payload (0x01)

```
Offset  Size    Field           Type      Notes
──────  ──────  ──────────────  ────────  ─────────────────────────
0       8       sessionId       uint64    Current session identifier
8       1       role            uint8     0=User, 1=Admin
9       2       capabilities    uint16    Bitfield (Section 6.1.1)
11      1       nameLength      uint8     Display name byte count
12      N       displayName     utf8      (N = nameLength, max 64)
```

Total: 12 + nameLength bytes (Admin key NOT included here; see KEY_ANNOUNCE)

#### 6.1.1 Capabilities Bitfield

| Bit | Mask | Capability |
|-----|------|------------|
| 0 | 0x0001 | Supports Wi-Fi Direct |
| 1 | 0x0002 | Supports Bluetooth Classic |
| 2 | 0x0004 | Supports BLE |
| 3 | 0x0008 | Willing to relay |
| 4 | 0x0010 | Has Admin public key cached |
| 5-15 | — | Reserved (zero) |

### 6.2 DISCOVERY_RESPONSE Payload (0x02)

Identical encoding to DISCOVERY payload.

### 6.3 HEARTBEAT Payload (0x03)

```
Offset  Size    Field           Type      Notes
──────  ──────  ──────────────  ────────  ─────────────────────────
0       8       sessionId       uint64    For restart detection
8       1       neighborCount   uint8     Current neighbor count
9       1       load            uint8     0-255 load indicator
```

Total: 10 bytes (fixed).

### 6.4 BROADCAST Payload (0x04)

```
Offset  Size    Field           Type      Notes
──────  ──────  ──────────────  ────────  ─────────────────────────
0       1       contentType     uint8     0=text, 1=emergency
1       2       messageLength   uint16    Message byte count
3       N       message         utf8      (N = messageLength, max 3950)
```

Total: 3 + messageLength bytes.

### 6.5 ENCRYPTED_MESSAGE Payload (0x05)

```
Offset  Size    Field           Type      Notes
──────  ──────  ──────────────  ────────  ─────────────────────────
0       16      keyPacketId     uuid      Corresponding KEY_PACKET ID
16      1       algorithm       uint8     0x01=AES-CBC, 0x02=AES-GCM
17      1       ivLength        uint8     IV byte count (12 or 16)
18      N       iv              bytes     Initialization vector
18+N    2       cipherLength    uint16    Ciphertext byte count
20+N    M       ciphertext      bytes     Encrypted message
20+N+M  1       tagLength       uint8     Auth tag length (0 for CBC)
21+N+M  T       authTag         bytes     GCM authentication tag
```

### 6.6 KEY_PACKET Payload (0x06)

```
Offset  Size    Field              Type     Notes
──────  ──────  ─────────────────  ───────  ─────────────────────────
0       16      messagePacketId    uuid     Corresponding ENCRYPTED_MESSAGE
16      1       algorithm          uint8    0x01=RSA-2048-OAEP
17      2       encKeyLength       uint16   Encrypted key byte count
19      N       encryptedKey       bytes    RSA-encrypted AES key
```

### 6.7 ACK Payload (0x07)

```
Offset  Size    Field           Type      Notes
──────  ──────  ──────────────  ────────  ─────────────────────────
0       16      ackedPacketId   uuid      Packet being acknowledged
16      1       status          uint8     0=OK, 1=error
17      1       errorCode       uint8     0 if status=OK (see Error spec)
```

Total: 18 bytes (fixed).

### 6.8 ROUTE_REQUEST Payload (0x08)

```
Offset  Size    Field           Type      Notes
──────  ──────  ──────────────  ────────  ─────────────────────────
0       16      targetNodeId    uuid      Destination being sought
16      4       requestSeqNum   uint32    Discovery attempt counter
20      1       hopListCount    uint8     Number of nodes in hop list
21      N*16    hopList         uuid[]    Ordered node IDs traversed
```

Total: 21 + (hopListCount × 16) bytes.

### 6.9 ROUTE_REPLY Payload (0x09)

```
Offset  Size    Field           Type      Notes
──────  ──────  ──────────────  ────────  ─────────────────────────
0       16      targetNodeId    uuid      Destination reached
16      4       requestSeqNum   uint32    Matches the request
20      2       routeMetric     uint16    Composite quality score
22      1       routeLength     uint8     Number of nodes in route
23      N*16    route           uuid[]    Full path (source to dest)
```

Total: 23 + (routeLength × 16) bytes.

### 6.10 ROUTE_ERROR Payload (0x0A)

```
Offset  Size    Field              Type     Notes
──────  ──────  ─────────────────  ───────  ─────────────────────────
0       16      unreachableNodeId  uuid     Node that cannot be reached
16      16      reporterNodeId     uuid     Node reporting the failure
32      1       errorCode          uint8    1=LINK_BROKEN, 2=UNREACHABLE, 3=SHUTDOWN
```

Total: 33 bytes (fixed).

### 6.11 KEY_ANNOUNCE Payload (0x0B)

```
Offset  Size    Field           Type      Notes
──────  ──────  ──────────────  ────────  ─────────────────────────
0       16      adminNodeId     uuid      Which Admin this key belongs to
16      2       keyLength       uint16    Public key byte count
18      N       publicKey       bytes     DER-encoded RSA public key
18+N    4       keyFingerprint  uint32    CRC-32 of the public key bytes
```

---

## 7. Checksum Computation

Algorithm: CRC-32 (ISO 3309, polynomial 0x04C11DB7).

Computation procedure:
1. Construct the complete packet bytes (header + payload + signature if present).
2. Set bytes at offset 67-70 (checksum field) to 0x00000000.
3. Compute CRC-32 over the entire byte sequence.
4. Write the resulting 32-bit value into offset 67-70 (big-endian).

Verification procedure:
1. Read bytes 67-70 and store as `expected`.
2. Set bytes 67-70 to 0x00000000.
3. Compute CRC-32 over the entire byte sequence.
4. Compare result to `expected`. If mismatch → packet is corrupted.

---

## 8. Signature Computation

Algorithm: Ed25519 (RFC 8032).

Signing procedure:
1. Construct complete packet bytes (header + payload).
2. Set bytes 67-70 (checksum) to 0x00000000.
3. Set the signature region to 64 bytes of 0x00 (or compute before appending).
4. Sign the (header + payload) bytes with the sender's Ed25519 private key.
5. Append the 64-byte signature after the payload.
6. Compute checksum over the full packet (including signature).

Verification procedure:
1. Verify checksum first (discard if corrupt).
2. Extract the 64-byte signature from the end of the packet.
3. Remove the signature from the byte sequence.
4. Set checksum field to 0x00000000.
5. Verify the Ed25519 signature over (header + payload) using sender's public key.

---

## 9. Transport Framing

When transmitting packets over stream-based transports (Bluetooth RFCOMM),
packets MUST be framed to establish boundaries:

```
Offset  Size    Field           Type      Notes
──────  ──────  ──────────────  ────────  ─────────────────────────
0       2       frameMagic      uint16    0x4E39 ("N9")
2       4       frameLength     uint32    Total frame size (incl. markers)
6       N       packetData      bytes     Complete NINE packet
6+N     2       frameEnd        uint16    0x394E (reversed "N9")
```

Frame overhead: 8 bytes.

For message-based transports (Wi-Fi Direct datagrams, simulated), framing
is OPTIONAL since message boundaries are preserved by the transport.

---

## 10. JSON Debug Serialization

For simulation and debugging, packets MAY be serialized as JSON:

```json
{
  "version": 1,
  "packetType": "BROADCAST",
  "flags": ["PRIORITY"],
  "packetId": "550e8400-e29b-41d4-a716-446655440000",
  "senderId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "destinationId": "00000000-0000-0000-0000-000000000000",
  "sequenceNumber": 42,
  "timestamp": 1752537600000,
  "ttl": 10,
  "hopCount": 0,
  "payloadLength": 47,
  "checksum": "0xa1b2c3d4",
  "payload": {
    "contentType": 1,
    "message": "Emergency: Building evacuation in progress"
  }
}
```

JSON serialization is NOT used on the wire. It is a debugging aid only.

---

## 11. Maximum Sizes Summary

| Field/Element | Maximum |
|---------------|---------|
| Total packet | 4096 bytes |
| Header | 71 bytes (fixed) |
| Payload | 3961 bytes (unsigned) or 3897 bytes (signed) |
| Signature | 64 bytes |
| Display name | 64 bytes (UTF-8) |
| Broadcast message | 3950 bytes (UTF-8) |
| Hop list | 20 entries (320 bytes) |
| Route | 20 entries (320 bytes) |
| RSA public key | 294 bytes (DER-encoded 2048-bit) |
| Encrypted AES key | 256 bytes (RSA-2048 output) |

---

*End of NINE Packet Encoding Specification v1.0*
