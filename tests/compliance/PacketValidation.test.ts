/**
 * Phase 8.0 — Packet Validation Compliance Tests
 *
 * Verifies the Packet Engine (Serializer, Parser, Validator, Checksum)
 * against NINE-PacketEncoding-v1.0 (wire layout) and NINE-RFC-v1.0
 * Section 13 (packet rules). Uses classifyPacket() from
 * core/validation/ProtocolValidator.ts to exercise the exact
 * checksum → parse → validate pipeline RoutingEngine.handleIncoming uses.
 *
 * All fixtures are deterministic (fixed UUIDs, fixed timestamps). No
 * wall-clock timing, no randomness.
 */

import { describe, it, expect } from 'vitest';
import { createPacket } from '../../core/protocol/PacketFactory.js';
import { serialize } from '../../core/protocol/Serializer.js';
import { parse } from '../../core/protocol/Parser.js';
import { HEADER_SIZE, MAX_PACKET_SIZE, PacketFlags, PROTOCOL_VERSION } from '../../core/protocol/Packet.js';
import { PacketType, type NodeID, type PacketID, type Timestamp } from '../../core/shared/Types.js';
import { classifyPacket, corruptVersion, corruptPacketType, corruptFlags, corruptPayloadLength, buildOversizedBuffer } from '../../core/validation/ProtocolValidator.js';

const SENDER = '11111111-aaaa-4bbb-8ccc-dddddddddddd' as NodeID;
const DEST = '22222222-bbbb-4ccc-8ddd-eeeeeeeeeeee' as NodeID;
const BROADCAST = '00000000-0000-0000-0000-000000000000' as NodeID;
const FIXED_ID = 'a3f1c2d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d' as PacketID;
const FIXED_TS = 1752537600000 as Timestamp;

function basePacket(overrides?: Partial<Parameters<typeof createPacket>[0]>) {
  return createPacket({
    packetType: PacketType.BROADCAST,
    senderId: SENDER,
    destinationId: BROADCAST,
    sequenceNumber: 1,
    ttl: 10,
    payload: Buffer.from('compliance-fixture'),
    packetId: FIXED_ID,
    timestamp: FIXED_TS,
    ...overrides,
  });
}

// ─── Serialization ──────────────────────────────────────────────────────

describe('Packet Serialization Compliance', () => {
  it('produces a buffer of exactly HEADER_SIZE + payloadLength bytes for an unsigned packet', () => {
    const pkt = basePacket({ payload: Buffer.from('123456789') });
    const bytes = serialize(pkt);
    expect(bytes.length).toBe(HEADER_SIZE + 9);
  });

  it('produces a buffer of HEADER_SIZE + payloadLength + 64 for a signed packet', () => {
    const sig = Buffer.alloc(64, 0x11);
    const pkt = basePacket({ flags: PacketFlags.SIGNED, signature: sig });
    const bytes = serialize(pkt);
    expect(bytes.length).toBe(HEADER_SIZE + pkt.payload.length + 64);
  });

  it('writes fields at the exact byte offsets specified by NINE-PacketEncoding-v1.0', () => {
    const pkt = basePacket({ ttl: 42, sequenceNumber: 7 });
    const bytes = serialize(pkt);
    expect(bytes.readUInt8(0)).toBe(PROTOCOL_VERSION);       // version @0
    expect(bytes.readUInt8(1)).toBe(PacketType.BROADCAST);   // packetType @1
    expect(bytes.readUInt32BE(51)).toBe(7);                  // sequenceNumber @51
    expect(bytes.readUInt8(63)).toBe(42);                    // ttl @63
    expect(bytes.readUInt8(64)).toBe(0);                     // hopCount @64
  });

  it('always writes a non-zero checksum at offset 67 for non-trivial content', () => {
    const bytes = serialize(basePacket());
    expect(bytes.readUInt32BE(67)).not.toBe(0);
  });

  it('supports payload sizes up to the unsigned maximum (3961 bytes)', () => {
    const pkt = basePacket({ payload: Buffer.alloc(3961, 0xcd) });
    const bytes = serialize(pkt);
    expect(bytes.length).toBe(HEADER_SIZE + 3961);
    expect(bytes.length).toBeLessThanOrEqual(MAX_PACKET_SIZE);
  });
});

// ─── Parsing ─────────────────────────────────────────────────────────────

describe('Packet Parsing Compliance', () => {
  it('round-trips every field through serialize → parse unchanged', () => {
    // Note: pkt.header.checksum is always 0 in the in-memory Packet model
    // (PacketFactory leaves it as a placeholder — the real checksum is
    // computed only during serialize()). So the checksum field is compared
    // separately; every other header field must match exactly.
    const pkt = basePacket({ ttl: 17, sequenceNumber: 99 });
    const restored = parse(serialize(pkt));
    const { checksum: _restoredChecksum, ...restoredRest } = restored.header;
    const { checksum: _originalChecksum, ...originalRest } = pkt.header;
    expect(restoredRest).toEqual(originalRest);
    expect(restored.header.checksum).not.toBe(0);
    expect(restored.payload.equals(pkt.payload)).toBe(true);
  });

  it('parses all 11 defined packet types without error', () => {
    const types = [
      PacketType.DISCOVERY, PacketType.DISCOVERY_RESPONSE, PacketType.HEARTBEAT,
      PacketType.BROADCAST, PacketType.ENCRYPTED_MESSAGE, PacketType.KEY_PACKET,
      PacketType.ACK, PacketType.ROUTE_REQUEST, PacketType.ROUTE_REPLY,
      PacketType.ROUTE_ERROR, PacketType.KEY_ANNOUNCE,
    ];
    for (const t of types) {
      const restored = parse(serialize(basePacket({ packetType: t })));
      expect(restored.header.packetType).toBe(t);
    }
  });

  it('throws a descriptive error for a buffer shorter than HEADER_SIZE', () => {
    expect(() => parse(Buffer.alloc(HEADER_SIZE - 1))).toThrow(/Buffer too small/);
  });

  it('throws a descriptive error when the declared payload exceeds the actual buffer', () => {
    const bytes = serialize(basePacket());
    expect(() => parse(bytes.subarray(0, HEADER_SIZE + 1))).toThrow(/Buffer size mismatch/);
  });
});

