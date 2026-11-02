/**
 * NINE Core — Integration Layer (Composition Root)
 *
 * The ONLY public entry point into the NINE protocol.
 * Applications (Android, Desktop, CLI, Web) interact solely through this API.
 * They never touch PacketEngine, RoutingEngine, SecurityEngine, or TransportManager.
 */

import { type NodeID, type Timestamp, NodeRole, PacketType, ContentType } from './shared/Types.js';
import { type Packet } from './protocol/Packet.js';
import { createPacket } from './protocol/PacketFactory.js';
import { serialize } from './protocol/Serializer.js';
import { parse } from './protocol/Parser.js';
import { MeshNode, NodeLifecycleState } from './node/MeshNode.js';
import { NeighborTable } from './node/NeighborTable.js';
import { NodeRegistry } from './node/NodeRegistry.js';
import { RoutingEngine } from './routing/RoutingEngine.js';
import { KeyManager } from './security/KeyManager.js';
import { DualPathManager } from './messaging/DualPathManager.js';
import { PathSelector } from './messaging/PathSelector.js';
import { TransportManager } from './transport/TransportManager.js';
import { type ITransport } from './transport/ITransport.js';
import { TransportEventType, type TransportEvent } from './transport/TransportEvents.js';
import { type NineConfiguration } from './NineConfiguration.js';
import { NineEventBus, NineEventType, type NineEventHandler } from './NineEvents.js';
import { NineMetricsAggregator, type NineMetrics } from './NineMetrics.js';

export interface NodeInfo {
  nodeId: NodeID;
  displayName: string;
  role: NodeRole;
  lifecycleState: NodeLifecycleState;
}

export interface TopologyView {
  self: NodeID;
  neighbors: NodeID[];
  knownNodes: NodeID[];
  routes: Array<{ destination: NodeID; nextHop: NodeID; hopCount: number }>;
}

export interface NineCoreDependencies {
  config: NineConfiguration;
  node: MeshNode;
  transportManager: TransportManager;
  transport: ITransport;
  keyManager: KeyManager;
  clock: () => Timestamp;
}

export class NineCore {
  private readonly config: NineConfiguration;
  private readonly node: MeshNode;
  private readonly transportManager: TransportManager;
  private readonly transport: ITransport;
  private readonly keyManager: KeyManager;
  private readonly clock: () => Timestamp;

  private readonly neighborTable = new NeighborTable();
  private readonly registry = new NodeRegistry();
  private readonly events = new NineEventBus();
  private readonly routing: RoutingEngine;
  private readonly dualPath: DualPathManager;
  private readonly metrics: NineMetricsAggregator;

  private _sequenceCounter = 0;
  private _initialized = false;

  constructor(deps: NineCoreDependencies) {
    this.config = deps.config;
    this.node = deps.node;
    this.transportManager = deps.transportManager;
    this.transport = deps.transport;
    this.keyManager = deps.keyManager;
    this.clock = deps.clock;

    // Wire the routing engine to the transport (sync bridge, best-effort).
    // onRouteAdded lets the DualPathManager transmit queued secure sends as
    // soon as (disjoint) routes are discovered.
    this.routing = new RoutingEngine({
      selfId: this.node.nodeId,
      send: (to, data) => { void this.transport.send(to as unknown as any, data); return true; },
      broadcast: (data) => { void this.transport.broadcast(data); return this.neighborTable.size(); },
      deliver: (packet) => this.handleDelivered(packet),
      getNeighbors: () => this.getNeighborIds(),
      clock: this.clock,
      onRouteAdded: (dest) => { this.dualPath?.retryPending(dest); },
    });

    // Path selector requests a node-disjoint route pair from the routing engine.
    const pathSelector = new PathSelector((_source, destination) => {
      // Direct neighbour → single link; both packets travel it directly.
      const neighbors = this.getNeighborIds();
      if (neighbors.some(n => n.toLowerCase() === destination.toLowerCase())) {
        const p = [this.node.nodeId, destination];
        return { pathA: p, pathB: p, disjoint: false, overlapScore: 0 };
      }
      const pair = this.routing.getDisjointRoutes(destination);
      if (!pair) return null;
      return {
        pathA: [...pair.primary.fullPath],
        pathB: [...pair.secondary.fullPath],
        disjoint: pair.disjoint,
        overlapScore: pair.overlapScore,
      };
    });

    this.dualPath = new DualPathManager({
      selfId: this.node.nodeId,
      keyManager: this.keyManager,
      pathSelector,
      // Send each half to the FIRST HOP of its assigned path (source routing
      // of the split). Relays forward toward the Admin using their route cache.
      routedSend: (bytes, path) => {
        if (path.length >= 2) {
          void this.transport.send(path[1] as unknown as any, bytes);
        } else if (path.length === 1) {
          void this.transport.send(path[0] as unknown as any, bytes);
        } else {
          const pkt = parse(bytes);
          this.routing.sendPacket(pkt, bytes);
        }
      },
      clock: this.clock,
      reassemblyTimeoutMs: this.config.reassemblyTimeoutMs,
    });

    this.metrics = new NineMetricsAggregator({
      getRoutingMetrics: () => this.routing.getMetrics(),
      getDualPathMetrics: () => this.dualPath.getMetrics(),
      getTransportMetrics: () => this.transportManager.getAggregateMetrics(),
      getNodeMetrics: () => ({
        neighborCount: this.getNeighborIds().length,
        knownNodeCount: this.registry.size(),
        routeCount: this.routing.routeCache.size(),
      }),
    });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────

  /** Initialize the protocol stack. */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    // Admin generates its key pair
    if (this.config.role === NodeRole.ADMIN) {
      this.keyManager.generateAdminKeys();
    }

    // Subscribe to transport events → feed into routing / node management
    this.transportManager.on((e) => this.handleTransportEvent(e));

    // Initialize transport
    await this.transportManager.initializeAll();

    // Advance node lifecycle
    this.node.transitionTo(NodeLifecycleState.INITIALIZING);
    this.node.transitionTo(NodeLifecycleState.IDLE);

    this._initialized = true;
  }

