/**
 * NINE Transport — ITransport Interface
 *
 * The universal contract that ALL transports must implement:
 * VirtualTransport (testing), Wi-Fi Direct, Bluetooth, LoRa (future).
 *
 * The protocol layer depends only on this interface — never on a
 * concrete transport. New transports plug in without protocol changes.
 */

import { type PeerID, type TransportType } from '../shared/Types.js';
import { type TransportCapabilities } from './TransportCapabilities.js';
import { type TransportMetricsSnapshot } from './TransportMetrics.js';
import { type TransportEventType, type TransportEventHandler } from './TransportEvents.js';
import { type TransportState, type ConnectionState } from './TransportState.js';

export interface SendResult {
  readonly success: boolean;
  readonly bytesSent: number;
  readonly error?: string;
}

export interface PeerConnection {
  readonly peerId: PeerID;
  readonly state: ConnectionState;
  readonly transportType: TransportType;
}

export interface TransportConfig {
  readonly [key: string]: unknown;
}

/**
 * The universal transport interface.
 * All methods that touch hardware are async (Promise-based) because
 * real transports (Bluetooth, Wi-Fi Direct) are inherently asynchronous.
 */
export interface ITransport {
  /** The transport type identifier. */
  readonly type: TransportType;

  /** Static capability descriptor. */
  readonly capabilities: TransportCapabilities;

  /** Current lifecycle state. */
  readonly state: TransportState;

  // --- Lifecycle ---

  /** Initialize the transport (allocate resources, prepare hardware). */
  initialize(config?: TransportConfig): Promise<void>;

  /** Shut down and release all resources. */
  shutdown(): Promise<void>;

  // --- Discovery & Advertisement ---

  /** Begin scanning for peers. */
  startDiscovery(): Promise<void>;

  /** Stop scanning. */
  stopDiscovery(): Promise<void>;

  /** Make this node discoverable to others for a duration. */
  advertise(durationMs: number): Promise<void>;

  // --- Connection Management ---

  /** Establish a connection to a peer. */
  connect(peerId: PeerID): Promise<PeerConnection>;

  /** Disconnect from a peer. */
  disconnect(peerId: PeerID): Promise<void>;

  /** Get all active connections. */
  getConnections(): PeerConnection[];

  /** Get connection to a specific peer. */
  getConnection(peerId: PeerID): PeerConnection | undefined;

  /** Check if connected to a peer. */
  isConnected(peerId: PeerID): boolean;

  // --- Data Transfer ---

  /** Send bytes to a specific peer. */
  send(peerId: PeerID, data: Buffer): Promise<SendResult>;

  /** Broadcast bytes to all connected peers. */
  broadcast(data: Buffer): Promise<number>;

  // --- Events ---

  /** Subscribe to a transport event. */
  on(type: TransportEventType, handler: TransportEventHandler): void;

  /** Unsubscribe. */
  off(type: TransportEventType, handler: TransportEventHandler): void;

  // --- Metrics ---

  /** Get a snapshot of transport metrics. */
  getMetrics(): TransportMetricsSnapshot;
}
