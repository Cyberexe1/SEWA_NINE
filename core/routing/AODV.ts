/**
 * NINE Protocol - AODV-style Routing Algorithm Interface
 *
 * Defines the pluggable routing algorithm contract.
 * AODV (Ad hoc On-Demand Distance Vector) is the initial implementation target,
 * but any algorithm conforming to this interface can be substituted.
 */

import type { Packet } from '../protocol/Packet.js';
import type { NodeID } from '../shared/Types.js';
import type { NeighborEntry } from '../node/NeighborTable.js';
import type { RoutingContext } from './Router.js';

/**
 * Pluggable routing algorithm interface.
 *
 * Implementations:
 * - AODV-like reactive routing (default)
 * - DSR (Dynamic Source Routing)
 * - Custom hybrids
 */
export interface IRoutingAlgorithm {
  /** Algorithm identifier */
  readonly name: string;

  /** Algorithm version */
  readonly version: string;

  /** Initialize with routing context */
  initialize(context: RoutingContext): void;

  /** Find the next hop toward a destination */
  getNextHop(destinationId: NodeID): NodeID | null;

  /** Get the full route to a destination (if known) */
  getRoute(destinationId: NodeID): NodeID[] | null;

  /**
   * Find two node-disjoint paths for dual-path secure messaging.
   * Returns [pathA, pathB] or null if dual-path is unavailable.
   */
  getDualPaths(destinationId: NodeID): [NodeID[], NodeID[]] | null;

  /** Handle an incoming ROUTE_REQUEST */
  handleRouteRequest(packet: Packet, fromPeer: NodeID): void;

  /** Handle an incoming ROUTE_REPLY */
  handleRouteReply(packet: Packet, fromPeer: NodeID): void;

  /** Handle an incoming ROUTE_ERROR */
  handleRouteError(packet: Packet, fromPeer: NodeID): void;

  /** Notification: new neighbor appeared */
  onNeighborAdded(neighbor: NeighborEntry): void;

  /** Notification: neighbor disappeared */
  onNeighborRemoved(neighborId: NodeID): void;

  /** Notification: link quality changed */
  onLinkQualityChanged(neighborId: NodeID, quality: number): void;

  /** Cleanup resources */
  shutdown(): void;
}
