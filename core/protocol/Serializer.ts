/**
 * NINE Protocol — Packet Serializer
 *
 * Converts a Packet object to a byte buffer for wire transmission.
 * Conforms to NINE-PacketEncoding-v1.0 Section 3 (Header Layout).
 *
 * Process:
 * 1. Allocate buffer of exact size.
 * 2. Write header fields at fixed offsets (big-endian).
 * 3. Write payload bytes.
 * 4. Write signature bytes (if SIGNED flag).
 * 5. Compute and write CRC-32 checksum.
 */

import { type Packet, HEADER_SIZE, SIGNATURE_SIZE, PacketFlags } from './Packet.js';
import { crc32 } from './Checksum.js';
import { uuidToBytes } from './UuidUtils.js';

/**
 * Serialize a Packet to a Buffer ready for transmission.
 * The checksum field is computed and written automatically.
 */
export function serialize(packet: Packet): Buffer {
  const { header, payload, signature } = packet;
  const hasSig = (header.flags & PacketFlags.SIGNED) !== 0 && signature != null;
  const totalSize = HEADER_SIZE + header.payloadLength + (hasSig ? SIGNATURE_SIZE : 0);

  const buf = Buffer.alloc(totalSize);
  let offset = 0;

  // version (1 byte)
  buf.writeUInt8(header.version, offset); offset += 1;
  // packetType (1 byte)
  buf.writeUInt8(header.packetType, offset); offset += 1;
  // flags (1 byte)
  buf.writeUInt8(header.flags, offset); offset += 1;
  // packetId (16 bytes)
  uuidToBytes(header.packetId).copy(buf, offset); offset += 16;
  // senderId (16 bytes)
  uuidToBytes(header.senderId).copy(buf, offset); offset += 16;
  // destinationId (16 bytes)
  uuidToBytes(header.destinationId).copy(buf, offset); offset += 16;
  // sequenceNumber (4 bytes, big-endian)
  buf.writeUInt32BE(header.sequenceNumber, offset); offset += 4;
  // timestamp (8 bytes, big-endian uint64)
  const tsHigh = Math.floor(header.timestamp / 0x100000000);
  const tsLow = header.timestamp % 0x100000000;
  buf.writeUInt32BE(tsHigh, offset); offset += 4;
  buf.writeUInt32BE(tsLow >>> 0, offset); offset += 4;
  // ttl (1 byte)
  buf.writeUInt8(header.ttl, offset); offset += 1;
  // hopCount (1 byte)
  buf.writeUInt8(header.hopCount, offset); offset += 1;
  // payloadLength (2 bytes, big-endian)
  buf.writeUInt16BE(header.payloadLength, offset); offset += 2;
  // checksum placeholder (4 bytes) — will be filled after
  buf.writeUInt32BE(0, offset); offset += 4;

  // payload
  payload.copy(buf, offset); offset += header.payloadLength;

  // signature (if present)
  if (hasSig && signature) {
    signature.copy(buf, offset); offset += SIGNATURE_SIZE;
  }

  // Compute checksum over entire buffer with checksum field = 0
  const checksum = crc32(buf);
  buf.writeUInt32BE(checksum, 67); // checksum is at offset 67

  return buf;
}
