/**
 * NINE Messaging — Reassembly Manager
 *
 * Buffers partial dual-path messages at the Admin node.
 * When both halves (SECURE_DATA + SECURE_KEY) arrive, signals ready.
 */

import { type NodeID, type Timestamp } from '../shared/Types.js';

export interface PartialMessage {
  sessionId: string;
  senderId?: NodeID;
  ciphertext?: Buffer;
  iv?: Buffer;
  tag?: Buffer;
  encryptedKey?: Buffer;
  hasData: boolean;
  hasKey: boolean;
  firstReceivedAt: Timestamp;
}

export interface AssembledMessage {
  sessionId: string;
  senderId: NodeID;
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  encryptedKey: Buffer;
  firstReceivedAt: Timestamp;
}

export class ReassemblyManager {
  private readonly timeoutMs: number;
  private partials: Map<string, PartialMessage> = new Map();
  private completed: Set<string> = new Set();

  constructor(timeoutMs: number = 30000) {
    this.timeoutMs = timeoutMs;
  }

  /** Receive the data half (ENCRYPTED_MESSAGE). Returns status. */
  receiveData(
    sessionId: string, ciphertext: Buffer, iv: Buffer, tag: Buffer, senderId: NodeID, now: Timestamp,
  ): 'ready' | 'waiting' | 'duplicate' {
    if (this.completed.has(sessionId)) return 'duplicate';

    const existing = this.partials.get(sessionId);
    if (existing?.hasData) return 'duplicate';

    if (existing) {
      existing.ciphertext = ciphertext;
      existing.iv = iv;
      existing.tag = tag;
      existing.senderId = senderId;
      existing.hasData = true;
      return existing.hasKey ? 'ready' : 'waiting';
    }

    this.partials.set(sessionId, {
      sessionId, senderId, ciphertext, iv, tag,
      hasData: true, hasKey: false, firstReceivedAt: now,
    });
    return 'waiting';
  }

  /** Receive the key half (KEY_PACKET). Returns status. */
  receiveKey(sessionId: string, encryptedKey: Buffer, now: Timestamp): 'ready' | 'waiting' | 'duplicate' {
    if (this.completed.has(sessionId)) return 'duplicate';

    const existing = this.partials.get(sessionId);
    if (existing?.hasKey) return 'duplicate';

    if (existing) {
      existing.encryptedKey = encryptedKey;
      existing.hasKey = true;
      return existing.hasData ? 'ready' : 'waiting';
    }

    this.partials.set(sessionId, {
      sessionId, encryptedKey,
      hasData: false, hasKey: true, firstReceivedAt: now,
    });
    return 'waiting';
  }

  /** Get assembled message if both halves present. */
  getAssembled(sessionId: string): AssembledMessage | null {
    const p = this.partials.get(sessionId);
    if (!p || !p.hasData || !p.hasKey) return null;
    return {
      sessionId: p.sessionId,
      senderId: p.senderId!,
      ciphertext: p.ciphertext!,
      iv: p.iv!,
      tag: p.tag!,
      encryptedKey: p.encryptedKey!,
      firstReceivedAt: p.firstReceivedAt,
    };
  }

  /** Mark a session as completed (decrypted). */
  complete(sessionId: string): void {
    this.partials.delete(sessionId);
    this.completed.add(sessionId);
  }

  /** Evict expired partial messages. Returns count evicted. */
  evictExpired(now: Timestamp): number {
    let count = 0;
    for (const [key, partial] of this.partials) {
      if ((now as number) - (partial.firstReceivedAt as number) > this.timeoutMs) {
        this.partials.delete(key);
        count++;
      }
    }
    return count;
  }

  getPendingCount(): number { return this.partials.size; }
  getCompletedCount(): number { return this.completed.size; }
  clear(): void { this.partials.clear(); this.completed.clear(); }
}
