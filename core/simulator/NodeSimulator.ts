/**
 * NINE Simulator — Node Simulator
 *
 * A single virtual node within the mesh simulator.
 * Can send/receive packets via the VirtualTransport.
 * Validates incoming packets using the Packet Engine.
 */

import { type NodeID, type PacketID, NodeRole } from '../shared/Types.js';
import { type Packet } from '../protocol/Packet.js';
import { serialize } from '../protocol/Serializer.js';
import { parse } from '../protocol/Parser.js';
import { validate, verifyChecksum } from '../protocol/Validator.js';
import { createPacket } from '../protocol/PacketFactory.js';
import { MeshNode, NodeLifecycleState } from '../node/MeshNode.js';
import { type VirtualTransport } from './VirtualTransport.js';
import { type VirtualClock } from './VirtualClock.js';
import { type SimulationEventBus, SimEventType } from './SimulationEvents.js';

export interface NodeSimulatorConfig {
  nodeId?: NodeID;
  role: NodeRole;
  displayName: string;
}

export class NodeSimulator {
  readonly node: MeshNode;
  private transport: VirtualTransport;
  private clock: VirtualClock;
  private events: SimulationEventBus;
  private _receivedPackets: Packet[] = [];
  private _running = false;

  constructor(
    config: NodeSimulatorConfig,
    transport: VirtualTransport,
    clock: VirtualClock,
    events: SimulationEventBus,
  ) {
    this.node = MeshNode.create({
      role: config.role,
      displayName: config.displayName,
      nodeId: config.nodeId,
    });
    this.transport = transport;
    this.clock = clock;
    this.events = events;
  }

  get nodeId(): NodeID { return this.node.nodeId; }
  get displayName(): string { return this.node.displayName; }
  get isRunning(): boolean { return this._running; }

  /** Start the node — registers with transport, transitions to ACTIVE. */
  start(): void {
    this.node.transitionTo(NodeLifecycleState.INITIALIZING);
    this.node.transitionTo(NodeLifecycleState.IDLE);
    this.node.transitionTo(NodeLifecycleState.DISCOVERING);
    this.node.transitionTo(NodeLifecycleState.ACTIVE);

    this.transport.registerNode(this.nodeId, (from, data) => this.handleIncoming(from, data));
    this._running = true;

    this.events.emit({
      type: SimEventType.NODE_STARTED,
      timestamp: this.clock.now() as number,
      detail: { eventType: SimEventType.NODE_STARTED, nodeId: this.nodeId },
    });
  }

  /** Stop the node — unregisters from transport. */
  stop(): void {
    if (!this._running) return;
    this.node.transitionTo(NodeLifecycleState.SHUTTING_DOWN);
    this.node.transitionTo(NodeLifecycleState.TERMINATED);
    this.transport.unregisterNode(this.nodeId);
    this._running = false;

    this.events.emit({
      type: SimEventType.NODE_STOPPED,
      timestamp: this.clock.now() as number,
      detail: { eventType: SimEventType.NODE_STOPPED, nodeId: this.nodeId },
    });
  }

  /** Send a raw packet to a specific neighbor. */
  sendTo(to: NodeID, packet: Packet): boolean {
    if (!this._running) return false;
    const bytes = serialize(packet);
    return this.transport.send(this.nodeId, to, bytes);
  }

  /** Broadcast a packet to all neighbors. */
  broadcastPacket(packet: Packet): number {
    if (!this._running) return 0;
    const bytes = serialize(packet);
    return this.transport.broadcast(this.nodeId, bytes);
  }

  /** Create and broadcast a BROADCAST-type packet with a text message. */
  broadcastMessage(message: string, sequenceNumber: number): number {
    const payload = Buffer.alloc(3 + Buffer.byteLength(message, 'utf-8'));
    payload.writeUInt8(0x00, 0); // contentType = TEXT
    payload.writeUInt16BE(Buffer.byteLength(message, 'utf-8'), 1);
    payload.write(message, 3, 'utf-8');

    const packet = createPacket({
      packetType: 0x04, // BROADCAST
      senderId: this.nodeId,
      destinationId: '00000000-0000-0000-0000-000000000000' as NodeID,
      sequenceNumber,
      ttl: 10,
      payload,
      timestamp: this.clock.now(),
    });

    return this.broadcastPacket(packet);
  }

  /** Get all received packets. */
  getReceivedPackets(): readonly Packet[] {
    return this._receivedPackets;
  }

  /** Clear received packet buffer. */
  clearReceived(): void {
    this._receivedPackets = [];
  }

  /** Number of received packets. */
  get receivedCount(): number {
    return this._receivedPackets.length;
  }

  private handleIncoming(_from: NodeID, data: Buffer): void {
    // Verify checksum
    if (!verifyChecksum(data)) {
      this.events.emit({
        type: SimEventType.PACKET_DROPPED,
        timestamp: this.clock.now() as number,
        detail: {
          eventType: SimEventType.PACKET_DROPPED,
          at: this.nodeId,
          packetId: '00000000-0000-0000-0000-000000000000' as PacketID,
          reason: 'checksum_invalid',
        },
      });
      return;
    }

    // Parse
    let packet: Packet;
    try {
      packet = parse(data);
    } catch {
      this.events.emit({
        type: SimEventType.PACKET_DROPPED,
        timestamp: this.clock.now() as number,
        detail: {
          eventType: SimEventType.PACKET_DROPPED,
          at: this.nodeId,
          packetId: '00000000-0000-0000-0000-000000000000' as PacketID,
          reason: 'parse_failed',
        },
      });
      return;
    }

    // Validate
    const result = validate(packet);
    if (!result.valid) {
      this.events.emit({
        type: SimEventType.PACKET_DROPPED,
        timestamp: this.clock.now() as number,
        detail: {
          eventType: SimEventType.PACKET_DROPPED,
          at: this.nodeId,
          packetId: packet.header.packetId,
          reason: `validation_failed: ${result.errors[0]?.code}`,
        },
      });
      return;
    }

    // Deliver
    this._receivedPackets.push(packet);
  }
}
