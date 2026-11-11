/**
 * NINE Transport — Connection Policy
 *
 * Decides WHICH discovered peers become active Bluetooth links and
 * manages connection lifecycle policies: max peers, duplicate prevention,
 * backoff after failure, reconnection scheduling, and peer eviction.
 *
 * Pure logic — no I/O, no Android dependencies, fully testable.
 */

import { type PeerID } from '../shared/Types.js';

export interface ConnectionPolicyConfig {
  /** Maximum simultaneous connections allowed. Default: 7 (BT Classic piconet limit). */
  maxConnections: number;

  /** Base backoff delay in ms after a failed connection attempt. Default: 3000. */
  baseBackoffMs: number;

  /** Maximum backoff delay in ms (caps exponential growth). Default: 30000. */
  maxBackoffMs: number;

  /** Maximum consecutive failures before a peer is blacklisted for this session. Default: 5. */
  maxFailures: number;

  /** Cooldown in ms before allowing reconnect to a peer that disconnected cleanly. Default: 5000. */
  reconnectCooldownMs: number;
}

const DEFAULT_CONFIG: ConnectionPolicyConfig = {
  maxConnections: 7,
  baseBackoffMs: 3000,
  maxBackoffMs: 30000,
  maxFailures: 5,
  reconnectCooldownMs: 5000,
};

interface PeerRecord {
  peerId: PeerID;
  consecutiveFailures: number;
  lastFailureAt: number;
  lastDisconnectAt: number;
  blacklisted: boolean;
}

export class ConnectionPolicy {
  private readonly config: ConnectionPolicyConfig;
  private readonly records: Map<string, PeerRecord> = new Map();
  private _activeCount = 0;

  constructor(config?: Partial<ConnectionPolicyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Current number of active connections tracked by the policy. */
  get activeCount(): number { return this._activeCount; }

  /** Maximum connections allowed. */
  get maxConnections(): number { return this.config.maxConnections; }

  /**
   * Ask whether a connection to this peer should be attempted right now.
   * Returns `{ allowed: true }` or `{ allowed: false, reason }`.
   */
  shouldConnect(peerId: PeerID, now: number = Date.now()): { allowed: boolean; reason?: string } {
    // Check capacity
    if (this._activeCount >= this.config.maxConnections) {
      return { allowed: false, reason: 'MAX_CONNECTIONS_REACHED' };
    }

    const key = (peerId as string).toLowerCase();
    const record = this.records.get(key);

    if (!record) return { allowed: true };

    // Blacklisted peer
    if (record.blacklisted) {
      return { allowed: false, reason: 'PEER_BLACKLISTED' };
    }

    // In backoff period after failure
    if (record.consecutiveFailures > 0) {
      const backoff = this.computeBackoff(record.consecutiveFailures);
      const elapsed = now - record.lastFailureAt;
      if (elapsed < backoff) {
        return { allowed: false, reason: 'BACKOFF_ACTIVE' };
      }
    }

    // In cooldown after clean disconnect
    if (record.lastDisconnectAt > 0) {
      const elapsed = now - record.lastDisconnectAt;
      if (elapsed < this.config.reconnectCooldownMs) {
        return { allowed: false, reason: 'RECONNECT_COOLDOWN' };
      }
    }

    return { allowed: true };
  }

  /**
   * Ask whether an inbound connection should be accepted.
   * Inbound connections are accepted unless at capacity or peer is blacklisted.
   */
  shouldAcceptInbound(peerId: PeerID): { allowed: boolean; reason?: string } {
    if (this._activeCount >= this.config.maxConnections) {
      return { allowed: false, reason: 'MAX_CONNECTIONS_REACHED' };
    }

    const key = (peerId as string).toLowerCase();
    const record = this.records.get(key);
    if (record?.blacklisted) {
      return { allowed: false, reason: 'PEER_BLACKLISTED' };
    }

    return { allowed: true };
  }

  /** Record a successful connection. */
  recordConnected(peerId: PeerID): void {
    this._activeCount++;
    const key = (peerId as string).toLowerCase();
    const record = this.getOrCreate(key, peerId);
    record.consecutiveFailures = 0; // reset on success
    record.lastDisconnectAt = 0;
  }

  /** Record a connection failure. Increments backoff. */
  recordFailure(peerId: PeerID, now: number = Date.now()): void {
    const key = (peerId as string).toLowerCase();
    const record = this.getOrCreate(key, peerId);
    record.consecutiveFailures++;
    record.lastFailureAt = now;
    if (record.consecutiveFailures >= this.config.maxFailures) {
      record.blacklisted = true;
    }
  }

  /** Record a clean disconnect. */
  recordDisconnected(peerId: PeerID, now: number = Date.now()): void {
    if (this._activeCount > 0) this._activeCount--;
    const key = (peerId as string).toLowerCase();
    const record = this.getOrCreate(key, peerId);
    record.lastDisconnectAt = now;
  }

  /** Check if a peer is currently blacklisted. */
  isBlacklisted(peerId: PeerID): boolean {
    const key = (peerId as string).toLowerCase();
    return this.records.get(key)?.blacklisted ?? false;
  }

  /** Get the current backoff delay for a peer (0 if no failures). */
  getBackoffMs(peerId: PeerID): number {
    const key = (peerId as string).toLowerCase();
    const record = this.records.get(key);
    if (!record || record.consecutiveFailures === 0) return 0;
    return this.computeBackoff(record.consecutiveFailures);
  }

  /** Get consecutive failure count for a peer. */
  getFailureCount(peerId: PeerID): number {
    const key = (peerId as string).toLowerCase();
    return this.records.get(key)?.consecutiveFailures ?? 0;
  }

  /** Reset a peer's failure/blacklist state (e.g., after manual intervention). */
  resetPeer(peerId: PeerID): void {
    this.records.delete((peerId as string).toLowerCase());
  }

  /** Clear all policy state. */
  clear(): void {
    this.records.clear();
    this._activeCount = 0;
  }

  private computeBackoff(failures: number): number {
    // Exponential backoff: base * 2^(failures-1), capped at maxBackoffMs
    const delay = this.config.baseBackoffMs * Math.pow(2, failures - 1);
    return Math.min(delay, this.config.maxBackoffMs);
  }

  private getOrCreate(key: string, peerId: PeerID): PeerRecord {
    let record = this.records.get(key);
    if (!record) {
      record = { peerId, consecutiveFailures: 0, lastFailureAt: 0, lastDisconnectAt: 0, blacklisted: false };
      this.records.set(key, record);
    }
    return record;
  }
}
