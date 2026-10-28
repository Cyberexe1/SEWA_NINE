/**
 * NINE Transport — Transport State Machine
 *
 * Governs the lifecycle of a transport adapter.
 * Conforms to NINE-RFC Section 11 (State Machines).
 */

export enum TransportState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  DISCOVERING = 'discovering',
  ADVERTISING = 'advertising',
  ERROR = 'error',
  SHUTDOWN = 'shutdown',
}

const VALID_TRANSITIONS: Record<TransportState, TransportState[]> = {
  [TransportState.UNINITIALIZED]: [TransportState.INITIALIZING],
  [TransportState.INITIALIZING]: [TransportState.READY, TransportState.ERROR],
  [TransportState.READY]: [TransportState.DISCOVERING, TransportState.ADVERTISING, TransportState.SHUTDOWN, TransportState.ERROR],
  [TransportState.DISCOVERING]: [TransportState.READY, TransportState.ADVERTISING, TransportState.SHUTDOWN, TransportState.ERROR],
  [TransportState.ADVERTISING]: [TransportState.READY, TransportState.DISCOVERING, TransportState.SHUTDOWN, TransportState.ERROR],
  [TransportState.ERROR]: [TransportState.READY, TransportState.SHUTDOWN],
  [TransportState.SHUTDOWN]: [],
};

export class TransportStateMachine {
  private _state: TransportState = TransportState.UNINITIALIZED;

  get state(): TransportState { return this._state; }

  canTransitionTo(target: TransportState): boolean {
    return VALID_TRANSITIONS[this._state]?.includes(target) ?? false;
  }

  transitionTo(target: TransportState): void {
    if (!this.canTransitionTo(target)) {
      throw new Error(`Invalid transport state transition: ${this._state} -> ${target}`);
    }
    this._state = target;
  }

  isOperational(): boolean {
    return this._state === TransportState.READY ||
           this._state === TransportState.DISCOVERING ||
           this._state === TransportState.ADVERTISING;
  }
}

// --- Connection State (per peer) ---

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  DISCONNECTING = 'disconnecting',
}
