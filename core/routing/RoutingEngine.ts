/**
 * NINE Routing — Routing Engine
 *
 * The central routing orchestrator. Processes incoming packets, makes
 * forwarding decisions, manages route discovery, and handles errors.
 * Operates entirely within the Virtual Mesh Simulator.
 */

import { type NodeID, type PacketID, type Timestamp, PacketType } from '../shared/Types.js';
import { type Packet, PacketFlags } from '../protocol/Packet.js';
import { parse } from '../protocol/Parser.js';
import { serialize } from '../protocol/Serializer.js';
import { createPacket } from '../protocol/PacketFactory.js';
import { verifyChecksum } from '../protocol/Validator.js';
import { DuplicatePacketCache } from './DuplicatePacketCache.js';
import { decrementTTL } from './TTLManager.js';
import { RouteCache } from './RouteCache.js';
import { RouteDiscovery } from './RouteDiscovery.js';
import { PendingMessageQueue } from './PendingMessageQueue.js';
import { AckManager } from './AckManager.js';
import { hasLoop as _hasLoop, wouldCreateLoop } from './LoopPrevention.js';

export interface RoutingMetrics {
  routesCreated: number;
  routesInvalidated: number;
  packetsForwarded: number;
  packetsDropped: number;
  duplicatesDetected: number;
  ttlExpired: number;
  routeDiscoveries: number;
  routeRepliesSent: number;
  routeErrorsSent: number;
  acksSent: number;
  acksReceived: number;
  pendingQueueSize: number;
}

export type SendFn = (to: NodeID, data: Buffer) => boolean;
export type BroadcastFn = (data: Buffer) => number;
export type DeliverFn = (packet: Packet) => void;

export interface RoutingEngineConfig {
  selfId: NodeID;
  send: SendFn;
  broadcast: BroadcastFn;
  deliver: DeliverFn;
  getNeighbors: () => NodeID[];
  clock: () => Timestamp;
}

export class RoutingEngine {
  private readonly selfId: NodeID;
  private readonly send: SendFn;
  private readonly broadcastFn: BroadcastFn;
  private readonly deliver: DeliverFn;
  private readonly getNeighbors: () => NodeID[];
  private readonly clock: () => Timestamp;

  readonly dedup: DuplicatePacketCache;
  readonly routeCache: RouteCache;
  readonly discovery: RouteDiscovery;
  readonly pendingQueue: PendingMessageQueue;
  readonly ackManager: AckManager;

  private _metrics: RoutingMetrics = {
    routesCreated: 0, routesInvalidated: 0, packetsForwarded: 0,
    packetsDropped: 0, duplicatesDetected: 0, ttlExpired: 0,
    routeDiscoveries: 0, routeRepliesSent: 0, routeErrorsSent: 0,
    acksSent: 0, acksReceived: 0, pendingQueueSize: 0,
  };

  constructor(config: RoutingEngineConfig) {
    this.selfId = config.selfId;
    this.send = config.send;
    this.broadcastFn = config.broadcast;
    this.deliver = config.deliver;
    this.getNeighbors = config.getNeighbors;
    this.clock = config.clock;

    this.dedup = new DuplicatePacketCache();
    this.routeCache = new RouteCache();
    this.discovery = new RouteDiscovery();
    this.pendingQueue = new PendingMessageQueue();
    this.ackManager = new AckManager();
  }

  /** Process an incoming raw packet from the transport. */
  handleIncoming(from: NodeID, data: Buffer): void {
    if (!verifyChecksum(data)) { this._metrics.packetsDropped++; return; }

    let packet: Packet;
    try { packet = parse(data); } catch { this._metrics.packetsDropped++; return; }

    const { header } = packet;

    // Duplicate check
    if (this.dedup.hasSeen(header.packetId)) {
      this._metrics.duplicatesDetected++;
      return;
    }
    this.dedup.markSeen(header.packetId, this.clock());

    // Dispatch by type
    switch (header.packetType) {
      case PacketType.ROUTE_REQUEST: this.handleRouteRequest(packet, from); break;
      case PacketType.ROUTE_REPLY: this.handleRouteReply(packet); break;
      case PacketType.ROUTE_ERROR: this.handleRouteError(packet); break;
      case PacketType.ACK: this.handleAck(packet); break;
      case PacketType.BROADCAST: this.handleBroadcast(packet, from); break;
      default: this.handleUnicast(packet, from); break;
    }
  }

