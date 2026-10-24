/**
 * NINE Protocol - Heartbeat Service
 *
 * Periodically sends HEARTBEAT packets to all neighbors.
 * Monitors neighbor liveness by tracking heartbeat responses.
 * Triggers neighbor eviction when heartbeats time out.
 */

import type { NodeID } from '../shared/Types.js';

/**
 * Heartbeat configuration.
 */
export interface HeartbeatConfig {
  /** Interval between heartbeat emissions (ms) */
  intervalMs: number;

  /** Time before a neighbor is considered dead (ms) */
  timeoutMs: number;
}

/**
 * Heartbeat Service interface.
 */
export interface IHeartbeatService {
  /** Start emitting heartbeats */
  start(config: HeartbeatConfig): void;

  /** Stop heartbeat emission */
  stop(): void;

  /** Check if heartbeat service is running */
  isRunning(): boolean;

  /** Manually emit a single heartbeat to all neighbors */
  emitOnce(): void;

  /** Process an incoming heartbeat from a neighbor */
  handleHeartbeat(fromPeer: NodeID, payload: unknown): void;

  /** Register callback for neighbor timeout (death detection) */
  onNeighborTimeout(callback: (nodeId: NodeID) => void): void;
}
