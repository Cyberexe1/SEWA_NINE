/**
 * NINE Protocol - Secure Messaging Engine
 *
 * Handles encrypted user-to-Admin communication.
 * Coordinates between security engine (encryption) and
 * routing engine (dual-path delivery).
 */

import type { NodeID, PacketID, Timestamp } from '../shared/Types.js';

/**
 * Result of sending a secure message.
 */
export interface SecureMessageResult {
  success: boolean;
  messagePacketId: PacketID;
  keyPacketId: PacketID;
  dualPathUsed: boolean;
}

/**
 * Received secure message (Admin side, after decryption).
 */
export interface SecureMessageReceivedEvent {
  messagePacketId: PacketID;
  keyPacketId: PacketID;
  senderId: NodeID;
  senderName: string;
  plaintext: string;
  timestamp: Timestamp;
}

export type SecureMessageCallback = (event: SecureMessageReceivedEvent) => void;

/**
 * Secure Messaging Engine interface.
 */
export interface ISecureMessaging {
  /**
   * Send an encrypted message to the Admin.
   * Generates session key, encrypts, creates dual packets,
   * routes on independent paths.
   *
   * @param message - Plaintext message
   * @param adminId - Admin's Node ID
   * @returns Send result with both packet IDs
   */
  send(message: string, adminId: NodeID): Promise<SecureMessageResult>;

  /**
   * Process an incoming ENCRYPTED_MESSAGE packet (Admin only).
   * Buffers until corresponding KEY_PACKET arrives.
   */
  handleEncryptedMessage(
    packetId: PacketID,
    senderId: NodeID,
    keyPacketId: PacketID,
    algorithm: string,
    iv: Buffer,
    ciphertext: Buffer,
    tag: Buffer,
    timestamp: Timestamp,
  ): void;

  /**
   * Process an incoming KEY_PACKET (Admin only).
   * If corresponding ENCRYPTED_MESSAGE already buffered, decrypt and deliver.
   */
  handleKeyPacket(
    packetId: PacketID,
    messagePacketId: PacketID,
    algorithm: string,
    encryptedKey: Buffer,
  ): void;

  /** Register callback for fully decrypted secure messages */
  onReceived(callback: SecureMessageCallback): void;

  /** Remove callback */
  offReceived(callback: SecureMessageCallback): void;
}