  /** Send a packet to a destination. Initiates route discovery if needed. */
  sendPacket(packet: Packet, serialized: Buffer): void {
    const dest = packet.header.destinationId;
    const now = this.clock();

    // Broadcast = flood
    if (dest === '00000000-0000-0000-0000-000000000000') {
      this.broadcastFn(serialized);
      return;
    }

    // Check if destination is a direct neighbor
    const neighbors = this.getNeighbors();
    if (neighbors.some(n => n.toLowerCase() === dest.toLowerCase())) {
      this.send(dest, serialized);
      return;
    }

    // Check route cache
    const nextHop = this.routeCache.getNextHop(dest, now);
    if (nextHop) {
      this.send(nextHop, serialized);
      this.routeCache.refresh(dest, now);
      this._metrics.packetsForwarded++;
      return;
    }

    // No route — queue and discover
    this.pendingQueue.enqueue(packet, serialized, dest, now);
    this._metrics.pendingQueueSize = this.pendingQueue.size();
    if (!this.discovery.isPending(dest)) {
      this.initiateRouteDiscovery(dest);
    }
  }

  /** Initiate route discovery for a destination. */
  private initiateRouteDiscovery(targetNodeId: NodeID): void {
    const now = this.clock();
    const rreqBytes = this.discovery.createRouteRequest(this.selfId, targetNodeId, now);
    this.broadcastFn(rreqBytes);
    this._metrics.routeDiscoveries++;
  }

  /** Handle incoming BROADCAST: deliver locally and re-flood. */
  private handleBroadcast(packet: Packet, from: NodeID): void {
    this.deliver(packet);

    const ttlResult = decrementTTL(packet);
    if (ttlResult.dropped) { this._metrics.ttlExpired++; return; }

    // Re-flood to all neighbors except sender
    const relayed = ttlResult.packet!;
    const bytes = serialize(relayed);
    const neighbors = this.getNeighbors();
    for (const n of neighbors) {
      if (n.toLowerCase() !== from.toLowerCase()) {
        this.send(n, bytes);
      }
    }
    this._metrics.packetsForwarded++;
  }

  /** Handle incoming unicast: deliver if for us, forward otherwise. */
  private handleUnicast(packet: Packet, _from: NodeID): void {
    if (packet.header.destinationId.toLowerCase() === this.selfId.toLowerCase()) {
      this.deliver(packet);
      if (packet.header.flags & PacketFlags.REQUIRES_ACK) {
        this.sendAck(packet.header.packetId, packet.header.senderId);
      }
      return;
    }

    // Forward
    const ttlResult = decrementTTL(packet);
    if (ttlResult.dropped) { this._metrics.ttlExpired++; return; }

    const dest = packet.header.destinationId;
    const now = this.clock();
    const nextHop = this.routeCache.getNextHop(dest, now);
    if (nextHop) {
      this.send(nextHop, serialize(ttlResult.packet!));
      this.routeCache.refresh(dest, now);
      this._metrics.packetsForwarded++;
    } else {
      this._metrics.packetsDropped++;
    }
  }

  /** Handle ROUTE_REQUEST: reply if target or re-flood. */
  private handleRouteRequest(packet: Packet, from: NodeID): void {
    const { targetNodeId, requestSeqNum, hopList } = this.discovery.decodeRouteRequest(packet.payload);

    // Loop check
    if (wouldCreateLoop(hopList, this.selfId)) { this._metrics.packetsDropped++; return; }
    if (hopList.length >= this.discovery.getMaxHopListSize()) { this._metrics.packetsDropped++; return; }

    const now = this.clock();
    const newHopList = [...hopList, this.selfId];

    // Are we the target?
    if (targetNodeId.toLowerCase() === this.selfId.toLowerCase()) {
      const route = newHopList; // Path from source to us
      const originatorId = hopList[0]!;
      const rrepBytes = this.discovery.createRouteReply(
        this.selfId, originatorId, targetNodeId, requestSeqNum, route, now
      );
      // Send RREP back along reverse path
      const prevHop = hopList[hopList.length - 1]!;
      this.send(prevHop, rrepBytes);
      this._metrics.routeRepliesSent++;
      return;
    }

    // Re-flood with updated hopList
    const ttlResult = decrementTTL(packet);
    if (ttlResult.dropped) { this._metrics.ttlExpired++; return; }

    // Reconstruct RREQ with updated hopList
    const newPayload = this.rebuildRouteRequestPayload(targetNodeId, requestSeqNum, newHopList);
    const newPacket = createPacket({
      packetType: PacketType.ROUTE_REQUEST,
      senderId: packet.header.senderId,
      destinationId: packet.header.destinationId,
      sequenceNumber: packet.header.sequenceNumber,
      ttl: ttlResult.packet!.header.ttl,
      payload: newPayload,
      packetId: packet.header.packetId,
      timestamp: packet.header.timestamp,
    });
    const bytes = serialize(newPacket);
    const neighbors = this.getNeighbors();
    for (const n of neighbors) {
      if (n.toLowerCase() !== from.toLowerCase()) {
        this.send(n, bytes);
      }
    }
    this._metrics.packetsForwarded++;
  }

