/**
 * NINE Simulator — Simulation Controller
 *
 * Orchestrates the virtual mesh: creates nodes, manages links,
 * advances time, and collects statistics.
 */

import { type NodeID, NodeRole } from '../shared/Types.js';
import { VirtualClock } from './VirtualClock.js';
import { VirtualTransport, type LinkConfig } from './VirtualTransport.js';
import { SimulationEventBus, SimEventType } from './SimulationEvents.js';
import { NodeSimulator, type NodeSimulatorConfig } from './NodeSimulator.js';

export interface SimulationStats {
  totalPacketsSent: number;
  totalPacketsReceived: number;
  totalPacketsDropped: number;
  totalPacketsLost: number;
  activeNodes: number;
  totalLinks: number;
  pendingDeliveries: number;
  elapsedMs: number;
}

export class SimulationController {
  readonly clock: VirtualClock;
  readonly transport: VirtualTransport;
  readonly events: SimulationEventBus;
  private nodes: Map<string, NodeSimulator> = new Map();

  constructor() {
    this.clock = new VirtualClock(0);
    this.events = new SimulationEventBus();
    this.transport = new VirtualTransport(this.clock, this.events);
  }

  /** Add a node to the simulation. Starts it immediately. */
  addNode(config: NodeSimulatorConfig): NodeSimulator {
    const node = new NodeSimulator(config, this.transport, this.clock, this.events);
    this.nodes.set(node.nodeId.toLowerCase(), node);
    node.start();
    return node;
  }

  /** Get a node by ID. */
  getNode(nodeId: NodeID): NodeSimulator | undefined {
    return this.nodes.get(nodeId.toLowerCase());
  }

  /** Get all nodes. */
  getAllNodes(): NodeSimulator[] {
    return Array.from(this.nodes.values());
  }

  /** Get only running nodes. */
  getActiveNodes(): NodeSimulator[] {
    return this.getAllNodes().filter(n => n.isRunning);
  }

  /** Stop a node (simulates node failure). */
  stopNode(nodeId: NodeID): boolean {
    const node = this.nodes.get(nodeId.toLowerCase());
    if (!node || !node.isRunning) return false;
    node.stop();
    return true;
  }

  /** Create a bidirectional link between two nodes. */
  link(nodeA: NodeID, nodeB: NodeID, config?: LinkConfig): void {
    this.transport.createLink(nodeA, nodeB, config);
  }

  /** Destroy a link (simulates link failure). */
  unlink(nodeA: NodeID, nodeB: NodeID): void {
    this.transport.destroyLink(nodeA, nodeB);
  }

  /** Check if two nodes are linked. */
  isLinked(nodeA: NodeID, nodeB: NodeID): boolean {
    return this.transport.hasLink(nodeA, nodeB);
  }

  /** Advance simulation time and deliver pending packets. */
  advanceTime(ms: number): number {
    this.clock.advance(ms);
    return this.transport.tick();
  }

  /** Advance time enough to deliver all pending packets. */
  deliverAll(maxIterations: number = 100): number {
    let total = 0;
    for (let i = 0; i < maxIterations && this.transport.getPendingCount() > 0; i++) {
      this.clock.advance(50);
      total += this.transport.tick();
    }
    return total;
  }

  /** Get simulation statistics. */
  getStats(): SimulationStats {
    const log = this.events.getLog();
    return {
      totalPacketsSent: log.filter(e => e.type === SimEventType.PACKET_SENT).length,
      totalPacketsReceived: log.filter(e => e.type === SimEventType.PACKET_RECEIVED).length,
      totalPacketsDropped: log.filter(e => e.type === SimEventType.PACKET_DROPPED).length,
      totalPacketsLost: log.filter(e => e.type === SimEventType.PACKET_LOST).length,
      activeNodes: this.getActiveNodes().length,
      totalLinks: this.transport.getLinkCount(),
      pendingDeliveries: this.transport.getPendingCount(),
      elapsedMs: this.clock.now() as number,
    };
  }

  /** Create a linear topology: A — B — C — D ... */
  createLinearTopology(count: number, linkConfig?: LinkConfig): NodeSimulator[] {
    const nodes: NodeSimulator[] = [];
    for (let i = 0; i < count; i++) {
      const node = this.addNode({
        role: i === count - 1 ? NodeRole.ADMIN : NodeRole.USER,
        displayName: String.fromCharCode(65 + i), // A, B, C...
      });
      nodes.push(node);
      if (i > 0) {
        this.link(nodes[i - 1]!.nodeId, node.nodeId, linkConfig);
      }
    }
    return nodes;
  }

  /** Create a star topology: center node connected to all others. */
  createStarTopology(count: number, linkConfig?: LinkConfig): NodeSimulator[] {
    const nodes: NodeSimulator[] = [];
    const center = this.addNode({ role: NodeRole.ADMIN, displayName: 'Center' });
    nodes.push(center);
    for (let i = 1; i < count; i++) {
      const node = this.addNode({ role: NodeRole.USER, displayName: `Node${i}` });
      nodes.push(node);
      this.link(center.nodeId, node.nodeId, linkConfig);
    }
    return nodes;
  }

  /** Create a full mesh: every node connected to every other. */
  createFullMeshTopology(count: number, linkConfig?: LinkConfig): NodeSimulator[] {
    const nodes: NodeSimulator[] = [];
    for (let i = 0; i < count; i++) {
      nodes.push(this.addNode({ role: NodeRole.USER, displayName: `Node${i}` }));
    }
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        this.link(nodes[i]!.nodeId, nodes[j]!.nodeId, linkConfig);
      }
    }
    return nodes;
  }

  /** Reset the entire simulation. */
  reset(): void {
    for (const node of this.nodes.values()) {
      if (node.isRunning) node.stop();
    }
    this.nodes.clear();
    this.transport.clearPending();
    this.events.clearLog();
    this.clock.reset();
  }

  /** Get the number of nodes. */
  get nodeCount(): number {
    return this.nodes.size;
  }
}
