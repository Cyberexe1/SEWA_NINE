/**
 * NINE Transport — BluetoothAcceptLoop
 *
 * Continuously accepts inbound RFCOMM connections from remote devices.
 * Each accepted socket is reported via the onAccepted callback so the
 * BluetoothTransport can wrap it in a BluetoothLink and start its
 * read loop.
 *
 * API Status: STABLE (frozen at Phase 9.8)
 */

import { type IBluetoothSocket } from './BluetoothLink.js';

// ─── Server Socket Abstraction ──────────────────────────────────────────

/**
 * Abstraction over BluetoothServerSocket. On Android: wraps the real
 * server socket. In tests: a mock that produces mock sockets on demand.
 */
export interface IBluetoothServerSocket {
  /** Block until a remote device connects. Returns the accepted socket. */
  accept(): Promise<IBluetoothSocket>;

  /** Close the server socket, causing any blocking accept() to throw. */
  close(): void;
}

export type AcceptCallback = (socket: IBluetoothSocket) => void;

// ─── BluetoothAcceptLoop ────────────────────────────────────────────────

export class BluetoothAcceptLoop {
  private readonly serverSocket: IBluetoothServerSocket;
  private readonly onAccepted: AcceptCallback;
  private _running = false;
  private _stopped = false;

  constructor(serverSocket: IBluetoothServerSocket, onAccepted: AcceptCallback) {
    this.serverSocket = serverSocket;
    this.onAccepted = onAccepted;
  }

  get running(): boolean { return this._running; }

  /**
   * Start the accept loop. Runs until cancel() is called or the
   * server socket throws (e.g., after close()).
   */
  async start(): Promise<void> {
    if (this._running || this._stopped) return;
    this._running = true;

    try {
      while (this._running) {
        const socket = await this.serverSocket.accept();
        if (this._running) {
          this.onAccepted(socket);
        } else {
          socket.close();
        }
      }
    } catch {
      // Server socket closed (normal shutdown path) or error — stop the loop.
    } finally {
      this._running = false;
    }
  }

  /** Stop accepting new connections and close the server socket. */
  cancel(): void {
    this._running = false;
    this._stopped = true;
    try {
      this.serverSocket.close();
    } catch {
      // Swallow — may already be closed
    }
  }
}
