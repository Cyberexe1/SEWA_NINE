/**
 * NINE Messaging — Dual-Path Manager
 *
 * Orchestrates the splitting, routing, and reassembly of secure messages.
 * The encrypted message and encrypted key travel independent mesh paths.
 * Only Admin can reassemble and decrypt.
 */

import { randomBytes } from 'node:crypto';
import { type NodeID, type PacketID, type Timestamp, PacketType } from '../shared/Types.js';
import { type Packet } from '../protocol/Packet.js';
import { createPacket } from '../protocol/PacketFactory.js';
import { serialize } from '../protocol/Serializer.js';
import { KeyManager, type SecureMessageBundle } from '../security/KeyManager.js';
import { PathSelector } from './PathSelector.js';
import { ReassemblyManager } from './ReassemblyManager.js';

export interface DualPathMetrics {
  messagesSent: number;
  messagesDelivered: number;
  messagesTimedOut: number;
  duplicatesSuppressed: number;
  averageReconstructionMs: number;
  dualPathUsed: number;
  singlePathFallback: number;
}

export interface SendResult {
  sessionId: string;
  dataPacketId: PacketID;
  keyPacketId: PacketID;
  dualPathAchieved: boolean;
  pending: boolean;
}

export type RoutedSendFn = (packetBytes: Buffer, path: NodeID[]) => void;

interface PendingSecureSend {
  sessionId: string;
  dataBytes: Buffer;
  keyBytes: Buffer;
  adminId: NodeID;
  dataPacketId: PacketID;
  keyPacketId: PacketID;
  enqueuedAt: Timestamp;
}

export class DualPathManager {
  private readonly selfId: NodeID;
  private readonly keyManager: KeyManager;
  private readonly pathSelector: PathSelector;
  readonly reassembly: ReassemblyManager;
  private readonly routedSend: RoutedSendFn;
  private readonly clock: () => Timestamp;
  /** Secure sends waiting for a route to become available. */
  private readonly pendingSends: Map<string, PendingSecureSend> = new Map();
  private _metrics: DualPathMetrics = {
    messagesSent: 0, messagesDelivered: 0, messagesTimedOut: 0,
    duplicatesSuppressed: 0, averageReconstructionMs: 0,
    dualPathUsed: 0, singlePathFallback: 0,
  };

  constructor(config: {
    selfId: NodeID;
    keyManager: KeyManager;
    pathSelector: PathSelector;
    routedSend: RoutedSendFn;
    clock: () => Timestamp;
    reassemblyTimeoutMs?: number;
  }) {
    this.selfId = config.selfId;
    this.keyManager = config.keyManager;
    this.pathSelector = config.pathSelector;
    this.routedSend = config.routedSend;
    this.clock = config.clock;
    this.reassembly = new ReassemblyManager(config.reassemblyTimeoutMs ?? 30000);
  }