  /** Shut down the protocol stack and release resources. */
  async shutdown(): Promise<void> {
    if (!this._initialized) return;
    if (this.node.canTransitionTo(NodeLifecycleState.SHUTTING_DOWN)) {
      this.node.transitionTo(NodeLifecycleState.SHUTTING_DOWN);
      this.node.transitionTo(NodeLifecycleState.TERMINATED);
    }
    await this.transportManager.shutdownAll();
    this.keyManager.destroy();
    this.events.clear();
    this._initialized = false;
  }

  // ─── Discovery & Connection ─────────────────────────────────────

  /** Discover nearby peers. */
  async discoverPeers(): Promise<void> {
    if (this.node.canTransitionTo(NodeLifecycleState.DISCOVERING)) {
      this.node.transitionTo(NodeLifecycleState.DISCOVERING);
    }
    await this.transportManager.startDiscoveryAll();
  }

  /** Connect to a specific peer. */
  async connect(peerId: NodeID): Promise<void> {
    await this.transport.connect(peerId as unknown as any);
  }

  /** Disconnect from a peer. */
  async disconnect(peerId: NodeID): Promise<void> {
    await this.transport.disconnect(peerId as unknown as any);
    this.neighborTable.remove(peerId);
    this.routing.notifyLinkBroken(peerId);
  }

  // ─── Messaging ──────────────────────────────────────────────────

  /** Send a broadcast message to all reachable nodes. */
  sendBroadcast(message: string, isEmergency: boolean = false): void {
    this.assertActive();
    const msgBytes = Buffer.from(message, 'utf-8');
    const payload = Buffer.alloc(3 + msgBytes.length);
    payload.writeUInt8(isEmergency ? ContentType.EMERGENCY_ALERT : ContentType.TEXT, 0);
    payload.writeUInt16BE(msgBytes.length, 1);
    msgBytes.copy(payload, 3);

    const packet = createPacket({
      packetType: PacketType.BROADCAST,
      senderId: this.node.nodeId,
      destinationId: '00000000-0000-0000-0000-000000000000' as NodeID,
      sequenceNumber: this.nextSeq(),
      ttl: this.config.broadcastTTL,
      payload,
      timestamp: this.clock(),
    });
    this.routing.sendPacket(packet, serialize(packet));
  }

  /** Send an encrypted message to the Admin using dual-path delivery. */
  sendSecureMessage(message: string, adminId: NodeID): { sessionId: string; dualPathAchieved: boolean } {
    this.assertActive();
    if (!this.keyManager.hasAdminPublicKey()) {
      throw new Error('ADMIN_KEY_NOT_AVAILABLE: cannot send secure message');
    }
    const result = this.dualPath.sendSecureMessage(message, adminId);
    // If no route yet, trigger discovery; DualPathManager transmits the split
    // via retryPending() once (disjoint) routes are installed.
    if (result.pending) {
      this.routing.initiateDiscovery(adminId);
    }
    return { sessionId: result.sessionId, dualPathAchieved: result.dualPathAchieved };
  }

  /** Proactively discover route(s) to a destination (warms the route cache). */
  discoverRoute(destinationId: NodeID): void {
    this.assertActive();
    this.routing.initiateDiscovery(destinationId);
  }

  /** Feed raw incoming bytes (used when a transport delivers data). */
  receive(from: NodeID, data: Buffer): void {
    this.routing.handleIncoming(from, data);
  }

  // ─── Queries ────────────────────────────────────────────────────

  /** Get mesh topology view. */
  getTopology(): TopologyView {
    return {
      self: this.node.nodeId,
      neighbors: this.getNeighborIds(),
      knownNodes: this.registry.getAll().map(n => n.nodeId),
      routes: this.routing.routeCache.getAll().map(r => ({
        destination: r.destinationId,
        nextHop: r.nextHopId,
        hopCount: r.hopCount,
      })),
    };
  }

