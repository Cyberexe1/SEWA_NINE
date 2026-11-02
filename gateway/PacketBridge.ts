/**
 * NINE Gateway - Packet Bridge
 *
 * The bridge between platform-specific transport implementations
 * and the NINE core protocol engine.
 *
 * Platform clients (Android, Desktop) provide raw bytes from their
 * Bluetooth/Wi-Fi APIs. The PacketBridge translates between the
 * platform layer and the core protocol layer.
 */

import type { PeerID } from '../core/shared/Types.js';

/**
 * Direction of data flow through the bridge.
 */
export enum BridgeDirection {
  /** Platform → Core (incoming bytes from physical transport) */
  INBOUND = 'inbound',

  /** Core → Platform (outgoing bytes to physical transport) */
  OUTBOUND = 'outbound',
}

/**
 * Packet Bridge interface.
 *
 * Implementations:
 * - AndroidBridge: Communicates with Android app via some IPC mechanism
 * - DesktopBridge: Communicates with Electron/Node.js native modules
 */
export interface IPacketBridge {
  /** Initialize the bridge */
  initialize(): Promise<void>;

  /** Shutdown the bridge */
  shutdown(): Promise<void>;

  /**
   * Feed raw bytes from the platform transport into the core.
   * Called when the platform receives data from a peer.
   */
  feedInbound(peerId: PeerID, data: Buffer): void;

  /**
   * Register callback for outbound data.
   * Called when the core needs to send bytes to a peer.
   * The platform must then transmit these bytes via its transport.
   */
  onOutbound(callback: (peerId: PeerID, data: Buffer) => void): void;

  /**
   * Notify the bridge of a new peer connection (platform detected).
   */
  notifyPeerConnected(peerId: PeerID, displayName?: string): void;

  /**
   * Notify the bridge of a peer disconnection.
   */
  notifyPeerDisconnected(peerId: PeerID): void;
}
