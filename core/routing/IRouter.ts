/**
 * NINE Routing — IRouter Interface
 *
 * Public contract for the routing engine.
 * Consumers depend on this interface, not the concrete RoutingEngine.
 */

import { type NodeID } from '../shared/Types.js';
import { type Packet } from '../protocol/Packet.js';
import { type RoutingMetrics } from './RoutingEngine.js';

export interface IRouter {
  handleIncoming(from: NodeID, data: Buffer): void;
  sendPacket(packet: Packet, serialized: Buffer): void;
  notifyLinkBroken(deadNeighborId: NodeID): void;
  tick(): void;
  getMetrics(): RoutingMetrics;
}
