/**
 * NINE Protocol - Discovery Service
 *
 * Handles node discovery within the mesh.
 * Sends DISCOVERY packets, processes DISCOVERY_RESPONSE,
 * and maintains the neighbor table.
 */

import type { NodeID } from '../shared/Types.js';
import type { NeighborEntry } from '../node/NeighborTable.js';

/**
 * Discovery Service configuration.
 */
export interface DiscoveryConfig {
  /** How often to broadcast discovery (ms) */
  discoveryIntervalMs: number;

  /** How long to remain discoverable (ms) */
  discoverableDurationMs: number;

  /** Include Admin public key in discovery (Admin only) */
  includePublicKey: boolean;
}

/**
 * Discovery event types.
 */
export enum DiscoveryEvent {
  NEIGHBOR_FOUND = 'neighbor_found',
  NEIGHBOR_UPDATED = 'neighbor_updated',
  NEIGHBOR_LOST = 'neighbor_lost',
}

export type DiscoveryCallback = (event: DiscoveryEvent, neighbor: NeighborEntry) => void;

/**
 * Discovery Service interface.
 */
export interface IDiscoveryService {
  /** Start the discovery process */
  start(config: DiscoveryConfig): void;

  /** Stop discovery */
  stop(): void;

  /** Manually trigger a single discovery broadcast */
  discoverOnce(): void;

  /** Check if discovery is currently active */
  isActive(): boolean;

  /** Register a callback for discovery events */
  onDiscoveryEvent(callback: DiscoveryCallback): void;

  /** Remove a callback */
  offDiscoveryEvent(callback: DiscoveryCallback): void;

  /** Process an incoming DISCOVERY packet from a peer */
  handleDiscovery(fromPeer: NodeID, payload: unknown): void;

  /** Process an incoming DISCOVERY_RESPONSE */
  handleDiscoveryResponse(fromPeer: NodeID, payload: unknown): void;
}
