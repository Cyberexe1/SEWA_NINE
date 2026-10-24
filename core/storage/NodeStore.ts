/**
 * NINE Protocol - Node Store
 *
 * Persists node identity, routing state, and key material.
 */

import type { NodeID, NodeRole, Timestamp } from '../shared/Types.js';
import type { NeighborEntry } from '../node/NeighborTable.js';
import type { RoutingEntry } from '../node/RoutingTable.js';
import type { KnownNodeEntry } from '../routing/MeshManager.js';

/**
 * Persisted node state (survives restarts).
 */
export interface PersistedNodeState {
  nodeId: NodeID;
  role: NodeRole;
  displayName: string;
  createdAt: Timestamp;
  lastActiveAt: Timestamp;
}

/**
 * Stored key record.
 */
export interface StoredKey {
  id: string;
  nodeId: NodeID;
  keyType: 'rsa_public' | 'rsa_private' | 'admin_public';
  keyData: Buffer;
  createdAt: Timestamp;
  expiresAt: Timestamp | null;
}

/**
 * Node Store interface.
 */
export interface INodeStore {
  // --- Node State ---

  /** Save node state */
  saveNodeState(state: PersistedNodeState): Promise<void>;

  /** Get persisted node state */
  getNodeState(): Promise<PersistedNodeState | null>;

  /** Check if node state exists */
  hasNodeState(): Promise<boolean>;

  // --- Routing Persistence ---

  /** Save routing entries */
  saveRoutes(entries: RoutingEntry[]): Promise<void>;

  /** Get persisted routes */
  getRoutes(): Promise<RoutingEntry[]>;

  /** Save neighbor state (for recovery) */
  saveNeighbors(neighbors: NeighborEntry[]): Promise<void>;

  /** Get persisted neighbors */
  getNeighbors(): Promise<NeighborEntry[]>;

  /** Save known nodes */
  saveKnownNodes(nodes: KnownNodeEntry[]): Promise<void>;

  /** Get persisted known nodes */
  getKnownNodes(): Promise<KnownNodeEntry[]>;

  // --- Key Storage ---

  /** Store a cryptographic key */
  storeKey(key: StoredKey): Promise<void>;

  /** Get a key by node ID and type */
  getKey(nodeId: NodeID, keyType: string): Promise<StoredKey | null>;

  /** Get Admin's public key */
  getAdminPublicKey(): Promise<Buffer | null>;

  /** Store Admin's public key */
  storeAdminPublicKey(key: Buffer): Promise<void>;

  /** Get Admin's private key (Admin node only) */
  getAdminPrivateKey(): Promise<Buffer | null>;

  /** Store Admin's key pair */
  storeAdminKeyPair(publicKey: Buffer, privateKey: Buffer): Promise<void>;

  /** Remove a key */
  removeKey(nodeId: NodeID, keyType: string): Promise<void>;

  // --- Cleanup ---

  /** Clear all stored data */
  clearAll(): Promise<void>;
}
