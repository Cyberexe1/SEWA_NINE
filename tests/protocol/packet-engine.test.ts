/**
 * NINE Protocol — Packet Engine Unit Tests
 *
 * Tests the round-trip: Packet Object → Serialize → Bytes → Parse → Packet Object
 * The output object must be identical to the input object.
 */

import { describe, it, expect } from 'vitest';
import { serialize } from '../../core/protocol/Serializer.js';
import { parse } from '../../core/protocol/Parser.js';
import { validate, verifyChecksum } from '../../core/protocol/Validator.js';
import { createPacket } from '../../core/protocol/PacketFactory.js';
import { crc32 } from '../../core/protocol/Checksum.js';
import { uuidToBytes, bytesToUuid } from '../../core/protocol/UuidUtils.js';
import { type Packet, PacketFlags, HEADER_SIZE, PROTOCOL_VERSION } from '../../core/protocol/Packet.js';
import { PacketType, type NodeID, type PacketID, type Timestamp } from '../../core/shared/Types.js';

// ─── Test Fixtures ─────────────────────────────────────────────────────

const SENDER_ID = '11111111-aaaa-4bbb-8ccc-dddddddddddd' as NodeID;
const DEST_ID = '22222222-bbbb-4ccc-8ddd-eeeeeeeeeeee' as NodeID;
const BROADCAST_ADDR = '00000000-0000-0000-0000-000000000000' as NodeID;
const FIXED_PACKET_ID = 'a3f1c2d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d' as PacketID;
const FIXED_TIMESTAMP = 1752537600000 as Timestamp;

function makeTestPacket(overrides?: Partial<Parameters<typeof createPacket>[0]>): Packet {
  return createPacket({
    packetType: PacketType.BROADCAST,
    senderId: SENDER_ID,
    destinationId: BROADCAST_ADDR,
    sequenceNumber: 42,
    ttl: 10,
    payload: Buffer.from('Hello NINE mesh', 'utf-8'),
    packetId: FIXED_PACKET_ID,
    timestamp: FIXED_TIMESTAMP,
    ...overrides,
  });
}

// ─── UUID Utils Tests ──────────────────────────────────────────────────

describe('UuidUtils', () => {
  it('converts UUID string to 16 bytes and back', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const bytes = uuidToBytes(uuid);
    expect(bytes.length).toBe(16);
    const restored = bytesToUuid(bytes);
    expect(restored).toBe(uuid);
  });

  it('handles all-zeros UUID (broadcast address)', () => {
    const bytes = uuidToBytes(BROADCAST_ADDR);
    expect(bytes.every(b => b === 0)).toBe(true);
    expect(bytesToUuid(bytes)).toBe(BROADCAST_ADDR);
  });

  it('rejects invalid UUID strings', () => {
    expect(() => uuidToBytes('not-a-uuid')).toThrow();
    expect(() => uuidToBytes('')).toThrow();
  });

  it('rejects wrong-length byte arrays', () => {
    expect(() => bytesToUuid(Buffer.alloc(15))).toThrow();
    expect(() => bytesToUuid(Buffer.alloc(17))).toThrow();
  });
});

// ─── CRC-32 Tests ──────────────────────────────────────────────────────

describe('CRC-32', () => {
  it('produces consistent output for same input', () => {
    const data = Buffer.from('NINE Protocol');
    expect(crc32(data)).toBe(crc32(data));
  });

  it('produces different output for different inputs', () => {
    const a = crc32(Buffer.from('hello'));
    const b = crc32(Buffer.from('world'));
    expect(a).not.toBe(b);
  });

  it('produces known CRC-32 value', () => {
    // "123456789" has well-known CRC-32 = 0xCBF43926
    const result = crc32(Buffer.from('123456789', 'ascii'));
    expect(result).toBe(0xcbf43926);
  });

  it('handles empty buffer', () => {
    const result = crc32(Buffer.alloc(0));
    expect(result).toBe(0x00000000);
  });
});

// ─── Serializer + Parser Round-Trip ────────────────────────────────────

