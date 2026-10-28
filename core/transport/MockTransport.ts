/**
 * NINE Transport — Mock Transport
 *
 * A fully in-memory ITransport implementation for testing the abstraction.
 * Mock transports on a shared "medium" can discover and message each other.
 * No hardware, no simulator dependency.
 */

import { type PeerID, type TransportType, type Timestamp } from '../shared/Types.js';
import { type ITransport, type SendResult, type PeerConnection, type TransportConfig } from './ITransport.js';
import { type TransportCapabilities } from './TransportCapabilities.js';
import { TransportMetrics, type TransportMetricsSnapshot } from './TransportMetrics.js';
import { TransportEventEmitter, TransportEventType, type TransportEventHandler } from './TransportEvents.js';
import { TransportStateMachine, TransportState, ConnectionState } from './TransportState.js';

const MOCK_TYPE = 'simulated' as TransportType;

const MOCK_CAPABILITIES: TransportCapabilities = {
  type: MOCK_TYPE,
  rangeMeters: 100,
  maxThroughput: 1_000_000,
  typicalLatencyMs: 5,
  maxConnections: 16,
  maxPayloadSize: 4096,
  powerCost: 0,
  supportsBroadcast: true,
  selectionPriority: 1,
};

/** Shared in-memory medium connecting mock transports. */
export class MockMedium {
  private nodes: Map<string, MockTransport> = new Map();

  register(peerId: PeerID, transport: MockTransport): void {
    this.nodes.set(peerId.toLowerCase(), transport);
  }

  unregister(peerId: PeerID): void {
    this.nodes.delete(peerId.toLowerCase());
  }

  getPeers(exclude: PeerID): PeerID[] {
    return Array.from(this.nodes.keys())
      .filter(k => k !== exclude.toLowerCase()) as PeerID[];
  }

  deliver(to: PeerID, from: PeerID, data: Buffer): boolean {
    const target = this.nodes.get(to.toLowerCase());
    if (!target) return false;
    target._receive(from, data);
    return true;
  }
}

export class MockTransport implements ITransport {
  readonly type = MOCK_TYPE;
  readonly capabilities = MOCK_CAPABILITIES;

  private readonly selfId: PeerID;
  private readonly medium: MockMedium;
  private readonly fsm = new TransportStateMachine();
  private readonly metrics = new TransportMetrics();
  private readonly events = new TransportEventEmitter();
  private connections: Map<string, PeerConnection> = new Map();
  private clock: () => Timestamp;

  constructor(selfId: PeerID, medium: MockMedium, clock?: () => Timestamp) {
    this.selfId = selfId;
    this.medium = medium;
    this.clock = clock ?? (() => Date.now() as Timestamp);
  }

  get state(): TransportState { return this.fsm.state; }

  async initialize(_config?: TransportConfig): Promise<void> {
    this.fsm.transitionTo(TransportState.INITIALIZING);
    this.medium.register(this.selfId, this);
    this.fsm.transitionTo(TransportState.READY);
  }

  async shutdown(): Promise<void> {
    this.medium.unregister(this.selfId);
    this.connections.clear();
    this.events.clear();
    if (this.fsm.state !== TransportState.SHUTDOWN) {
      this.fsm.transitionTo(TransportState.SHUTDOWN);
    }
  }

  async startDiscovery(): Promise<void> {
    if (this.fsm.state === TransportState.READY) this.fsm.transitionTo(TransportState.DISCOVERING);
    // Discover all peers on the medium
    for (const peerId of this.medium.getPeers(this.selfId)) {
      this.metrics.recordPeerDiscovered();
      this.events.emit({ type: TransportEventType.PEER_DISCOVERED, peerId, transportType: this.type });
    }
  }

  async stopDiscovery(): Promise<void> {
    if (this.fsm.state === TransportState.DISCOVERING) this.fsm.transitionTo(TransportState.READY);
  }

  async advertise(_durationMs: number): Promise<void> {
    if (this.fsm.state === TransportState.READY) this.fsm.transitionTo(TransportState.ADVERTISING);
  }

  async connect(peerId: PeerID): Promise<PeerConnection> {
    const conn: PeerConnection = { peerId, state: ConnectionState.CONNECTED, transportType: this.type };
    this.connections.set(peerId.toLowerCase(), conn);
    this.metrics.recordConnectionEstablished();
    this.events.emit({ type: TransportEventType.CONNECTION_ESTABLISHED, peerId, transportType: this.type });
    return conn;
  }

  async disconnect(peerId: PeerID): Promise<void> {
    if (this.connections.delete(peerId.toLowerCase())) {
      this.metrics.recordConnectionLost();
      this.events.emit({ type: TransportEventType.CONNECTION_LOST, peerId, transportType: this.type, reason: 'manual' });
    }
  }

  getConnections(): PeerConnection[] { return Array.from(this.connections.values()); }
  getConnection(peerId: PeerID): PeerConnection | undefined { return this.connections.get(peerId.toLowerCase()); }
  isConnected(peerId: PeerID): boolean { return this.connections.has(peerId.toLowerCase()); }

  async send(peerId: PeerID, data: Buffer): Promise<SendResult> {
    if (!this.isConnected(peerId)) {
      this.metrics.recordSendFailure();
      this.events.emit({ type: TransportEventType.SEND_FAILED, peerId, transportType: this.type, reason: 'not_connected' });
      return { success: false, bytesSent: 0, error: 'not_connected' };
    }
    const ok = this.medium.deliver(peerId, this.selfId, Buffer.from(data));
    if (!ok) {
      this.metrics.recordSendFailure();
      return { success: false, bytesSent: 0, error: 'peer_unreachable' };
    }
    this.metrics.recordSend(data.length);
    return { success: true, bytesSent: data.length };
  }

  async broadcast(data: Buffer): Promise<number> {
    let count = 0;
    for (const conn of this.connections.values()) {
      const result = await this.send(conn.peerId, data);
      if (result.success) count++;
    }
    return count;
  }

  on(type: TransportEventType, handler: TransportEventHandler): void { this.events.on(type, handler); }
  off(type: TransportEventType, handler: TransportEventHandler): void { this.events.off(type, handler); }
  onAny(handler: TransportEventHandler): void { this.events.onAny(handler); }

  getMetrics(): TransportMetricsSnapshot { return this.metrics.snapshot(); }

  /** Internal: called by the medium when data arrives. */
  _receive(from: PeerID, data: Buffer): void {
    this.metrics.recordReceive(data.length);
    this.events.emit({
      type: TransportEventType.DATA_RECEIVED,
      peerId: from,
      transportType: this.type,
      data,
      receivedAt: this.clock(),
    });
  }
}
