/**
 * NINE Protocol - DSR (Dynamic Source Routing) Algorithm Stub
 *
 * Alternative routing algorithm using full source-routing.
 * The complete path is carried in every data packet.
 *
 * This file defines the DSR-specific types and will hold the
 * implementation once the routing engine is built.
 *
 * Key differences from AODV:
 * - No routing tables at intermediate nodes (route is in the packet)
 * - Route cache at source (stores discovered routes)
 * - Multiple routes per destination supported
 * - Better for small, mobile networks
 */

import type { IRoutingAlgorithm } from './AODV.js';

/**
 * DSR-specific route cache entry.
 * DSR stores full paths rather than next-hop entries.
 */
export interface DSRRouteCache {
  /** Multiple cached routes per destination (sorted by metric) */
  routes: Map<string, DSRCachedRoute[]>;
}

export interface DSRCachedRoute {
  /** Full ordered path from self to destination */
  path: string[];

  /** When this route was last used successfully */
  lastUsed: number;

  /** Number of times this route has been used */
  useCount: number;

  /** Composite metric */
  metric: number;
}

/**
 * DSR Algorithm — placeholder for future implementation.
 * Must conform to the IRoutingAlgorithm interface from AODV.ts.
 */
export type IDSRAlgorithm = IRoutingAlgorithm;
