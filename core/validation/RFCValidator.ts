/**
 * NINE Protocol — RFC Rule Verification Helpers
 *
 * Encodes the MANDATORY rules from NINE-RFC-v1.0 Section 13 as small,
 * pure verification functions. This module does not change any protocol
 * behavior — it only inspects packets/config/state produced by the
 * frozen engines and reports whether a rule held.
 *
 * Used exclusively by tests/compliance/RFCCompliance.test.ts.
 */

import { type Packet } from '../protocol/Packet.js';
import { type NineConfiguration } from '../NineConfiguration.js';
import { MAX_PACKET_SIZE } from '../protocol/Packet.js';

// ─── RFC Rule Registry (Section 13) ─────────────────────────────────────

export type RuleCategory = 'packet' | 'forwarding' | 'timing' | 'security' | 'discovery' | 'routing';

export interface RfcRule {
  readonly id: number;
  readonly category: RuleCategory;
  readonly text: string;
}

/** The 40 mandatory rules from NINE-RFC-v1.0 Section 13, verbatim. */
export const RFC_RULES: readonly RfcRule[] = [
  { id: 1, category: 'packet', text: 'A packet MUST NOT exceed 4096 bytes total (header + payload + signature).' },
  { id: 2, category: 'packet', text: 'A packet MUST contain all required header fields as defined in Section 4.2.' },
  { id: 3, category: 'packet', text: 'A packet with an invalid checksum MUST be dropped.' },
  { id: 4, category: 'packet', text: "A packet with a version number different from the local node's version MUST be dropped." },
  { id: 5, category: 'packet', text: 'A packet with an unknown packetType MUST be dropped.' },
  { id: 6, category: 'packet', text: 'A packet with TTL = 0 MUST NOT be forwarded (it may be delivered if this node is the destination).' },
  { id: 7, category: 'packet', text: "A packet's senderId MUST NOT be modified by any relay node." },
  { id: 8, category: 'packet', text: 'Sequence numbers MUST be monotonically increasing per sender.' },
  { id: 9, category: 'forwarding', text: 'A relay node MUST decrement TTL by exactly 1 before forwarding.' },
  { id: 10, category: 'forwarding', text: 'A relay node MUST increment hopCount by exactly 1 before forwarding.' },
  { id: 11, category: 'forwarding', text: 'A relay node MUST check the deduplication buffer before processing.' },
  { id: 12, category: 'forwarding', text: 'A relay node MUST NOT forward a packet it has already seen (by packetId).' },
  { id: 13, category: 'forwarding', text: 'DISCOVERY, DISCOVERY_RESPONSE, and HEARTBEAT packets MUST NOT be forwarded under any circumstances.' },
  { id: 14, category: 'forwarding', text: 'BROADCAST packets MUST be forwarded to all neighbors except the delivering peer.' },
  { id: 15, category: 'forwarding', text: 'ROUTE_REQUEST packets MUST be forwarded to all neighbors except the delivering peer (flood behavior).' },
  { id: 16, category: 'forwarding', text: 'ROUTE_REPLY packets MUST be forwarded only to the next node in the reverse path.' },
  { id: 17, category: 'forwarding', text: 'ROUTE_ERROR packets MUST be forwarded only to affected upstream nodes.' },
  { id: 18, category: 'timing', text: 'Heartbeats MUST be sent at intervals no greater than HEARTBEAT_INTERVAL_MS.' },
  { id: 19, category: 'timing', text: 'A neighbor MUST be declared dead after HEARTBEAT_TIMEOUT_MS without a heartbeat.' },
  { id: 20, category: 'timing', text: 'Route discovery MUST timeout after ROUTE_DISCOVERY_TIMEOUT_MS.' },
  { id: 21, category: 'timing', text: 'Pending packets MUST be dropped after PENDING_PACKET_TIMEOUT_MS.' },
  { id: 22, category: 'timing', text: 'Dedup buffer entries MUST be evicted after DEDUP_EXPIRY_MS.' },
  { id: 23, category: 'timing', text: 'Routing entries MUST be invalidated after ROUTE_EXPIRY_MS.' },
  { id: 24, category: 'security', text: 'Session keys MUST be generated using cryptographically secure random.' },
  { id: 25, category: 'security', text: 'Session keys MUST be used exactly once and then erased.' },
  { id: 26, category: 'security', text: "Admin's RSA private key MUST never be transmitted over the network." },
  { id: 27, category: 'security', text: 'ENCRYPTED_MESSAGE and KEY_PACKET MUST have the SIGNED flag set.' },
  { id: 28, category: 'security', text: 'A node MUST NOT decrypt ENCRYPTED_MESSAGE unless it is the Admin.' },
  { id: 29, category: 'security', text: 'Hash comparisons MUST use constant-time algorithms.' },
  { id: 30, category: 'security', text: 'Key material MUST be zeroed from memory after use.' },
  { id: 31, category: 'discovery', text: 'A node MUST send DISCOVERY when it first detects a new transport-level peer.' },
  { id: 32, category: 'discovery', text: 'A node MUST respond with DISCOVERY_RESPONSE when it receives a valid DISCOVERY.' },
  { id: 33, category: 'discovery', text: 'A node MUST update its neighbor table upon successful discovery handshake.' },
  { id: 34, category: 'discovery', text: 'Admin MUST include its RSA public key in DISCOVERY and DISCOVERY_RESPONSE packets.' },
  { id: 35, category: 'routing', text: 'A node MUST initiate route discovery when it has a packet for a destination with no known route.' },
  { id: 36, category: 'routing', text: 'A node MUST buffer packets during route discovery (up to MAX_PENDING_QUEUE_SIZE).' },
  { id: 37, category: 'routing', text: 'A node MUST generate ROUTE_ERROR when it detects a link break.' },
  { id: 38, category: 'routing', text: 'A node MUST invalidate routes when it receives a ROUTE_ERROR.' },
  { id: 39, category: 'routing', text: 'ROUTE_REQUEST hopList MUST NOT exceed MAX_HOP_LIST_SIZE.' },
  { id: 40, category: 'routing', text: 'A node MUST NOT appear more than once in a ROUTE_REQUEST hopList (loop detected → drop).' },
];

