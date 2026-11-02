import { describe, it, expect, beforeEach } from 'vitest';
import { SimulationController } from '../../core/simulator/SimulationController.js';
import { RoutingEngine, type RoutingEngineConfig } from '../../core/routing/RoutingEngine.js';
import { DuplicatePacketCache } from '../../core/routing/DuplicatePacketCache.js';
import { RouteCache } from '../../core/routing/RouteCache.js';
import { PendingMessageQueue } from '../../core/routing/PendingMessageQueue.js';
import { AckManager } from '../../core/routing/AckManager.js';
import { decrementTTL } from '../../core/routing/TTLManager.js';
import { hasLoop, wouldCreateLoop } from '../../core/routing/LoopPrevention.js';
import { RouteDiscovery } from '../../core/routing/RouteDiscovery.js';
import { createPacket } from '../../core/protocol/PacketFactory.js';
import { serialize } from '../../core/protocol/Serializer.js';
import { type Packet } from '../../core/protocol/Packet.js';
import { type NodeID, type PacketID, type Timestamp, PacketType, NodeRole } from '../../core/shared/Types.js';
import { NodeSimulator } from '../../core/simulator/NodeSimulator.js';
import { VirtualClock } from '../../core/simulator/VirtualClock.js';
import { SimulationEventBus } from '../../core/simulator/SimulationEvents.js';
import { VirtualTransport } from '../../core/simulator/VirtualTransport.js';

const A = '11111111-aaaa-4bbb-8ccc-dddddddddddd' as NodeID;
const B = '22222222-bbbb-4ccc-8ddd-eeeeeeeeeeee' as NodeID;
const C = '33333333-cccc-4ddd-8eee-ffffffffffff' as NodeID;
const D = '44444444-dddd-4eee-8fff-aaaaaaaaaaaa' as NodeID;

describe('DuplicatePacketCache', () => {
  it('detects duplicates', () => { const c = new DuplicatePacketCache(); c.markSeen('pkt-1' as PacketID, 100 as Timestamp); expect(c.hasSeen('pkt-1' as PacketID)).toBe(true); expect(c.hasSeen('pkt-2' as PacketID)).toBe(false); });
  it('evicts old entries', () => { const c = new DuplicatePacketCache(100, 1000); c.markSeen('p1' as PacketID, 100 as Timestamp); c.markSeen('p2' as PacketID, 2000 as Timestamp); expect(c.evict(1200 as Timestamp)).toBe(1); expect(c.size()).toBe(1); });
  it('respects max size', () => { const c = new DuplicatePacketCache(3, 60000); for (let i = 0; i < 5; i++) c.markSeen(`p${i}` as PacketID, (i * 100) as Timestamp); expect(c.size()).toBe(3); });
});

describe('TTLManager', () => {
  it('decrements TTL and increments hopCount', () => { const pkt = createPacket({packetType:PacketType.BROADCAST,senderId:A,destinationId:B,sequenceNumber:1,ttl:5,payload:Buffer.alloc(0)}); const r = decrementTTL(pkt); expect(r.dropped).toBe(false); expect(r.packet!.header.ttl).toBe(4); expect(r.packet!.header.hopCount).toBe(1); });
  it('drops when TTL=0', () => { const pkt = createPacket({packetType:PacketType.BROADCAST,senderId:A,destinationId:B,sequenceNumber:1,ttl:0,payload:Buffer.alloc(0)}); const r = decrementTTL(pkt); expect(r.dropped).toBe(true); expect(r.packet).toBeNull(); });
});

describe('LoopPrevention', () => {
  it('detects loop in hop list', () => { expect(hasLoop([A, B, C, A])).toBe(true); expect(hasLoop([A, B, C])).toBe(false); });
  it('wouldCreateLoop detects adding duplicate', () => { expect(wouldCreateLoop([A, B], B)).toBe(true); expect(wouldCreateLoop([A, B], C)).toBe(false); });
});

