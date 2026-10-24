/**
 * NINE Protocol — Heartbeat State
 *
 * Conforms to NINE-RFC-v0.9.1 Section 3.6 (Heartbeat).
 * Tracks per-neighbor heartbeat timing for liveness detection.
 */

import { type NodeID, type SessionID, type Timestamp } from '../shared/Types.js';

// ─── Heartbeat Record (Immutable) ─────────────────────────────────────

export interface HeartbeatRecord {
  readonly nodeId: NodeID;
  readonly sessionId: SessionID;
  readonly lastReceived: Timestamp;
  readonly neighborCount: number;
  readonly load: number;
  readonly missedCount: number;
}

// ─── Heartbeat Status ──────────────────────────────────────────────────

export enum HeartbeatStatus {
  ALIVE = 'alive',
  DEGRADED = 'degraded',     // 1 missed heartbeat
  DEAD = 'dead',             // Exceeded timeout
}

// ─── Heartbeat State Tracker ───────────────────────────────────────────

export class HeartbeatState {
  private readonly records: Map<string, HeartbeatRecord> = new Map();
  private readonly intervalMs: number;
  private readonly timeoutMs: number;

  constructor(intervalMs: number, timeoutMs: number) {
    if (timeoutMs < 3 * intervalMs) {
      throw new Error(
        `Timeout (${timeoutMs}ms) must be >= 3× interval (${3 * intervalMs}ms)`
      );
    }
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Record a received heartbeat from a neighbor.
   * Returns the previous session ID (for restart detection) or null if new.
   */
  recordHeartbeat(
    nodeId: NodeID,
    sessionId: SessionID,
    now: Timestamp,
    neighborCount: number,
    load: number,
  ): SessionID | null {
    const key = nodeId.toLowerCase();
    const existing = this.records.get(key);
    const previousSession = existing?.sessionId ?? null;

    this.records.set(key, {
      nodeId,
      sessionId,
      lastReceived: now,
      neighborCount,
      load,
      missedCount: 0,
    });

    // Return previous session only if it differs (restart detected)
    if (previousSession && previousSession !== sessionId) {
      return previousSession;
    }
    return null;
  }

  /**
   * Get the heartbeat status of a specific neighbor.
   */
  getStatus(nodeId: NodeID, now: Timestamp): HeartbeatStatus {
    const record = this.records.get(nodeId.toLowerCase());
    if (!record) return HeartbeatStatus.DEAD;

    const age = (now as number) - (record.lastReceived as number);
    if (age > this.timeoutMs) return HeartbeatStatus.DEAD;
    if (age > this.intervalMs * 2) return HeartbeatStatus.DEGRADED;
    return HeartbeatStatus.ALIVE;
  }

  /**
   * Get the heartbeat record for a neighbor.
   */
  getRecord(nodeId: NodeID): HeartbeatRecord | undefined {
    return this.records.get(nodeId.toLowerCase());
  }

  /**
   * Check all neighbors and return IDs of those that are DEAD.
   * Does NOT remove them — caller is responsible for cleanup.
   */
  getDeadNeighbors(now: Timestamp): NodeID[] {
    const dead: NodeID[] = [];
    for (const [, record] of this.records) {
      const age = (now as number) - (record.lastReceived as number);
      if (age > this.timeoutMs) {
        dead.push(record.nodeId);
      }
    }
    return dead;
  }

  /**
   * Remove a neighbor's heartbeat record (after they've been evicted).
   */
  remove(nodeId: NodeID): boolean {
    return this.records.delete(nodeId.toLowerCase());
  }

  /**
   * Get number of tracked neighbors.
   */
  size(): number {
    return this.records.size;
  }

  /**
   * Clear all records.
   */
  clear(): void {
    this.records.clear();
  }

  /**
   * Get the configured interval.
   */
  getInterval(): number {
    return this.intervalMs;
  }

  /**
   * Get the configured timeout.
   */
  getTimeout(): number {
    return this.timeoutMs;
  }
}
