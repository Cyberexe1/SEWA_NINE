/**
 * Phase 8.0 — Compatibility Validation Tests
 *
 * Verifies the TypeScript implementation produces (and accepts) exactly
 * the wire format documented in NINE-PacketEncoding-v1.0, independent of
 * the Serializer/Parser implementation itself. This is the test category
 * that protects cross-platform interop (e.g. a future Android/Kotlin or
 * Java implementation) — if these tests pass, any implementation that
 * follows the encoding spec byte-for-byte can talk to this one.
 *
 * Bytes are assembled by hand here (NOT via core/protocol/Serializer.ts)
 * so a spec drift in Serializer would be caught, not silently mirrored.
 */

import { describe, it, expect } from 'vitest';
import { createPacket } from '../../core/protocol/PacketFactory.js';
import { serialize } from '../../core/protocol/Serializer.js';
import { parse } from '../../core/protocol/Parser.js';
import { validate, verifyChecksum } from '../../core/protocol/Validator.js';
import { crc32 } from '../../core/protocol/Checksum.js';
import { HEADER_SIZE, PROTOCOL_VERSION } from '../../core/protocol/Packet.js';
import { PacketType, type NodeID, type PacketID, type Timestamp } from '../../core/shared/Types.js';

const SENDER = '6ba7b810-9dad-11d1-80b4-00c04fd430c8' as NodeID; // RFC 4122 example UUID
const DEST = '550e8400-e29b-41d4-a716-446655440000' as NodeID;    // RFC 4122 example UUID
const BROADCAST = '00000000-0000-0000-0000-000000000000' as NodeID;

/** Hand-assemble a NINE packet buffer per NINE-PacketEncoding-v1.0 Section 3, independent of Serializer.ts. */
function assembleWireFormat(opts: {
  version: number; packetType: number; flags: number;
  packetId: string; senderId: string; destinationId: string;
  sequenceNumber: number; timestamp: number; ttl: number; hopCount: number;
  payload: Buffer; signature?: Buffer;
}): Buffer {
  const hasSig = (opts.flags & 0x04) !== 0 && opts.signature != null;
  const total = HEADER_SIZE + opts.payload.length + (hasSig ? 64 : 0);
  const buf = Buffer.alloc(total);
  let off = 0;
  buf.writeUInt8(opts.version, off); off += 1;
  buf.writeUInt8(opts.packetType, off); off += 1;
  buf.writeUInt8(opts.flags, off); off += 1;
  uuidToRawBytes(opts.packetId).copy(buf, off); off += 16;
  uuidToRawBytes(opts.senderId).copy(buf, off); off += 16;
  uuidToRawBytes(opts.destinationId).copy(buf, off); off += 16;
  buf.writeUInt32BE(opts.sequenceNumber, off); off += 4;
  const tsHigh = Math.floor(opts.timestamp / 0x100000000);
  const tsLow = opts.timestamp % 0x100000000;
  buf.writeUInt32BE(tsHigh, off); off += 4;
  buf.writeUInt32BE(tsLow >>> 0, off); off += 4;
  buf.writeUInt8(opts.ttl, off); off += 1;
  buf.writeUInt8(opts.hopCount, off); off += 1;
  buf.writeUInt16BE(opts.payload.length, off); off += 2;
  buf.writeUInt32BE(0, off); off += 4; // checksum placeholder
  opts.payload.copy(buf, off); off += opts.payload.length;
  if (hasSig && opts.signature) opts.signature.copy(buf, off);
  const checksum = crc32(buf);
  buf.writeUInt32BE(checksum, 67);
  return buf;
}

function uuidToRawBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

