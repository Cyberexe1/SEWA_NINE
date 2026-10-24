/**
 * NINE Protocol - Mesh Simulator
 *
 * Runs multiple virtual nodes in a single process.
 * Simulates transport delays, packet loss, and topologies
 * without physical hardware.
 */

import type { NodeID } from '../shared/Types.js';

/**
 * Simulation configuration.
 */
export interface SimulationConfig {
  /** Topology setup */
  topology: TopologyConfig;

  /** Duration in ms (0 = manual control) */
  durationMs: number;

  /** Speed multiplier (1.0 = real-time) */
  speedMultiplier: number;

  /** Logging level */
  logLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug';
}

export interface TopologyConfig {
  /** Node definitions */
  nodes: VirtualNodeConfig[];

  /** Communication range in meters */
  communicationRange: number;

  /** Link simulation properties */
  linkProperties: LinkProperties;
}

export interface VirtualNodeConfig {
  nodeId?: NodeID;
  role: number;
  displayName: string;
  position: { x: number; y: number };
}

export interface LinkProperties {
  baseLatencyMs: number;
  jitterMs: number;
  packetLossRate: number;
  bandwidthLimit: number;
}

/**
 * Predefined topology presets for quick setup.
 */
export enum TopologyPreset {
  LINEAR = 'linear',
  STAR = 'star',
  FULL_MESH = 'full_mesh',
  GRID = 'grid',
  RANDOM = 'random',
  MULTI_FLOOR = 'multi_floor',
}

/**
 * Simulation statistics.
 */
export interface SimulationStats {
  totalPacketsSent: number;
  totalPacketsReceived: number;
  totalPacketsDropped: number;
  averageLatencyMs: number;
  activeLinks: number;
  brokenLinks: number;
  elapsedMs: number;
}

/**
 * Simulation events for monitoring.
 */
export enum SimulationEvent {
  NODE_STARTED = 'node_started',
  NODE_STOPPED = 'node_stopped',
  PACKET_SENT = 'packet_sent',
  PACKET_RECEIVED = 'packet_received',
  PACKET_DROPPED = 'packet_dropped',
  LINK_BROKEN = 'link_broken',
  LINK_RESTORED = 'link_restored',
  ROUTE_DISCOVERED = 'route_discovered',
  MESSAGE_DELIVERED = 'message_delivered',
}

/**
 * Mesh Simulator interface.
 */
export interface IMeshSimulator {
  /** Initialize with configuration */
  initialize(config: SimulationConfig): Promise<void>;

  /** Create from a preset topology */
  initializeFromPreset(preset: TopologyPreset, nodeCount: number): Promise<void>;

  /** Start the simulation */
  start(): Promise<void>;

  /** Pause */
  pause(): void;

  /** Resume */
  resume(): void;

  /** Stop and clean up */
  stop(): Promise<void>;

  /** Get all virtual node IDs */
  getNodeIds(): NodeID[];

  /** Inject a link failure */
  breakLink(nodeA: NodeID, nodeB: NodeID): void;

  /** Restore a broken link */
  restoreLink(nodeA: NodeID, nodeB: NodeID): void;

  /** Move a node (may change connectivity) */
  moveNode(nodeId: NodeID, x: number, y: number): void;

  /** Get simulation statistics */
  getStats(): SimulationStats;

  /** Subscribe to simulation events */
  on(event: SimulationEvent, callback: (data: unknown) => void): void;

  /** Unsubscribe */
  off(event: SimulationEvent, callback: (data: unknown) => void): void;
}
