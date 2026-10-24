import { type NodeID, type SessionID, type Timestamp, NodeRole } from '../shared/Types.js';
import { generateNodeId, generateSessionId } from './NodeID.js';

export enum NodeLifecycleState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  IDLE = 'idle',
  DISCOVERING = 'discovering',
  ACTIVE = 'active',
  SHUTTING_DOWN = 'shutting_down',
  TERMINATED = 'terminated',
}

const VALID_TRANSITIONS: Record<NodeLifecycleState, NodeLifecycleState[]> = {
  [NodeLifecycleState.UNINITIALIZED]: [NodeLifecycleState.INITIALIZING],
  [NodeLifecycleState.INITIALIZING]: [NodeLifecycleState.IDLE],
  [NodeLifecycleState.IDLE]: [NodeLifecycleState.DISCOVERING, NodeLifecycleState.SHUTTING_DOWN],
  [NodeLifecycleState.DISCOVERING]: [NodeLifecycleState.ACTIVE, NodeLifecycleState.SHUTTING_DOWN],
  [NodeLifecycleState.ACTIVE]: [NodeLifecycleState.DISCOVERING, NodeLifecycleState.SHUTTING_DOWN],
  [NodeLifecycleState.SHUTTING_DOWN]: [NodeLifecycleState.TERMINATED],
  [NodeLifecycleState.TERMINATED]: [],
};

export interface NodeState {
  readonly nodeId: NodeID;
  readonly sessionId: SessionID;
  readonly role: NodeRole;
  readonly displayName: string;
  readonly capabilities: number;
  readonly createdAt: Timestamp;
  readonly lastActiveAt: Timestamp;
  readonly lifecycleState: NodeLifecycleState;
}

export interface NodeConfig {
  role: NodeRole;
  displayName: string;
  capabilities?: number;
  nodeId?: NodeID;
}

export class MeshNode {
  private _state: NodeState;

  private constructor(state: NodeState) {
    this._state = state;
  }

  static create(config: NodeConfig): MeshNode {
    const now = Date.now() as Timestamp;
    const state: NodeState = {
      nodeId: config.nodeId ?? generateNodeId(),
      sessionId: generateSessionId(),
      role: config.role,
      displayName: config.displayName,
      capabilities: config.capabilities ?? 0,
      createdAt: now,
      lastActiveAt: now,
      lifecycleState: NodeLifecycleState.UNINITIALIZED,
    };
    return new MeshNode(state);
  }

  static restore(persisted: {
    nodeId: NodeID;
    role: NodeRole;
    displayName: string;
    capabilities: number;
    createdAt: Timestamp;
  }): MeshNode {
    const state: NodeState = {
      ...persisted,
      sessionId: generateSessionId(),
      lastActiveAt: Date.now() as Timestamp,
      lifecycleState: NodeLifecycleState.UNINITIALIZED,
    };
    return new MeshNode(state);
  }

  getState(): NodeState { return this._state; }
  get nodeId(): NodeID { return this._state.nodeId; }
  get sessionId(): SessionID { return this._state.sessionId; }
  get role(): NodeRole { return this._state.role; }
  get displayName(): string { return this._state.displayName; }
  get lifecycleState(): NodeLifecycleState { return this._state.lifecycleState; }

  transitionTo(target: NodeLifecycleState): void {
    const allowed = VALID_TRANSITIONS[this._state.lifecycleState];
    if (!allowed?.includes(target)) {
      throw new Error(`Invalid state transition: ${this._state.lifecycleState} -> ${target}`);
    }
    this._state = { ...this._state, lifecycleState: target, lastActiveAt: Date.now() as Timestamp };
  }

  canTransitionTo(target: NodeLifecycleState): boolean {
    return VALID_TRANSITIONS[this._state.lifecycleState]?.includes(target) ?? false;
  }

  setDisplayName(name: string): void {
    this._state = { ...this._state, displayName: name };
  }

  touch(): void {
    this._state = { ...this._state, lastActiveAt: Date.now() as Timestamp };
  }
}
