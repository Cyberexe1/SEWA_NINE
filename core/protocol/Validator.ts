/**
 * NINE Protocol — Packet Validator
 *
 * Validates packets against protocol rules (NINE-RFC-v0.9.1 Section 13).
 * Checks: version, checksum, size constraints, flags, type codes.
 */

import { type Packet, HEADER_SIZE, SIGNATURE_SIZE, MAX_PACKET_SIZE, PROTOCOL_VERSION, PacketFlags } from './Packet.js';
import { PacketType } from '../shared/Types.js';
import { crc32 } from './Checksum.js';

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
}

export interface ValidationError {
  readonly code: string;
  readonly field: string;
  readonly message: string;
}

/**
 * Validate a parsed Packet object.
 * Returns a result with all violations found.
 */
export function validate(packet: Packet): ValidationResult {
  const errors: ValidationError[] = [];
  const { header, payload, signature } = packet;

  // Rule 1: Version check
  if (header.version !== PROTOCOL_VERSION) {
    errors.push({
      code: 'PACKET_VERSION_MISMATCH',
      field: 'version',
      message: `Expected version ${PROTOCOL_VERSION}, got ${header.version}`,
    });
  }

  // Rule 5: Packet type must be known
  if (!isValidPacketType(header.packetType)) {
    errors.push({
      code: 'PACKET_TYPE_UNKNOWN',
      field: 'packetType',
      message: `Unknown packet type: 0x${header.packetType.toString(16).padStart(2, '0')}`,
    });
  }

  // Payload length consistency
  if (header.payloadLength !== payload.length) {
    errors.push({
      code: 'PACKET_PAYLOAD_LENGTH_MISMATCH',
      field: 'payloadLength',
      message: `Header declares ${header.payloadLength} bytes, actual payload is ${payload.length} bytes`,
    });
  }

  // Total size check
  const hasSig = (header.flags & PacketFlags.SIGNED) !== 0;
  const totalSize = HEADER_SIZE + header.payloadLength + (hasSig ? SIGNATURE_SIZE : 0);
  if (totalSize > MAX_PACKET_SIZE) {
    errors.push({
      code: 'PACKET_TOO_LARGE',
      field: 'size',
      message: `Total packet size ${totalSize} exceeds maximum ${MAX_PACKET_SIZE}`,
    });
  }

  // Signature presence check
  if (hasSig && (signature == null || signature.length !== SIGNATURE_SIZE)) {
    errors.push({
      code: 'PACKET_SIGNATURE_MISSING',
      field: 'signature',
      message: `SIGNED flag set but signature is ${signature ? signature.length : 0} bytes (expected ${SIGNATURE_SIZE})`,
    });
  }

  // TTL range
  if (header.ttl > 255) {
    errors.push({
      code: 'PACKET_TTL_INVALID',
      field: 'ttl',
      message: `TTL ${header.ttl} exceeds maximum 255`,
    });
  }

  // Reserved flags should be zero (warning, not error — per versioning spec)
  if ((header.flags & 0xf0) !== 0) {
    errors.push({
      code: 'PACKET_FLAGS_RESERVED',
      field: 'flags',
      message: `Reserved flag bits are non-zero: 0x${header.flags.toString(16)}`,
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Verify the CRC-32 checksum of a raw packet buffer.
 * Returns true if the checksum is correct.
 */
export function verifyChecksum(data: Buffer): boolean {
  if (data.length < HEADER_SIZE) return false;

  // Read the stored checksum
  const stored = data.readUInt32BE(67);

  // Zero out the checksum field for computation
  const copy = Buffer.from(data);
  copy.writeUInt32BE(0, 67);

  // Compute and compare
  const computed = crc32(copy);
  return stored === computed;
}

function isValidPacketType(type: number): boolean {
  return Object.values(PacketType).includes(type as PacketType);
}
