/**
 * NINE Transport — Transport Selector
 *
 * Chooses the best transport for a given peer/need based on capabilities,
 * priority, and connection state. Implements fallback logic.
 */

import { type PeerID } from '../shared/Types.js';
import { type ITransport } from './ITransport.js';

export interface SelectionCriteria {
  /** Minimum payload size the transport must support. */
  minPayloadSize?: number;
  /** Prefer low power transports. */
  preferLowPower?: boolean;
  /** Require broadcast support. */
  requireBroadcast?: boolean;
}

export class TransportSelector {
  private transports: ITransport[] = [];

  register(transport: ITransport): void {
    this.transports.push(transport);
    // Sort by selection priority (highest first)
    this.transports.sort((a, b) => b.capabilities.selectionPriority - a.capabilities.selectionPriority);
  }

  unregister(transport: ITransport): void {
    this.transports = this.transports.filter(t => t !== transport);
  }

  /** Select the best transport that is connected to a peer. */
  selectForPeer(peerId: PeerID, criteria?: SelectionCriteria): ITransport | null {
    for (const t of this.transports) {
      if (!this.meetsCriteria(t, criteria)) continue;
      if (t.isConnected(peerId)) return t;
    }
    // Fallback: any transport meeting criteria (may need to connect first)
    for (const t of this.transports) {
      if (this.meetsCriteria(t, criteria)) return t;
    }
    return null;
  }

  /** Select the best transport for broadcast. */
  selectForBroadcast(criteria?: SelectionCriteria): ITransport | null {
    for (const t of this.transports) {
      if (!t.capabilities.supportsBroadcast) continue;
      if (this.meetsCriteria(t, criteria)) return t;
    }
    return null;
  }

  /** Get all registered transports in priority order. */
  getAll(): ITransport[] { return [...this.transports]; }

  private meetsCriteria(t: ITransport, criteria?: SelectionCriteria): boolean {
    if (!criteria) return true;
    if (criteria.minPayloadSize && t.capabilities.maxPayloadSize < criteria.minPayloadSize) return false;
    if (criteria.requireBroadcast && !t.capabilities.supportsBroadcast) return false;
    return true;
  }
}
