/**
 * NINE Security — Replay Protection
 *
 * RFC Section 10.7: Prevents replay attacks using:
 * 1. Packet ID deduplication (via DuplicatePacketCache)
 * 2. Timestamp freshness check (MAX_PACKET_AGE_MS)
 * 3. Per-sender sequence number tracking
 */

import { type NodeID, type PacketID, type Timestamp } from '../shared/Types.js';

export interface ReplayCheckResult {
  readonly allowed: boolean;
  readonly reason?: 'duplicate_id' | 'stale_timestamp' | 'sequence_replay';
}

export class ReplayProtection {
  private readonly maxAgeMs: number;
  private readonly seenIds: Set<string> = new Set();
  private readonly senderSequences: Map<string, number> = new Map();
  private readonly maxIdCache: number;

  constructor(maxAgeMs: number = 60000, maxIdCache: number = 2048) {
    this.maxAgeMs = maxAgeMs;
    this.maxIdCache = maxIdCache;
  }

  /** Check if a packet should be accepted or rejected. */
  check(packetId: PacketID, senderId: NodeID, sequenceNumber: number, timestamp: Timestamp, now: Timestamp): ReplayCheckResult {
    // 1. Duplicate packet ID
    const idKey = packetId.toLowerCase();
    if (this.seenIds.has(idKey)) {
      return { allowed: false, reason: 'duplicate_id' };
    }

    // 2. Timestamp freshness
    const age = (now as number) - (timestamp as number);
    if (age > this.maxAgeMs || age < -this.maxAgeMs) {
      return { allowed: false, reason: 'stale_timestamp' };
    }

    // 3. Sequence number (advisory in v1 — log but allow)
    const senderKey = senderId.toLowerCase();
    const lastSeq = this.senderSequences.get(senderKey) ?? -1;
    if (sequenceNumber <= lastSeq && sequenceNumber !== 0) {
      // In v1 this is advisory — we still reject for security
      return { allowed: false, reason: 'sequence_replay' };
    }

    // Accept — record state
    this.recordAccepted(packetId, senderId, sequenceNumber);
    return { allowed: true };
  }

  /** Record an accepted packet (called internally or after external validation). */
  recordAccepted(packetId: PacketID, senderId: NodeID, sequenceNumber: number): void {
    const idKey = packetId.toLowerCase();
    if (this.seenIds.size >= this.maxIdCache) {
      // Evict oldest (first inserted)
      const first = this.seenIds.values().next().value;
      if (first) this.seenIds.delete(first);
    }
    this.seenIds.add(idKey);
    this.senderSequences.set(senderId.toLowerCase(), sequenceNumber);
  }

  /** Get the last known sequence number for a sender. */
  getLastSequence(senderId: NodeID): number {
    return this.senderSequences.get(senderId.toLowerCase()) ?? -1;
  }

  /** Reset all state. */
  clear(): void {
    this.seenIds.clear();
    this.senderSequences.clear();
  }

  get idCacheSize(): number { return this.seenIds.size; }
  get trackedSenders(): number { return this.senderSequences.size; }
}
