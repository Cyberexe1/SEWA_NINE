/**
 * NINE Messaging — Path Selector
 *
 * Selects two node-disjoint paths for dual-path delivery.
 * Falls back to single path if only one exists.
 */

import { type NodeID } from '../shared/Types.js';

export interface DualPaths {
  pathA: NodeID[];
  pathB: NodeID[];
  disjoint: boolean;
}

export type GetRouteFn = (from: NodeID, to: NodeID, excludeNodes?: NodeID[]) => NodeID[] | null;

export class PathSelector {
  private readonly getRoute: GetRouteFn;

  constructor(getRoute: GetRouteFn) {
    this.getRoute = getRoute;
  }

  /**
   * Select two paths from source to destination.
   * Attempts node-disjoint paths; falls back to same path.
   */
  selectPaths(source: NodeID, destination: NodeID): DualPaths {
    // Path A: standard route
    const pathA = this.getRoute(source, destination);
    if (!pathA || pathA.length === 0) {
      return { pathA: [destination], pathB: [destination], disjoint: false };
    }

    // Path B: exclude intermediate nodes from Path A
    const intermediates = pathA.filter(
      id => id.toLowerCase() !== source.toLowerCase() && id.toLowerCase() !== destination.toLowerCase()
    );
    const pathB = this.getRoute(source, destination, intermediates);

    if (pathB && pathB.length > 0 && !this.hasOverlap(pathA, pathB, source, destination)) {
      return { pathA, pathB, disjoint: true };
    }

    // Fallback: use same path
    return { pathA, pathB: pathA, disjoint: false };
  }

  private hasOverlap(a: NodeID[], b: NodeID[], source: NodeID, dest: NodeID): boolean {
    const intermediatesA = new Set(
      a.filter(id => id.toLowerCase() !== source.toLowerCase() && id.toLowerCase() !== dest.toLowerCase())
        .map(id => id.toLowerCase())
    );
    return b.some(id => {
      const lower = id.toLowerCase();
      return lower !== source.toLowerCase() && lower !== dest.toLowerCase() && intermediatesA.has(lower);
    });
  }
}
