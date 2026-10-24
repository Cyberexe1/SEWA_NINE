/**
 * NINE Simulator — Virtual Clock
 *
 * Deterministic time source for the simulation.
 * Allows time to be advanced manually (no real wall-clock dependency).
 * All simulator components use this instead of Date.now().
 */

import { type Timestamp } from '../shared/Types.js';

export class VirtualClock {
  private _now: number;

  constructor(startTime: number = 0) {
    this._now = startTime;
  }

  /** Get current simulated time. */
  now(): Timestamp {
    return this._now as Timestamp;
  }

  /** Advance time by a given number of milliseconds. */
  advance(ms: number): void {
    if (ms < 0) throw new Error('Cannot advance time backwards');
    this._now += ms;
  }

  /** Set time to an absolute value. Must be >= current. */
  setTime(ms: number): void {
    if (ms < this._now) throw new Error('Cannot set time backwards');
    this._now = ms;
  }

  /** Reset clock to zero. */
  reset(): void {
    this._now = 0;
  }
}