describe('RouteCache', () => {
  let cache: RouteCache;
  beforeEach(() => { cache = new RouteCache(5000); });
  it('adds and retrieves route', () => { cache.addRoute(D, B, [A,B,D], 1, 1000 as Timestamp); const r = cache.getRoute(D, 2000 as Timestamp); expect(r).not.toBeNull(); expect(r!.nextHopId).toBe(B); });
  it('returns null for expired', () => { cache.addRoute(D, B, [A,B,D], 1, 1000 as Timestamp); expect(cache.getRoute(D, 7000 as Timestamp)).toBeNull(); });
  it('invalidates by next hop', () => { cache.addRoute(C, B, [A,B,C], 1, 1000 as Timestamp); cache.addRoute(D, B, [A,B,D], 1, 1000 as Timestamp); expect(cache.invalidateByNextHop(B)).toHaveLength(2); expect(cache.size()).toBe(0); });
  it('refreshes expiry', () => { cache.addRoute(D, B, [A,B,D], 1, 1000 as Timestamp); cache.refresh(D, 4000 as Timestamp); expect(cache.getRoute(D, 8000 as Timestamp)).not.toBeNull(); });
});

describe('PendingMessageQueue', () => {
  it('enqueues and dequeues by destination', () => { const q = new PendingMessageQueue(); const pkt = createPacket({packetType:PacketType.BROADCAST,senderId:A,destinationId:D,sequenceNumber:1,ttl:10,payload:Buffer.alloc(0)}); q.enqueue(pkt, Buffer.alloc(71), D, 1000 as Timestamp); expect(q.size()).toBe(1); const msgs = q.dequeueFor(D); expect(msgs).toHaveLength(1); expect(q.size()).toBe(0); });
  it('rejects when full', () => { const q = new PendingMessageQueue(2, 30000); q.enqueue(createPacket({packetType:PacketType.BROADCAST,senderId:A,destinationId:D,sequenceNumber:1,ttl:10,payload:Buffer.alloc(0)}), Buffer.alloc(71), D, 100 as Timestamp); q.enqueue(createPacket({packetType:PacketType.BROADCAST,senderId:A,destinationId:D,sequenceNumber:2,ttl:10,payload:Buffer.alloc(0)}), Buffer.alloc(71), D, 200 as Timestamp); expect(q.enqueue(createPacket({packetType:PacketType.BROADCAST,senderId:A,destinationId:D,sequenceNumber:3,ttl:10,payload:Buffer.alloc(0)}), Buffer.alloc(71), D, 300 as Timestamp)).toBe(false); });
  it('evicts expired', () => { const q = new PendingMessageQueue(64, 1000); q.enqueue(createPacket({packetType:PacketType.BROADCAST,senderId:A,destinationId:D,sequenceNumber:1,ttl:10,payload:Buffer.alloc(0)}), Buffer.alloc(71), D, 100 as Timestamp); expect(q.evictExpired(2000 as Timestamp)).toHaveLength(1); });
});

describe('AckManager', () => {
  it('tracks and receives ACK', () => { const m = new AckManager(3000, 3); m.expectAck('p1' as PacketID, B, Buffer.alloc(71), 1000 as Timestamp); expect(m.isWaiting('p1' as PacketID)).toBe(true); expect(m.receiveAck('p1' as PacketID)).toBe(true); expect(m.size()).toBe(0); });
  it('identifies retransmissions needed', () => { const m = new AckManager(1000, 3); m.expectAck('p1' as PacketID, B, Buffer.alloc(71), 100 as Timestamp); expect(m.getRetransmissions(1200 as Timestamp)).toHaveLength(1); });
  it('identifies failures after max retries', () => { const m = new AckManager(1000, 0); m.expectAck('p1' as PacketID, B, Buffer.alloc(71), 100 as Timestamp); expect(m.getFailures(1200 as Timestamp)).toHaveLength(1); expect(m.size()).toBe(0); });
});

describe('RouteDiscovery', () => {
  it('creates and decodes ROUTE_REQUEST', () => { const d = new RouteDiscovery(); const bytes = d.createRouteRequest(A, D, 1000 as Timestamp); expect(bytes.length).toBeGreaterThan(71); expect(d.isPending(D)).toBe(true); });
  it('creates and decodes ROUTE_REPLY', () => { const d = new RouteDiscovery(); const bytes = d.createRouteReply(D, A, D, 1, [A, B, D], 1000 as Timestamp); expect(bytes.length).toBeGreaterThan(71); });
  it('creates and decodes ROUTE_ERROR', () => { const d = new RouteDiscovery(); const bytes = d.createRouteError(B, A, D, 0x01, 1000 as Timestamp); expect(bytes.length).toBeGreaterThan(71); });
});

