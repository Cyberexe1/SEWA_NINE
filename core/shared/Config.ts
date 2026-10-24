/**
 * NINE Protocol - Runtime Configuration
 *
 * Configuration interfaces for initializing the NINE core.
 * Applications pass these when calling initialize().
 */

import type { NodeID, NodeRole, TransportType } from './Types.js';

export interface NodeConfig {
  /** Node role: USER or ADMIN */
  role: NodeRole;

  /** Human-readable display name */
  displayName: string;

  /** Path to the SQLite database file */
  storagePath: string;

  /** Existing Node ID to resume (auto-generated if omitted) */
  nodeId?: NodeID;

  /** Which transport adapters to enable */
  transports: TransportSelection[];

  /** Override default protocol parameters */
  protocolOverrides?: Partial<ProtocolOverrides>;
}

export interface TransportSelection {
  type: TransportType;
  config?: Record<string, unknown>;
}

export interface ProtocolOverrides {
  broadcastTTL: number;
  routedTTL: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  dedupBufferSize: number;
  routeExpiryMs: number;
}