describe('Packet Round-Trip (Serialize → Parse)', () => {
  it('round-trips a BROADCAST packet', () => {
    const original = makeTestPacket();
    const bytes = serialize(original);
    const restored = parse(bytes);

    expect(restored.header.version).toBe(original.header.version);
    expect(restored.header.packetType).toBe(original.header.packetType);
    expect(restored.header.flags).toBe(original.header.flags);
    expect(restored.header.packetId).toBe(original.header.packetId);
    expect(restored.header.senderId).toBe(original.header.senderId);
    expect(restored.header.destinationId).toBe(original.header.destinationId);
    expect(restored.header.sequenceNumber).toBe(original.header.sequenceNumber);
    expect(restored.header.timestamp).toBe(original.header.timestamp);
    expect(restored.header.ttl).toBe(original.header.ttl);
    expect(restored.header.hopCount).toBe(original.header.hopCount);
    expect(restored.header.payloadLength).toBe(original.header.payloadLength);
    expect(restored.payload.equals(original.payload)).toBe(true);
  });

  it('round-trips a packet with empty payload', () => {
    const original = makeTestPacket({
      packetType: PacketType.HEARTBEAT,
      payload: Buffer.alloc(0),
    });
    const bytes = serialize(original);
    const restored = parse(bytes);

    expect(restored.header.payloadLength).toBe(0);
    expect(restored.payload.length).toBe(0);
    expect(restored.header.packetType).toBe(PacketType.HEARTBEAT);
  });

  it('round-trips a packet with maximum sensible payload', () => {
    const largePayload = Buffer.alloc(3900, 0xAB);
    const original = makeTestPacket({ payload: largePayload });
    const bytes = serialize(original);
    const restored = parse(bytes);

    expect(restored.payload.equals(largePayload)).toBe(true);
    expect(restored.header.payloadLength).toBe(3900);
  });

  it('round-trips a signed packet', () => {
    const fakeSig = Buffer.alloc(64, 0xDE);
    const original = makeTestPacket({
      flags: PacketFlags.SIGNED | PacketFlags.ENCRYPTED,
      signature: fakeSig,
    });
    const bytes = serialize(original);
    const restored = parse(bytes);

    expect(restored.header.flags & PacketFlags.SIGNED).toBeTruthy();
    expect(restored.signature).toBeDefined();
    expect(restored.signature!.equals(fakeSig)).toBe(true);
  });

  it('preserves timestamp precision for large values', () => {
    const bigTimestamp = 1752537600000 as Timestamp; // July 2026
    const original = makeTestPacket({ timestamp: bigTimestamp });
    const bytes = serialize(original);
    const restored = parse(bytes);

    expect(restored.header.timestamp).toBe(bigTimestamp);
  });

  it('preserves all packet types', () => {
    const types = [
      PacketType.DISCOVERY,
      PacketType.DISCOVERY_RESPONSE,
      PacketType.HEARTBEAT,
      PacketType.BROADCAST,
      PacketType.ENCRYPTED_MESSAGE,
      PacketType.KEY_PACKET,
      PacketType.ACK,
      PacketType.ROUTE_REQUEST,
      PacketType.ROUTE_REPLY,
      PacketType.ROUTE_ERROR,
      PacketType.KEY_ANNOUNCE,
    ];

    for (const packetType of types) {
      const original = makeTestPacket({ packetType });
      const bytes = serialize(original);
      const restored = parse(bytes);
      expect(restored.header.packetType).toBe(packetType);
    }
  });

  it('preserves sequence number at maximum value', () => {
    const original = makeTestPacket({ sequenceNumber: 0xFFFFFFFF });
    const bytes = serialize(original);
    const restored = parse(bytes);
    expect(restored.header.sequenceNumber).toBe(0xFFFFFFFF);
  });

  it('produces correct total byte size', () => {
    const payload = Buffer.from('test', 'utf-8');
    const original = makeTestPacket({ payload });
    const bytes = serialize(original);
    expect(bytes.length).toBe(HEADER_SIZE + payload.length);
  });

  it('produces correct byte size for signed packets', () => {
    const payload = Buffer.from('signed', 'utf-8');
    const sig = Buffer.alloc(64, 0xFF);
    const original = makeTestPacket({
      payload,
      flags: PacketFlags.SIGNED,
      signature: sig,
    });
    const bytes = serialize(original);
    expect(bytes.length).toBe(HEADER_SIZE + payload.length + 64);
  });
});

