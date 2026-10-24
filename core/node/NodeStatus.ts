/**
 * NINE Protocol — Node Status
 *
 * Computes aggregate health/status of the local node based on
 * neighbor table, routing table, and heartbeat state.
 */

import { type NodeID, type Timestamp } from '../shared/Types.js';
import { NeighborTable } from './NeighborTable.js';
import { RoutingTable } from './RoutingTable.js';
import { HeartbeatState, HeartbeatStatus } from './HeartbeatState.js';

// ─── Node Health Summary ───────────────────────────────────────────────

export interface NodeHealthSummary {
  readonly neighborCount: number;
  readonly aliveNeighbors: number;
  readonly degradedNeighbors: number;
  readonly deadNeighbors: number;
  readonly routeCount: number;
  readonly averageLinkQuality: number;
  readonly meshConnected: boolean;         // At least 1 alive neighbor
}

// ─── Per-Neighbor Status ───────────────────────────────────────────────

export interface NeighborStatus {
  readonly nodeId: NodeID;
  readonly displayName: string;
  readonly heartbeatStatus: HeartbeatStatus;
  readonly linkQuality: number;
  readonly lastHeartbeatAge: number;       // ms since last heartbeat
}

// ─── Status Computer ───────────────────────────────────────────────────

export function computeNodeHealth(
  neighborTable: NeighborTable,
  routingTable: RoutingTable,
  heartbeatState: HeartbeatState,
  now: Timestamp,
): NodeHealthSummary {
  const neighbors = neighborTable.getAll();
  let alive = 0;
  let degraded = 0;
  let dead = 0;
  let totalQuality = 0;

  for (const neighbor of neighbors) {
    const status = heartbeatState.getStatus(neighbor.nodeId, now);
    switch (status) {
      case HeartbeatStatus.ALIVE: alive++; break;
      case HeartbeatStatus.DEGRADED: degraded++; break;
      case HeartbeatStatus.DEAD: dead++; break;
    }
    totalQuality += neighbor.linkQuality;
  }

  const avgQuality = neighbors.length > 0 ? totalQuality / neighbors.length : 0;

  return {
    neighborCount: neighbors.length,
    aliveNeighbors: alive,
    degradedNeighbors: degraded,
    deadNeighbors: dead,
    routeCount: routingTable.size(),
    averageLinkQuality: Math.round(avgQuality * 100) / 100,
    meshConnected: alive > 0,
  };
}

/**
 * Compute per-neighbor status for display/monitoring.
 */
export function computeNeighborStatuses(
  neighborTable: NeighborTable,
  heartbeatState: HeartbeatState,
  now: Timestamp,
): NeighborStatus[] {
  return neighborTable.getAll().map(neighbor => {
    const hbRecord = heartbeatState.getRecord(neighbor.nodeId);
    const lastAge = hbRecord
      ? (now as number) - (hbRecord.lastReceived as number)
      : Infinity;

    return {
      nodeId: neighbor.nodeId,
      displayName: neighbor.displayName,
      heartbeatStatus: heartbeatState.getStatus(neighbor.nodeId, now),
      linkQuality: neighbor.linkQuality,
      lastHeartbeatAge: lastAge,
    };
  });
}
