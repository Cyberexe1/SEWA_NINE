/**
 * NINE Protocol - Routing Table
 *
 * Stores discovered routes to non-neighbor (multi-hop) destinations.
 * Populated by ROUTE_REPLY packets.
 */

import type { NodeID, Timestamp } from '../shared/Types.js';

/**
 * A single routing entry — path to a destination.
 */
export interface RoutingEntry {
  /** Target node */
  destinationId: NodeID;

  /** First hop toward destination */
  nextHopId: NodeID;

  /** Total hops to reach destination */
  hopCount: number;

  /** Composite route quality metric (lower = better) */
  routeMetric: number;

  /** Full ordered path from self to destination */
  route: NodeID[];

  /** When this route was discovered */
  discoveredAt: Timestamp;

  /** When this route expires (must re-discover after) */
  expiresAt: Timestamp;

  /** Monotonic sequence number (higher = fresher) */
  sequenceNumber: number;
}

/**
 * Interface for the Routing Table.
 * Manages multi-hop route state.
 */
export interface IRoutingTable {
  /** Add or update a route */
  upsert(entry: RoutingEntry): void;

  /** Remove a route */
  remove(destinationId: NodeID): void;

  /** Get route to destination */
  get(destinationId: NodeID): RoutingEntry | undefined;

  /** Get all routes */
  getAll(): RoutingEntry[];

  /** Check if a route exists and is not expired */
  hasValidRoute(destinationId: NodeID): boolean;

  /** Remove expired routes. Returns evicted destination IDs */
  evictExpired(): NodeID[];

  /** Invalidate all routes using a specific next hop. Returns affected destinations */
  invalidateByNextHop(nextHopId: NodeID): NodeID[];

  /** Get route count */
  size(): number;

  /** Clear all entries */
  clear(): void;
}
