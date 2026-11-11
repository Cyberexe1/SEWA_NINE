/**
 * NINE Transport — Bluetooth Discovery Manager
 *
 * Manages the discovery lifecycle: tracks discovered peers, suppresses
 * duplicates, enforces discovery timeout, and reports new peers via
 * callback. This is the TypeScript equivalent of the Android
 * BroadcastReceiver for ACTION_FOUND / ACTION_DISCOVERY_FINISHED.
 *
 * Pure logic — no Android dependencies. Platform events are fed in
 * via reportDeviceFound() / reportDiscoveryFinished().
 */

import { type PeerID } from '../shared/Types.js';

export interface DiscoveredPeer {
  readonly peerId: PeerID;
  readonly displayName?: string;
  readonly rssi?: number;
  readonly discoveredAt: number;
}

export type PeerDiscoveredCallback = (peer: DiscoveredPeer) => void;
export type DiscoveryFinishedCallback = () => void;

export class BluetoothDiscoveryManager {
  private readonly discoveredPeers: Map<string, DiscoveredPeer> = new Map();
  private readonly onPeerDiscovered: PeerDiscoveredCallback;
  private readonly onFinished: DiscoveryFinishedCallback;
  private _active = false;
  private _timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly timeoutMs: number;

  constructor(config: {
    onPeerDiscovered: PeerDiscoveredCallback;
    onFinished: DiscoveryFinishedCallback;
    timeoutMs?: number;
  }) {
    this.onPeerDiscovered = config.onPeerDiscovered;
    this.onFinished = config.onFinished;
    this.timeoutMs = config.timeoutMs ?? 12000; // Android default ~12s
  }

  /** Whether a discovery scan is currently active. */
  get active(): boolean { return this._active; }

  /** Number of unique peers discovered in the current/last scan. */
  get discoveredCount(): number { return this.discoveredPeers.size; }

  /** Start a new discovery scan. Clears previous results. */
  start(): void {
    this._active = true;
    this.discoveredPeers.clear();

    // Set a timeout to auto-finish if the adapter doesn't signal completion
    if (this._timeoutTimer) clearTimeout(this._timeoutTimer);
    this._timeoutTimer = setTimeout(() => {
      if (this._active) this.finish();
    }, this.timeoutMs);
  }

  /** Stop the current discovery (explicit cancellation). */
  stop(): void {
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = null;
    }
    this._active = false;
  }

  /**
   * Report a device found during scanning (called by the platform layer
   * when a Bluetooth device is discovered — equivalent of ACTION_FOUND).
   * Duplicates are suppressed: callback fires only for new peers.
   */
  reportDeviceFound(peerId: PeerID, displayName?: string, rssi?: number): void {
    if (!this._active) return;

    const key = (peerId as string).toLowerCase();
    if (this.discoveredPeers.has(key)) return; // duplicate suppression

    const peer: DiscoveredPeer = {
      peerId,
      displayName,
      rssi,
      discoveredAt: Date.now(),
    };
    this.discoveredPeers.set(key, peer);
    this.onPeerDiscovered(peer);
  }

  /**
   * Report that the adapter's discovery scan completed (called by the
   * platform layer — equivalent of ACTION_DISCOVERY_FINISHED).
   */
  reportDiscoveryFinished(): void {
    this.finish();
  }

  /** Get all peers discovered in the current/last scan. */
  getDiscoveredPeers(): DiscoveredPeer[] {
    return Array.from(this.discoveredPeers.values());
  }

  /** Check if a peer has already been discovered. */
  hasDiscovered(peerId: PeerID): boolean {
    return this.discoveredPeers.has((peerId as string).toLowerCase());
  }

  /** Clear all discovered peer state. */
  clear(): void {
    this.stop();
    this.discoveredPeers.clear();
  }

  private finish(): void {
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = null;
    }
    this._active = false;
    this.onFinished();
  }
}
