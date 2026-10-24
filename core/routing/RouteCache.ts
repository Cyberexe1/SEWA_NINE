/**
 * NINE Routing — Route Cache
 *
 * RFC Section 3.5 / 7.2: Stores discovered routes with expiry and metric comparison.
 * Wraps the existing RoutingTable from the Node Layer with routing-engine semantics.
 */

import { type NodeID, type Timestamp } from '../shared/Types.js';
import { RoutingTable, type RoutingEntry } from '../node/RoutingTable.js';

export class RouteCache {
  private readonly table: RoutingTable;
  private readonly expiryMs: number;

  constructor(expiryMs: number = 30000) {
    this.table = new RoutingTable();
    this.expiryMs = expiryMs;
  }

  /** Add a discovered route. */
  addRoute(
    destinationId: NodeID,
    nextHopId: NodeID,
    fullPath: NodeID[],
    sequenceNumber: number,
    now: Timestamp,
  ): boolean {
    const entry: RoutingEntry = {
      destinationId,
      nextHopId,
      hopCount: fullPath.length - 1,
      routeMetric: (fullPath.length - 1) * 100,
      fullPath,
      sequenceNumber,
      discoveredAt: now,
      expiresAt: ((now as number) + this.expiryMs) as Timestamp,
    };
    return this.table.upsert(entry);
  }

  /** Get route to destination. Returns null if expired or not found. */
  getRoute(destinationId: NodeID, now: Timestamp): RoutingEntry | null {
    const entry = this.table.get(destinationId);
    if (!entry) return null;
    if ((entry.expiresAt as number) <= (now as number)) {
      this.table.remove(destinationId);
      return null;
    }
    return entry;
  }

  /** Get next hop toward destination. */
  getNextHop(destinationId: NodeID, now: Timestamp): NodeID | null {
    const route = this.getRoute(destinationId, now);
    return route ? route.nextHopId : null;
  }

  /** Refresh route expiry after successful use. */
  refresh(destinationId: NodeID, now: Timestamp): boolean {
    return this.table.refresh(destinationId, ((now as number) + this.expiryMs) as Timestamp);
  }

  /** Invalidate all routes through a broken next hop. Returns affected destinations. */
  invalidateByNextHop(nextHopId: NodeID): NodeID[] {
    return this.table.invalidateByNextHop(nextHopId);
  }

  /** Remove expired routes. */
  evictExpired(now: Timestamp): NodeID[] {
    return this.table.evictExpired(now);
  }

  /** Remove specific route. */
  remove(destinationId: NodeID): boolean {
    return this.table.remove(destinationId);
  }

  /** Get all routes. */
  getAll(): RoutingEntry[] { return this.table.getAll(); }
  size(): number { return this.table.size(); }
  clear(): void { this.table.clear(); }
}
