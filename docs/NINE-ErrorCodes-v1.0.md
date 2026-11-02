# NINE Protocol Error Code Specification v1.0

## Document Metadata

| Field | Value |
|-------|-------|
| Title | NINE Protocol Error Code Specification |
| Version | 1.0.0-draft |
| Status | DRAFT |
| Date | 2026-07-15 |
| Companion To | NINE-RFC-v1.0 |
| Category | Error Classification Specification |

---

## 1. Purpose

This document defines all standardized error codes, error categories,
and error behaviors in the NINE protocol. Every error condition that
can occur during protocol operation is assigned a unique code, severity,
and prescribed response.

---

## 2. Error Code Structure

Error codes are 16-bit unsigned integers organized hierarchically:

```
Bits 15-12: Category (4 bits, 0-15)
Bits 11-8:  Subcategory (4 bits, 0-15)
Bits 7-0:   Specific error (8 bits, 0-255)
```

Format: `0xCSSE` where C=category, SS=subcategory, E=specific.

For readability, codes are written as: `CATEGORY.SUBCATEGORY.CODE`

---

## 3. Error Categories

| Code Prefix | Category | Description |
|-------------|----------|-------------|
| 0x1xxx | PACKET | Packet structure and validation errors |
| 0x2xxx | ROUTING | Route discovery and forwarding errors |
| 0x3xxx | TRANSPORT | Physical layer communication errors |
| 0x4xxx | SECURITY | Encryption, signing, key errors |
| 0x5xxx | DISCOVERY | Peer discovery and handshake errors |
| 0x6xxx | PROTOCOL | General protocol state errors |
| 0x7xxx | STORAGE | Local persistence errors |
| 0x8xxx-0xFxxx | RESERVED | Future use |

---

## 4. Severity Levels

| Level | Name | Behavior |
|-------|------|----------|
| 0 | INFO | Normal operation, logged for diagnostics |
| 1 | WARNING | Degraded operation, protocol continues |
| 2 | ERROR | Operation failed, specific action aborted |
| 3 | CRITICAL | Node-level failure, protocol may need restart |

---

## 5. Packet Errors (0x1xxx)

| Code | Name | Severity | Description | Response |
|------|------|----------|-------------|----------|
| 0x1001 | PACKET_VERSION_MISMATCH | 2 | Received packet has unsupported version | Drop packet, log warning |
| 0x1002 | PACKET_CHECKSUM_INVALID | 2 | CRC-32 verification failed | Drop packet, log warning |
| 0x1003 | PACKET_TOO_LARGE | 2 | Packet exceeds 4096 bytes | Drop packet, log error |
| 0x1004 | PACKET_TOO_SMALL | 2 | Packet smaller than minimum header (71 bytes) | Drop packet, log error |
| 0x1005 | PACKET_TYPE_UNKNOWN | 2 | Unrecognized packet type code | Drop packet, log warning |
| 0x1006 | PACKET_MALFORMED | 2 | Payload doesn't match declared type structure | Drop packet, log error |
| 0x1007 | PACKET_TTL_EXHAUSTED | 0 | TTL reached 0 at relay | Drop silently |
| 0x1008 | PACKET_DUPLICATE | 0 | Already seen (dedup buffer hit) | Drop silently |
| 0x1009 | PACKET_STALE | 1 | Timestamp exceeds MAX_PACKET_AGE_MS | Drop, log info |
| 0x100A | PACKET_SIGNATURE_INVALID | 2 | Ed25519 signature verification failed | Drop, log security warning |
| 0x100B | PACKET_SIGNATURE_MISSING | 2 | SIGNED flag set but no signature present | Drop, log error |
| 0x100C | PACKET_FLAGS_INVALID | 1 | Reserved flag bits are non-zero | Accept but log warning |
| 0x100D | PACKET_PAYLOAD_LENGTH_MISMATCH | 2 | Declared payloadLength ≠ actual | Drop, log error |

---

## 6. Routing Errors (0x2xxx)

