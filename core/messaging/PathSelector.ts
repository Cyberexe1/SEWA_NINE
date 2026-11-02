/**
 * NINE Messaging — Path Selector
 *
 * Requests a node-disjoint route pair from the Routing Engine (multi-route
 * cache). No longer derives paths independently — the routing layer owns
 * route knowledge and disjointness scoring.
 */

import { type NodeID } from '../shared/Types.js';

export interface DualPaths {
  /** Full path for the message (SECURE_DATA). */
  pathA: NodeID[];
  /** Full path for the key (SECURE_KEY). */
  pathB: NodeID[];
  /** True if the two paths are node-disjoint. */
  disjoint: boolean;
  /** True if at least one usable route exists. */
  hasRoute: boolean;
  /** Number of shared intermediate nodes between the two paths. */
  overlapScore: number;
}

/**
 * Provided by NineCore/RoutingEngine. Returns a disjoint (or minimal-overlap)
 * route pair for the destination, or null if no route is known.
 */
export type DisjointRouteProvider = (
  source: NodeID,
  destination: NodeID,
) => { pathA: NodeID[]; pathB: NodeID[]; disjoint: boolean; overlapScore: number } | null;

export class PathSelector {
  private readonly provider: DisjointRouteProvider;

  constructor(provider: DisjointRouteProvider) {
    this.provider = provider;
  }

  /** Select two paths from source to destination using the routing engine. */
  selectPaths(source: NodeID, destination: NodeID): DualPaths {
    const pair = this.provider(source, destination);
    if (!pair) {
      return { pathA: [], pathB: [], disjoint: false, hasRoute: false, overlapScore: Infinity };
    }
    return {
      pathA: pair.pathA,
      pathB: pair.pathB,
      disjoint: pair.disjoint,
      hasRoute: true,
      overlapScore: pair.overlapScore,
    };
  }
}
