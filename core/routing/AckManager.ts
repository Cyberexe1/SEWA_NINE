/**
 * NINE Routing — ACK Manager
 *
 * Tracks packets awaiting ACK responses.
 * Manages retransmission timers and retry counts.
 */

import { type NodeID, type PacketID, type Timestamp } from '../shared/Types.js';

export interface PendingAck {
  readonly packetId: PacketID;
  readonly destinationId: NodeID;
  readonly sentAt: Timestamp;
  readonly serialized: Buffer;
  retryCount: number;
}

export class AckManager {
  private readonly retryIntervalMs: number;
  private readonly maxRetries: number;
  private pending: Map<string, PendingAck> = new Map();

  constructor(retryIntervalMs: number = 3000, maxRetries: number = 3) {
    this.retryIntervalMs = retryIntervalMs;
    this.maxRetries = maxRetries;
  }

  /** Register a packet that requires ACK. */
  expectAck(packetId: PacketID, destinationId: NodeID, serialized: Buffer, now: Timestamp): void {
    this.pending.set(packetId.toLowerCase(), {
      packetId, destinationId, sentAt: now, serialized, retryCount: 0,
    });
  }

  /** Process a received ACK. Returns true if we were waiting for it. */
  receiveAck(packetId: PacketID): boolean {
    return this.pending.delete(packetId.toLowerCase());
  }

  /** Get packets that need retransmission (timeout exceeded, retries remaining). */
  getRetransmissions(now: Timestamp): PendingAck[] {
    const retransmit: PendingAck[] = [];
    for (const entry of this.pending.values()) {
      const age = (now as number) - (entry.sentAt as number);
      if (age > this.retryIntervalMs && entry.retryCount < this.maxRetries) {
        retransmit.push(entry);
      }
    }
    return retransmit;
  }

  /** Get packets that have exhausted all retries (delivery failed). */
  getFailures(now: Timestamp): PendingAck[] {
    const failed: PendingAck[] = [];
    for (const [key, entry] of this.pending) {
      const age = (now as number) - (entry.sentAt as number);
      if (age > this.retryIntervalMs && entry.retryCount >= this.maxRetries) {
        failed.push(entry);
        this.pending.delete(key);
      }
    }
    return failed;
  }

  /** Increment retry count for a packet. */
  incrementRetry(packetId: PacketID, now: Timestamp): void {
    const entry = this.pending.get(packetId.toLowerCase());
    if (entry) {
      entry.retryCount++;
      // Reset sentAt so the next timeout window starts from now
      (entry as any).sentAt = now;
    }
  }

  /** Check if we are waiting for an ACK for this packet. */
  isWaiting(packetId: PacketID): boolean {
    return this.pending.has(packetId.toLowerCase());
  }

  size(): number { return this.pending.size; }
  clear(): void { this.pending.clear(); }
}