// ─── Checksum Verification ─────────────────────────────────────────────

describe('Checksum Verification', () => {
  it('serialized packets pass checksum verification', () => {
    const packet = makeTestPacket();
    const bytes = serialize(packet);
    expect(verifyChecksum(bytes)).toBe(true);
  });

  it('corrupted packets fail checksum verification', () => {
    const packet = makeTestPacket();
    const bytes = serialize(packet);
    // Corrupt one byte in the payload region
    bytes[HEADER_SIZE + 2] = (bytes[HEADER_SIZE + 2]! ^ 0xFF);
    expect(verifyChecksum(bytes)).toBe(false);
  });

  it('checksum in parsed packet matches recomputed value', () => {
    const packet = makeTestPacket();
    const bytes = serialize(packet);
    const parsed = parse(bytes);
    // The checksum stored in the parsed header should be non-zero
    expect(parsed.header.checksum).not.toBe(0);
    // And the buffer should verify
    expect(verifyChecksum(bytes)).toBe(true);
  });
});

// ─── Validator Tests ───────────────────────────────────────────────────

describe('Packet Validator', () => {
  it('accepts a valid packet', () => {
    const packet = makeTestPacket();
    const result = validate(packet);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects wrong protocol version', () => {
    const packet = makeTestPacket();
    const bad: Packet = {
      ...packet,
      header: { ...packet.header, version: 99 },
    };
    const result = validate(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'PACKET_VERSION_MISMATCH')).toBe(true);
  });

  it('rejects unknown packet type', () => {
    const packet = makeTestPacket();
    const bad: Packet = {
      ...packet,
      header: { ...packet.header, packetType: 0x7F as PacketType },
    };
    const result = validate(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'PACKET_TYPE_UNKNOWN')).toBe(true);
  });

  it('rejects payload length mismatch', () => {
    const packet = makeTestPacket();
    const bad: Packet = {
      ...packet,
      header: { ...packet.header, payloadLength: 999 },
    };
    const result = validate(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'PACKET_PAYLOAD_LENGTH_MISMATCH')).toBe(true);
  });

  it('rejects oversized packet', () => {
    const hugePayload = Buffer.alloc(4090);
    const packet = createPacket({
      packetType: PacketType.BROADCAST,
      senderId: SENDER_ID,
      destinationId: BROADCAST_ADDR,
      sequenceNumber: 1,
      ttl: 10,
      payload: hugePayload,
      packetId: FIXED_PACKET_ID,
      timestamp: FIXED_TIMESTAMP,
    });
    const result = validate(packet);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'PACKET_TOO_LARGE')).toBe(true);
  });

  it('warns on reserved flags', () => {
    const packet = makeTestPacket();
    const bad: Packet = {
      ...packet,
      header: { ...packet.header, flags: 0xF0 },
    };
    const result = validate(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'PACKET_FLAGS_RESERVED')).toBe(true);
  });

  it('rejects SIGNED flag without signature', () => {
    const packet = makeTestPacket();
    const bad: Packet = {
      header: { ...packet.header, flags: PacketFlags.SIGNED },
      payload: packet.payload,
      signature: undefined,
    };
    const result = validate(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'PACKET_SIGNATURE_MISSING')).toBe(true);
  });
});

// ─── Parser Error Handling ─────────────────────────────────────────────

describe('Parser Error Handling', () => {
  it('throws on buffer smaller than header', () => {
    expect(() => parse(Buffer.alloc(50))).toThrow('Buffer too small');
  });

  it('throws on buffer with declared payload exceeding actual size', () => {
    const packet = makeTestPacket();
    const bytes = serialize(packet);
    // Truncate the buffer so payload is incomplete
    const truncated = bytes.subarray(0, HEADER_SIZE + 2);
    expect(() => parse(truncated)).toThrow('Buffer size mismatch');
  });
});
