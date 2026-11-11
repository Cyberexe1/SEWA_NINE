/**
 * NINE Transport — Bluetooth Classic (RFCOMM) Transport
 *
 * Implements the full ITransport interface for Bluetooth Classic RFCOMM.
 * Provides: lifecycle management, device discovery, connection management
 * with policy enforcement (max peers, backoff, blacklisting), framed
 * packet transmission, continuous packet reception, and event emission.
 *
 * All Bluetooth-specific calls are isolated behind injected abstractions
 * (IBluetoothAdapter, IBluetoothSocket, IBluetoothServerSocket) so the
 * entire class is testable without Android hardware.
 *
 * API Status: STABLE (frozen at Phase 9.8)
 */

import { type PeerID, type TransportType, type Timestamp } from '../shared/Types.js';
import {
  type ITransport, type SendResult, type PeerConnection, type TransportConfig,
} from './ITransport.js';
import { type TransportCapabilities } from './TransportCapabilities.js';
import { TransportMetrics, type TransportMetricsSnapshot } from './TransportMetrics.js';
import {
  TransportEventEmitter, TransportEventType, type TransportEventHandler,
} from './TransportEvents.js';
import { TransportStateMachine, TransportState, ConnectionState } from './TransportState.js';
import { PeerIdMapper } from './PeerIdMapper.js';
import { BluetoothLink, type IBluetoothSocket, LinkState } from './BluetoothLink.js';
import { BluetoothAcceptLoop, type IBluetoothServerSocket } from './BluetoothAcceptLoop.js';
import { BluetoothDiscoveryManager } from './BluetoothDiscovery.js';
import { ConnectionPolicy, type ConnectionPolicyConfig } from './ConnectionPolicy.js';

// ─── Bluetooth Capabilities (static descriptor) ────────────────────────

const BLUETOOTH_TYPE = 'bluetooth_classic' as TransportType;

export const BLUETOOTH_CAPABILITIES: TransportCapabilities = {
  type: BLUETOOTH_TYPE,
  rangeMeters: 10,
  maxThroughput: 3_000_000,    // ~3 Mbps practical RFCOMM throughput
  typicalLatencyMs: 50,
  maxConnections: 7,           // Bluetooth Classic piconet limit
  maxPayloadSize: 4096,        // matches MAX_PACKET_SIZE
  powerCost: 2,                // medium
  supportsBroadcast: false,    // no native broadcast; fan-out via iteration
  selectionPriority: 2,        // preferred over simulated, lower than Wi-Fi Direct
};

// ─── Bluetooth Adapter Abstraction (for testability) ────────────────────

/**
 * Minimal abstraction over the platform Bluetooth adapter.
 * On Android this wraps BluetoothAdapter; in tests it's a mock.
 */
export interface IBluetoothAdapter {
  /** Check if Bluetooth hardware is available and enabled. */
  isEnabled(): boolean;

  /** Start classic device discovery scan. Returns true if started. */
  startDiscovery(): boolean;

  /** Cancel an ongoing discovery scan. */
  cancelDiscovery(): void;

  /** Request discoverability for the given duration (ms). */
  requestDiscoverable(durationMs: number): void;

  /** Create an RFCOMM server socket for accepting inbound connections. */
  createServerSocket(): IBluetoothServerSocket;

  /** Create an RFCOMM client socket to connect to a remote peer. */
  createSocket(peerId: PeerID): IBluetoothSocket;
}

// ─── BluetoothTransport ─────────────────────────────────────────────────

export class BluetoothTransport implements ITransport {
  readonly type: TransportType = BLUETOOTH_TYPE;
  readonly capabilities: TransportCapabilities = BLUETOOTH_CAPABILITIES;

  private readonly fsm = new TransportStateMachine();
  private readonly metrics = new TransportMetrics();
  private readonly events = new TransportEventEmitter();
  private readonly connections: Map<string, PeerConnection> = new Map();
  private readonly links: Map<string, BluetoothLink> = new Map();
  private readonly adapter: IBluetoothAdapter;
  private acceptLoop: BluetoothAcceptLoop | null = null;
  private discoveryManager: BluetoothDiscoveryManager | null = null;
  private advertiseTimer: ReturnType<typeof setTimeout> | null = null;
  readonly peerIdMapper: PeerIdMapper;
  readonly connectionPolicy: ConnectionPolicy;
  private readonly connectTimeoutMs: number;
  private readonly discoveryTimeoutMs: number;