  /** Get direct neighbors. */
  getNeighbors(): NodeID[] { return this.getNeighborIds(); }

  /** Get current routes. */
  getRoutes(): Array<{ destination: NodeID; nextHop: NodeID; hopCount: number }> {
    return this.routing.routeCache.getAll().map(r => ({
      destination: r.destinationId, nextHop: r.nextHopId, hopCount: r.hopCount,
    }));
  }

  /** Get unified metrics from all subsystems. */
  getMetrics(): NineMetrics { return this.metrics.snapshot(); }

  /** Get this node's info. */
  getNodeInfo(): NodeInfo {
    return {
      nodeId: this.node.nodeId,
      displayName: this.node.displayName,
      role: this.node.role,
      lifecycleState: this.node.lifecycleState,
    };
  }

  /** Get the Admin's public key (for distribution). Admin only. */
  getAdminPublicKey(): Buffer | null { return this.keyManager.getAdminPublicKey(); }

  /** Store the Admin's public key (received via discovery). */
  setAdminPublicKey(key: Buffer): void { this.keyManager.setAdminPublicKey(key); }

  // ─── Event Subscriptions ────────────────────────────────────────

  onBroadcast(handler: NineEventHandler): void { this.events.on(NineEventType.BROADCAST_RECEIVED, handler); }
  onSecureMessage(handler: NineEventHandler): void { this.events.on(NineEventType.SECURE_MESSAGE_RECEIVED, handler); }
  onNodeJoined(handler: NineEventHandler): void { this.events.on(NineEventType.NODE_JOINED, handler); }
  onNodeLeft(handler: NineEventHandler): void { this.events.on(NineEventType.NODE_LEFT, handler); }
  onTransportChanged(handler: NineEventHandler): void { this.events.on(NineEventType.TRANSPORT_CHANGED, handler); }

  /** Periodic maintenance tick (evict stale state). */
  tick(): void {
    this.routing.tick();
    this.dualPath.tick();
    this.keyManager.tick(this.clock());
  }

  // ─── Internal Handlers ──────────────────────────────────────────

  /** Called by RoutingEngine when a packet is delivered to this node. */
  private handleDelivered(packet: Packet): void {
    switch (packet.header.packetType) {
      case PacketType.BROADCAST:
        this.deliverBroadcast(packet);
        break;
      case PacketType.ENCRYPTED_MESSAGE: {
        const plaintext = this.dualPath.handleSecureData(packet);
        if (plaintext !== null) this.deliverSecureMessage(packet, plaintext);
        break;
      }
      case PacketType.KEY_PACKET: {
        const plaintext = this.dualPath.handleSecureKey(packet);
        if (plaintext !== null) this.deliverSecureMessage(packet, plaintext);
        break;
      }
      default:
        break;
    }
  }

  private deliverBroadcast(packet: Packet): void {
    const contentType = packet.payload.readUInt8(0);
    const msgLen = packet.payload.readUInt16BE(1);
    const message = packet.payload.subarray(3, 3 + msgLen).toString('utf-8');
    this.events.emit({
      type: NineEventType.BROADCAST_RECEIVED,
      senderId: packet.header.senderId,
      message,
      hopCount: packet.header.hopCount,
      timestamp: packet.header.timestamp,
      isEmergency: contentType === ContentType.EMERGENCY_ALERT,
    });
  }

  private deliverSecureMessage(packet: Packet, plaintext: string): void {
    this.events.emit({
      type: NineEventType.SECURE_MESSAGE_RECEIVED,
      senderId: packet.header.senderId,
      plaintext,
      sessionId: '',
      timestamp: packet.header.timestamp,
    });
  }

  /** Translate low-level transport events into high-level NINE events. */
  private handleTransportEvent(e: TransportEvent): void {
    switch (e.type) {
      case TransportEventType.DATA_RECEIVED:
        this.routing.handleIncoming(e.peerId as unknown as NodeID, e.data);
        break;
      case TransportEventType.PEER_DISCOVERED:
        this.registry.upsert({
          nodeId: e.peerId as unknown as NodeID,
          role: NodeRole.USER,
          displayName: e.displayName ?? '',
          lastSeen: this.clock(),
          reachable: true,
          hopDistance: 1,
        });
        this.events.emit({ type: NineEventType.NODE_JOINED, nodeId: e.peerId as unknown as NodeID, displayName: e.displayName });
        break;
      case TransportEventType.CONNECTION_LOST:
      case TransportEventType.PEER_LOST:
        this.events.emit({ type: NineEventType.NODE_LEFT, nodeId: e.peerId as unknown as NodeID });
        break;
      default:
        break;
    }
  }

  private getNeighborIds(): NodeID[] {
    return this.transport.getConnections().map(c => c.peerId as unknown as NodeID);
  }

  private nextSeq(): number {
    this._sequenceCounter = (this._sequenceCounter + 1) % 0xffffffff;
    return this._sequenceCounter;
  }

  private assertActive(): void {
    if (!this._initialized) throw new Error('NODE_NOT_INITIALIZED');
  }
}
