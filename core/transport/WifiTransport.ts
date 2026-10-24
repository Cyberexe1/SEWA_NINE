/**
 * NINE Protocol - Wi-Fi Direct Transport Adapter
 *
 * Platform-specific implementation of the transport adapter
 * for Wi-Fi Direct (IEEE 802.11 P2P).
 *
 * This file defines the interface. Actual platform bindings
 * will be provided by the Gateway layer (AndroidBridge / DesktopBridge).
 */

import type { ITransportAdapter } from './Transport.js';

/**
 * Wi-Fi Direct specific configuration.
 */
export interface WifiDirectConfig {
  /** Group Owner intent (0-15, higher = more likely to become GO) */
  groupOwnerIntent: number;

  /** Service name for NINE protocol discovery */
  serviceName: string;

  /** Channel preference (0 = auto) */
  preferredChannel: number;
}

/**
 * Wi-Fi Direct adapter interface.
 * Extends base transport with Wi-Fi Direct specific operations.
 */
export interface IWifiDirectAdapter extends ITransportAdapter {
  /** Get Wi-Fi Direct group info */
  getGroupInfo(): WifiDirectGroupInfo | null;

  /** Check if this node is Group Owner */
  isGroupOwner(): boolean;
}

export interface WifiDirectGroupInfo {
  groupOwner: string;
  networkName: string;
  passphrase: string;
  frequency: number;
  clientCount: number;
}
