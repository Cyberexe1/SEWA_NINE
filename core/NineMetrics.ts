/**
 * NINE Core — Unified Metrics
 *
 * Aggregates metrics from every subsystem into one interface.
 * Applications get a single, coherent view of protocol health.
 */

import { type RoutingMetrics } from './routing/RoutingEngine.js';
import { type DualPathMetrics } from './messaging/DualPathManager.js';

export interface NineMetrics {
  routing: RoutingMetrics;
  dualPath: DualPathMetrics;
  transport: {
    bytesSent: number;
    bytesReceived: number;
    packetsSent: number;
    packetsReceived: number;
  };
  node: {
    neighborCount: number;
    knownNodeCount: number;
    routeCount: number;
  };
}

export interface MetricsProviders {
  getRoutingMetrics: () => RoutingMetrics;
  getDualPathMetrics: () => DualPathMetrics;
  getTransportMetrics: () => { bytesSent: number; bytesReceived: number; packetsSent: number; packetsReceived: number };
  getNodeMetrics: () => { neighborCount: number; knownNodeCount: number; routeCount: number };
}

export class NineMetricsAggregator {
  constructor(private readonly providers: MetricsProviders) {}

  snapshot(): NineMetrics {
    return {
      routing: this.providers.getRoutingMetrics(),
      dualPath: this.providers.getDualPathMetrics(),
      transport: this.providers.getTransportMetrics(),
      node: this.providers.getNodeMetrics(),
    };
  }
}
