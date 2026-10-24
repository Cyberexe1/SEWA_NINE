/**
 * NINE Protocol - Bluetooth Transport Adapter
 *
 * Platform-specific implementation of the transport adapter
 * for Bluetooth Classic (RFCOMM) and BLE.
 *
 * This file defines the interface. Actual platform bindings
 * will be provided by the Gateway layer.
 */

import type { ITransportAdapter } from './Transport.js';

/**
 * Bluetooth specific configuration.
 */
export interface BluetoothConfig {
  /** UUID for NINE protocol RFCOMM service */
  serviceUUID: string;

  /** Bluetooth device name broadcast */
  deviceName: string;

  /** Enable BLE advertising alongside classic */
  enableBLE: boolean;

  /** Maximum simultaneous connections (Bluetooth limit: 7) */
  maxConnections: number;
}

/**
 * Bluetooth adapter interface.
 * Extends base transport with Bluetooth-specific operations.
 */
export interface IBluetoothAdapter extends ITransportAdapter {
  /** Get Bluetooth MAC address (if available) */
  getMacAddress(): string | null;

  /** Check if Bluetooth is enabled on the device */
  isBluetoothEnabled(): boolean;

  /** Get signal strength to a peer */
  getRSSI(peerId: string): number | null;
}

/**
 * Default NINE Bluetooth service UUID.
 * Generated deterministically — all NINE nodes use the same UUID.
 */
export const NINE_BLUETOOTH_SERVICE_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
