/**
 * NINE Protocol - Packet Assembler
 *
 * Handles reassembly of related packets that arrive independently.
 * Specifically manages the pairing of:
 * - ENCRYPTED_MESSAGE + KEY_PACKET (dual-path secure messaging)
 *
 * Buffers partial arrivals and triggers assembly when both halves arrive.
 */

import type { PacketID, Timestamp } from '../shared/Types.js';

/**
 * A partial message awaiting its counterpart.
 */
export interface PendingAssembly {
  /** Which packet ID we're waiting to pair with */
  partnerPacketId: PacketID;

  /** The data we already have */
  data: Buffer;

  /** When this partial was buffered */
  bufferedAt: Timestamp;

  /** Type of partial: 'message' or 'key' */
  partialType: 'message' | 'key';

  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Assembled result — both halves present.
 */
export interface AssembledMessage {
  messagePacketId: PacketID;
  keyPacketId: PacketID;
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  encryptedKey: Buffer;
  algorithm: string;
  keyAlgorithm: string;
  metadata: Record<string, unknown>;
}

/**
 * Packet Assembler interface.
 */
export interface IPacketAssembler {
  /**
   * Buffer an ENCRYPTED_MESSAGE partial.
   * Returns assembled result if KEY_PACKET was already buffered.
   */
  bufferMessage(
    packetId: PacketID,
    keyPacketId: PacketID,
    ciphertext: Buffer,
    iv: Buffer,
    tag: Buffer,
    algorithm: string,
    metadata: Record<string, unknown>,
  ): AssembledMessage | null;

  /**
   * Buffer a KEY_PACKET partial.
   * Returns assembled result if ENCRYPTED_MESSAGE was already buffered.
   */
  bufferKey(
    packetId: PacketID,
    messagePacketId: PacketID,
    encryptedKey: Buffer,
    keyAlgorithm: string,
    metadata: Record<string, unknown>,
  ): AssembledMessage | null;

  /**
   * Evict partials that have been waiting too long.
   * @returns Number of evicted entries
   */
  evictExpired(maxAgeMs: number): number;

  /** Get count of pending partials */
  getPendingCount(): number;

  /** Clear all pending assemblies */
  clear(): void;
}