  constructor(adapter: IBluetoothAdapter, options?: {
    connectTimeoutMs?: number;
    discoveryTimeoutMs?: number;
    connectionPolicy?: Partial<ConnectionPolicyConfig>;
  }) {
    this.adapter = adapter;
    this.peerIdMapper = new PeerIdMapper();
    this.connectionPolicy = new ConnectionPolicy(options?.connectionPolicy);
    this.connectTimeoutMs = options?.connectTimeoutMs ?? 12000;
    this.discoveryTimeoutMs = options?.discoveryTimeoutMs ?? 12000;
  }

  // ─── ITransport: state ──────────────────────────────────────────

  get state(): TransportState { return this.fsm.state; }

  // ─── ITransport: Lifecycle ──────────────────────────────────────

  async initialize(_config?: TransportConfig): Promise<void> {
    this.fsm.transitionTo(TransportState.INITIALIZING);

    if (!this.adapter.isEnabled()) {
      this.fsm.transitionTo(TransportState.ERROR);
      throw new Error('BLUETOOTH_DISABLED: adapter is not enabled');
    }

    // Start the server accept loop for inbound connections
    const serverSocket = this.adapter.createServerSocket();
    this.acceptLoop = new BluetoothAcceptLoop(serverSocket, (socket) => {
      this.handleAcceptedSocket(socket);
    });
    // Fire and forget — the loop runs until cancel() is called
    void this.acceptLoop.start();

    this.fsm.transitionTo(TransportState.READY);
  }

  async shutdown(): Promise<void> {
    // Cancel the accept loop
    if (this.acceptLoop) {
      this.acceptLoop.cancel();
      this.acceptLoop = null;
    }

    // Cancel discovery
    if (this.discoveryManager) {
      this.discoveryManager.clear();
      this.discoveryManager = null;
    }

    // Cancel advertise timer
    if (this.advertiseTimer) {
      clearTimeout(this.advertiseTimer);
      this.advertiseTimer = null;
    }

    // Close all links and clear connections
    for (const [key, link] of this.links) {
      link.close();
      this.links.delete(key);
    }
    for (const [peerId] of this.connections) {
      this.connections.delete(peerId);
      this.metrics.recordConnectionLost();
      this.events.emit({
        type: TransportEventType.CONNECTION_LOST,
        peerId: peerId as PeerID,
        transportType: this.type,
        reason: 'shutdown',
      });
    }

    this.peerIdMapper.clear();
    this.connectionPolicy.clear();

    if (this.fsm.state !== TransportState.SHUTDOWN) {
      this.fsm.transitionTo(TransportState.SHUTDOWN);
    }
  }

  // ─── ITransport: Discovery & Advertisement ──────────────────────

  async startDiscovery(): Promise<void> {
    this.assertOperational();
    if (this.fsm.state === TransportState.READY) {
      this.fsm.transitionTo(TransportState.DISCOVERING);
    }

    // Initialize discovery manager if needed
    if (!this.discoveryManager) {
      this.discoveryManager = new BluetoothDiscoveryManager({
        onPeerDiscovered: (peer) => {
          this.metrics.recordPeerDiscovered();
          this.events.emit({
            type: TransportEventType.PEER_DISCOVERED,
            peerId: peer.peerId,
            transportType: this.type,
            displayName: peer.displayName,
            rssi: peer.rssi,
          });
        },
        onFinished: () => {
          // Transition back to READY when scan completes/times out
          if (this.fsm.state === TransportState.DISCOVERING) {
            this.fsm.transitionTo(TransportState.READY);
          }
        },
        timeoutMs: this.discoveryTimeoutMs,
      });
    }

    this.discoveryManager.start();

    const started = this.adapter.startDiscovery();
    if (!started) {
      this.discoveryManager.stop();
      if (this.fsm.state === TransportState.DISCOVERING) {
        this.fsm.transitionTo(TransportState.READY);
      }
      throw new Error('DISCOVERY_FAILED: adapter.startDiscovery() returned false');
    }
  }

  async stopDiscovery(): Promise<void> {
    this.adapter.cancelDiscovery();
    if (this.discoveryManager) {
      this.discoveryManager.stop();
    }
    if (this.fsm.state === TransportState.DISCOVERING) {
      this.fsm.transitionTo(TransportState.READY);
    }
  }

