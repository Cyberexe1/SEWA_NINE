/**
 * NINE Protocol — Routing Table
 *
 * Conforms to NINE-RFC-v0.9.1 Section 3.5 (Routing Table).
 * Stores discovered routes to multi-hop destinations.
 * Routes are ephemeral — they expire after ROUTE_EXPIRY_MS.
 */

import { type NodeID, type Timestamp } from '../shared/Types.js';

// ─── Routing Entry (Immutable) ─────────────────────────────────────────

export interface RoutingEntry {
  readonly destinationId: NodeID;
  readonly nextHopId: NodeID;
  readonly hopCount: number;
  readonly routeMetric: number;
  readonly fullPath: readonly NodeID[];
  readonly sequenceNumber: number;
  readonly discoveredAt: Timestamp;
  readonly expiresAt: Timestamp;
}

// ─── Routing Table ─────────────────────────────────────────────────────

export class RoutingTable {
  private readonly entries: Map<string, RoutingEntry> = new Map();

  /**
   * Add or update a route.
   * A route is accepted if it's new or has a higher sequence number,
   * or same sequence with better metric.
   */
  upsert(entry: RoutingEntry): boolean {
    const key = entry.destinationId.toLowerCase();
    const existing = this.entries.get(key);

    if (!existing) {
      this.entries.set(key, entry);
      return true;
    }

    // Higher sequence = fresher route, always accept
    if (entry.sequenceNumber > existing.sequenceNumber) {
      this.entries.set(key, entry);
      return true;
    }

    // Same sequence, better metric = accept
    if (entry.sequenceNumber === existing.sequenceNumber && entry.routeMetric < existing.routeMetric) {
      this.entries.set(key, entry);
      return true;
    }

    return false; // Rejected — existing route is better or fresher
  }

  /**
   * Remove a route by destination.
   */
  remove(destinationId: NodeID): boolean {
    return this.entries.delete(destinationId.toLowerCase());
  }

  /**
   * Get route to a destination. Returns undefined if no route exists.
   */
  get(destinationId: NodeID): RoutingEntry | undefined {
    return this.entries.get(destinationId.toLowerCase());
  }

  /**
   * Check if a valid (non-expired) route exists.
   */
  hasValidRoute(destinationId: NodeID, now: Timestamp): boolean {
    const entry = this.entries.get(destinationId.toLowerCase());
    if (!entry) return false;
    return (entry.expiresAt as number) > (now as number);
  }

  /**
   * Get all routes.
   */
  getAll(): RoutingEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Remove expired routes. Returns evicted destination IDs.
   */
  evictExpired(now: Timestamp): NodeID[] {
    const evicted: NodeID[] = [];
    for (const [key, entry] of this.entries) {
      if ((entry.expiresAt as number) <= (now as number)) {
        this.entries.delete(key);
        evicted.push(entry.destinationId);
      }
    }
    return evicted;
  }

  /**
   * Invalidate all routes that use a specific node as next hop.
   * Returns the destination IDs of invalidated routes.
   */
  invalidateByNextHop(nextHopId: NodeID): NodeID[] {
    const invalidated: NodeID[] = [];
    const nextHopLower = nextHopId.toLowerCase();
    for (const [key, entry] of this.entries) {
      if (entry.nextHopId.toLowerCase() === nextHopLower) {
        this.entries.delete(key);
        invalidated.push(entry.destinationId);
      }
    }
    return invalidated;
  }

  /**
   * Refresh a route's expiry (extends lifetime after successful use).
   */
  refresh(destinationId: NodeID, newExpiresAt: Timestamp): boolean {
    const key = destinationId.toLowerCase();
    const existing = this.entries.get(key);
    if (!existing) return false;
    this.entries.set(key, { ...existing, expiresAt: newExpiresAt });
    return true;
  }

  /**
   * Get number of routes.
   */
  size(): number {
    return this.entries.size;
  }

  /**
   * Remove all entries.
   */
  clear(): void {
    this.entries.clear();
  }
}