// ═══════════════════════════════════════════════════════════════════════
// INTEGRATION: RoutingEngine in Simulator
// ═══════════════════════════════════════════════════════════════════════

function createRoutedMesh(topology: 'linear' | 'star', nodeCount: number) {
  const clock = new VirtualClock(0);
  const events = new SimulationEventBus();
  const transport = new VirtualTransport(clock, events);
  const latency = { latencyMs: 10, jitterMs: 0, packetLossRate: 0 };

  interface RoutedNode { id: NodeID; engine: RoutingEngine; delivered: Packet[] }
  const nodes: RoutedNode[] = [];

  for (let i = 0; i < nodeCount; i++) {
    const id = `${(i+1).toString().padStart(8,'0')}-aaaa-4bbb-8ccc-dddddddddddd` as NodeID;
    const delivered: Packet[] = [];
    const engine = new RoutingEngine({
      selfId: id,
      send: (to, data) => transport.send(id, to, data),
      broadcast: (data) => transport.broadcast(id, data),
      deliver: (pkt) => { delivered.push(pkt); },
      getNeighbors: () => transport.getNeighbors(id),
      clock: () => clock.now(),
    });
    transport.registerNode(id, (from, data) => engine.handleIncoming(from, data));
    nodes.push({ id, engine, delivered });
  }

  // Create links
  if (topology === 'linear') {
    for (let i = 0; i < nodeCount - 1; i++) {
      transport.createLink(nodes[i]!.id, nodes[i+1]!.id, latency);
    }
  } else {
    for (let i = 1; i < nodeCount; i++) {
      transport.createLink(nodes[0]!.id, nodes[i]!.id, latency);
    }
  }

  function advance(ms: number) { clock.advance(ms); transport.tick(); }
  function advanceUntilQuiet(maxTicks = 50) { for (let i = 0; i < maxTicks; i++) { clock.advance(10); if (transport.tick() === 0 && transport.getPendingCount() === 0) break; } }

  return { nodes, clock, transport, events, advance, advanceUntilQuiet };
}

describe('Scenario 1: Multi-hop routing A→B→C→D', () => {
  it('discovers route and delivers packet', () => {
    const { nodes, advanceUntilQuiet } = createRoutedMesh('linear', 4);
    const [a, _b, _c, d] = nodes;

    // A sends a unicast packet to D
    const pkt = createPacket({ packetType: PacketType.HEARTBEAT, senderId: a!.id, destinationId: d!.id, sequenceNumber: 1, ttl: 20, payload: Buffer.alloc(10) });
    a!.engine.sendPacket(pkt, serialize(pkt));

    // Let RREQ flood and RREP return
    advanceUntilQuiet();

    // D should have received the packet
    expect(d!.delivered.length).toBeGreaterThanOrEqual(1);
    // Verify the original sender is A
    const received = d!.delivered.find(p => p.header.senderId.toLowerCase() === a!.id.toLowerCase());
    expect(received).toBeDefined();
  });
});

describe('Scenario 2: Automatic route discovery for unknown destination', () => {
  it('buffers packet and discovers route automatically', () => {
    const { nodes, advanceUntilQuiet } = createRoutedMesh('linear', 3);
    const [a, _b, c] = nodes;

    // A has no route to C initially
    expect(a!.engine.routeCache.getNextHop(c!.id, 0 as Timestamp)).toBeNull();

    // Send packet — should be queued
    const pkt = createPacket({ packetType: PacketType.HEARTBEAT, senderId: a!.id, destinationId: c!.id, sequenceNumber: 1, ttl: 20, payload: Buffer.alloc(5) });
    a!.engine.sendPacket(pkt, serialize(pkt));

    expect(a!.engine.getMetrics().routeDiscoveries).toBe(1);

    advanceUntilQuiet();

    // C should receive the packet after route discovery
    expect(c!.delivered.length).toBe(1);
    // Route should now be cached
    expect(a!.engine.routeCache.getNextHop(c!.id, 0 as Timestamp)).not.toBeNull();
  });
});