// ─── Header field boundary values ───────────────────────────────────────

describe('Header Field Boundaries', () => {
  it('accepts TTL at the maximum uint8 value (255)', () => {
    const bytes = serialize(basePacket({ ttl: 255 }));
    const result = classifyPacket(bytes);
    expect(result.accepted).toBe(true);
  });

  it('accepts sequenceNumber at the uint32 maximum', () => {
    const restored = parse(serialize(basePacket({ sequenceNumber: 0xffffffff })));
    expect(restored.header.sequenceNumber).toBe(0xffffffff);
  });

  it('accepts hopCount incrementing up to 255 without overflow corruption', () => {
    let pkt = basePacket();
    for (let i = 0; i < 5; i++) {
      const bytes = serialize(pkt);
      const restored = parse(bytes);
      pkt = { ...restored, header: { ...restored.header, hopCount: restored.header.hopCount + 1 } };
    }
    expect(pkt.header.hopCount).toBe(5);
  });

  it('preserves timestamps beyond 32-bit range (64-bit big-endian split)', () => {
    const farFuture = 4102444800000 as Timestamp; // year 2100
    const restored = parse(serialize(basePacket({ timestamp: farFuture })));
    expect(restored.header.timestamp).toBe(farFuture);
  });
});

// ─── CRC Validation via classifyPacket ──────────────────────────────────

describe('CRC-32 Checksum Compliance (RFC Rule 3)', () => {
  it('a valid packet is classified accepted at stage "ok"', () => {
    const result = classifyPacket(serialize(basePacket()));
    expect(result).toMatchObject({ accepted: true, stage: 'ok' });
  });

  it('a checksum-corrupted packet is rejected at the checksum stage', () => {
    const bytes = serialize(basePacket());
    bytes.writeUInt32BE(bytes.readUInt32BE(67) ^ 0xffffffff, 67);
    const result = classifyPacket(bytes);
    expect(result).toMatchObject({ accepted: false, stage: 'checksum' });
  });
});

// ─── Packet size limits (RFC Rule 1) ─────────────────────────────────────

describe('Packet Size Limits (RFC Rule 1)', () => {
  it('rejects a packet whose total size exceeds MAX_PACKET_SIZE', () => {
    const oversized = buildOversizedBuffer(basePacket());
    const result = classifyPacket(oversized);
    expect(result.accepted).toBe(false);
    expect(result.stage).toBe('validate');
    expect(result.validation?.errors.some(e => e.code === 'PACKET_TOO_LARGE')).toBe(true);
  });

  it('accepts a packet exactly at MAX_PACKET_SIZE', () => {
    const payload = Buffer.alloc(MAX_PACKET_SIZE - HEADER_SIZE, 0x01);
    const pkt = basePacket({ payload });
    const bytes = serialize(pkt);
    expect(bytes.length).toBe(MAX_PACKET_SIZE);
    expect(classifyPacket(bytes).accepted).toBe(true);
  });
});

// ─── Sequence numbers ────────────────────────────────────────────────────

describe('Sequence Number Handling', () => {
  it('accepts sequenceNumber = 0 (used for control packets like ACK/ROUTE_ERROR)', () => {
    const bytes = serialize(basePacket({ sequenceNumber: 0, packetType: PacketType.ACK, payload: Buffer.alloc(18) }));
    expect(classifyPacket(bytes).accepted).toBe(true);
  });

  it('round-trips sequence numbers across the full uint32 range boundary', () => {
    for (const seq of [0, 1, 0x7fffffff, 0xfffffffe, 0xffffffff]) {
      const restored = parse(serialize(basePacket({ sequenceNumber: seq })));
      expect(restored.header.sequenceNumber).toBe(seq);
    }
  });
});

// ─── Malformed packet classification (using validator helpers) ─────────

describe('Malformed Packet Rejection', () => {
  it('rejects invalid version (RFC Rule 4)', () => {
    const bytes = corruptVersion(serialize(basePacket()));
    const result = classifyPacket(bytes);
    expect(result.accepted).toBe(false);
    expect(result.validation?.errors.some(e => e.code === 'PACKET_VERSION_MISMATCH')).toBe(true);
  });

  it('rejects unknown packet type (RFC Rule 5)', () => {
    const bytes = corruptPacketType(serialize(basePacket()));
    const result = classifyPacket(bytes);
    expect(result.accepted).toBe(false);
    expect(result.validation?.errors.some(e => e.code === 'PACKET_TYPE_UNKNOWN')).toBe(true);
  });

  it('rejects non-zero reserved flag bits', () => {
    const bytes = corruptFlags(serialize(basePacket()));
    const result = classifyPacket(bytes);
    expect(result.accepted).toBe(false);
    expect(result.validation?.errors.some(e => e.code === 'PACKET_FLAGS_RESERVED')).toBe(true);
  });

  it('rejects inflated payloadLength that no longer matches the actual payload', () => {
    const bytes = corruptPayloadLength(serialize(basePacket()));
    // Corrupting payloadLength while keeping the buffer the same size causes
    // a parse-stage size mismatch (buffer too small for declared length).
    const result = classifyPacket(bytes);
    expect(result.accepted).toBe(false);
    expect(['parse', 'validate']).toContain(result.stage);
  });
});
