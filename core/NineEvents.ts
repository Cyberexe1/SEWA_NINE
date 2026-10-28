/**
 * NINE Core — High-Level Events
 *
 * Applications subscribe ONLY to these events, never to internal
 * subsystem events (RoutingEngine, TransportManager, etc.).
 */

import { type NodeID, type Timestamp, type TransportType } from './shared/Types.js';

export enum NineEventType {
  BROADCAST_RECEIVED = 'broadcast_received',
  SECURE_MESSAGE_RECEIVED = 'secure_message_received',
  NODE_JOINED = 'node_joined',
  NODE_LEFT = 'node_left',
  TRANSPORT_CHANGED = 'transport_changed',
  ERROR = 'error',
}

export interface BroadcastReceivedEvent {
  type: NineEventType.BROADCAST_RECEIVED;
  senderId: NodeID;
  message: string;
  hopCount: number;
  timestamp: Timestamp;
  isEmergency: boolean;
}

export interface SecureMessageReceivedEvent {
  type: NineEventType.SECURE_MESSAGE_RECEIVED;
  senderId: NodeID;
  plaintext: string;
  sessionId: string;
  timestamp: Timestamp;
}

export interface NodeJoinedEvent {
  type: NineEventType.NODE_JOINED;
  nodeId: NodeID;
  displayName?: string;
}

export interface NodeLeftEvent {
  type: NineEventType.NODE_LEFT;
  nodeId: NodeID;
}

export interface TransportChangedEvent {
  type: NineEventType.TRANSPORT_CHANGED;
  transportType: TransportType;
  status: string;
}

export interface NineErrorEvent {
  type: NineEventType.ERROR;
  code: string;
  message: string;
}

export type NineEvent =
  | BroadcastReceivedEvent
  | SecureMessageReceivedEvent
  | NodeJoinedEvent
  | NodeLeftEvent
  | TransportChangedEvent
  | NineErrorEvent;

export type NineEventHandler<T extends NineEvent = NineEvent> = (event: T) => void;

/** Typed high-level event bus. */
export class NineEventBus {
  private handlers: Map<NineEventType, NineEventHandler[]> = new Map();

  on(type: NineEventType, handler: NineEventHandler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  off(type: NineEventType, handler: NineEventHandler): void {
    const list = this.handlers.get(type);
    if (list) this.handlers.set(type, list.filter(h => h !== handler));
  }

  emit(event: NineEvent): void {
    const list = this.handlers.get(event.type);
    if (list) for (const h of list) h(event);
  }

  clear(): void { this.handlers.clear(); }
}
