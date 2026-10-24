/**
 * NINE Protocol - Topology Monitor
 *
 * Tracks the mesh topology for visualization on the Admin dashboard.
 * Aggregates data from neighbor table, routing table, and known nodes.
 */

import type { NodeID, TransportType } from '../shared/Types.js';

/**
 * An edge in the topology graph.
 */
export interface TopologyEdge {
  from: NodeID;
  to: NodeID;
  quality: number;
  transportType: TransportType;
  bidirectional: boolean;
}

/**
 * A node in the topology graph.
 */
export interface TopologyNode {
  nodeId: NodeID;
  displayName: string;
  role: number;
  reachable: boolean;
  hopDistance: number;
  isNeighbor: boolean;
}

/**
 * Complete topology snapshot for visualization.
 */
export interface TopologySnapshot {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  timestamp: number;
  selfId: NodeID;
}

/**
 * Topology Monitor interface.
 */
export interface ITopologyMonitor {
  /** Get the current topology snapshot */
  getSnapshot(): TopologySnapshot;

  /** Register callback for topology changes */
  onChange(callback: (snapshot: TopologySnapshot) => void): void;

  /** Remove callback */
  offChange(callback: (snapshot: TopologySnapshot) => void): void;

  /** Force a topology recalculation */
  recalculate(): void;
}