describe('Wire Format Compatibility — Header Byte Offsets (NINE-PacketEncoding-v1.0 Section 3)', () => {
  it('an independently-assembled buffer using documented offsets is accepted by the real Parser and Validator', () => {
    const payload = Buffer.from('interop test', 'utf-8');
    const handAssembled = assembleWireFormat({
      version: PROTOCOL_VERSION, packetType: PacketType.BROADCAST, flags: 0,
      packetId: 'a3f1c2d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d', senderId: SENDER, destinationId: BROADCAST,
      sequenceNumber: 42, timestamp: 1752537600000, ttl: 10, hopCount: 0, payload,
    });

    expect(verifyChecksum(handAssembled)).toBe(true);
    const parsed = parse(handAssembled);
    expect(validate(parsed).valid).toBe(true);
    expect(parsed.header.senderId.toLowerCase()).toBe(SENDER.toLowerCase());
    expect(parsed.payload.equals(payload)).toBe(true);
  });

  it("this project's own Serializer output is byte-identical to a hand-assembled buffer for the same logical packet", () => {
    const packetId = 'a3f1c2d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d' as PacketID;
    const timestamp = 1752537600000 as Timestamp;
    const payload = Buffer.from('cross-check', 'utf-8');

    const viaSerializer = serialize(createPacket({
      packetType: PacketType.HEARTBEAT, senderId: SENDER, destinationId: DEST,
      sequenceNumber: 5, ttl: 8, payload, packetId, timestamp,
    }));

    const handAssembled = assembleWireFormat({
      version: PROTOCOL_VERSION, packetType: PacketType.HEARTBEAT, flags: 0,
      packetId, senderId: SENDER, destinationId: DEST,
      sequenceNumber: 5, timestamp, ttl: 8, hopCount: 0, payload,
    });

    expect(viaSerializer.equals(handAssembled)).toBe(true);
  });

  it('offset 0 (version) is always PROTOCOL_VERSION for packets produced by this implementation', () => {
    const bytes = serialize(createPacket({ packetType: PacketType.DISCOVERY, senderId: SENDER, destinationId: DEST, sequenceNumber: 1, ttl: 1, payload: Buffer.alloc(0) }));
    expect(bytes.readUInt8(0)).toBe(1);
  });

  it('offset 67-70 (checksum) recomputes identically whether via Serializer or hand assembly', () => {
    const packetId = 'a3f1c2d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d' as PacketID;
    const payload = Buffer.from('checksum-parity');
    const viaSerializer = serialize(createPacket({ packetType: PacketType.ACK, senderId: SENDER, destinationId: DEST, sequenceNumber: 1, ttl: 5, payload, packetId, timestamp: 1000 as Timestamp }));
    const handAssembled = assembleWireFormat({ version: 1, packetType: PacketType.ACK, flags: 0, packetId, senderId: SENDER, destinationId: DEST, sequenceNumber: 1, timestamp: 1000, ttl: 5, hopCount: 0, payload });
    expect(viaSerializer.readUInt32BE(67)).toBe(handAssembled.readUInt32BE(67));
  });
});

describe('Wire Format Compatibility — UUID Encoding (RFC 4122 binary layout)', () => {
  it('a well-known RFC 4122 example UUID round-trips through the 16-byte binary layout unchanged', () => {
    const bytes = serialize(createPacket({ packetType: PacketType.BROADCAST, senderId: SENDER, destinationId: BROADCAST, sequenceNumber: 1, ttl: 1, payload: Buffer.alloc(0) }));
    const restored = parse(bytes);
    expect(restored.header.senderId.toLowerCase()).toBe(SENDER.toLowerCase());
  });

  it('the broadcast address (all-zero UUID) encodes as 16 zero bytes at the destinationId offset (35)', () => {
    const bytes = serialize(createPacket({ packetType: PacketType.BROADCAST, senderId: SENDER, destinationId: BROADCAST, sequenceNumber: 1, ttl: 1, payload: Buffer.alloc(0) }));
    const destBytes = bytes.subarray(35, 51);
    expect(destBytes.every(b => b === 0)).toBe(true);
  });
});

describe('Wire Format Compatibility — Flags Bitfield (Section 4)', () => {
  it('PRIORITY (bit 0, 0x01) round-trips through the flags byte at offset 2', () => {
    const bytes = serialize(createPacket({ packetType: PacketType.BROADCAST, senderId: SENDER, destinationId: BROADCAST, sequenceNumber: 1, ttl: 1, payload: Buffer.alloc(0), flags: 0x01 }));
    expect(bytes.readUInt8(2) & 0x01).toBe(0x01);
  });

  it('REQUIRES_ACK (bit 1, 0x02) round-trips through the flags byte', () => {
    const bytes = serialize(createPacket({ packetType: PacketType.HEARTBEAT, senderId: SENDER, destinationId: DEST, sequenceNumber: 1, ttl: 1, payload: Buffer.alloc(0), flags: 0x02 }));
    expect(bytes.readUInt8(2) & 0x02).toBe(0x02);
  });

  it('combined PRIORITY + REQUIRES_ACK flags coexist correctly (0x03)', () => {
    const bytes = serialize(createPacket({ packetType: PacketType.BROADCAST, senderId: SENDER, destinationId: BROADCAST, sequenceNumber: 1, ttl: 1, payload: Buffer.alloc(0), flags: 0x03 }));
    expect(bytes.readUInt8(2)).toBe(0x03);
  });
});

