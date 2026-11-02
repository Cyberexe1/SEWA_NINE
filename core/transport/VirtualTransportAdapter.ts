/**
 * NINE Transport — Virtual Transport Adapter
 *
 * Adapts the frozen simulator VirtualTransport to the ITransport interface.
 * This proves the abstraction works with the existing simulator WITHOUT
 * modifying the frozen simulator code.
 */

import { type PeerID, type NodeID, type TransportType, type Timestamp } from '../shared/Types.js';
import { type ITransport, type SendResult, type PeerConnection, type TransportConfig } from './ITransport.js';
import { VIRTUAL_CAPABILITIES, type TransportCapabilities } from './TransportCapabilities.js';
import { TransportMetrics, type TransportMetricsSnapshot } from './TransportMetrics.js';
import { TransportEventEmitter, TransportEventType, type TransportEventHandler } from './TransportEvents.js';
import { TransportStateMachine, TransportState, ConnectionState } from './TransportState.js';
import { type VirtualTransport } from '../simulator/VirtualTransport.js';

export class VirtualTransportAdapter implements ITransport {
  readonly type = 'simulated' as TransportType;
  readonly capabilities: TransportCapabilities = VIRTUAL_CAPABILITIES;

  private readonly selfId: NodeID;
  private readonly vt: VirtualTransport;
  private readonly fsm = new TransportStateMachine();
  private readonly metrics = new TransportMetrics();
  private readonly events = new TransportEventEmitter();
  private readonly clock: () => Timestamp;

  constructor(selfId: NodeID, virtualTransport: VirtualTransport, clock: () => Timestamp) {
    this.selfId = selfId;
    this.vt = virtualTransport;
    this.clock = clock;
  }

  get state(): TransportState { return this.fsm.state; }

  async initialize(_config?: TransportConfig): Promise<void> {
    this.fsm.transitionTo(TransportState.INITIALIZING);
    // Register with the underlying virtual transport
    this.vt.registerNode(this.selfId, (from, data) => {
      this.metrics.recordReceive(data.length);
      this.events.emit({
        type: TransportEventType.DATA_RECEIVED,
        peerId: from as unknown as PeerID,
        transportType: this.type,
        data,
        receivedAt: this.clock(),
      });
    });
    this.fsm.transitionTo(TransportState.READY);
  }

  async shutdown(): Promise<void> {
    this.vt.unregisterNode(this.selfId);
    this.events.clear();
    if (this.fsm.state !== TransportState.SHUTDOWN) {
      this.fsm.transitionTo(TransportState.SHUTDOWN);
    }
  }

  async startDiscovery(): Promise<void> {
    if (this.fsm.state === TransportState.READY) this.fsm.transitionTo(TransportState.DISCOVERING);
    for (const peerId of this.vt.getNeighbors(this.selfId)) {
      this.metrics.recordPeerDiscovered();
      this.events.emit({ type: TransportEventType.PEER_DISCOVERED, peerId: peerId as unknown as PeerID, transportType: this.type });
    }
  }

  async stopDiscovery(): Promise<void> {
    if (this.fsm.state === TransportState.DISCOVERING) this.fsm.transitionTo(TransportState.READY);
  }

  async advertise(_durationMs: number): Promise<void> {
    if (this.fsm.state === TransportState.READY) this.fsm.transitionTo(TransportState.ADVERTISING);
  }

  async connect(peerId: PeerID): Promise<PeerConnection> {
    // Virtual transport uses links, not explicit connections; treat linked = connected
    this.metrics.recordConnectionEstablished();
    this.events.emit({ type: TransportEventType.CONNECTION_ESTABLISHED, peerId, transportType: this.type });
    return { peerId, state: ConnectionState.CONNECTED, transportType: this.type };
  }

  async disconnect(peerId: PeerID): Promise<void> {
    this.metrics.recordConnectionLost();
    this.events.emit({ type: TransportEventType.CONNECTION_LOST, peerId, transportType: this.type, reason: 'manual' });
  }

  getConnections(): PeerConnection[] {
    return this.vt.getNeighbors(this.selfId).map(n => ({
      peerId: n as unknown as PeerID,
      state: ConnectionState.CONNECTED,
      transportType: this.type,
    }));
  }

  getConnection(peerId: PeerID): PeerConnection | undefined {
    return this.getConnections().find(c => c.peerId.toLowerCase() === peerId.toLowerCase());
  }

  isConnected(peerId: PeerID): boolean {
    return this.vt.hasLink(this.selfId, peerId as unknown as NodeID);
  }

  async send(peerId: PeerID, data: Buffer): Promise<SendResult> {
    const ok = this.vt.send(this.selfId, peerId as unknown as NodeID, data);
    if (!ok) {
      this.metrics.recordSendFailure();
      this.events.emit({ type: TransportEventType.SEND_FAILED, peerId, transportType: this.type, reason: 'no_link_or_loss' });
      return { success: false, bytesSent: 0, error: 'no_link_or_loss' };
    }
    this.metrics.recordSend(data.length);
    return { success: true, bytesSent: data.length };
  }

  async broadcast(data: Buffer): Promise<number> {
    const sent = this.vt.broadcast(this.selfId, data);
    this.metrics.recordSend(data.length);
    return sent;
  }

  on(type: TransportEventType, handler: TransportEventHandler): void { this.events.on(type, handler); }
  off(type: TransportEventType, handler: TransportEventHandler): void { this.events.off(type, handler); }

  getMetrics(): TransportMetricsSnapshot { return this.metrics.snapshot(); }
}
