/**
 * NINE Protocol - Node
 *
 * Represents a single node in the NINE mesh network.
 * Maintains identity, state, and lifecycle management.
 */

import type { NodeID, SessionID, NodeRole, Timestamp } from '../shared/Types.js';

/**
 * Complete state of a NINE node at any point in time.
 */
export interface NodeState {
  /** Permanent identity (persists across restarts) */
  nodeId: NodeID;

  /** Session identity (regenerated each startup) */
  sessionId: SessionID;

  /** Role in the mesh */
  role: NodeRole;

  /** Human-readable display name */
  displayName: string;

  /** Capability bitfield */
  capabilities: number;

  /** When this node was first created */
  createdAt: Timestamp;

  /** When this node was last active */
  lastActiveAt: Timestamp;
}

/**
 * Node lifecycle states.
 */
export enum NodeLifecycleState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  READY = 'ready',
  DISCOVERING = 'discovering',
  CONNECTED = 'connected',
  SHUTTING_DOWN = 'shutting_down',
  SHUTDOWN = 'shutdown',
}

/**
 * Interface for the Node entity.
 * Manages identity, state transitions, and lifecycle.
 */
export interface INode {
  /** Get current node state */
  getState(): NodeState;

  /** Get lifecycle state */
  getLifecycleState(): NodeLifecycleState;

  /** Get node ID */
  getNodeId(): NodeID;

  /** Get session ID */
  getSessionId(): SessionID;

  /** Get role */
  getRole(): NodeRole;

  /** Update display name */
  setDisplayName(name: string): void;

  /** Transition lifecycle state */
  transitionTo(state: NodeLifecycleState): void;
}
