/**
 * NINE Transport — BluetoothLink
 *
 * Represents a single RFCOMM connection to one neighbor. Wraps an
 * IBluetoothSocket (injected, mockable) with lifecycle management,
 * length-prefixed frame writing, and continuous frame reading.
 *
 * API Status: STABLE (frozen at Phase 9.8)
 */

import { type PeerID } from '../shared/Types.js';

// ─── Socket Abstraction (for testability) ───────────────────────────────

/**
 * Minimal abstraction over a Bluetooth RFCOMM socket.
 * On Android: wraps BluetoothSocket's input/output streams.
 * In tests: a mock that simulates connect/close behavior.
 */
export interface IBluetoothSocket {
  /** Establish the RFCOMM connection (blocking on Android). */
  connect(): Promise<void>;

  /** Close the socket and release resources. */
  close(): void;

  /** Whether the socket is currently connected. */
  isConnected(): boolean;

  /** Write raw bytes to the socket output stream. */
  write(data: Buffer): Promise<void>;

  /**
   * Read exactly `size` bytes from the socket input stream.
   * Returns a Buffer of exactly `size` bytes, or throws on EOF/error.
   */
  read(size: number): Promise<Buffer>;

  /** Remote address identifier (e.g., Bluetooth MAC). */
  readonly remoteAddress: string;
}

// ─── Link States ────────────────────────────────────────────────────────

export enum LinkState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  CLOSING = 'closing',
  CLOSED = 'closed',
  FAILED = 'failed',
}

// ─── BluetoothLink ──────────────────────────────────────────────────────

export class BluetoothLink {
  private _state: LinkState = LinkState.IDLE;
  private readonly socket: IBluetoothSocket;
  private readonly _peerId: PeerID;
  private readonly _initiatedByUs: boolean;

  constructor(socket: IBluetoothSocket, peerId: PeerID, initiatedByUs: boolean) {
    this.socket = socket;
    this._peerId = peerId;
    this._initiatedByUs = initiatedByUs;
  }

  get state(): LinkState { return this._state; }
  get peerId(): PeerID { return this._peerId; }
  get initiatedByUs(): boolean { return this._initiatedByUs; }
  get remoteAddress(): string { return this.socket.remoteAddress; }

  /**
   * Establish the RFCOMM connection.
   * Transitions: IDLE → CONNECTING → CONNECTED (or FAILED).
   */
  async connect(): Promise<void> {
    if (this._state !== LinkState.IDLE) {
      throw new Error(`Cannot connect: link is in state ${this._state}`);
    }
    this._state = LinkState.CONNECTING;
    try {
      await this.socket.connect();
      this._state = LinkState.CONNECTED;
    } catch (err) {
      this._state = LinkState.FAILED;
      throw err;
    }
  }

  /**
   * Close the link gracefully.
   * Transitions: any active state → CLOSING → CLOSED.
   */
  close(): void {
    if (this._state === LinkState.CLOSED || this._state === LinkState.CLOSING) return;
    this._state = LinkState.CLOSING;
    try {
      this.socket.close();
    } catch {
      // Swallow close errors (socket may already be closed by remote)
    }
    this._state = LinkState.CLOSED;
  }

  /** Whether this link is in a usable state for data transfer. */
  isAlive(): boolean {
    return this._state === LinkState.CONNECTED && this.socket.isConnected();
  }

  /**
   * Write a framed packet to the socket: [4-byte big-endian length][data].
   * Throws if the link is not alive or the write fails.
   */
  async writeFrame(data: Buffer): Promise<void> {
    if (!this.isAlive()) {
      throw new Error(`LINK_NOT_ALIVE: cannot write, state=${this._state}`);
    }

    // Build the framed buffer: 4-byte length prefix + data
    const frame = Buffer.alloc(4 + data.length);
    frame.writeUInt32BE(data.length, 0);
    data.copy(frame, 4);

    await this.socket.write(frame);
  }

  /** Maximum allowed frame payload size (matches MAX_PACKET_SIZE). */
  static readonly MAX_FRAME_SIZE = 4096;

  /**
   * Start a continuous read loop that reads length-prefixed frames.
   * Each valid frame's payload is delivered via onFrame callback.
   * The loop exits on socket close/error, calling onError with the reason.
   * Non-blocking relative to other links (each link runs its own loop).
   */
  async startReadLoop(
    onFrame: (data: Buffer) => void,
    onError: (err: Error) => void,
  ): Promise<void> {
    try {
      while (this.isAlive()) {
        // Read the 4-byte length prefix
        const header = await this.socket.read(4);
        const payloadLength = header.readUInt32BE(0);

        // Validate frame size
        if (payloadLength > BluetoothLink.MAX_FRAME_SIZE) {
          onError(new Error(`FRAME_TOO_LARGE: ${payloadLength} bytes exceeds max ${BluetoothLink.MAX_FRAME_SIZE}`));
          this.close();
          return;
        }

        // Read the payload (may be zero-length for control frames)
        if (payloadLength === 0) {
          onFrame(Buffer.alloc(0));
          continue;
        }

        const payload = await this.socket.read(payloadLength);
        onFrame(payload);
      }
    } catch (err) {
      // Socket closed or read error — normal shutdown path
      if (this._state !== LinkState.CLOSED && this._state !== LinkState.CLOSING) {
        onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }
}
