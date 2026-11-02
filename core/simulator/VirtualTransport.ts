/**
 * NINE Simulator — Virtual Transport
 *
 * In-memory packet delivery between virtual nodes.
 * Simulates latency, jitter, and packet loss.
 * No real networking — bytes move between JS objects.
 */

import { type NodeID } from '../shared/Types.js';
import { type VirtualClock } from './VirtualClock.js';
import { SimulationEventBus, SimEventType, type SimEvent } from './SimulationEvents.js';

export interface LinkConfig {
  latencyMs: number;
  jitterMs: number;
  packetLossRate: number;  // 0.0 to 1.0
}

export interface PendingDelivery {
  data: Buffer;
  from: NodeID;
  to: NodeID;
  deliverAt: number;
}

export type ReceiveHandler = (from: NodeID, data: Buffer) => void;

export class VirtualTransport {
  private links: Map<string, LinkConfig> = new Map();
  private handlers: Map<string, ReceiveHandler> = new Map();
  private pending: PendingDelivery[] = [];
  private readonly clock: VirtualClock;
  private readonly events: SimulationEventBus;
  private defaultConfig: LinkConfig = { latencyMs: 10, jitterMs: 5, packetLossRate: 0 };

  constructor(clock: VirtualClock, events: SimulationEventBus) {
    this.clock = clock;
    this.events = events;
  }

  /** Set default link properties for new links. */
  setDefaultLinkConfig(config: LinkConfig): void {
    this.defaultConfig = config;
  }

  /** Create a bidirectional link between two nodes. */
  createLink(nodeA: NodeID, nodeB: NodeID, config?: LinkConfig): void {
    const cfg = config ?? this.defaultConfig;
    this.links.set(this.linkKey(nodeA, nodeB), cfg);
    this.links.set(this.linkKey(nodeB, nodeA), cfg);
    this.events.emit(this.makeEvent(SimEventType.LINK_CREATED, {
      eventType: SimEventType.LINK_CREATED, nodeA, nodeB,
    }));
  }

  /** Destroy a bidirectional link. */
  destroyLink(nodeA: NodeID, nodeB: NodeID): void {
    this.links.delete(this.linkKey(nodeA, nodeB));
    this.links.delete(this.linkKey(nodeB, nodeA));
    this.events.emit(this.makeEvent(SimEventType.LINK_DESTROYED, {
      eventType: SimEventType.LINK_DESTROYED, nodeA, nodeB,
    }));
  }

  /** Check if a link exists. */
  hasLink(nodeA: NodeID, nodeB: NodeID): boolean {
    return this.links.has(this.linkKey(nodeA, nodeB));
  }

  /** Get all nodes linked to a given node. */
  getNeighbors(nodeId: NodeID): NodeID[] {
    const neighbors: NodeID[] = [];
    for (const key of this.links.keys()) {
      if (key.startsWith(nodeId.toLowerCase() + '->')) {
        neighbors.push(key.split('->')[1]! as NodeID);
      }
    }
    return neighbors;
  }

  /** Register a receive handler for a node. */
  registerNode(nodeId: NodeID, handler: ReceiveHandler): void {
    this.handlers.set(nodeId.toLowerCase(), handler);
  }

  /** Unregister a node. */
  unregisterNode(nodeId: NodeID): void {
    this.handlers.delete(nodeId.toLowerCase());
  }

  /** Send a packet from one node to another. Schedules delivery based on latency. */
  send(from: NodeID, to: NodeID, data: Buffer): boolean {
    const linkCfg = this.links.get(this.linkKey(from, to));
    if (!linkCfg) {
      this.events.emit(this.makeEvent(SimEventType.PACKET_LOST, {
        eventType: SimEventType.PACKET_LOST,
        from, to,
        packetId: this.extractPacketId(data),
        reason: 'no_link',
      }));
      return false;
    }

    // Simulate packet loss
    if (linkCfg.packetLossRate > 0 && Math.random() < linkCfg.packetLossRate) {
      this.events.emit(this.makeEvent(SimEventType.PACKET_LOST, {
        eventType: SimEventType.PACKET_LOST,
        from, to,
        packetId: this.extractPacketId(data),
        reason: 'random_loss',
      }));
      return false;
    }

    // Calculate delivery time
    const jitter = linkCfg.jitterMs > 0 ? Math.floor(Math.random() * linkCfg.jitterMs) : 0;
    const deliverAt = (this.clock.now() as number) + linkCfg.latencyMs + jitter;

    this.pending.push({ data: Buffer.from(data), from, to, deliverAt });

    this.events.emit(this.makeEvent(SimEventType.PACKET_SENT, {
      eventType: SimEventType.PACKET_SENT,
      from, to,
      packetId: this.extractPacketId(data),
      packetType: data.length >= 2 ? data[1]! : 0,
      size: data.length,
    }));

    return true;
  }

  /** Broadcast a packet from a node to all its neighbors. */
  broadcast(from: NodeID, data: Buffer): number {
    const neighbors = this.getNeighbors(from);
    let sent = 0;
    for (const to of neighbors) {
      if (this.send(from, to, data)) sent++;
    }
    return sent;
  }

  /** Process all pending deliveries whose time has arrived. Call after clock.advance(). */
  tick(): number {
    const now = this.clock.now() as number;
    const ready: PendingDelivery[] = [];
    const remaining: PendingDelivery[] = [];

    for (const p of this.pending) {
      if (p.deliverAt <= now) ready.push(p);
      else remaining.push(p);
    }
    this.pending = remaining;

    for (const p of ready) {
      const handler = this.handlers.get(p.to.toLowerCase());
      if (handler) {
        handler(p.from, p.data);
        this.events.emit(this.makeEvent(SimEventType.PACKET_RECEIVED, {
          eventType: SimEventType.PACKET_RECEIVED,
          at: p.to,
          from: p.from,
          packetId: this.extractPacketId(p.data),
          packetType: p.data.length >= 2 ? p.data[1]! : 0,
          size: p.data.length,
        }));
      }
    }

    return ready.length;
  }

  /** Get number of pending deliveries. */
  getPendingCount(): number {
    return this.pending.length;
  }

  /** Clear all pending deliveries. */
  clearPending(): void {
    this.pending = [];
  }

  /** Get total link count. */
  getLinkCount(): number {
    return this.links.size / 2; // bidirectional
  }

  private linkKey(from: NodeID, to: NodeID): string {
    return `${from.toLowerCase()}->${to.toLowerCase()}`;
  }

  private extractPacketId(data: Buffer): NodeID {
    // PacketId is at offset 3, 16 bytes (per encoding spec)
    if (data.length < 19) return '00000000-0000-0000-0000-000000000000' as NodeID;
    const hex = data.subarray(3, 19).toString('hex');
    return (hex.substring(0,8)+'-'+hex.substring(8,12)+'-'+hex.substring(12,16)+'-'+hex.substring(16,20)+'-'+hex.substring(20,32)) as NodeID;
  }

  private makeEvent(type: SimEventType, detail: any): SimEvent {
    return { type, timestamp: this.clock.now() as number, detail };
  }
}