// ─── RFC-Specified Default Values (Section 13 timing rules) ────────────
// Cross-referenced against NineConfiguration.DEFAULT_CONFIGURATION.

export const RFC_DEFAULTS = {
  ROUTE_EXPIRY_MS: 30000,
  DEDUP_EXPIRY_MS: 60000,
  DEDUP_BUFFER_SIZE: 1024,
  MAX_PENDING_QUEUE_SIZE: 64,
  PENDING_PACKET_TIMEOUT_MS: 30000,
  ROUTE_DISCOVERY_TIMEOUT_MS: 10000,
  MAX_HOP_LIST_SIZE: 20,
} as const;

export interface ConfigComplianceResult {
  readonly compliant: boolean;
  readonly mismatches: Array<{ field: keyof typeof RFC_DEFAULTS; expected: number; actual: number }>;
}

/** Compare a running configuration's timing values against RFC-mandated defaults. */
export function checkConfigDefaults(config: NineConfiguration): ConfigComplianceResult {
  const mismatches: ConfigComplianceResult['mismatches'] = [];
  const pairs: Array<[keyof typeof RFC_DEFAULTS, number]> = [
    ['ROUTE_EXPIRY_MS', config.routeExpiryMs],
    ['DEDUP_EXPIRY_MS', config.duplicateCacheExpiryMs],
    ['DEDUP_BUFFER_SIZE', config.duplicateCacheSize],
    ['MAX_PENDING_QUEUE_SIZE', config.pendingQueueSize],
    ['PENDING_PACKET_TIMEOUT_MS', config.packetTimeoutMs],
    ['ROUTE_DISCOVERY_TIMEOUT_MS', config.routeDiscoveryTimeoutMs],
  ];
  for (const [field, actual] of pairs) {
    const expected = RFC_DEFAULTS[field];
    if (actual !== expected) mismatches.push({ field, expected, actual });
  }
  return { compliant: mismatches.length === 0, mismatches };
}

// ─── Packet-Level Rule Checks (Rules 1, 6, 7, 8, 9, 10) ────────────────

/** Rule 1: total serialized size (header + payload + signature) must not exceed MAX_PACKET_SIZE. */
export function checkSizeLimit(serializedLength: number): boolean {
  return serializedLength <= MAX_PACKET_SIZE;
}

/** Rule 9: TTL on the relayed packet must be exactly one less than the original. */
export function checkTTLDecrementedByOne(original: Packet, relayed: Packet): boolean {
  return relayed.header.ttl === original.header.ttl - 1;
}

/** Rule 10: hopCount on the relayed packet must be exactly one more than the original. */
export function checkHopCountIncrementedByOne(original: Packet, relayed: Packet): boolean {
  return relayed.header.hopCount === original.header.hopCount + 1;
}

/** Rule 7: senderId must be byte-for-byte identical after any relay operation. */
export function checkSenderIdUnchanged(original: Packet, relayed: Packet): boolean {
  return original.header.senderId.toLowerCase() === relayed.header.senderId.toLowerCase();
}

/** Rule 8: sequence numbers observed from one sender must be strictly increasing. */
export function checkSequenceMonotonic(sequenceNumbersInArrivalOrder: readonly number[]): boolean {
  for (let i = 1; i < sequenceNumbersInArrivalOrder.length; i++) {
    if (sequenceNumbersInArrivalOrder[i]! <= sequenceNumbersInArrivalOrder[i - 1]!) return false;
  }
  return true;
}

/** Rule 39: ROUTE_REQUEST hopList must never exceed the configured maximum. */
export function checkHopListWithinLimit(hopListLength: number, max: number = RFC_DEFAULTS.MAX_HOP_LIST_SIZE): boolean {
  return hopListLength <= max;
}

/** Rule 27: ENCRYPTED_MESSAGE / KEY_PACKET packets must carry the SIGNED flag. */
export function checkSignedFlagSet(packet: Packet): boolean {
  return (packet.header.flags & 0x04) !== 0; // PacketFlags.SIGNED = 0x04
}
