/**
 * NINE Protocol - Node Simulator
 *
 * A single virtual node running inside the MeshSimulator.
 * Has its own identity, state, and participates in the mesh.
 */

import type { NodeID, NodeRole } from '../shared/Types.js';

/**
 * Virtual node interface.
 */
export interface INodeSimulator {
  /** Get this node's ID */
  readonly nodeId: NodeID;

  /** Get this node's role */
  readonly role: NodeRole;

  /** Get display name */
  readonly displayName: string;

  /** Get position */
  readonly position: { x: number; y: number };

  /** Start the virtual node */
  start(): Promise<void>;

  /** Stop the virtual node */
  stop(): Promise<void>;

  /** Check if running */
  isRunning(): boolean;

  /** Send a broadcast message */
  broadcast(message: string): Promise<void>;

  /** Send a secure message to Admin */
  sendSecureMessage(message: string, adminId: NodeID): Promise<void>;

  /** Get all received broadcasts */
  getReceivedBroadcasts(): Array<{ message: string; from: string; hops: number }>;

  /** Get all received secure messages (Admin only) */
  getReceivedSecureMessages(): Array<{ plaintext: string; from: string }>;

  /** Get this node's neighbor count */
  getNeighborCount(): number;

  /** Get this node's known node count */
  getKnownNodeCount(): number;
}