  /**
   * Send a secure message to Admin using dual-path delivery.
   */
  sendSecureMessage(plaintext: string, adminId: NodeID): SendResult {
    const now = this.clock();
    const message = Buffer.from(plaintext, 'utf-8');

    // Encrypt: AES for message, RSA for key
    const bundle = this.keyManager.encryptForAdmin(message, now);

    // Generate session ID linking both packets
    const sessionId = randomBytes(8).toString('hex');

    // Create ENCRYPTED_MESSAGE packet (SECURE_DATA)
    const dataPayload = this.encodeDataPayload(sessionId, bundle);
    const dataPacket = createPacket({
      packetType: PacketType.ENCRYPTED_MESSAGE,
      senderId: this.selfId,
      destinationId: adminId,
      sequenceNumber: Date.now() % 0xFFFFFFFF,
      ttl: 20,
      payload: dataPayload,
      timestamp: now,
    });

    // Create KEY_PACKET (SECURE_KEY)
    const keyPayload = this.encodeKeyPayload(sessionId, bundle);
    const keyPacket = createPacket({
      packetType: PacketType.KEY_PACKET,
      senderId: this.selfId,
      destinationId: adminId,
      sequenceNumber: (Date.now() + 1) % 0xFFFFFFFF,
      ttl: 20,
      payload: keyPayload,
      timestamp: now,
    });

    this._metrics.messagesSent++;
    const dataBytes = serialize(dataPacket);
    const keyBytes = serialize(keyPacket);

    // Ask the routing engine for a disjoint route pair.
    const paths = this.pathSelector.selectPaths(this.selfId, adminId);

    if (!paths.hasRoute) {
      // No route yet — queue and let retryPending()/tick() send once a route
      // is discovered. NineCore triggers route discovery.
      this.pendingSends.set(sessionId, {
        sessionId, dataBytes, keyBytes, adminId,
        dataPacketId: dataPacket.header.packetId,
        keyPacketId: keyPacket.header.packetId,
        enqueuedAt: now,
      });
      return {
        sessionId,
        dataPacketId: dataPacket.header.packetId,
        keyPacketId: keyPacket.header.packetId,
        dualPathAchieved: false,
        pending: true,
      };
    }

    this.transmitSplit(dataBytes, keyBytes, paths);
    return {
      sessionId,
      dataPacketId: dataPacket.header.packetId,
      keyPacketId: keyPacket.header.packetId,
      dualPathAchieved: paths.disjoint,
      pending: false,
    };
  }

  /**
   * Retry pending secure sends for a destination — called when a route
   * becomes available. Transmits only when a node-disjoint pair exists,
   * so dual-path is preferred over single-path fallback.
   */
  retryPending(destinationId: NodeID): void {
    for (const [sessionId, p] of this.pendingSends) {
      if (p.adminId.toLowerCase() !== destinationId.toLowerCase()) continue;
      const paths = this.pathSelector.selectPaths(this.selfId, p.adminId);
      if (paths.hasRoute && paths.disjoint) {
        this.transmitSplit(p.dataBytes, p.keyBytes, paths);
        this.pendingSends.delete(sessionId);
      }
    }
  }

  /** Transmit the data on path A and key on path B (or same path if not disjoint). */
  private transmitSplit(dataBytes: Buffer, keyBytes: Buffer, paths: { pathA: NodeID[]; pathB: NodeID[]; disjoint: boolean }): void {
    this.routedSend(dataBytes, paths.pathA);
    this.routedSend(keyBytes, paths.disjoint ? paths.pathB : paths.pathA);
    if (paths.disjoint) this._metrics.dualPathUsed++;
    else this._metrics.singlePathFallback++;
  }

  /** Number of secure sends still awaiting a route. */
  getPendingSendCount(): number { return this.pendingSends.size; }

  /**
   * Handle incoming ENCRYPTED_MESSAGE at Admin.
   */
  handleSecureData(packet: Packet): string | null {
    const now = this.clock();
    const { sessionId, ciphertext, iv, tag } = this.decodeDataPayload(packet.payload);

    const result = this.reassembly.receiveData(sessionId, ciphertext, iv, tag, packet.header.senderId, now);
    if (result === 'duplicate') { this._metrics.duplicatesSuppressed++; return null; }
    if (result === 'waiting') return null;

    // Both halves ready — decrypt
    return this.tryDecrypt(sessionId, now);
  }

  /**
   * Handle incoming KEY_PACKET at Admin.
   */
  handleSecureKey(packet: Packet): string | null {
    const now = this.clock();
    const { sessionId, encryptedKey } = this.decodeKeyPayload(packet.payload);

    const result = this.reassembly.receiveKey(sessionId, encryptedKey, now);
    if (result === 'duplicate') { this._metrics.duplicatesSuppressed++; return null; }
    if (result === 'waiting') return null;

    // Both halves ready — decrypt
    return this.tryDecrypt(sessionId, now);
  }