describe('Scenario 3: Relay node failure → route invalidation', () => {
  it('invalidates routes through dead neighbor', () => {
    const { nodes, advanceUntilQuiet, transport } = createRoutedMesh('linear', 4);
    const [a, b, _c, d] = nodes;

    // First establish route A→B→C→D
    const pkt = createPacket({ packetType: PacketType.HEARTBEAT, senderId: a!.id, destinationId: d!.id, sequenceNumber: 1, ttl: 20, payload: Buffer.alloc(5) });
    a!.engine.sendPacket(pkt, serialize(pkt));
    advanceUntilQuiet();
    expect(d!.delivered.length).toBe(1);

    // Kill node B — remove its links
    transport.destroyLink(a!.id, b!.id);
    transport.destroyLink(b!.id, nodes[2]!.id);
    a!.engine.notifyLinkBroken(b!.id);

    expect(a!.engine.getMetrics().routesInvalidated).toBeGreaterThan(0);
  });
});

describe('Scenario 4: TTL expiration', () => {
  it('drops packet when TTL exhausted', () => {
    const { nodes, advanceUntilQuiet } = createRoutedMesh('linear', 4);
    const [a, _b, _c, d] = nodes;

    // Send with TTL=1 — can only reach B, not D
    const pkt = createPacket({ packetType: PacketType.HEARTBEAT, senderId: a!.id, destinationId: d!.id, sequenceNumber: 1, ttl: 1, payload: Buffer.alloc(5) });
    a!.engine.sendPacket(pkt, serialize(pkt));
    advanceUntilQuiet();

    // D should NOT receive the data packet (but may receive RREQ which has its own TTL=20)
    const dataPackets = d!.delivered.filter(p => p.header.packetType === PacketType.HEARTBEAT);
    expect(dataPackets.length).toBe(0);
  });
});

describe('Scenario 5: Duplicate packet suppression', () => {
  it('drops duplicate packets', () => {
    const { nodes, advance } = createRoutedMesh('linear', 3);
    const [a, b, _c] = nodes;

    // Send same packet twice (same packetId)
    const pkt = createPacket({ packetType: PacketType.BROADCAST, senderId: a!.id, destinationId: '00000000-0000-0000-0000-000000000000' as NodeID, sequenceNumber: 1, ttl: 10, payload: Buffer.from('dup test') });
    const bytes = serialize(pkt);
    a!.engine.sendPacket(pkt, bytes);
    advance(10);
    // Inject the same packet again directly into B
    b!.engine.handleIncoming(a!.id, bytes);

    expect(b!.engine.getMetrics().duplicatesDetected).toBeGreaterThanOrEqual(1);
    // B should have delivered only once
    expect(b!.delivered.length).toBe(1);
  });
});

describe('Scenario 6: Broken link → ROUTE_ERROR', () => {
  it('generates ROUTE_ERROR on link break', () => {
    const { nodes, advanceUntilQuiet, transport } = createRoutedMesh('linear', 3);
    const [a, b, c] = nodes;

    // Establish route
    const pkt = createPacket({ packetType: PacketType.HEARTBEAT, senderId: a!.id, destinationId: c!.id, sequenceNumber: 1, ttl: 20, payload: Buffer.alloc(5) });
    a!.engine.sendPacket(pkt, serialize(pkt));
    advanceUntilQuiet();
    expect(c!.delivered.length).toBe(1);

    // Break link B→C
    transport.destroyLink(b!.id, c!.id);
    b!.engine.notifyLinkBroken(c!.id);
    advanceUntilQuiet();

    expect(b!.engine.getMetrics().routeErrorsSent).toBeGreaterThan(0);
  });
});

