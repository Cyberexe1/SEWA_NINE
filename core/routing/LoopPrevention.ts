/**
 * NINE Routing — Loop Prevention
 *
 * RFC Section 7.6: Three mechanisms prevent routing loops:
 * 1. TTL decrement (handled by TTLManager)
 * 2. Duplicate packet detection (handled by DuplicatePacketCache)
 * 3. Hop list inspection (same node appears twice → loop)
 */

import { type NodeID } from '../shared/Types.js';

/**
 * Check if a hop list contains a loop (same node appears more than once).
 */
export function hasLoop(hopList: readonly NodeID[]): boolean {
  const seen = new Set<string>();
  for (const id of hopList) {
    const key = id.toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/**
 * Check if adding a node to a hop list would create a loop.
 */
export function wouldCreateLoop(hopList: readonly NodeID[], nodeId: NodeID): boolean {
  return hopList.some(id => id.toLowerCase() === nodeId.toLowerCase());
}

/**
 * Check if a node is already in a route path (for forwarding loop prevention).
 */
export function isInPath(path: readonly NodeID[], nodeId: NodeID): boolean {
  return path.some(id => id.toLowerCase() === nodeId.toLowerCase());
}
