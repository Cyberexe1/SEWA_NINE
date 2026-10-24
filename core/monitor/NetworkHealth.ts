/**
 * NINE Protocol - Network Health Monitor
 *
 * Tracks overall mesh health metrics:
 * - Per-node heartbeat status
 * - Link quality trends
 * - Packet delivery rates
 * - Route stability
 */

import type { NodeID } from '../shared/Types.js';

/**
 * Health status of a single node.
 */
export interface NodeHealth {
  nodeId: NodeID;
  displayName: string;
  status: 'alive' | 'degraded' | 'dead';
  lastHeartbeatAge: number; // ms since last heartbeat
  linkQuality: number;
  packetDeliveryRate: number; // 0.0 to 1.0
}

/**
 * Overall mesh health summary.
 */
export interface MeshHealthSummary {
  totalNodes: number;
  aliveNodes: number;
  degradedNodes: number;
  deadNodes: number;
  averageLinkQuality: number;
  averageDeliveryRate: number;
  routeCount: number;
  pendingPackets: number;
}

/**
 * Network Health Monitor interface.
 */
export interface INetworkHealthMonitor {
  /** Get health status of all nodes */
  getNodeHealth(): NodeHealth[];

  /** Get health of a specific node */
  getNodeHealthById(nodeId: NodeID): NodeHealth | undefined;

  /** Get overall mesh health summary */
  getSummary(): MeshHealthSummary;

  /** Register callback for health status changes */
  onHealthChange(callback: (summary: MeshHealthSummary) => void): void;

  /** Remove callback */
  offHealthChange(callback: (summary: MeshHealthSummary) => void): void;
}
