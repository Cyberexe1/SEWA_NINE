/**
 * NINE Core — Configuration
 *
 * All runtime configuration for the protocol stack in one place.
 * No hardcoded values elsewhere — every tunable flows from here.
 */

import { type NodeID, NodeRole } from './shared/Types.js';

export interface NineConfiguration {
  // --- Identity ---
  role: NodeRole;
  displayName: string;
  nodeId?: NodeID;

  // --- Timing ---
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  packetTimeoutMs: number;
  ackTimeoutMs: number;
  ackMaxRetries: number;
  routeExpiryMs: number;
  routeDiscoveryTimeoutMs: number;
  reassemblyTimeoutMs: number;

  // --- Limits ---
  duplicateCacheSize: number;
  duplicateCacheExpiryMs: number;
  maxTTL: number;
  broadcastTTL: number;
  routedTTL: number;
  pendingQueueSize: number;

  // --- Security ---
  sessionKeyMaxAgeMs: number;
  maxPacketAgeMs: number;

  // --- Transport ---
  preferredTransports: string[];
  simulationMode: boolean;
}

/** Default configuration values (align with RFC and Timing spec). */
export const DEFAULT_CONFIGURATION: Omit<NineConfiguration, 'role' | 'displayName'> = {
  heartbeatIntervalMs: 5000,
  heartbeatTimeoutMs: 15000,
  packetTimeoutMs: 30000,
  ackTimeoutMs: 3000,
  ackMaxRetries: 3,
  routeExpiryMs: 30000,
  routeDiscoveryTimeoutMs: 10000,
  reassemblyTimeoutMs: 30000,
  duplicateCacheSize: 1024,
  duplicateCacheExpiryMs: 60000,
  maxTTL: 255,
  broadcastTTL: 10,
  routedTTL: 20,
  pendingQueueSize: 64,
  sessionKeyMaxAgeMs: 60000,
  maxPacketAgeMs: 60000,
  preferredTransports: ['simulated'],
  simulationMode: true,
};

/** Build a complete configuration from partial overrides. */
export function createConfiguration(
  role: NodeRole,
  displayName: string,
  overrides?: Partial<NineConfiguration>,
): NineConfiguration {
  return { role, displayName, ...DEFAULT_CONFIGURATION, ...overrides };
}
