/**
 * NINE Routing — Route Cache (Multi-Route)
 *
 * RFC Section 3.5 / 7.2 + dual-path enhancement:
 * Stores MULTIPLE candidate routes per destination, ranks them, and computes
 * node-disjoint pairs for dual-path delivery.
 *
 * Route ranking: lower hop count (metric) first, then fresher (higher seq).
 * Disjoint selection: maximise node-disjointness; if impossible, minimise
 * intermediate-node overlap.
 */

import { type NodeID, type Timestamp } from '../shared/Types.js';
import { type RoutingEntry } from '../node/RoutingTable.js';

export interface DisjointRoutePair {
  primary: RoutingEntry;
  secondary: RoutingEntry;
  disjoint: boolean;        // true if zero intermediate-node overlap
  overlapScore: number;     // number of shared intermediate nodes
}

const MAX_ROUTES_PER_DEST = 5;

export class RouteCache {
  /** destination(lowercase) -> ranked list of routes */
  private readonly routes: Map<string, RoutingEntry[]> = new Map();
  private readonly expiryMs: number;

  constructor(expiryMs: number = 30000) {
    this.expiryMs = expiryMs;
  }

  /** Add a discovered route. Multiple routes per destination are kept. */
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

    const key = destinationId.toLowerCase();
    const list = this.routes.get(key) ?? [];

    // Deduplicate by path signature — refresh if same path re-discovered
    const sig = this.pathSignature(fullPath);
    const existingIdx = list.findIndex(r => this.pathSignature(r.fullPath) === sig);
    if (existingIdx >= 0) {
      list[existingIdx] = entry; // refresh
      this.routes.set(key, this.rank(list));
      return false;
    }