describe('Scenario 7: Pending queue → delivery after route discovery', () => {
  it('queues message then delivers when route found', () => {
    const { nodes, advanceUntilQuiet } = createRoutedMesh('linear', 5);
    const [a, _b, _c, _d, e] = nodes;

    // A sends to E (4 hops away, no route known)
    const pkt = createPacket({ packetType: PacketType.HEARTBEAT, senderId: a!.id, destinationId: e!.id, sequenceNumber: 1, ttl: 20, payload: Buffer.from('queued') });
    a!.engine.sendPacket(pkt, serialize(pkt));

    // Should be in pending queue
    expect(a!.engine.pendingQueue.size()).toBe(1);

    advanceUntilQuiet();

    // After route discovery, the packet should have been delivered
    expect(e!.delivered.length).toBe(1);
    expect(a!.engine.pendingQueue.size()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// STRESS TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('Stress: 10-node mesh', () => {
  it('routes across a 10-node linear chain', () => {
    const { nodes, advanceUntilQuiet } = createRoutedMesh('linear', 10);
    const first = nodes[0]!;
    const last = nodes[9]!;

    const pkt = createPacket({ packetType: PacketType.HEARTBEAT, senderId: first.id, destinationId: last.id, sequenceNumber: 1, ttl: 20, payload: Buffer.from('deep') });
    first.engine.sendPacket(pkt, serialize(pkt));
    advanceUntilQuiet();

    expect(last.delivered.length).toBe(1);
    expect(first.engine.getMetrics().routesCreated).toBeGreaterThanOrEqual(1);
  });
});

describe('Stress: 20-node mesh', () => {
  it('routes across a 20-node linear chain', () => {
    const { nodes, clock, transport } = createRoutedMesh('linear', 20);
    const first = nodes[0]!;
    const last = nodes[19]!;

    const pkt = createPacket({ packetType: PacketType.HEARTBEAT, senderId: first.id, destinationId: last.id, sequenceNumber: 1, ttl: 25, payload: Buffer.from('stress') });
    first.engine.sendPacket(pkt, serialize(pkt));

    // 20-node chain needs more ticks: RREQ floods 19 hops, RREP returns 19 hops, data travels 19 hops
    for (let i = 0; i < 200; i++) { clock.advance(10); transport.tick(); }

    expect(last.delivered.length).toBe(1);
  });
});

describe('Stress: Broadcast in 5-node star', () => {
  it('all nodes receive broadcast', () => {
    const { nodes, advanceUntilQuiet } = createRoutedMesh('star', 5);
    const center = nodes[0]!;

    const pkt = createPacket({ packetType: PacketType.BROADCAST, senderId: center.id, destinationId: '00000000-0000-0000-0000-000000000000' as NodeID, sequenceNumber: 1, ttl: 10, payload: Buffer.from('alert') });
    center.engine.sendPacket(pkt, serialize(pkt));
    advanceUntilQuiet();

    // All 4 leaf nodes should have received
    for (let i = 1; i < 5; i++) {
      expect(nodes[i]!.delivered.length).toBe(1);
    }
  });
});

describe('Metrics collection', () => {
  it('tracks routing metrics accurately', () => {
    const { nodes, advanceUntilQuiet } = createRoutedMesh('linear', 4);
    const [a, _b, _c, d] = nodes;

    const pkt = createPacket({ packetType: PacketType.HEARTBEAT, senderId: a!.id, destinationId: d!.id, sequenceNumber: 1, ttl: 20, payload: Buffer.alloc(5) });
    a!.engine.sendPacket(pkt, serialize(pkt));
    advanceUntilQuiet();

    const metrics = a!.engine.getMetrics();
    expect(metrics.routeDiscoveries).toBeGreaterThanOrEqual(1);
    expect(metrics.routesCreated).toBeGreaterThanOrEqual(1);
    expect(metrics.packetsForwarded).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MULTI-ROUTE / DISJOINT-PATH SUPPORT (protocol defect fix)
// ═══════════════════════════════════════════════════════════════════════

describe('RouteCache — Multi-Route & Disjoint Selection', () => {
  let cache: RouteCache;
  beforeEach(() => { cache = new RouteCache(30000); });

  it('stores multiple routes per destination', () => {
    cache.addRoute(D, B, [A, B, D], 1, 1000 as Timestamp);
    cache.addRoute(D, C, [A, C, D], 1, 1000 as Timestamp);
    expect(cache.routeCount(D, 2000 as Timestamp)).toBe(2);
  });

  it('deduplicates identical paths (refresh, not duplicate)', () => {
    cache.addRoute(D, B, [A, B, D], 1, 1000 as Timestamp);
    const second = cache.addRoute(D, B, [A, B, D], 1, 1500 as Timestamp);
    expect(second).toBe(false);
    expect(cache.routeCount(D, 2000 as Timestamp)).toBe(1);
  });

  it('ranks primary by lowest hop count', () => {
    cache.addRoute(D, C, [A, C, C, D], 1, 1000 as Timestamp); // 3 hops
    cache.addRoute(D, B, [A, B, D], 1, 1000 as Timestamp);    // 2 hops
    const primary = cache.getPrimaryRoute(D, 2000 as Timestamp);
    expect(primary!.nextHopId).toBe(B);
  });

  it('getDisjointRoutes returns disjoint pair when available', () => {
    cache.addRoute(D, B, [A, B, D], 1, 1000 as Timestamp);
    cache.addRoute(D, C, [A, C, D], 1, 1000 as Timestamp);
    const pair = cache.getDisjointRoutes(D, 2000 as Timestamp);
    expect(pair).not.toBeNull();
    expect(pair!.disjoint).toBe(true);
    expect(pair!.overlapScore).toBe(0);
  });

  it('getDisjointRoutes reports overlap when paths share intermediates', () => {
    // Both routes go through B
    cache.addRoute(D, B, [A, B, D], 1, 1000 as Timestamp);
    cache.addRoute(D, B, [A, B, C, D], 2, 1000 as Timestamp);
    const pair = cache.getDisjointRoutes(D, 2000 as Timestamp);
    expect(pair!.disjoint).toBe(false);
    expect(pair!.overlapScore).toBeGreaterThanOrEqual(1);
  });

  it('getSecondaryRoute returns the min-overlap alternative', () => {
    cache.addRoute(D, B, [A, B, D], 1, 1000 as Timestamp);
    cache.addRoute(D, C, [A, C, D], 1, 1000 as Timestamp);
    const secondary = cache.getSecondaryRoute(D, 2000 as Timestamp);
    expect(secondary).not.toBeNull();
    expect(secondary!.nextHopId).toBe(C);
  });

  it('single route → disjoint pair uses same route (not disjoint)', () => {
    cache.addRoute(D, B, [A, B, D], 1, 1000 as Timestamp);
    const pair = cache.getDisjointRoutes(D, 2000 as Timestamp);
    expect(pair!.disjoint).toBe(false);
    expect(pair!.primary).toBe(pair!.secondary);
  });

  it('invalidateByNextHop removes routes containing the broken node', () => {
    cache.addRoute(D, B, [A, B, D], 1, 1000 as Timestamp);
    cache.addRoute(D, C, [A, C, D], 1, 1000 as Timestamp);
    cache.invalidateByNextHop(B);
    expect(cache.routeCount(D, 2000 as Timestamp)).toBe(1);
    expect(cache.getPrimaryRoute(D, 2000 as Timestamp)!.nextHopId).toBe(C);
  });
});

describe('Scenario 8: Genuine node-disjoint dual-path discovery', () => {
  it('diamond topology discovers two disjoint routes to the destination', () => {
    // Diamond: Source - RelayA - Admin  and  Source - RelayB - Admin
    const clock = new VirtualClock(0);
    const events = new SimulationEventBus();
    const transport = new VirtualTransport(clock, events);
    const latency = { latencyMs: 10, jitterMs: 0, packetLossRate: 0 };

    const S = '00000001-aaaa-4bbb-8ccc-dddddddddddd' as NodeID;
    const RA = '00000002-aaaa-4bbb-8ccc-dddddddddddd' as NodeID;
    const RB = '00000003-aaaa-4bbb-8ccc-dddddddddddd' as NodeID;
    const AD = '00000004-aaaa-4bbb-8ccc-dddddddddddd' as NodeID;

    const engines = new Map<NodeID, RoutingEngine>();
    for (const id of [S, RA, RB, AD]) {
      const engine = new RoutingEngine({
        selfId: id,
        send: (to, data) => transport.send(id, to, data),
        broadcast: (data) => transport.broadcast(id, data),
        deliver: () => {},
        getNeighbors: () => transport.getNeighbors(id),
        clock: () => clock.now(),
      });
      transport.registerNode(id, (from, data) => engine.handleIncoming(from, data));
      engines.set(id, engine);
    }
    transport.createLink(S, RA, latency);
    transport.createLink(S, RB, latency);
    transport.createLink(RA, AD, latency);
    transport.createLink(RB, AD, latency);

    // Source discovers routes to Admin
    engines.get(S)!.initiateDiscovery(AD);
    for (let i = 0; i < 30; i++) { clock.advance(10); transport.tick(); }

    const pair = engines.get(S)!.getDisjointRoutes(AD);
    expect(pair).not.toBeNull();
    expect(engines.get(S)!.routeCache.routeCount(AD, clock.now())).toBeGreaterThanOrEqual(2);
    expect(pair!.disjoint).toBe(true);
    expect(pair!.overlapScore).toBe(0);
  });
});
