/**
 * NINE Protocol - Neighbor Table
 *
 * Maintains the list of direct (1-hop) neighbors.
 * Updated by heartbeats and discovery responses.
 */

import type { NodeID, SessionID, NodeRole, Timestamp, TransportType } from '../shared/Types.js';

/**
 * Entry for a single direct neighbor.
 */
export interface NeighborEntry {
  nodeId: NodeID;
  sessionId: SessionID;
  role: NodeRole;
  displayName: string;
  lastHeartbeat: Timestamp;
  linkQuality: number;         // 0.0 to 1.0
  transportType: TransportType;
  capabilities: number;
}

/**
 * Interface for the Neighbor Table.
 * Manages direct peer state.
 */
export interface INeighborTable {
  /** Add or update a neighbor */
  upsert(entry: NeighborEntry): void;

  /** Remove a neighbor */
  remove(nodeId: NodeID): void;

  /** Get a specific neighbor */
  get(nodeId: NodeID): NeighborEntry | undefined;

  /** Get all current neighbors */
  getAll(): NeighborEntry[];

  /** Check if a node is a direct neighbor */
  isNeighbor(nodeId: NodeID): boolean;

  /** Remove neighbors whose heartbeat exceeds timeout */
  evictStale(timeoutMs: number): NodeID[];

  /** Get neighbor count */
  size(): number;

  /** Clear all entries */
  clear(): void;
}
