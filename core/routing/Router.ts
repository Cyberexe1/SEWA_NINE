/**
 * NINE Protocol - Router Interface
 *
 * The main routing engine. Accepts packets and makes forwarding decisions.
 * Coordinates between neighbor table, routing table, and the pluggable algorithm.
 */

import type { Packet } from '../protocol/Packet.js';
import type { NodeID } from '../shared/Types.js';
import type { IRoutingAlgorithm } from './AODV.js';
import type { NeighborEntry, NeighborTable } from '../node/NeighborTable.js';
import type { RoutingTable } from '../node/RoutingTable.js';

/**
 * Topology view for the Admin dashboard visualization.
 */
export interface TopologyEdge {
  from: NodeID;
  to: NodeID;
  quality: number;
  transportType: string;
}

export interface TopologyView {
  nodes: Array<{
    nodeId: NodeID;
    role: number;
    displayName: string;
    reachable: boolean;
    hopDistance: number;
  }>;
  edges: TopologyEdge[];
}

/**
 * Context provided to routing algorithms.
 */
export interface RoutingContext {
  selfId: NodeID;
  neighborTable: NeighborTable;
  routingTable: RoutingTable;
  sendPacket: (packet: Packet, nextHop: NodeID) => Promise<void>;
  broadcastPacket: (packet: Packet, excludeNode?: NodeID) => Promise<void>;
}

/**
 * Main router interface.
 */
export interface IRouter {
  /** Initialize the router with context and algorithm */
  initialize(context: RoutingContext, algorithm: IRoutingAlgorithm): void;

  /** Forward a packet toward its destination */
  forward(packet: Packet, fromPeer: NodeID): Promise<void>;

  /** Initiate route discovery for a destination */
  discoverRoute(destinationId: NodeID): Promise<NodeID[] | null>;

  /** Get the active routing algorithm */
  getAlgorithm(): IRoutingAlgorithm;

  /** Get topology view for visualization */
  getTopology(): TopologyView;

  /** Notify router of a new neighbor */
  onNeighborAdded(neighbor: NeighborEntry): void;

  /** Notify router of a lost neighbor */
  onNeighborRemoved(neighborId: NodeID): void;

  /** Shutdown the router */
  shutdown(): void;
}
