/**
 * NINE Protocol — Immutable Packet Model
 *
 * Conforms to NINE-RFC-v0.9.1 Section 4 (Packet Architecture).
 * Packets are value objects. Once created, they are never mutated.
 * Relay operations (TTL decrement, hopCount increment) produce NEW packets.
 */

import { type NodeID, type PacketID, type Timestamp, PacketType } from '../shared/Types.js';

// ─── Header ────────────────────────────────────────────────────────────

export interface PacketHeader {
  readonly version: number;
  readonly packetType: PacketType;
  readonly flags: number;
  readonly packetId: PacketID;
  readonly senderId: NodeID;
  readonly destinationId: NodeID;
  readonly sequenceNumber: number;
  readonly timestamp: Timestamp;
  readonly ttl: number;
  readonly hopCount: number;
  readonly payloadLength: number;
  readonly checksum: number;
}

// ─── Complete Packet ───────────────────────────────────────────────────

export interface Packet {
  readonly header: PacketHeader;
  readonly payload: Buffer;
  readonly signature?: Buffer;
}

// ─── Flags ─────────────────────────────────────────────────────────────

export const PacketFlags = {
  NONE: 0x00,
  PRIORITY: 0x01,
  REQUIRES_ACK: 0x02,
  SIGNED: 0x04,
  ENCRYPTED: 0x08,
} as const;

// ─── Constants ─────────────────────────────────────────────────────────

export const HEADER_SIZE = 71;
export const SIGNATURE_SIZE = 64;
export const MAX_PACKET_SIZE = 4096;
export const PROTOCOL_VERSION = 1;