  async advertise(durationMs: number): Promise<void> {
    this.assertOperational();
    if (this.fsm.state === TransportState.READY) {
      this.fsm.transitionTo(TransportState.ADVERTISING);
    }

    this.adapter.requestDiscoverable(durationMs);

    // Auto-transition back to READY after the advertise duration expires
    if (this.advertiseTimer) clearTimeout(this.advertiseTimer);
    this.advertiseTimer = setTimeout(() => {
      this.advertiseTimer = null;
      if (this.fsm.state === TransportState.ADVERTISING) {
        this.fsm.transitionTo(TransportState.READY);
      }
    }, durationMs);
  }

  /**
   * Feed a discovered device into the discovery manager.
   * Called by the platform integration layer (Android BroadcastReceiver)
   * or by tests to simulate device discovery.
   */
  reportDeviceFound(peerId: PeerID, displayName?: string, rssi?: number): void {
    if (this.discoveryManager) {
      this.discoveryManager.reportDeviceFound(peerId, displayName, rssi);
    }
  }

  /**
   * Signal that the adapter's discovery scan has finished.
   * Called by the platform layer or tests.
   */
  reportDiscoveryFinished(): void {
    if (this.discoveryManager) {
      this.discoveryManager.reportDiscoveryFinished();
    }
  }

  /** Get all peers discovered during the current/last scan. */
  getDiscoveredPeers(): Array<{ peerId: PeerID; displayName?: string }> {
    if (!this.discoveryManager) return [];
    return this.discoveryManager.getDiscoveredPeers().map(p => ({
      peerId: p.peerId,
      displayName: p.displayName,
    }));
  }

  // ─── ITransport: Connection Management ──────────────────────────

  async connect(peerId: PeerID): Promise<PeerConnection> {
    this.assertOperational();

    const key = peerId.toLowerCase();

    // Reject duplicate connection attempts
    if (this.connections.has(key)) {
      throw new Error(`ALREADY_CONNECTED: peer ${peerId} is already connected`);
    }
    if (this.links.has(key) && this.links.get(key)!.state === LinkState.CONNECTING) {
      throw new Error(`CONNECT_IN_PROGRESS: already connecting to ${peerId}`);
    }

    // Check connection policy
    const decision = this.connectionPolicy.shouldConnect(peerId);
    if (!decision.allowed) {
      throw new Error(`CONNECTION_DENIED: ${decision.reason}`);
    }

    // Create a socket and link
    const socket = this.adapter.createSocket(peerId);
    const link = new BluetoothLink(socket, peerId, true);
    this.links.set(key, link);

    // Attempt connection with timeout
    try {
      await this.withTimeout(link.connect(), this.connectTimeoutMs, `Connect to ${peerId} timed out`);
    } catch (err) {
      this.links.delete(key);
      link.close();
      this.connectionPolicy.recordFailure(peerId);
      this.metrics.recordSendFailure();
      throw new Error(`CONNECTION_FAILED: ${(err as Error).message}`);
    }

    // Connection successful — register with policy
    this.connectionPolicy.recordConnected(peerId);
    const conn: PeerConnection = {
      peerId,
      state: ConnectionState.CONNECTED,
      transportType: this.type,
    };
    this.connections.set(key, conn);
    this.metrics.recordConnectionEstablished();
    this.events.emit({
      type: TransportEventType.CONNECTION_ESTABLISHED,
      peerId,
      transportType: this.type,
    });

    // Start the receive loop (fire-and-forget — runs until link closes)
    this.startLinkReadLoop(link, peerId);

    return conn;
  }

  async disconnect(peerId: PeerID): Promise<void> {
    const key = peerId.toLowerCase();
    const link = this.links.get(key);
    if (link) {
      link.close();
      this.links.delete(key);
    }
    if (this.connections.delete(key)) {
      this.connectionPolicy.recordDisconnected(peerId);
      this.peerIdMapper.removeByPeerId(peerId);
      this.metrics.recordConnectionLost();
      this.events.emit({
        type: TransportEventType.CONNECTION_LOST,
        peerId,
        transportType: this.type,
        reason: 'manual',
      });
    }
  }

  getConnections(): PeerConnection[] {
    return Array.from(this.connections.values());
  }

  getConnection(peerId: PeerID): PeerConnection | undefined {
    return this.connections.get(peerId.toLowerCase());
  }

  isConnected(peerId: PeerID): boolean {
    return this.connections.has(peerId.toLowerCase());
  }

  // ─── ITransport: Data Transfer ──────────────────────────────────

