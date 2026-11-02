/**
 * NINE Protocol — Packet Parser
 *
 * Converts a raw byte buffer back into a Packet object.
 * Conforms to NINE-PacketEncoding-v1.0 Section 3 (Header Layout).
 *
 * Process:
 * 1. Validate minimum size (71 bytes).
 * 2. Read header fields from fixed offsets (big-endian).
 * 3. Extract payload.
 * 4. Extract signature (if SIGNED flag).
 * 5. Return immutable Packet object.
 *
 * NOTE: Checksum verification is NOT performed here. Use Validator.
 */

import { type Packet, type PacketHeader, HEADER_SIZE, SIGNATURE_SIZE, PacketFlags } from './Packet.js';
import { type PacketType } from '../shared/Types.js';
import { type NodeID, type PacketID, type Timestamp } from '../shared/Types.js';
import { bytesToUuid } from './UuidUtils.js';

/**
 * Parse a raw byte buffer into a Packet object.
 * Throws if buffer is too small or structurally invalid.
 */
export function parse(data: Buffer): Packet {
  if (data.length < HEADER_SIZE) {
    throw new Error(`Buffer too small: ${data.length} bytes (minimum ${HEADER_SIZE})`);
  }

  let offset = 0;

  const version = data.readUInt8(offset); offset += 1;
  const packetType = data.readUInt8(offset) as PacketType; offset += 1;
  const flags = data.readUInt8(offset); offset += 1;
  const packetId = bytesToUuid(data.subarray(offset, offset + 16)) as PacketID; offset += 16;
  const senderId = bytesToUuid(data.subarray(offset, offset + 16)) as NodeID; offset += 16;
  const destinationId = bytesToUuid(data.subarray(offset, offset + 16)) as NodeID; offset += 16;
  const sequenceNumber = data.readUInt32BE(offset); offset += 4;
  const tsHigh = data.readUInt32BE(offset); offset += 4;
  const tsLow = data.readUInt32BE(offset); offset += 4;
  const timestamp = (tsHigh * 0x100000000 + tsLow) as Timestamp;
  const ttl = data.readUInt8(offset); offset += 1;
  const hopCount = data.readUInt8(offset); offset += 1;
  const payloadLength = data.readUInt16BE(offset); offset += 2;
  const checksum = data.readUInt32BE(offset); offset += 4;

  // Validate sizes
  const hasSig = (flags & PacketFlags.SIGNED) !== 0;
  const expectedSize = HEADER_SIZE + payloadLength + (hasSig ? SIGNATURE_SIZE : 0);
  if (data.length < expectedSize) {
    throw new Error(
      `Buffer size mismatch: got ${data.length}, expected ${expectedSize} ` +
      `(header=${HEADER_SIZE}, payload=${payloadLength}, sig=${hasSig ? SIGNATURE_SIZE : 0})`
    );
  }

  // Extract payload
  const payload = Buffer.from(data.subarray(offset, offset + payloadLength));
  offset += payloadLength;

  // Extract signature
  let signature: Buffer | undefined;
  if (hasSig) {
    signature = Buffer.from(data.subarray(offset, offset + SIGNATURE_SIZE));
  }

  const header: PacketHeader = {
    version,
    packetType,
    flags,
    packetId,
    senderId,
    destinationId,
    sequenceNumber,
    timestamp,
    ttl,
    hopCount,
    payloadLength,
    checksum,
  };

  return { header, payload, signature };
}
