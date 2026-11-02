/**
 * NINE Transport — Transport Capabilities
 *
 * Describes the properties of a transport implementation so the
 * TransportSelector can choose the best medium for a given need.
 */

import { type TransportType } from '../shared/Types.js';

export interface TransportCapabilities {
  /** Which transport type this describes */
  readonly type: TransportType;

  /** Approximate range in meters */
  readonly rangeMeters: number;

  /** Maximum throughput in bytes/sec */
  readonly maxThroughput: number;

  /** Typical latency in milliseconds */
  readonly typicalLatencyMs: number;

  /** Maximum simultaneous connections */
  readonly maxConnections: number;

  /** Maximum single-packet payload in bytes */
  readonly maxPayloadSize: number;

  /** Relative power cost (0=none, 1=low, 2=medium, 3=high) */
  readonly powerCost: number;

  /** Whether the transport supports broadcast natively */
  readonly supportsBroadcast: boolean;

  /** Priority for selection (higher = preferred) */
  readonly selectionPriority: number;
}

/** Capability profile for the simulated/virtual transport. */
export const VIRTUAL_CAPABILITIES: TransportCapabilities = {
  type: 'simulated' as TransportType,
  rangeMeters: Infinity,
  maxThroughput: Infinity,
  typicalLatencyMs: 10,
  maxConnections: Infinity,
  maxPayloadSize: 4096,
  powerCost: 0,
  supportsBroadcast: true,
  selectionPriority: 0,
};
