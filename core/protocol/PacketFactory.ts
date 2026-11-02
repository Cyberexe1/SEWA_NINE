/**
 * NINE Protocol — Packet Factory
 *
 * Convenience functions for constructing valid Packet objects.
 * Uses crypto.randomUUID() for packet ID generation.
 */

import { randomUUID } from 'node:crypto';
import { type Packet, type PacketHeader, PROTOCOL_VERSION, PacketFlags } from './Packet.js';
import { type NodeID, type PacketID, type Timestamp, PacketType } from '../shared/Types.js';

export interface CreatePacketOptions {
  packetType: PacketType;
  senderId: NodeID;
  destinationId: NodeID;
  sequenceNumber: number;
  ttl: number;
  payload: Buffer;
  flags?: number;
  signature?: Buffer;
  packetId?: PacketID;
  timestamp?: Timestamp;
}

/**
 * Create an immutable Packet object.
 * Checksum is set to 0 in the model — the Serializer computes it on output.
 */
export function createPacket(options: CreatePacketOptions): Packet {
  const flags = options.flags ?? PacketFlags.NONE;
  const packetId = options.packetId ?? (randomUUID() as PacketID);
  const timestamp = options.timestamp ?? (Date.now() as Timestamp);

  const header: PacketHeader = {
    version: PROTOCOL_VERSION,
    packetType: options.packetType,
    flags,
    packetId,
    senderId: options.senderId,
    destinationId: options.destinationId,
    sequenceNumber: options.sequenceNumber,
    timestamp,
    ttl: options.ttl,
    hopCount: 0,
    payloadLength: options.payload.length,
    checksum: 0, // Computed during serialization
  };

  return {
    header,
    payload: options.payload,
    signature: options.signature,
  };
}
