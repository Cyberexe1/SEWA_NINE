/**
 * NINE Protocol - Core Type Definitions
 *
 * Branded types and enumerations used across ALL modules.
 * This file has ZERO imports — it is the foundation of the type system.
 */

// ============================================================
// BRANDED PRIMITIVE TYPES
// ============================================================

/** 128-bit UUID v4 identifying a node */
export type NodeID = string & { readonly __brand: 'NodeID' };

/** 128-bit UUID v4 identifying a packet */
export type PacketID = string & { readonly __brand: 'PacketID' };

/** 64-bit random session identifier (changes on restart) */
export type SessionID = string & { readonly __brand: 'SessionID' };

/** Peer identifier at the transport layer */
export type PeerID = string & { readonly __brand: 'PeerID' };

/** Unix epoch time in milliseconds */
export type Timestamp = number & { readonly __brand: 'Timestamp' };

// ============================================================
// ENUMERATIONS
// ============================================================

export enum NodeRole {
  USER = 0,
  ADMIN = 1,
}

export enum PacketType {
  DISCOVERY = 0x01,
  DISCOVERY_RESPONSE = 0x02,
  HEARTBEAT = 0x03,
  BROADCAST = 0x04,
  ENCRYPTED_MESSAGE = 0x05,
  KEY_PACKET = 0x06,
  ACK = 0x07,
  ROUTE_REQUEST = 0x08,
  ROUTE_REPLY = 0x09,
  ROUTE_ERROR = 0x0a,
  KEY_ANNOUNCE = 0x0b,
}

export enum TransportType {
  WIFI_DIRECT = 'wifi_direct',
  BLUETOOTH_CLASSIC = 'bluetooth_classic',
  BLE = 'ble',
  SIMULATED = 'simulated',
}

export enum ConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
}

export enum ContentType {
  TEXT = 0x00,
  EMERGENCY_ALERT = 0x01,
}

export enum AESMode {
  GCM = 'aes-256-gcm',
  CBC = 'aes-256-cbc',
}

export enum RSAMode {
  OAEP_SHA256 = 'rsa-oaep-sha256',
}

export enum RouteErrorCode {
  LINK_BROKEN = 0x01,
  NODE_UNREACHABLE = 0x02,
  NODE_SHUTDOWN = 0x03,
}

export enum TransportStatus {
  UNINITIALIZED = 'uninitialized',
  READY = 'ready',
  DISCOVERING = 'discovering',
  ERROR = 'error',
  SHUTDOWN = 'shutdown',
}

export enum NodeCapability {
  WIFI_DIRECT = 1 << 0,
  BLUETOOTH_CLASSIC = 1 << 1,
  BLE = 1 << 2,
  WILLING_TO_RELAY = 1 << 3,
}

// ============================================================
// SPECIAL VALUES
// ============================================================

/** Broadcast destination — message is for everyone */
export const BROADCAST_ADDRESS = '00000000-0000-0000-0000-000000000000' as NodeID;
