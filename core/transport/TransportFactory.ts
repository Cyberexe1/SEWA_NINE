/**
 * NINE Transport — Transport Factory
 *
 * Creates transport instances by type. Enables dependency injection
 * and keeps transport construction in one place. New transports register
 * their constructors here.
 */

import { type PeerID, type NodeID, type TransportType, type Timestamp } from '../shared/Types.js';
import { type ITransport } from './ITransport.js';
import { MockTransport, MockMedium } from './MockTransport.js';
import { VirtualTransportAdapter } from './VirtualTransportAdapter.js';
import { type VirtualTransport } from '../simulator/VirtualTransport.js';

export type TransportConstructor = (...args: any[]) => ITransport;

export class TransportFactory {
  private constructors: Map<string, TransportConstructor> = new Map();

  /** Register a transport constructor for a type. */
  register(type: TransportType, ctor: TransportConstructor): void {
    this.constructors.set(type, ctor);
  }

  /** Create a transport by type with the given args. */
  create(type: TransportType, ...args: any[]): ITransport {
    const ctor = this.constructors.get(type);
    if (!ctor) throw new Error(`No transport registered for type: ${type}`);
    return ctor(...args);
  }

  /** Check if a type is registered. */
  has(type: TransportType): boolean {
    return this.constructors.has(type);
  }

  // ─── Convenience Builders ────────────────────────────────────────

  /** Create a mock transport on a shared medium. */
  static createMock(selfId: PeerID, medium: MockMedium, clock?: () => Timestamp): MockTransport {
    return new MockTransport(selfId, medium, clock);
  }

  /** Create a virtual transport adapter wrapping the simulator's VirtualTransport. */
  static createVirtualAdapter(selfId: NodeID, vt: VirtualTransport, clock: () => Timestamp): VirtualTransportAdapter {
    return new VirtualTransportAdapter(selfId, vt, clock);
  }
}
