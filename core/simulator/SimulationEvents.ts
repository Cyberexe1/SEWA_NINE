/**
 * NINE Simulator — Simulation Events
 *
 * Typed event system for observing simulator behavior.
 * Provides a packet trace log and node lifecycle events.
 */

import { type NodeID, type PacketID } from '../shared/Types.js';

export enum SimEventType {
  PACKET_SENT = 'packet_sent',
  PACKET_RECEIVED = 'packet_received',
  PACKET_DROPPED = 'packet_dropped',
  PACKET_LOST = 'packet_lost',
  NODE_STARTED = 'node_started',
  NODE_STOPPED = 'node_stopped',
  LINK_CREATED = 'link_created',
  LINK_DESTROYED = 'link_destroyed',
}

export interface SimEvent {
  readonly type: SimEventType;
  readonly timestamp: number;
  readonly detail: SimEventDetail;
}

export type SimEventDetail =
  | PacketSentDetail
  | PacketReceivedDetail
  | PacketDroppedDetail
  | PacketLostDetail
  | NodeLifecycleDetail
  | LinkDetail;

export interface PacketSentDetail {
  eventType: SimEventType.PACKET_SENT;
  from: NodeID;
  to: NodeID;
  packetId: PacketID;
  packetType: number;
  size: number;
}

export interface PacketReceivedDetail {
  eventType: SimEventType.PACKET_RECEIVED;
  at: NodeID;
  from: NodeID;
  packetId: PacketID;
  packetType: number;
  size: number;
}

export interface PacketDroppedDetail {
  eventType: SimEventType.PACKET_DROPPED;
  at: NodeID;
  packetId: PacketID;
  reason: string;
}

export interface PacketLostDetail {
  eventType: SimEventType.PACKET_LOST;
  from: NodeID;
  to: NodeID;
  packetId: PacketID;
  reason: string;
}

export interface NodeLifecycleDetail {
  eventType: SimEventType.NODE_STARTED | SimEventType.NODE_STOPPED;
  nodeId: NodeID;
}

export interface LinkDetail {
  eventType: SimEventType.LINK_CREATED | SimEventType.LINK_DESTROYED;
  nodeA: NodeID;
  nodeB: NodeID;
}

export type SimEventHandler = (event: SimEvent) => void;

export class SimulationEventBus {
  private handlers: SimEventHandler[] = [];
  private _log: SimEvent[] = [];
  private _recording = true;

  /** Subscribe to all events. */
  on(handler: SimEventHandler): void {
    this.handlers.push(handler);
  }

  /** Unsubscribe. */
  off(handler: SimEventHandler): void {
    this.handlers = this.handlers.filter(h => h !== handler);
  }

  /** Emit an event. Appends to log and notifies handlers. */
  emit(event: SimEvent): void {
    if (this._recording) this._log.push(event);
    for (const h of this.handlers) h(event);
  }

  /** Get the full event log. */
  getLog(): readonly SimEvent[] {
    return this._log;
  }

  /** Get events filtered by type. */
  getByType(type: SimEventType): SimEvent[] {
    return this._log.filter(e => e.type === type);
  }

  /** Get packet trace (sent + received + dropped + lost). */
  getPacketTrace(): SimEvent[] {
    return this._log.filter(e =>
      e.type === SimEventType.PACKET_SENT ||
      e.type === SimEventType.PACKET_RECEIVED ||
      e.type === SimEventType.PACKET_DROPPED ||
      e.type === SimEventType.PACKET_LOST
    );
  }

  /** Clear the log. */
  clearLog(): void {
    this._log = [];
  }

  /** Enable/disable recording. */
  setRecording(enabled: boolean): void {
    this._recording = enabled;
  }

  /** Get total event count. */
  size(): number {
    return this._log.length;
  }
}