    list.push(entry);
    // Cap and rank
    this.routes.set(key, this.rank(list).slice(0, MAX_ROUTES_PER_DEST));
    return true;
  }

  /** Primary (best-ranked) route to a destination, or null. */
  getPrimaryRoute(destinationId: NodeID, now: Timestamp): RoutingEntry | null {
    const list = this.liveRoutes(destinationId, now);
    return list.length > 0 ? list[0]! : null;
  }

  /** Best route that is node-disjoint from the primary (or min-overlap), or null. */
  getSecondaryRoute(destinationId: NodeID, now: Timestamp): RoutingEntry | null {
    const list = this.liveRoutes(destinationId, now);
    if (list.length < 2) return null;
    const primary = list[0]!;
    // Choose the candidate with minimum intermediate overlap vs primary
    let best: RoutingEntry | null = null;
    let bestOverlap = Infinity;
    for (let i = 1; i < list.length; i++) {
      const overlap = this.overlapCount(primary, list[i]!);
      if (overlap < bestOverlap) { bestOverlap = overlap; best = list[i]!; }
    }
    return best;
  }

  /** Get a disjoint (or minimal-overlap) route pair for dual-path delivery. */
  getDisjointRoutes(destinationId: NodeID, now: Timestamp): DisjointRoutePair | null {
    const list = this.liveRoutes(destinationId, now);
    if (list.length === 0) return null;
    if (list.length === 1) {
      return { primary: list[0]!, secondary: list[0]!, disjoint: false, overlapScore: this.intermediates(list[0]!).length };
    }

    // Find the pair (primary = best-ranked, partner minimising overlap)
    const primary = list[0]!;
    let secondary = list[1]!;
    let bestOverlap = this.overlapCount(primary, secondary);
    for (let i = 2; i < list.length; i++) {
      const o = this.overlapCount(primary, list[i]!);
      if (o < bestOverlap) { bestOverlap = o; secondary = list[i]!; }
    }
    return { primary, secondary, disjoint: bestOverlap === 0, overlapScore: bestOverlap };
  }

  /** Best route (alias for primary). */
  getBestRoute(destinationId: NodeID, now: Timestamp): RoutingEntry | null {
    return this.getPrimaryRoute(destinationId, now);
  }

  /** Backward-compatible single-route accessor (= primary). */
  getRoute(destinationId: NodeID, now: Timestamp): RoutingEntry | null {
    return this.getPrimaryRoute(destinationId, now);
  }

  /** Next hop of the primary route. */
  getNextHop(destinationId: NodeID, now: Timestamp): NodeID | null {
    const r = this.getPrimaryRoute(destinationId, now);
    return r ? r.nextHopId : null;
  }

  /** Number of live routes to a destination. */
  routeCount(destinationId: NodeID, now: Timestamp): number {
    return this.liveRoutes(destinationId, now).length;
  }

  /** Refresh expiry of all routes to a destination after successful use. */
  refresh(destinationId: NodeID, now: Timestamp): boolean {
    const key = destinationId.toLowerCase();
    const list = this.routes.get(key);
    if (!list || list.length === 0) return false;
    const newExpiry = ((now as number) + this.expiryMs) as Timestamp;
    this.routes.set(key, list.map(r => ({ ...r, expiresAt: newExpiry })));
    return true;
  }

  /** Invalidate all routes whose next hop OR path contains the broken node. */
  invalidateByNextHop(nodeId: NodeID): NodeID[] {
    const affected: NodeID[] = [];
    const target = nodeId.toLowerCase();
    for (const [key, list] of this.routes) {
      const kept = list.filter(r =>
        r.nextHopId.toLowerCase() !== target &&
        !r.fullPath.some(p => p.toLowerCase() === target)
      );
      if (kept.length !== list.length) {
        if (list[0]) affected.push(list[0].destinationId);
        if (kept.length === 0) this.routes.delete(key);
        else this.routes.set(key, kept);
      }
    }
    return affected;
  }

  /** Remove expired routes. Returns destinations that lost all routes. */
  evictExpired(now: Timestamp): NodeID[] {
    const emptied: NodeID[] = [];
    for (const [key, list] of this.routes) {
      const live = list.filter(r => (r.expiresAt as number) > (now as number));
      if (live.length === 0) {
        if (list[0]) emptied.push(list[0].destinationId);
        this.routes.delete(key);
      } else if (live.length !== list.length) {
        this.routes.set(key, live);
      }
    }
    return emptied;
  }

  /** Remove all routes to a destination. */
  remove(destinationId: NodeID): boolean {
    return this.routes.delete(destinationId.toLowerCase());
  }

  /** All primary routes (one per destination) — for topology views. */
  getAll(): RoutingEntry[] {
    const out: RoutingEntry[] = [];
    for (const list of this.routes.values()) if (list[0]) out.push(list[0]);
    return out;
  }

  /** All routes across all destinations (including secondaries). */
  getAllRoutes(): RoutingEntry[] {
    const out: RoutingEntry[] = [];
    for (const list of this.routes.values()) out.push(...list);
    return out;
  }

  size(): number { return this.routes.size; }
  clear(): void { this.routes.clear(); }

  // ─── Internal helpers ───────────────────────────────────────────

  private liveRoutes(destinationId: NodeID, now: Timestamp): RoutingEntry[] {
    const key = destinationId.toLowerCase();
    const list = this.routes.get(key);
    if (!list) return [];
    const live = list.filter(r => (r.expiresAt as number) > (now as number));
    if (live.length !== list.length) {
      if (live.length === 0) this.routes.delete(key);
      else this.routes.set(key, live);
    }
    return live;
  }

  private rank(list: RoutingEntry[]): RoutingEntry[] {
    return [...list].sort((a, b) => {
      if (a.routeMetric !== b.routeMetric) return a.routeMetric - b.routeMetric;
      return b.sequenceNumber - a.sequenceNumber; // fresher first
    });
  }

  private intermediates(r: RoutingEntry): string[] {
    // Exclude first (source) and last (destination)
    return r.fullPath.slice(1, -1).map(id => id.toLowerCase());
  }

  private overlapCount(a: RoutingEntry, b: RoutingEntry): number {
    const setA = new Set(this.intermediates(a));
    let count = 0;
    for (const id of this.intermediates(b)) if (setA.has(id)) count++;
    return count;
  }

  private pathSignature(path: readonly NodeID[]): string {
    return path.map(id => id.toLowerCase()).join('>');
  }
}
