/**
 * NINE Transport — Transport Manager
 *
 * Coordinates multiple transports. Provides a unified send/broadcast/discover
 * API that automatically selects the best transport and handles fallback.
 * This is what the protocol layer interacts with.
 */

import { type PeerID, type TransportType } from '../shared/Types.js';
import { type ITransport, type SendResult } from './ITransport.js';
import { TransportSelector, type SelectionCriteria } from './TransportSelector.js';
import { TransportEventType, type TransportEventHandler, type TransportEvent } from './TransportEvents.js';

export class TransportManager {
  private readonly selector = new TransportSelector();
  private transports: Map<TransportType, ITransport> = new Map();
  private eventHandlers: TransportEventHandler[] = [];

  /** Register a transport implementation. */
  register(transport: ITransport): void {
    this.transports.set(transport.type, transport);
    this.selector.register(transport);
    // Forward all events from this transport to manager subscribers
    for (const type of Object.values(TransportEventType)) {
      transport.on(type as TransportEventType, (e) => this.forward(e));
    }
  }

  /** Remove a transport. */
  unregister(type: TransportType): void {
    const t = this.transports.get(type);
    if (t) {
      this.selector.unregister(t);
      this.transports.delete(type);
    }
  }

  /** Get a registered transport by type. */
  getTransport(type: TransportType): ITransport | undefined {
    return this.transports.get(type);
  }

  /** Initialize all registered transports. */
  async initializeAll(): Promise<void> {
    await Promise.all(Array.from(this.transports.values()).map(t => t.initialize()));
  }

  /** Start discovery on all transports. */
  async startDiscoveryAll(): Promise<void> {
    await Promise.all(Array.from(this.transports.values()).map(t => t.startDiscovery()));
  }

  /**
   * Send to a peer using the best available transport.
   * Falls back to the next transport if the primary fails.
   */
  async send(peerId: PeerID, data: Buffer, criteria?: SelectionCriteria): Promise<SendResult> {
    const primary = this.selector.selectForPeer(peerId, criteria);
    if (!primary) return { success: false, bytesSent: 0, error: 'no_transport_available' };

    const result = await primary.send(peerId, data);
    if (result.success) return result;

    // Fallback: try other transports
    for (const t of this.selector.getAll()) {
      if (t === primary) continue;
      if (t.isConnected(peerId)) {
        const fallback = await t.send(peerId, data);
        if (fallback.success) return fallback;
      }
    }
    return result;
  }

  /** Broadcast using the best broadcast-capable transport. */
  async broadcast(data: Buffer, criteria?: SelectionCriteria): Promise<number> {
    const t = this.selector.selectForBroadcast(criteria);
    if (!t) return 0;
    return t.broadcast(data);
  }

  /** Get all connected peers across all transports. */
  getConnectedPeers(): Array<{ peerId: PeerID; transportType: TransportType }> {
    const peers: Array<{ peerId: PeerID; transportType: TransportType }> = [];
    for (const t of this.transports.values()) {
      for (const conn of t.getConnections()) {
        peers.push({ peerId: conn.peerId, transportType: t.type });
      }
    }
    return peers;
  }

  /** Subscribe to unified transport events. */
  on(handler: TransportEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /** Unsubscribe. */
  off(handler: TransportEventHandler): void {
    this.eventHandlers = this.eventHandlers.filter(h => h !== handler);
  }

  /** Shut down all transports. */
  async shutdownAll(): Promise<void> {
    await Promise.all(Array.from(this.transports.values()).map(t => t.shutdown()));
    this.transports.clear();
    this.eventHandlers = [];
  }

  /** Get aggregate metrics across all transports. */
  getAggregateMetrics(): { bytesSent: number; bytesReceived: number; packetsSent: number; packetsReceived: number } {
    let bytesSent = 0, bytesReceived = 0, packetsSent = 0, packetsReceived = 0;
    for (const t of this.transports.values()) {
      const m = t.getMetrics();
      bytesSent += m.bytesSent;
      bytesReceived += m.bytesReceived;
      packetsSent += m.packetsSent;
      packetsReceived += m.packetsReceived;
    }
    return { bytesSent, bytesReceived, packetsSent, packetsReceived };
  }

  get transportCount(): number { return this.transports.size; }

  private forward(event: TransportEvent): void {
    for (const h of this.eventHandlers) h(event);
  }
}