| Code | Name | Severity | Description | Response |
|------|------|----------|-------------|----------|
| 0x2001 | ROUTE_NOT_FOUND | 2 | No route to destination exists | Buffer packet, initiate discovery |
| 0x2002 | ROUTE_DISCOVERY_TIMEOUT | 2 | ROUTE_REPLY not received in time | Retry or fail |
| 0x2003 | ROUTE_DISCOVERY_EXHAUSTED | 2 | All retry attempts failed | Drop pending packets, notify app |
| 0x2004 | ROUTE_EXPIRED | 1 | Cached route exceeded ROUTE_EXPIRY_MS | Remove entry, discover on next use |
| 0x2005 | ROUTE_BROKEN | 2 | Link failure detected (ROUTE_ERROR received) | Invalidate, propagate, rediscover |
| 0x2006 | ROUTE_LOOP_DETECTED | 2 | Same node appears twice in hop list | Drop packet |
| 0x2007 | ROUTE_HOP_LIMIT_EXCEEDED | 2 | hopList exceeds MAX_HOP_LIST_SIZE | Drop ROUTE_REQUEST |
| 0x2008 | PENDING_QUEUE_FULL | 1 | Cannot buffer more packets | Drop oldest or newest (policy) |
| 0x2009 | PENDING_PACKET_TIMEOUT | 1 | Buffered packet exceeded wait time | Drop packet |
| 0x200A | NEXT_HOP_UNREACHABLE | 2 | Next hop in route is not a current neighbor | Invalidate route, rediscover |
| 0x200B | DUAL_PATH_UNAVAILABLE | 1 | Only one path to Admin found | Send both on same path (degraded) |

---

## 7. Transport Errors (0x3xxx)

| Code | Name | Severity | Description | Response |
|------|------|----------|-------------|----------|
| 0x3001 | TRANSPORT_SEND_FAILED | 2 | Failed to transmit bytes to peer | Retry once, then report to routing |
| 0x3002 | TRANSPORT_CONNECTION_FAILED | 2 | Could not establish transport link | Log, try alternate adapter |
| 0x3003 | TRANSPORT_CONNECTION_LOST | 2 | Existing connection dropped | Trigger reconnection or neighbor removal |
| 0x3004 | TRANSPORT_QUEUE_FULL | 1 | Send queue at maximum capacity | Drop packet (or oldest in queue) |
| 0x3005 | TRANSPORT_ADAPTER_UNAVAILABLE | 2 | Requested adapter not registered | Use alternate adapter |
| 0x3006 | TRANSPORT_FRAME_CORRUPT | 1 | Frame magic markers not found | Discard bytes, scan for next frame |
| 0x3007 | TRANSPORT_FRAME_TIMEOUT | 1 | Incomplete frame exceeded FRAME_TIMEOUT_MS | Discard partial frame |
| 0x3008 | TRANSPORT_ALL_ADAPTERS_FAILED | 3 | No adapter can reach any peer | Critical — node is isolated |

---

## 8. Security Errors (0x4xxx)

| Code | Name | Severity | Description | Response |
|------|------|----------|-------------|----------|
| 0x4001 | ENCRYPTION_FAILED | 2 | AES encryption operation failed | Abort message send |
| 0x4002 | DECRYPTION_FAILED | 2 | AES decryption or GCM tag verification failed | Reject message |
| 0x4003 | KEY_GENERATION_FAILED | 3 | Random key generation failed | Critical — crypto unavailable |
| 0x4004 | INTEGRITY_CHECK_FAILED | 2 | Hash/HMAC verification failed | Reject data |
| 0x4005 | INVALID_KEY_FORMAT | 2 | Key material has wrong size or encoding | Reject key |
| 0x4006 | ADMIN_KEY_NOT_AVAILABLE | 1 | No Admin public key cached | Cannot send secure messages |
| 0x4007 | ADMIN_KEY_MISMATCH | 2 | Received key fingerprint doesn't match cached | Log security warning, investigate |
| 0x4008 | REPLAY_DETECTED | 1 | Packet failed replay protection checks | Drop packet |
| 0x4009 | SESSION_KEY_REUSE | 3 | Same session key used twice (implementation bug) | Critical error |
| 0x400A | KEY_REASSEMBLY_TIMEOUT | 1 | Second half of dual-path not received in time | Discard partial |
| 0x400B | RSA_PLAINTEXT_TOO_LARGE | 2 | Data exceeds RSA max plaintext size | Abort operation |

---

## 9. Discovery Errors (0x5xxx)