  async send(peerId: PeerID, data: Buffer): Promise<SendResult> {
    if (!this.isConnected(peerId)) {
      this.metrics.recordSendFailure();
      this.events.emit({
        type: TransportEventType.SEND_FAILED,
        peerId,
        transportType: this.type,
        reason: 'not_connected',
      });
      return { success: false, bytesSent: 0, error: 'not_connected' };
    }

    const link = this.links.get(peerId.toLowerCase());
    if (!link || !link.isAlive()) {
      this.metrics.recordSendFailure();
      this.events.emit({
        type: TransportEventType.SEND_FAILED,
        peerId,
        transportType: this.type,
        reason: 'link_not_alive',
      });
      return { success: false, bytesSent: 0, error: 'link_not_alive' };
    }

    try {
      await link.writeFrame(data);
      this.metrics.recordSend(data.length);
      return { success: true, bytesSent: data.length };
    } catch (err) {
      this.metrics.recordSendFailure();
      const reason = (err as Error).message;
      this.events.emit({
        type: TransportEventType.SEND_FAILED,
        peerId,
        transportType: this.type,
        reason,
      });
      return { success: false, bytesSent: 0, error: reason };
    }
  }

  async broadcast(data: Buffer): Promise<number> {
    let count = 0;
    for (const conn of this.connections.values()) {
      const result = await this.send(conn.peerId, data);
      if (result.success) count++;
    }
    return count;
  }

  // ─── ITransport: Events ─────────────────────────────────────────

  on(type: TransportEventType, handler: TransportEventHandler): void {
    this.events.on(type, handler);
  }

  off(type: TransportEventType, handler: TransportEventHandler): void {
    this.events.off(type, handler);
  }

  // ─── ITransport: Metrics ────────────────────────────────────────

  getMetrics(): TransportMetricsSnapshot {
    return this.metrics.snapshot();
  }

  // ─── Internal helpers ───────────────────────────────────────────

  /** Handle an inbound socket accepted by the AcceptLoop. */
  private handleAcceptedSocket(socket: IBluetoothSocket): void {
    const peerId = socket.remoteAddress as unknown as PeerID;
    const key = peerId.toLowerCase();

    // If already connected to this peer, close the duplicate
    if (this.connections.has(key)) {
      socket.close();
      return;
    }

    // Check inbound acceptance policy
    const decision = this.connectionPolicy.shouldAcceptInbound(peerId);
    if (!decision.allowed) {
      socket.close();
      return;
    }

    const link = new BluetoothLink(socket, peerId, false);
    // The socket is already connected (accepted), so mark the link directly
    (link as any)._state = LinkState.CONNECTED;
    this.links.set(key, link);

    this.connectionPolicy.recordConnected(peerId);
    const conn: PeerConnection = {
      peerId,
      state: ConnectionState.CONNECTED,
      transportType: this.type,
    };
    this.connections.set(key, conn);
    this.metrics.recordConnectionEstablished();
    this.events.emit({
      type: TransportEventType.CONNECTION_ESTABLISHED,
      peerId,
      transportType: this.type,
    });

    // Start the receive loop for this inbound link
    this.startLinkReadLoop(link, peerId);
  }

  /** Get the BluetoothLink for a peer (internal use). */
  getLink(peerId: PeerID): BluetoothLink | undefined {
    return this.links.get(peerId.toLowerCase());
  }

  /** Start the read loop for a link. Emits DATA_RECEIVED events or cleans up on error. */
  private startLinkReadLoop(link: BluetoothLink, peerId: PeerID): void {
    void link.startReadLoop(
      (data) => {
        this.metrics.recordReceive(data.length);
        this.events.emit({
          type: TransportEventType.DATA_RECEIVED,
          peerId,
          transportType: this.type,
          data,
          receivedAt: Date.now() as unknown as Timestamp,
        });
      },
      (_err) => {
        // Link read error (socket closed, malformed frame, etc.)
        // Clean up the connection if it's still registered
        const key = peerId.toLowerCase();
        if (this.connections.has(key)) {
          this.links.delete(key);
          this.connections.delete(key);
          this.connectionPolicy.recordDisconnected(peerId);
          this.peerIdMapper.removeByPeerId(peerId);
          this.metrics.recordConnectionLost();
          this.events.emit({
            type: TransportEventType.CONNECTION_LOST,
            peerId,
            transportType: this.type,
            reason: _err.message,
          });
        }
      },
    );
  }

  private assertOperational(): void {
    if (!this.fsm.isOperational()) {
      throw new Error(
        `TRANSPORT_NOT_OPERATIONAL: current state is ${this.fsm.state}`
      );
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      promise
        .then((v) => { clearTimeout(timer); resolve(v); })
        .catch((e) => { clearTimeout(timer); reject(e); });
    });
  }
}
