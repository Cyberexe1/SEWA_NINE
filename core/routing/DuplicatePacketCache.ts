/**
 * NINE Routing — Duplicate Packet Cache
 *
 * RFC Section 7.5: Prevents processing the same packet twice.
 * Bounded circular buffer keyed by packetId.
 */

import { type PacketID, type Timestamp } from '../shared/Types.js';

interface CacheEntry {
  packetId: PacketID;
  addedAt: Timestamp;
}

export class DuplicatePacketCache {
  private readonly maxSize: number;
  private readonly expiryMs: number;
  private entries: Map<string, CacheEntry> = new Map();

  constructor(maxSize: number = 1024, expiryMs: number = 60000) {
    this.maxSize = maxSize;
    this.expiryMs = expiryMs;
  }

  /** Check if a packet has been seen. */
  hasSeen(packetId: PacketID): boolean {
    return this.entries.has(packetId.toLowerCase());
  }

  /** Mark a packet as seen. Evicts oldest if at capacity. */
  markSeen(packetId: PacketID, now: Timestamp): void {
    const key = packetId.toLowerCase();
    if (this.entries.has(key)) return;
    if (this.entries.size >= this.maxSize) {
      // Evict oldest entry
      const firstKey = this.entries.keys().next().value;
      if (firstKey) this.entries.delete(firstKey);
    }
    this.entries.set(key, { packetId, addedAt: now });
  }

  /** Evict entries older than expiryMs. Returns count evicted. */
  evict(now: Timestamp): number {
    let count = 0;
    for (const [key, entry] of this.entries) {
      if ((now as number) - (entry.addedAt as number) > this.expiryMs) {
        this.entries.delete(key);
        count++;
      }
    }
    return count;
  }

  size(): number { return this.entries.size; }
  clear(): void { this.entries.clear(); }
}
