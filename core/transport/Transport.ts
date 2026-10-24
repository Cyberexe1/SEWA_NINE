/**
 * NINE Protocol - Transport Layer Interfaces
 *
 * Abstract transport that sends and receives raw bytes.
 * Knows NOTHING about packets, encryption, or routing.
 */

import type { PeerID, Timestamp, TransportType, TransportStatus, ConnectionState } from '../shared/Types.js';

// --- Connection & Link Quality ---

export interface LinkQuality {
  rssi: number;
  throughput: number;
  latency: number;
  reliability: number;
}

export interface Connection {
  peerId: PeerID;
  transportType: TransportType;
  establishedAt: Timestamp;
  lastActivityAt: Timestamp;
  quality: LinkQuality;
  state: ConnectionState;
}

export interface SendResult {
  success: boolean;
  bytesSent: number;
  error?: string;
}

// --- Events ---

export enum TransportEvent {
  PEER_DISCOVERED = 'peer_discovered',
  PEER_LOST = 'peer_lost',
  CONNECTION_ESTABLISHED = 'connection_established',
  CONNECTION_LOST = 'connection_lost',
  DATA_RECEIVED = 'data_received',
  SEND_FAILED = 'send_failed',
  ADAPTER_ERROR = 'adapter_error',
}

export interface PeerDiscoveredEvent {
  peerId: PeerID;
  transportType: TransportType;
  displayName?: string;
  rssi?: number;
}

export interface DataReceivedEvent {
  peerId: PeerID;
  data: Buffer;
  transportType: TransportType;
  receivedAt: Timestamp;
}

export interface ConnectionEvent {
  peerId: PeerID;
  transportType: TransportType;
  connection?: Connection;
  reason?: string;
}

export type TransportEventData = PeerDiscoveredEvent | DataReceivedEvent | ConnectionEvent;
export type TransportCallback = (event: TransportEventData) => void;

// --- Transport Adapter Interface ---

export interface TransportConfig {
  [key: string]: unknown;
}

export interface ITransportAdapter {
  readonly type: TransportType;
  readonly status: TransportStatus;

  initialize(config: TransportConfig): Promise<void>;
  shutdown(): Promise<void>;

  startDiscovery(): void;
  stopDiscovery(): void;
  makeDiscoverable(durationMs: number): void;

  connect(peerId: PeerID): Promise<Connection>;
  disconnect(peerId: PeerID): Promise<void>;
  getConnections(): Connection[];
  getConnection(peerId: PeerID): Connection | undefined;

  send(peerId: PeerID, data: Buffer): Promise<SendResult>;
  broadcast(data: Buffer): Promise<void>;

  on(event: TransportEvent, callback: TransportCallback): void;
  off(event: TransportEvent, callback: TransportCallback): void;
}

// --- Transport Manager Interface ---

export interface ITransportManager {
  registerAdapter(adapter: ITransportAdapter): void;
  removeAdapter(type: TransportType): void;
  getAdapter(type: TransportType): ITransportAdapter | undefined;

  send(peerId: PeerID, data: Buffer): Promise<SendResult>;
  broadcast(data: Buffer): Promise<void>;

  startDiscovery(): void;
  stopDiscovery(): void;

  getConnectedPeers(): Array<{ peerId: PeerID; transportType: TransportType; connection: Connection }>;
  getConnectionForPeer(peerId: PeerID): Connection | undefined;

  on(event: TransportEvent, callback: TransportCallback): void;
  off(event: TransportEvent, callback: TransportCallback): void;

  shutdown(): Promise<void>;
}
