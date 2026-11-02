/**
 * NINE Protocol - Message Store
 *
 * Persists broadcast and encrypted messages locally.
 */

import type { PacketID, NodeID, Timestamp } from '../shared/Types.js';

/**
 * A stored message record.
 */
export interface StoredMessage {
  id: number;
  packetId: PacketID;
  senderId: NodeID;
  senderName: string;
  content: string | null;
  contentType: number;
  encrypted: boolean;
  decrypted: boolean;
  receivedAt: Timestamp;
  decryptedAt: Timestamp | null;
}

/**
 * Message Store interface.
 */
export interface IMessageStore {
  /** Store a received broadcast message */
  storeBroadcast(message: Omit<StoredMessage, 'id'>): Promise<void>;

  /** Store a received encrypted message */
  storeSecureMessage(message: Omit<StoredMessage, 'id'>): Promise<void>;

  /** Mark a message as decrypted with its plaintext */
  markDecrypted(packetId: PacketID, plaintext: string): Promise<void>;

  /** Get broadcast messages (paginated) */
  getBroadcasts(limit?: number, offset?: number): Promise<StoredMessage[]>;

  /** Get secure messages (Admin only, paginated) */
  getSecureMessages(limit?: number, offset?: number): Promise<StoredMessage[]>;

  /** Get a specific message */
  getByPacketId(packetId: PacketID): Promise<StoredMessage | null>;

  /** Get total message count */
  count(): Promise<number>;

  /** Delete old messages beyond retention limit */
  evictOld(maxCount: number): Promise<number>;
}
