/**
 * NINE Security — Session Key Manager
 *
 * RFC Section 10.5: Ephemeral AES-256 keys used exactly once per message.
 * Provides generation, tracking, and secure erasure.
 */

import { randomBytes } from 'node:crypto';
import { type Timestamp } from '../shared/Types.js';

export interface SessionKeyRecord {
  readonly keyId: string;
  readonly key: Buffer;
  readonly createdAt: Timestamp;
  used: boolean;
}

export class SessionKeyManager {
  private keys: Map<string, SessionKeyRecord> = new Map();
  private readonly maxAgeMs: number;

  constructor(maxAgeMs: number = 60000) {
    this.maxAgeMs = maxAgeMs;
  }

  /** Generate a new one-time session key. Returns the key and its ID. */
  generate(now: Timestamp): SessionKeyRecord {
    const key = randomBytes(32);
    const keyId = randomBytes(8).toString('hex');
    const record: SessionKeyRecord = { keyId, key, createdAt: now, used: false };
    this.keys.set(keyId, record);
    return record;
  }

  /** Mark a session key as used. After use it should be erased. */
  markUsed(keyId: string): void {
    const record = this.keys.get(keyId);
    if (record) {
      record.used = true;
      // Zero the key material
      record.key.fill(0);
      this.keys.delete(keyId);
    }
  }

  /** Get a session key by ID (for verification/debugging only). */
  get(keyId: string): SessionKeyRecord | undefined {
    return this.keys.get(keyId);
  }

  /** Evict expired session keys (older than maxAgeMs). */
  evictExpired(now: Timestamp): number {
    let count = 0;
    for (const [id, record] of this.keys) {
      if ((now as number) - (record.createdAt as number) > this.maxAgeMs) {
        record.key.fill(0);
        this.keys.delete(id);
        count++;
      }
    }
    return count;
  }

  size(): number { return this.keys.size; }
  clear(): void { for (const r of this.keys.values()) r.key.fill(0); this.keys.clear(); }
}