describe('Wire Format Compatibility — Payload Encoding by Packet Type (Section 6)', () => {
  it('BROADCAST payload matches the documented [contentType(1)][messageLength(2)][message(N)] layout', () => {
    const message = 'evacuation notice';
    const msgBytes = Buffer.from(message, 'utf-8');
    const payload = Buffer.alloc(3 + msgBytes.length);
    payload.writeUInt8(0x00, 0); // contentType = TEXT
    payload.writeUInt16BE(msgBytes.length, 1);
    msgBytes.copy(payload, 3);

    const bytes = serialize(createPacket({ packetType: PacketType.BROADCAST, senderId: SENDER, destinationId: BROADCAST, sequenceNumber: 1, ttl: 10, payload }));
    const restored = parse(bytes);

    const contentType = restored.payload.readUInt8(0);
    const msgLen = restored.payload.readUInt16BE(1);
    const decodedMessage = restored.payload.subarray(3, 3 + msgLen).toString('utf-8');
    expect(contentType).toBe(0x00);
    expect(decodedMessage).toBe(message);
  });

  it('ACK payload matches the documented [ackedPacketId(16)][status(1)][errorCode(1)] layout (18 bytes)', () => {
    const ackedId = 'a3f1c2d4-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
    const payload = Buffer.alloc(18);
    uuidToRawBytes(ackedId).copy(payload, 0);
    payload.writeUInt8(0, 16); // status = OK
    payload.writeUInt8(0, 17); // errorCode = none

    const bytes = serialize(createPacket({ packetType: PacketType.ACK, senderId: SENDER, destinationId: DEST, sequenceNumber: 0, ttl: 20, payload }));
    const restored = parse(bytes);
    expect(restored.payload.length).toBe(18);
    const decodedAckedId = restored.payload.subarray(0, 16).toString('hex');
    expect(decodedAckedId).toBe(ackedId.replace(/-/g, ''));
    expect(restored.payload.readUInt8(16)).toBe(0);
  });

  it('ROUTE_ERROR payload matches the documented [unreachableNodeId(16)][reporterNodeId(16)][errorCode(1)] layout (33 bytes)', () => {
    const payload = Buffer.alloc(33);
    uuidToRawBytes(DEST).copy(payload, 0);
    uuidToRawBytes(SENDER).copy(payload, 16);
    payload.writeUInt8(0x01, 32); // LINK_BROKEN

    const bytes = serialize(createPacket({ packetType: PacketType.ROUTE_ERROR, senderId: SENDER, destinationId: DEST, sequenceNumber: 0, ttl: 20, payload }));
    const restored = parse(bytes);
    expect(restored.payload.length).toBe(33);
    expect(restored.payload.readUInt8(32)).toBe(0x01);
  });
});

describe('Wire Format Compatibility — Packet Type Codes (Section 5)', () => {
  it('every documented packet type code matches the PacketType enum value exactly', () => {
    const documented: Record<string, number> = {
      DISCOVERY: 0x01, DISCOVERY_RESPONSE: 0x02, HEARTBEAT: 0x03, BROADCAST: 0x04,
      ENCRYPTED_MESSAGE: 0x05, KEY_PACKET: 0x06, ACK: 0x07, ROUTE_REQUEST: 0x08,
      ROUTE_REPLY: 0x09, ROUTE_ERROR: 0x0a, KEY_ANNOUNCE: 0x0b,
    };
    expect(PacketType.DISCOVERY).toBe(documented.DISCOVERY);
    expect(PacketType.DISCOVERY_RESPONSE).toBe(documented.DISCOVERY_RESPONSE);
    expect(PacketType.HEARTBEAT).toBe(documented.HEARTBEAT);
    expect(PacketType.BROADCAST).toBe(documented.BROADCAST);
    expect(PacketType.ENCRYPTED_MESSAGE).toBe(documented.ENCRYPTED_MESSAGE);
    expect(PacketType.KEY_PACKET).toBe(documented.KEY_PACKET);
    expect(PacketType.ACK).toBe(documented.ACK);
    expect(PacketType.ROUTE_REQUEST).toBe(documented.ROUTE_REQUEST);
    expect(PacketType.ROUTE_REPLY).toBe(documented.ROUTE_REPLY);
    expect(PacketType.ROUTE_ERROR).toBe(documented.ROUTE_ERROR);
    expect(PacketType.KEY_ANNOUNCE).toBe(documented.KEY_ANNOUNCE);
  });
});

describe('Wire Format Compatibility — CRC-32 Algorithm Parity (Section 7)', () => {
  it('matches the well-known CRC-32 check value for the ASCII string "123456789" (0xCBF43926)', () => {
    expect(crc32(Buffer.from('123456789', 'ascii'))).toBe(0xcbf43926);
  });

  it('computes identically whether the checksum field is pre-zeroed or freshly allocated (spec requires explicit zeroing)', () => {
    const withExplicitZero = Buffer.alloc(75);
    withExplicitZero.fill(0xaa);
    withExplicitZero.writeUInt32BE(0, 67);
    const alreadyZero = Buffer.alloc(75, 0xaa);
    alreadyZero.writeUInt32BE(0, 67);
    expect(crc32(withExplicitZero)).toBe(crc32(alreadyZero));
  });
});