  /** Attempt decryption when both halves are available. */
  private tryDecrypt(sessionId: string, now: Timestamp): string | null {
    const assembled = this.reassembly.getAssembled(sessionId);
    if (!assembled) return null;

    try {
      const bundle: SecureMessageBundle = {
        ciphertext: assembled.ciphertext,
        iv: assembled.iv,
        tag: assembled.tag,
        encryptedKey: assembled.encryptedKey,
        sessionKeyId: sessionId,
      };
      const plaintext = this.keyManager.decryptAsAdmin(bundle);
      this.reassembly.complete(sessionId);
      this._metrics.messagesDelivered++;

      const reconTime = (now as number) - (assembled.firstReceivedAt as number);
      this._metrics.averageReconstructionMs =
        (this._metrics.averageReconstructionMs * (this._metrics.messagesDelivered - 1) + reconTime) /
        this._metrics.messagesDelivered;

      return plaintext.toString('utf-8');
    } catch {
      this.reassembly.complete(sessionId);
      return null;
    }
  }

  /** Evict timed-out partial messages and flush pending sends as fallback. */
  tick(): number {
    // Flush any pending send that now has a route (single-path fallback if no
    // disjoint pair materialised). This handles single-path topologies.
    for (const [sessionId, p] of this.pendingSends) {
      const paths = this.pathSelector.selectPaths(this.selfId, p.adminId);
      if (paths.hasRoute) {
        this.transmitSplit(p.dataBytes, p.keyBytes, paths);
        this.pendingSends.delete(sessionId);
      }
    }
    const timedOut = this.reassembly.evictExpired(this.clock());
    this._metrics.messagesTimedOut += timedOut;
    return timedOut;
  }

  getMetrics(): DualPathMetrics { return { ...this._metrics }; }

  // ─── Payload Encoding ────────────────────────────────────────────

  private encodeDataPayload(sessionId: string, bundle: SecureMessageBundle): Buffer {
    // sessionId(16 hex = 8 raw bytes) + ivLen(1) + iv + tagLen(1) + tag + cipherLen(2) + cipher
    const sidBuf = Buffer.from(sessionId, 'hex');
    const buf = Buffer.alloc(8 + 1 + bundle.iv.length + 1 + bundle.tag.length + 2 + bundle.ciphertext.length);
    let off = 0;
    sidBuf.copy(buf, off); off += 8;
    buf.writeUInt8(bundle.iv.length, off); off += 1;
    bundle.iv.copy(buf, off); off += bundle.iv.length;
    buf.writeUInt8(bundle.tag.length, off); off += 1;
    bundle.tag.copy(buf, off); off += bundle.tag.length;
    buf.writeUInt16BE(bundle.ciphertext.length, off); off += 2;
    bundle.ciphertext.copy(buf, off);
    return buf;
  }

  private encodeKeyPayload(sessionId: string, bundle: SecureMessageBundle): Buffer {
    const sidBuf = Buffer.from(sessionId, 'hex');
    const buf = Buffer.alloc(8 + 2 + bundle.encryptedKey.length);
    let off = 0;
    sidBuf.copy(buf, off); off += 8;
    buf.writeUInt16BE(bundle.encryptedKey.length, off); off += 2;
    bundle.encryptedKey.copy(buf, off);
    return buf;
  }

  private decodeDataPayload(payload: Buffer): { sessionId: string; ciphertext: Buffer; iv: Buffer; tag: Buffer } {
    let off = 0;
    const sessionId = payload.subarray(off, off + 8).toString('hex'); off += 8;
    const ivLen = payload.readUInt8(off); off += 1;
    const iv = Buffer.from(payload.subarray(off, off + ivLen)); off += ivLen;
    const tagLen = payload.readUInt8(off); off += 1;
    const tag = Buffer.from(payload.subarray(off, off + tagLen)); off += tagLen;
    const cipherLen = payload.readUInt16BE(off); off += 2;
    const ciphertext = Buffer.from(payload.subarray(off, off + cipherLen));
    return { sessionId, ciphertext, iv, tag };
  }

  private decodeKeyPayload(payload: Buffer): { sessionId: string; encryptedKey: Buffer } {
    let off = 0;
    const sessionId = payload.subarray(off, off + 8).toString('hex'); off += 8;
    const keyLen = payload.readUInt16BE(off); off += 2;
    const encryptedKey = Buffer.from(payload.subarray(off, off + keyLen));
    return { sessionId, encryptedKey };
  }

}