  /** Handle ROUTE_REPLY: install route and flush pending queue. */
  private handleRouteReply(packet: Packet): void {
    const { targetNodeId, requestSeqNum, route } = this.discovery.decodeRouteReply(packet.payload);
    const now = this.clock();

    // If we are the originator of the request
    if (route.length > 0 && route[0]!.toLowerCase() === this.selfId.toLowerCase()) {
      // Install route
      const nextHop = route.length > 1 ? route[1]! : targetNodeId;
      this.routeCache.addRoute(targetNodeId, nextHop, route, requestSeqNum, now);
      this._metrics.routesCreated++;
      this.discovery.completeDiscovery(targetNodeId);

      // Flush pending queue
      const pending = this.pendingQueue.dequeueFor(targetNodeId);
      for (const msg of pending) {
        this.send(nextHop, msg.serialized);
        this._metrics.packetsForwarded++;
      }
      this._metrics.pendingQueueSize = this.pendingQueue.size();
      return;
    }

    // Otherwise forward RREP toward the originator (source routing along reverse path)
    const myIndex = route.findIndex(id => id.toLowerCase() === this.selfId.toLowerCase());
    if (myIndex > 0) {
      // Also install partial route (I can reach targetNodeId via the next nodes)
      const nextHopForDest = route.length > myIndex + 1 ? route[myIndex + 1]! : targetNodeId;
      this.routeCache.addRoute(targetNodeId, nextHopForDest, route.slice(myIndex), requestSeqNum, now);
      this._metrics.routesCreated++;

      // Forward toward source
      const prevNode = route[myIndex - 1]!;
      this.send(prevNode, serialize(packet));
      this._metrics.packetsForwarded++;
    }
  }

  /** Handle ROUTE_ERROR: invalidate affected routes. */
  private handleRouteError(packet: Packet): void {
    const { unreachableNodeId } = this.discovery.decodeRouteError(packet.payload);
    const invalidated = this.routeCache.invalidateByNextHop(unreachableNodeId);
    this._metrics.routesInvalidated += invalidated.length;
  }

  /** Handle ACK packet. */
  private handleAck(packet: Packet): void {
    if (packet.payload.length >= 16) {
      const ackedHex = packet.payload.subarray(0, 16).toString('hex');
      const ackedId = `${ackedHex.substring(0,8)}-${ackedHex.substring(8,12)}-${ackedHex.substring(12,16)}-${ackedHex.substring(16,20)}-${ackedHex.substring(20,32)}` as PacketID;
      this.ackManager.receiveAck(ackedId);
      this._metrics.acksReceived++;
    }
  }

  /** Send an ACK back to a sender. */
  private sendAck(ackedPacketId: PacketID, destinationId: NodeID): void {
    const payload = Buffer.alloc(18);
    Buffer.from(ackedPacketId.replace(/-/g, ''), 'hex').copy(payload, 0);
    payload.writeUInt8(0, 16); // status OK
    payload.writeUInt8(0, 17); // error code none

    const ackPacket = createPacket({
      packetType: PacketType.ACK,
      senderId: this.selfId,
      destinationId,
      sequenceNumber: 0,
      ttl: 20,
      payload,
      timestamp: this.clock(),
    });
    const bytes = serialize(ackPacket);
    this.send(destinationId, bytes);
    this._metrics.acksSent++;
  }

  /** Notify that a neighbor is no longer reachable. */
  notifyLinkBroken(deadNeighborId: NodeID): void {
    const invalidated = this.routeCache.invalidateByNextHop(deadNeighborId);
    this._metrics.routesInvalidated += invalidated.length;

    // Send ROUTE_ERROR to affected sources
    const now = this.clock();
    const neighbors = this.getNeighbors();
    for (const n of neighbors) {
      const errBytes = this.discovery.createRouteError(this.selfId, n, deadNeighborId, 0x01, now);
      this.send(n, errBytes);
    }
    this._metrics.routeErrorsSent++;
  }

  /** Periodic maintenance: evict stale entries. */
  tick(): void {
    const now = this.clock();
    this.dedup.evict(now);
    this.routeCache.evictExpired(now);
    this.pendingQueue.evictExpired(now);
    this._metrics.pendingQueueSize = this.pendingQueue.size();
  }

  /** Get routing metrics. */
  getMetrics(): RoutingMetrics { return { ...this._metrics }; }

  private rebuildRouteRequestPayload(target: NodeID, seqNum: number, hopList: NodeID[]): Buffer {
    const buf = Buffer.alloc(21 + hopList.length * 16);
    Buffer.from(target.replace(/-/g, ''), 'hex').copy(buf, 0);
    buf.writeUInt32BE(seqNum, 16);
    buf.writeUInt8(hopList.length, 20);
    for (let i = 0; i < hopList.length; i++) {
      Buffer.from(hopList[i]!.replace(/-/g, ''), 'hex').copy(buf, 21 + i * 16);
    }
    return buf;
  }
}
