/**
 * NINE Transport — Transport Events
 *
 * Typed event system emitted by transport implementations.
 */

import { type PeerID, type TransportType, type Timestamp } from '../shared/Types.js';

export enum TransportEventType {
  PEER_DISCOVERED = 'peer_discovered',
  PEER_LOST = 'peer_lost',
  CONNECTION_ESTABLISHED = 'connection_established',
  CONNECTION_LOST = 'connection_lost',
  DATA_RECEIVED = 'data_received',
  SEND_FAILED = 'send_failed',
  STATE_CHANGED = 'state_changed',
  ERROR = 'error',
}

export interface PeerDiscoveredEvent {
  type: TransportEventType.PEER_DISCOVERED;
  peerId: PeerID;
  transportType: TransportType;
  displayName?: string;
  rssi?: number;
}

export interface PeerLostEvent {
  type: TransportEventType.PEER_LOST;
  peerId: PeerID;
  transportType: TransportType;
}

export interface ConnectionEstablishedEvent {
  type: TransportEventType.CONNECTION_ESTABLISHED;
  peerId: PeerID;
  transportType: TransportType;
}

export interface ConnectionLostEvent {
  type: TransportEventType.CONNECTION_LOST;
  peerId: PeerID;
  transportType: TransportType;
  reason: string;
}

export interface DataReceivedEvent {
  type: TransportEventType.DATA_RECEIVED;
  peerId: PeerID;
  transportType: TransportType;
  data: Buffer;
  receivedAt: Timestamp;
}

export interface SendFailedEvent {
  type: TransportEventType.SEND_FAILED;
  peerId: PeerID;
  transportType: TransportType;
  reason: string;
}

export interface ErrorEvent {
  type: TransportEventType.ERROR;
  transportType: TransportType;
  message: string;
}

export type TransportEvent =
  | PeerDiscoveredEvent
  | PeerLostEvent
  | ConnectionEstablishedEvent
  | ConnectionLostEvent
  | DataReceivedEvent
  | SendFailedEvent
  | ErrorEvent;

export type TransportEventHandler = (event: TransportEvent) => void;

/** Simple typed event emitter for transports. */
export class TransportEventEmitter {
  private handlers: Map<TransportEventType, TransportEventHandler[]> = new Map();
  private anyHandlers: TransportEventHandler[] = [];

  on(type: TransportEventType, handler: TransportEventHandler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  onAny(handler: TransportEventHandler): void {
    this.anyHandlers.push(handler);
  }

  off(type: TransportEventType, handler: TransportEventHandler): void {
    const list = this.handlers.get(type);
    if (list) this.handlers.set(type, list.filter(h => h !== handler));
  }

  emit(event: TransportEvent): void {
    const list = this.handlers.get(event.type);
    if (list) for (const h of list) h(event);
    for (const h of this.anyHandlers) h(event);
  }

  clear(): void {
    this.handlers.clear();
    this.anyHandlers = [];
  }
}