| Code | Name | Severity | Description | Response |
|------|------|----------|-------------|----------|
| 0x5001 | DISCOVERY_HANDSHAKE_TIMEOUT | 1 | No DISCOVERY_RESPONSE within timeout | Close connection, skip peer |
| 0x5002 | DISCOVERY_INVALID_RESPONSE | 1 | DISCOVERY_RESPONSE has bad format | Ignore, do not add neighbor |
| 0x5003 | DISCOVERY_SELF_LOOP | 0 | Received DISCOVERY from self (own ID) | Drop silently |
| 0x5004 | DISCOVERY_DUPLICATE_PEER | 0 | Already have this neighbor | Update entry (Session ID may change) |
| 0x5005 | HEARTBEAT_TIMEOUT | 2 | Neighbor missed 3+ heartbeats | Remove neighbor, ROUTE_ERROR |
| 0x5006 | SESSION_ID_CHANGED | 1 | Known node restarted (new session) | Invalidate stale state |

---

## 10. Protocol Errors (0x6xxx)

| Code | Name | Severity | Description | Response |
|------|------|----------|-------------|----------|
| 0x6001 | NODE_NOT_INITIALIZED | 3 | Operation attempted before initialization | Reject operation |
| 0x6002 | NODE_SHUTTING_DOWN | 1 | Operation rejected — node is shutting down | Reject gracefully |
| 0x6003 | INVALID_STATE_TRANSITION | 2 | State machine received invalid transition | Log error, remain in current state |
| 0x6004 | CONFIG_INVALID | 3 | Configuration parameters violate constraints | Refuse to start |
| 0x6005 | DEDUP_BUFFER_OVERFLOW | 1 | Buffer full, oldest entries force-evicted | Continue with reduced buffer |
| 0x6006 | SEQUENCE_NUMBER_WRAP | 0 | Counter reached max, reset to 0 | Normal operation |

---

## 11. Storage Errors (0x7xxx)

| Code | Name | Severity | Description | Response |
|------|------|----------|-------------|----------|
| 0x7001 | STORAGE_INIT_FAILED | 3 | Database could not be opened/created | Critical — node cannot start |
| 0x7002 | STORAGE_WRITE_FAILED | 2 | Insert/update operation failed | Retry once, then degrade gracefully |
| 0x7003 | STORAGE_READ_FAILED | 2 | Query operation failed | Return empty/default |
| 0x7004 | STORAGE_MIGRATION_FAILED | 3 | Schema migration failed | Critical — data integrity risk |
| 0x7005 | STORAGE_FULL | 2 | Database at maximum size | Evict oldest records |

---

## 12. Error Propagation Rules

1. Errors at severity 0 (INFO) are logged locally. No propagation.
2. Errors at severity 1 (WARNING) are logged and MAY trigger adaptive behavior.
3. Errors at severity 2 (ERROR) cause the specific operation to fail. The error is reported to the calling module.
4. Errors at severity 3 (CRITICAL) indicate node-level failure. The node SHOULD attempt graceful shutdown.

Errors are NEVER propagated to other nodes via protocol messages except:
- ROUTE_ERROR packets (which carry errorCode from Section 6).
- ACK packets with status=1 (which carry errorCode in the payload).

---

## 13. ACK Error Codes (carried in ACK payload)

When an ACK is sent with status=1 (error), the errorCode field uses:

| Code | Name | Meaning |
|------|------|---------|
| 0x00 | NONE | No error (status should be 0) |
| 0x01 | CANNOT_DECRYPT | Admin cannot decrypt the message |
| 0x02 | INTEGRITY_FAILED | GCM tag or signature invalid |
| 0x03 | UNSUPPORTED_ALGORITHM | Unrecognized encryption algorithm |
| 0x04 | KEY_MISSING | Corresponding KEY_PACKET not received |
| 0x05 | DESTINATION_BUSY | Receiver cannot process (queue full) |

---

## 14. ROUTE_ERROR Error Codes (carried in ROUTE_ERROR payload)

| Code | Name | Meaning |
|------|------|---------|
| 0x01 | LINK_BROKEN | Neighbor heartbeat timed out |
| 0x02 | NODE_UNREACHABLE | TTL exhausted trying to reach node |
| 0x03 | NODE_SHUTDOWN | Graceful departure |

---

*End of NINE Protocol Error Code Specification v1.0*
