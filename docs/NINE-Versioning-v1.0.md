# NINE Protocol Versioning & Compatibility Specification v1.0

## Document Metadata

| Field | Value |
|-------|-------|
| Title | NINE Protocol Versioning & Compatibility Specification |
| Version | 1.0.0-draft |
| Status | DRAFT |
| Date | 2026-07-15 |
| Companion To | NINE-RFC-v1.0 |
| Category | Compatibility & Evolution Specification |

---

## 1. Purpose

This document defines how the NINE protocol evolves over time. It specifies
version numbering, compatibility rules, reserved values for future use,
and negotiation procedures for mixed-version environments.

---

## 2. Version Numbering

The protocol version is a single uint8 carried in every packet header
(byte offset 0). This gives a range of 0-255.

| Version | Status | Description |
|---------|--------|-------------|
| 0 | RESERVED | Never used (indicates uninitialized) |
| 1 | CURRENT | Initial release (this specification) |
| 2-127 | FUTURE | Reserved for future standard versions |
| 128-254 | EXPERIMENTAL | Available for testing non-standard extensions |
| 255 | RESERVED | Never used (sentinel value) |

Version 0 and 255 MUST never appear in valid packets. A packet with
version 0 or 255 MUST be dropped with error PACKET_VERSION_MISMATCH.

---

## 3. Compatibility Model

### 3.1 Version 1 Rule: Strict Same-Version

In protocol version 1, all nodes in the mesh MUST run the same version.

**Rationale:** Version negotiation adds complexity unsuitable for an initial
academic prototype. The demo environment is fully controlled (all devices
run the same software).

**Behavior:** A node receiving a packet with version ≠ 1 MUST:
1. Drop the packet.
2. Log a warning with the received version.
3. NOT respond (no error packet sent to the sender).

### 3.2 Future Version Negotiation (v2+)

When protocol version 2 is defined, it SHOULD include a version negotiation
mechanism during DISCOVERY:

1. Node sends DISCOVERY with its version (e.g., version=2).
2. Receiver checks if it supports version 2.
3. If yes → respond with DISCOVERY_RESPONSE(version=2).
4. If no → respond with DISCOVERY_RESPONSE(version=1) indicating maximum supported.
5. Both sides use min(sender_version, receiver_version) for this link.

This backward-compatible negotiation is NOT implemented in v1.

---

## 4. Reserved Packet Type Codes

| Range | Purpose |
|-------|---------|
| 0x00 | RESERVED — never used |
| 0x01-0x0B | Defined in v1 (11 types) |
| 0x0C-0x1F | Reserved for future NINE control packets |
| 0x20-0x3F | Reserved for future NINE data packets |
| 0x40-0x7F | Reserved for future standard extensions |
| 0x80-0xFE | Experimental / vendor-specific |
| 0xFF | RESERVED — never used |

A v1 implementation receiving a packet type in the experimental range
(0x80-0xFE) MUST drop it silently (not an error — the sender may be
running an experimental extension).

A v1 implementation receiving a packet type in the reserved range
(0x0C-0x7F) MUST drop it and log a warning (indicates a newer protocol
version in the mesh).

---

## 5. Reserved Flag Bits

Bits 4-7 of the flags byte are reserved in v1:

| Bit | v1 Behavior | Future Intent |
|-----|-------------|---------------|
| 4 | Must be 0, ignore on receive | FRAGMENTED (packet is a fragment) |
| 5 | Must be 0, ignore on receive | MORE_FRAGMENTS (more fragments follow) |
| 6 | Must be 0, ignore on receive | COMPRESSED (payload is compressed) |
| 7 | Must be 0, ignore on receive | RELAY_ONLY (don't deliver to app) |

v1 implementations:
- MUST set reserved bits to 0 when creating packets.
- MUST ignore reserved bits when receiving packets (do not reject).
- MUST NOT assign meaning to reserved bits.

---

## 6. Reserved Payload Fields

### 6.1 Capability Bits

Bits 5-15 of the capabilities field in DISCOVERY are reserved:
- v1 senders set them to 0.
- v1 receivers ignore them.
- Future versions may assign meaning.

### 6.2 Error Codes

Error codes 0x06-0xFF in ROUTE_ERROR payload are reserved for future use.
Error codes 0x06-0xFF in ACK payload are reserved for future use.

---

## 7. Header Evolution Rules

The 71-byte header in v1 is DRAFT. Future versions may:

1. **Add fields after the checksum** (before payload). This increases header
   size but existing fields remain at their offsets.
2. **Repurpose reserved flag bits** to signal header extensions.
3. **Never change offsets of existing fields** within the same major version.

### 7.1 Header Extension Mechanism (Planned for v2)

If bit 7 (RELAY_ONLY, repurposed) is set in v2, it indicates an
**extended header** follows the base 71-byte header:

```
[71 bytes: base header]
[2 bytes: extension length]
[N bytes: extension data (TLV-encoded)]
[payload...]
```

This allows adding new header fields without breaking v1 parsers
(v1 ignores the reserved bit and reads payload starting at offset 71).

---

## 8. Backward Compatibility Guarantees

Within the same major version (1.x):

1. Packet header field offsets WILL NOT change.
2. Existing packet type codes WILL NOT be reassigned.
3. Existing payload field ordering WILL NOT change.
4. New fields MAY be appended to existing payloads (receivers must tolerate
   payloadLength > expected and ignore extra bytes).
5. New packet types MAY be added in reserved ranges.
6. New flag bits MAY be defined.

Across major versions (v1 → v2):
- No backward compatibility guaranteed.
- Mixed meshes require the negotiation mechanism in Section 3.2.

---

## 9. Deprecation Policy

When a feature is deprecated:
1. The specification marks it as DEPRECATED with a target removal version.
2. Implementations MUST continue to support deprecated features for at least
   one additional major version.
3. Implementations SHOULD log a warning when deprecated features are used.

No features are deprecated in v1.

---

## 10. Algorithm Identifiers

Cryptographic algorithms are identified by uint8 codes in packet payloads:

### 10.1 Symmetric Encryption Algorithms

| Code | Algorithm | Status |
|------|-----------|--------|
| 0x00 | RESERVED | — |
| 0x01 | AES-256-CBC | Supported (fallback) |
| 0x02 | AES-256-GCM | Supported (preferred) |
| 0x03-0x0F | RESERVED | Future standard algorithms |
| 0x10-0x1F | RESERVED | Post-quantum symmetric |
| 0x80-0xFE | EXPERIMENTAL | Vendor/research algorithms |
| 0xFF | RESERVED | — |

### 10.2 Asymmetric Encryption Algorithms

| Code | Algorithm | Status |
|------|-----------|--------|
| 0x00 | RESERVED | — |
| 0x01 | RSA-2048-OAEP-SHA256 | Supported (current) |
| 0x02 | RSA-4096-OAEP-SHA256 | Reserved (future) |
| 0x03-0x0F | RESERVED | Future RSA variants |
| 0x10-0x1F | RESERVED | Post-quantum KEM (e.g., ML-KEM) |
| 0x80-0xFE | EXPERIMENTAL | Vendor/research algorithms |
| 0xFF | RESERVED | — |

### 10.3 Signature Algorithms

| Code | Algorithm | Status |
|------|-----------|--------|
| 0x00 | NONE | No signature |
| 0x01 | Ed25519 | Supported (current) |
| 0x02-0x0F | RESERVED | Future signature algorithms |
| 0x10-0x1F | RESERVED | Post-quantum signatures (e.g., ML-DSA) |
| 0x80-0xFE | EXPERIMENTAL | — |
| 0xFF | RESERVED | — |

---

## 11. Transport Type Identifiers

Used internally (not on the wire) but standardized for interoperability:

| Code | Transport | Status |
|------|-----------|--------|
| 0x01 | Wi-Fi Direct | Supported |
| 0x02 | Bluetooth Classic (RFCOMM) | Supported |
| 0x03 | BLE | Reserved (future) |
| 0x04 | Simulated (testing) | Supported |
| 0x05 | LoRa | Reserved (future) |
| 0x06 | ZigBee | Reserved (future) |
| 0x07 | TCP/IP (LAN testing) | Reserved (future) |

---

## 12. Broadcast Address

The broadcast address is fixed for all protocol versions:

```
00000000-0000-0000-0000-000000000000
```

This UUID (all zeros) is RESERVED and MUST NOT be used as a Node ID.
It always means "all nodes in the mesh."

---

## 13. Implementation Version String

While the protocol version is a uint8 on the wire, implementations
SHOULD report a human-readable version string for debugging:

Format: `NINE/1.0.0` (protocol/major.minor.patch)

Where:
- Protocol = "NINE"
- Major = protocol version (must match wire version)
- Minor = specification revision (compatible additions)
- Patch = implementation bug fixes

---

*End of NINE Protocol Versioning & Compatibility Specification v1.0*
