/**
 * NINE Protocol — Compliance Validation Helpers
 *
 * This module does NOT implement new protocol logic. It is a thin
 * verification harness around the frozen Packet Engine (Serializer,
 * Parser, Validator, Checksum) used exclusively by the compliance test
 * suite (tests/compliance/*).
 *
 * Two responsibilities:
 * 1. classifyPacket()  — run the exact same pipeline the RoutingEngine
 *    uses (verifyChecksum → parse → validate) and report at which stage
 *    a buffer was accepted or rejected. Tests assert against this
 *    classification instead of re-implementing pipeline logic.
 * 2. Malformed buffer builders — deterministic byte-level corruption of
 *    an otherwise-valid serialized packet, one corruption category per
 *    function, matching the "malformed packet tests" required by
 *    Phase 8.0. No randomness is used except where explicitly seeded by
 *    the caller (see FailureValidation.test.ts).
 */

import { type Packet, HEADER_SIZE, PacketFlags, MAX_PACKET_SIZE } from '../protocol/Packet.js';
import { serialize } from '../protocol/Serializer.js';
import { parse } from '../protocol/Parser.js';
import { validate, verifyChecksum, type ValidationResult } from '../protocol/Validator.js';
import { crc32 } from '../protocol/Checksum.js';

export type ClassificationStage = 'checksum' | 'parse' | 'validate' | 'ok';

export interface PacketClassification {
  readonly accepted: boolean;
  readonly stage: ClassificationStage;
  readonly reason?: string;
  readonly validation?: ValidationResult;
}

/**
 * Run a raw buffer through the same three-stage pipeline RoutingEngine
 * uses on receipt: checksum verification, structural parsing, then
 * semantic validation. Returns a classification instead of throwing,
 * so tests can assert rejection without try/catch boilerplate.
 */
export function classifyPacket(data: Buffer): PacketClassification {
  if (!verifyChecksum(data)) {
    return { accepted: false, stage: 'checksum', reason: 'CHECKSUM_INVALID' };
  }

  let packet: Packet;
  try {
    packet = parse(data);
  } catch (err) {
    return { accepted: false, stage: 'parse', reason: (err as Error).message };
  }

  const result = validate(packet);
  if (!result.valid) {
    return { accepted: false, stage: 'validate', reason: result.errors[0]?.code, validation: result };
  }

  return { accepted: true, stage: 'ok', validation: result };
}

// ─── Malformed Buffer Builders ──────────────────────────────────────────
// Each function takes a well-formed serialized packet and returns a new
// buffer with exactly one category of corruption applied. The checksum
// is deliberately NOT recomputed after corruption (except where the
// corruption category is specifically about the checksum field) because
// real-world corruption in transit does not recompute checksums either —
// that is precisely what CRC-32 is meant to catch.

/** Version byte (offset 0) set to an unsupported value. */
export function corruptVersion(buf: Buffer, version = 0x99): Buffer {
  const out = Buffer.from(buf);
  out.writeUInt8(version, 0);
  return withRecomputedChecksum(out);
}

/** Packet type byte (offset 1) set to a code outside the defined 0x01–0x0B range. */
export function corruptPacketType(buf: Buffer, type = 0x7f): Buffer {
  const out = Buffer.from(buf);
  out.writeUInt8(type, 1);
  return withRecomputedChecksum(out);
}

/** Reserved flag bits (0xF0) set to non-zero. */
export function corruptFlags(buf: Buffer): Buffer {
  const out = Buffer.from(buf);
  const current = out.readUInt8(2);
  out.writeUInt8(current | 0xf0, 2);
  return withRecomputedChecksum(out);
}

/** Checksum field (offset 67) corrupted directly — the recomputed value is discarded. */
export function corruptChecksum(buf: Buffer): Buffer {
  const out = Buffer.from(buf);
  const current = out.readUInt32BE(67);
  out.writeUInt32BE((current ^ 0xffffffff) >>> 0, 67);
  return out;
}

/** Flip a byte inside the payload region without touching the checksum. */
export function corruptPayload(buf: Buffer): Buffer {
  const out = Buffer.from(buf);
  if (out.length <= HEADER_SIZE) return out; // no payload to corrupt
  const idx = HEADER_SIZE + Math.floor((out.length - HEADER_SIZE) / 2);
  out[idx] = out[idx]! ^ 0xff;
  return out; // checksum intentionally stale — this is the point of the test
}

/** Declared payloadLength (offset 65) inflated beyond the actual buffer contents. */
export function corruptPayloadLength(buf: Buffer): Buffer {
  const out = Buffer.from(buf);
  const declared = out.readUInt16BE(65);
  out.writeUInt16BE(declared + 500, 65);
  return withRecomputedChecksum(out);
}

/** Truncate the buffer below HEADER_SIZE — simulates a torn/incomplete frame. */
export function truncateBelowHeader(buf: Buffer): Buffer {
  return buf.subarray(0, HEADER_SIZE - 10);
}

/** Truncate the buffer so the declared payload cannot be fully present. */
export function truncatePayload(buf: Buffer): Buffer {
  if (buf.length <= HEADER_SIZE + 1) return buf.subarray(0, HEADER_SIZE);
  return buf.subarray(0, buf.length - 1);
}

/** Grow a payload past MAX_PACKET_SIZE — used for oversized-packet rejection tests. */
export function buildOversizedBuffer(basePacket: Packet): Buffer {
  const oversizedPayload = Buffer.alloc(MAX_PACKET_SIZE, 0xab);
  const bytes = serialize({
    header: { ...basePacket.header, payloadLength: oversizedPayload.length },
    payload: oversizedPayload,
  });
  return bytes;
}

/** SIGNED flag set but signature omitted. */
export function corruptMissingSignature(buf: Buffer): Buffer {
  const out = Buffer.from(buf);
  const current = out.readUInt8(2);
  out.writeUInt8(current | PacketFlags.SIGNED, 2);
  return withRecomputedChecksum(out);
}

/** Recompute and write a fresh CRC-32 over the buffer (checksum field zeroed first). */
function withRecomputedChecksum(buf: Buffer): Buffer {
  const out = Buffer.from(buf);
  out.writeUInt32BE(0, 67);
  out.writeUInt32BE(crc32(out), 67);
  return out;
}
