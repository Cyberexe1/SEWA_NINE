/**
 * NINE Protocol - Mesh Manager
 *
 * High-level coordinator for the mesh network.
 * Manages the overall mesh state including:
 * - Known nodes across the entire mesh
 * - Pending packet queue (packets awaiting route discovery)
 * - Mesh-wide event propagation
 * - Topology monitoring
 */

import type { NodeID, NodeRole, Timestamp } from '../shared/Types.js';
import type { Packet } from '../protocol/Packet.js';

/**
 * Known node in the mesh (may be multi-hop away).
 */
export interface KnownNodeEntry {
  nodeId: NodeID;
  role: NodeRole;
  displayName: string;
  lastSeen: Timestamp;
  reachable: boolean;
  hopDistance: number;
}

/**
 * Packet waiting for route discovery.
 */
export interface PendingPacketEntry {
  packet: Packet;
  destinationId: NodeID;
  enqueuedAt: Timestamp;
  retryCount: number;
}

/**
 * Interface for the Mesh Manager.
 */
export interface IMeshManager {
  // --- Known Nodes ---

  /** Register or update a known node */
  upsertKnownNode(entry: KnownNodeEntry): void;

  /** Get a known node by ID */
  getKnownNode(nodeId: NodeID): KnownNodeEntry | undefined;

  /** Get all known nodes */
  getAllKnownNodes(): KnownNodeEntry[];

  /** Mark a node as unreachable */
  markUnreachable(nodeId: NodeID): void;

  // --- Pending Queue ---

  /** Enqueue a packet awaiting route discovery */
  enqueuePending(entry: PendingPacketEntry): boolean;

  /** Dequeue all packets for a destination (route found) */
  dequeuePendingFor(destinationId: NodeID): PendingPacketEntry[];

  /** Evict expired pending packets */
  evictExpiredPending(timeoutMs: number): PendingPacketEntry[];

  /** Check if pending queue is full */
  isPendingFull(): boolean;

  /** Get pending queue size */
  getPendingSize(): number;

  // --- Mesh Events ---

  /** Notify that a new node was discovered */
  onNodeDiscovered(entry: KnownNodeEntry): void;

  /** Notify that a node left the mesh */
  onNodeLeft(nodeId: NodeID): void;
}
