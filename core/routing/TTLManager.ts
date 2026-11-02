/**
 * NINE Routing — TTL Manager
 *
 * RFC Section 4.4 and Rule 9-10: Handles TTL decrement and hopCount increment.
 * Returns null if packet should be dropped (TTL exhausted).
 */

import { type Packet, type PacketHeader } from '../protocol/Packet.js';

export interface TTLResult {
  /** The packet with decremented TTL and incremented hopCount, or null if expired. */
  packet: Packet | null;
  /** True if packet was dropped due to TTL exhaustion. */
  dropped: boolean;
}

/**
 * Decrement TTL and increment hopCount for a relay operation.
 * Returns null packet if TTL is already 0.
 */
export function decrementTTL(packet: Packet): TTLResult {
  if (packet.header.ttl <= 0) {
    return { packet: null, dropped: true };
  }

  const newHeader: PacketHeader = {
    ...packet.header,
    ttl: packet.header.ttl - 1,
    hopCount: packet.header.hopCount + 1,
  };

  return {
    packet: { header: newHeader, payload: packet.payload, signature: packet.signature },
    dropped: false,
  };
}

/**
 * Check if a packet's TTL allows further relay (TTL > 1 means next node can still forward).
 */
export function canRelay(packet: Packet): boolean {
  return packet.header.ttl > 0;
}
