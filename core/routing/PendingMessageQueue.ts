/**
 * NINE Routing — Pending Message Queue
 *
 * RFC Section 7.7: Buffers packets awaiting route discovery.
 * When a route is found, queued packets are dequeued and forwarded.
 */

import { type NodeID, type Timestamp } from '../shared/Types.js';
import { type Packet } from '../protocol/Packet.js';

export interface PendingMessage {
  readonly packet: Packet;
  readonly serialized: Buffer;
  readonly destinationId: NodeID;
  readonly enqueuedAt: Timestamp;
  retryCount: number;
}

export class PendingMessageQueue {
  private readonly maxSize: number;
  private readonly timeoutMs: number;
  private queue: PendingMessage[] = [];

  constructor(maxSize: number = 64, timeoutMs: number = 30000) {
    this.maxSize = maxSize;
    this.timeoutMs = timeoutMs;
  }

  /** Enqueue a packet. Returns false if queue is full. */
  enqueue(packet: Packet, serialized: Buffer, destinationId: NodeID, now: Timestamp): boolean {
    if (this.queue.length >= this.maxSize) return false;
    this.queue.push({ packet, serialized, destinationId, enqueuedAt: now, retryCount: 0 });
    return true;
  }

  /** Dequeue all packets for a destination (route found). */
  dequeueFor(destinationId: NodeID): PendingMessage[] {
    const key = destinationId.toLowerCase();
    const matched = this.queue.filter(m => m.destinationId.toLowerCase() === key);
    this.queue = this.queue.filter(m => m.destinationId.toLowerCase() !== key);
    return matched;
  }

  /** Evict expired entries. Returns evicted packets. */
  evictExpired(now: Timestamp): PendingMessage[] {
    const expired = this.queue.filter(m => (now as number) - (m.enqueuedAt as number) > this.timeoutMs);
    this.queue = this.queue.filter(m => (now as number) - (m.enqueuedAt as number) <= this.timeoutMs);
    return expired;
  }

  /** Check if queue has pending messages for a destination. */
  hasPendingFor(destinationId: NodeID): boolean {
    return this.queue.some(m => m.destinationId.toLowerCase() === destinationId.toLowerCase());
  }

  isFull(): boolean { return this.queue.length >= this.maxSize; }
  size(): number { return this.queue.length; }
  clear(): void { this.queue = []; }
}
