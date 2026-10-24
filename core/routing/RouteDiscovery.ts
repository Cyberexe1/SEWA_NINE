/**
 * NINE Routing — Route Discovery
 *
 * RFC Section 7.1: On-demand route discovery via ROUTE_REQUEST flooding
 * and ROUTE_REPLY unicast.
 */

import { type NodeID, type Timestamp, PacketType } from '../shared/Types.js';
import { createPacket } from '../protocol/PacketFactory.js';
import { serialize } from '../protocol/Serializer.js';

export interface RouteDiscoveryConfig {
  timeoutMs: number;
  maxRetries: number;
  maxHopListSize: number;
  defaultTTL: number;
}

export interface PendingDiscovery {
  targetNodeId: NodeID;
  requestSeqNum: number;
  startedAt: Timestamp;
  retryCount: number;
}

const DEFAULT_CONFIG: RouteDiscoveryConfig = {
  timeoutMs: 10000,
  maxRetries: 3,
  maxHopListSize: 20,
  defaultTTL: 20,
};

export class RouteDiscovery {
  private readonly config: RouteDiscoveryConfig;
  private pendingDiscoveries: Map<string, PendingDiscovery> = new Map();
  private sequenceCounter = 0;

  constructor(config?: Partial<RouteDiscoveryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Create a ROUTE_REQUEST packet to discover a route to targetNodeId. */
  createRouteRequest(senderId: NodeID, targetNodeId: NodeID, now: Timestamp): Buffer {
    this.sequenceCounter++;
    const seqNum = this.sequenceCounter;

    // Payload: targetNodeId(16) + requestSeqNum(4) + hopListCount(1) + hopList(16*N)
    const hopList = [senderId];
    const payload = this.encodeRouteRequestPayload(targetNodeId, seqNum, hopList);

    const packet = createPacket({
      packetType: PacketType.ROUTE_REQUEST,
      senderId,
      destinationId: '00000000-0000-0000-0000-000000000000' as NodeID, // broadcast
      sequenceNumber: seqNum,
      ttl: this.config.defaultTTL,
      payload,
      timestamp: now,
    });

    this.pendingDiscoveries.set(targetNodeId.toLowerCase(), {
      targetNodeId, requestSeqNum: seqNum, startedAt: now, retryCount: 0,
    });

    return serialize(packet);
  }

  /** Create a ROUTE_REPLY packet responding to a ROUTE_REQUEST. */
  createRouteReply(
    senderId: NodeID,
    destinationId: NodeID,
    targetNodeId: NodeID,
    requestSeqNum: number,
    route: NodeID[],
    now: Timestamp,
  ): Buffer {
    const routeMetric = (route.length - 1) * 100;
    const payload = this.encodeRouteReplyPayload(targetNodeId, requestSeqNum, route, routeMetric);

    const packet = createPacket({
      packetType: PacketType.ROUTE_REPLY,
      senderId,
      destinationId,
      sequenceNumber: requestSeqNum,
      ttl: this.config.defaultTTL,
      payload,
      timestamp: now,
    });

    return serialize(packet);
  }

  /** Create a ROUTE_ERROR packet. */
  createRouteError(
    senderId: NodeID,
    destinationId: NodeID,
    unreachableNodeId: NodeID,
    errorCode: number,
    now: Timestamp,
  ): Buffer {
    const payload = this.encodeRouteErrorPayload(unreachableNodeId, senderId, errorCode);

    const packet = createPacket({
      packetType: PacketType.ROUTE_ERROR,
      senderId,
      destinationId,
      sequenceNumber: 0,
      ttl: this.config.defaultTTL,
      payload,
      timestamp: now,
    });

    return serialize(packet);
  }

  /** Decode a ROUTE_REQUEST payload. */
  decodeRouteRequest(payload: Buffer): { targetNodeId: NodeID; requestSeqNum: number; hopList: NodeID[] } {
    const targetHex = payload.subarray(0, 16).toString('hex');
    const targetNodeId = this.hexToUuid(targetHex) as NodeID;
    const requestSeqNum = payload.readUInt32BE(16);
    const hopListCount = payload.readUInt8(20);
    const hopList: NodeID[] = [];
    for (let i = 0; i < hopListCount; i++) {
      const hex = payload.subarray(21 + i * 16, 37 + i * 16).toString('hex');
      hopList.push(this.hexToUuid(hex) as NodeID);
    }
    return { targetNodeId, requestSeqNum, hopList };
  }

  /** Decode a ROUTE_REPLY payload. */
  decodeRouteReply(payload: Buffer): { targetNodeId: NodeID; requestSeqNum: number; route: NodeID[]; routeMetric: number } {
    const targetHex = payload.subarray(0, 16).toString('hex');
    const targetNodeId = this.hexToUuid(targetHex) as NodeID;
    const requestSeqNum = payload.readUInt32BE(16);
    const routeMetric = payload.readUInt16BE(20);
    const routeLength = payload.readUInt8(22);
    const route: NodeID[] = [];
    for (let i = 0; i < routeLength; i++) {
      const hex = payload.subarray(23 + i * 16, 39 + i * 16).toString('hex');
      route.push(this.hexToUuid(hex) as NodeID);
    }
    return { targetNodeId, requestSeqNum, route, routeMetric };
  }

  /** Decode a ROUTE_ERROR payload. */
  decodeRouteError(payload: Buffer): { unreachableNodeId: NodeID; reporterNodeId: NodeID; errorCode: number } {
    const unreachHex = payload.subarray(0, 16).toString('hex');
    const reporterHex = payload.subarray(16, 32).toString('hex');
    return {
      unreachableNodeId: this.hexToUuid(unreachHex) as NodeID,
      reporterNodeId: this.hexToUuid(reporterHex) as NodeID,
      errorCode: payload.readUInt8(32),
    };
  }

  /** Check if a discovery is pending for a destination. */
  isPending(targetNodeId: NodeID): boolean {
    return this.pendingDiscoveries.has(targetNodeId.toLowerCase());
  }

  /** Mark discovery as complete. */
  completeDiscovery(targetNodeId: NodeID): void {
    this.pendingDiscoveries.delete(targetNodeId.toLowerCase());
  }

  /** Get timed-out discoveries. */
  getTimedOut(now: Timestamp): PendingDiscovery[] {
    const timedOut: PendingDiscovery[] = [];
    for (const [key, d] of this.pendingDiscoveries) {
      if ((now as number) - (d.startedAt as number) > this.config.timeoutMs) {
        if (d.retryCount >= this.config.maxRetries) {
          this.pendingDiscoveries.delete(key);
        }
        timedOut.push(d);
      }
    }
    return timedOut;
  }

  getMaxHopListSize(): number { return this.config.maxHopListSize; }

  // ─── Encoding Helpers ────────────────────────────────────────────

  private encodeRouteRequestPayload(target: NodeID, seqNum: number, hopList: NodeID[]): Buffer {
    const buf = Buffer.alloc(21 + hopList.length * 16);
    Buffer.from(target.replace(/-/g, ''), 'hex').copy(buf, 0);
    buf.writeUInt32BE(seqNum, 16);
    buf.writeUInt8(hopList.length, 20);
    for (let i = 0; i < hopList.length; i++) {
      Buffer.from(hopList[i]!.replace(/-/g, ''), 'hex').copy(buf, 21 + i * 16);
    }
    return buf;
  }

  private encodeRouteReplyPayload(target: NodeID, seqNum: number, route: NodeID[], metric: number): Buffer {
    const buf = Buffer.alloc(23 + route.length * 16);
    Buffer.from(target.replace(/-/g, ''), 'hex').copy(buf, 0);
    buf.writeUInt32BE(seqNum, 16);
    buf.writeUInt16BE(metric, 20);
    buf.writeUInt8(route.length, 22);
    for (let i = 0; i < route.length; i++) {
      Buffer.from(route[i]!.replace(/-/g, ''), 'hex').copy(buf, 23 + i * 16);
    }
    return buf;
  }

  private encodeRouteErrorPayload(unreachable: NodeID, reporter: NodeID, errorCode: number): Buffer {
    const buf = Buffer.alloc(33);
    Buffer.from(unreachable.replace(/-/g, ''), 'hex').copy(buf, 0);
    Buffer.from(reporter.replace(/-/g, ''), 'hex').copy(buf, 16);
    buf.writeUInt8(errorCode, 32);
    return buf;
  }

  private hexToUuid(hex: string): string {
    return `${hex.substring(0,8)}-${hex.substring(8,12)}-${hex.substring(12,16)}-${hex.substring(16,20)}-${hex.substring(20,32)}`;
  }
}
