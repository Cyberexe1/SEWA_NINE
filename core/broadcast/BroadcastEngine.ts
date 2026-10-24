/**
 * NINE Protocol - Broadcast Engine
 *
 * Handles one-to-all message propagation through the mesh.
 * Uses controlled flooding with TTL and deduplication.
 */

import type { NodeID, PacketID, Timestamp } from '../shared/Types.js';

/**
 * Broadcast result returned to the application.
 */
export interface BroadcastResult {
  success: boolean;
  packetId: PacketID;
  reachedNeighbors: number;
}

/**
 * Received broadcast event delivered to the application.
 */
export interface BroadcastReceivedEvent {
  packetId: PacketID;
  senderId: NodeID;
  senderName: string;
  message: string;
  hopCount: number;
  timestamp: Timestamp;
  isEmergency: boolean;
}

export type BroadcastCallback = (event: BroadcastReceivedEvent) => void;

/**
 * Broadcast Engine interface.
 */
export interface IBroadcastEngine {
  /**
   * Send a broadcast message to all reachable nodes.
   *
   * @param message - UTF-8 message content
   * @param isEmergency - If true, gets higher relay priority
   * @returns Result with packet ID and neighbor delivery count
   */
  send(message: string, isEmergency?: boolean): Promise<BroadcastResult>;

  /**
   * Process an incoming broadcast packet (from the protocol layer).
   * Delivers to application if new, re-floods to neighbors if TTL > 0.
   */
  handleIncoming(packetId: PacketID, senderId: NodeID, senderName: string, message: string, hopCount: number, ttl: number, timestamp: Timestamp, isEmergency: boolean): void;

  /** Register a callback for received broadcasts */
  onReceived(callback: BroadcastCallback): void;

  /** Remove a callback */
  offReceived(callback: BroadcastCallback): void;
}
