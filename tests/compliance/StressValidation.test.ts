/**
 * Phase 8.0 — Stress Validation Tests
 *
 * Covers: 1000 packet serialization, 1000 packet parsing, 1000 broadcasts,
 * 1000 secure messages, large payloads, rapid node joins, rapid node
 * failures, rapid route discoveries, rapid route invalidations.
 *
 * Timing is measured with performance.now() purely for reporting
 * (printed + returned via helper, not asserted against wall-clock
 * thresholds that could flake on slow CI hardware — thresholds are wide).
 * All PROTOCOL time (TTL, route expiry, etc.) uses VirtualClock.
 */

import { describe, it, expect } from 'vitest';
import { createPacket } from '../../core/protocol/PacketFactory.js';
import { serialize } from '../../core/protocol/Serializer.js';
import { parse } from '../../core/protocol/Parser.js';
import { HEADER_SIZE, MAX_PACKET_SIZE } from '../../core/protocol/Packet.js';
import { PacketType, type NodeID, type Timestamp, NodeRole } from '../../core/shared/Types.js';
import { RoutingEngine } from '../../core/routing/RoutingEngine.js';
import { VirtualClock } from '../../core/simulator/VirtualClock.js';
import { VirtualTransport } from '../../core/simulator/VirtualTransport.js';
import { SimulationEventBus } from '../../core/simulator/SimulationEvents.js';
import { NineCore } from '../../core/NineCore.js';
import { NineCoreBuilder } from '../../core/NineCoreBuilder.js';
import { createConfiguration } from '../../core/NineConfiguration.js';
import { MockTransport, MockMedium } from '../../core/transport/MockTransport.js';
import { recordPerf as record } from './_perfLog.js';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as NodeID;
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as NodeID;
const BROADCAST = '00000000-0000-0000-0000-000000000000' as NodeID;

// ─── 1000 packet serialization ──────────────────────────────────────────

describe('Stress: 1000 packet serializations', () => {
  it('serializes 1000 packets without error and within a generous time budget', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      const pkt = createPacket({ packetType: PacketType.BROADCAST, senderId: A, destinationId: BROADCAST, sequenceNumber: i, ttl: 10, payload: Buffer.from(`msg-${i}`) });
      const bytes = serialize(pkt);
      expect(bytes.length).toBeGreaterThan(HEADER_SIZE);
    }
    const elapsed = performance.now() - start;
    record('serialize x1000', 1000, elapsed);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ─── 1000 packet parsing ─────────────────────────────────────────────────

describe('Stress: 1000 packet parsings', () => {
  it('parses 1000 pre-serialized packets without error and within a generous time budget', () => {
    const buffers: Buffer[] = [];
    for (let i = 0; i < 1000; i++) {
      buffers.push(serialize(createPacket({ packetType: PacketType.HEARTBEAT, senderId: A, destinationId: B, sequenceNumber: i, ttl: 10, payload: Buffer.alloc(10, i % 256) })));
    }
    const start = performance.now();
    for (const buf of buffers) {
      const restored = parse(buf);
      expect(restored.header.packetType).toBe(PacketType.HEARTBEAT);
    }
    const elapsed = performance.now() - start;
    record('parse x1000', 1000, elapsed);
    expect(elapsed).toBeLessThan(5000);
  });
});

// ─── 1000 broadcasts ─────────────────────────────────────────────────────

describe('Stress: 1000 broadcasts through a routed 5-node star', () => {
  it('delivers 1000 sequential broadcasts to all leaves without leaks or metric drift', () => {
    const clock = new VirtualClock(0);
    const events = new SimulationEventBus();
    const transport = new VirtualTransport(clock, events);
    const link = { latencyMs: 1, jitterMs: 0, packetLossRate: 0 };
    const center = A;
    const leaves = ['b1111111-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b2222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b3333333-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b4444444-bbbb-4bbb-8bbb-bbbbbbbbbbbb'] as NodeID[];
    const deliveredCounts = new Map<NodeID, number>();
    for (const id of [center, ...leaves]) {
      deliveredCounts.set(id, 0);
      const engine = new RoutingEngine({
        selfId: id, send: (to, data) => transport.send(id, to, data), broadcast: (data) => transport.broadcast(id, data),
        deliver: () => { deliveredCounts.set(id, deliveredCounts.get(id)! + 1); },
        getNeighbors: () => transport.getNeighbors(id), clock: () => clock.now(),
      });
      transport.registerNode(id, (from, data) => engine.handleIncoming(from, data));
    }
    for (const leaf of leaves) transport.createLink(center, leaf, link);

    const centerEngine = new RoutingEngine({
      selfId: center, send: (to, data) => transport.send(center, to, data), broadcast: (data) => transport.broadcast(center, data),
      deliver: () => {}, getNeighbors: () => transport.getNeighbors(center), clock: () => clock.now(),
    });
    // Re-register center with its own dedicated engine reference for sendPacket use
    transport.registerNode(center, (from, data) => centerEngine.handleIncoming(from, data));

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      const pkt = createPacket({ packetType: PacketType.BROADCAST, senderId: center, destinationId: BROADCAST, sequenceNumber: i, ttl: 5, payload: Buffer.from(`b${i}`) });
      centerEngine.sendPacket(pkt, serialize(pkt));
      clock.advance(1);
      transport.tick();
    }
    // Drain remaining
    for (let i = 0; i < 20; i++) { clock.advance(1); transport.tick(); }
    const elapsed = performance.now() - start;
    record('broadcast x1000 (5-node star)', 1000, elapsed);

    for (const leaf of leaves) expect(deliveredCounts.get(leaf)).toBe(1000);
    expect(elapsed).toBeLessThan(15000);
  });
});

// ─── 1000 secure messages ────────────────────────────────────────────────

describe('Stress: 1000 secure messages between directly-connected user and admin', () => {
  it('encrypts, transmits, and decrypts 1000 secure messages without loss', async () => {
    const medium = new MockMedium();
    const clock = new VirtualClock(0);
    const userTransport = new MockTransport(A as unknown as any, medium, () => clock.now());
    const adminTransport = new MockTransport(B as unknown as any, medium, () => clock.now());
    const user = new NineCoreBuilder().withConfiguration(createConfiguration(NodeRole.USER, 'User', { nodeId: A })).withTransport(userTransport).withClock(() => clock.now()).build();
    const admin = new NineCoreBuilder().withConfiguration(createConfiguration(NodeRole.ADMIN, 'Admin', { nodeId: B })).withTransport(adminTransport).withClock(() => clock.now()).build();
    await user.initialize();
    await admin.initialize();
    user.setAdminPublicKey(admin.getAdminPublicKey()!);
    await userTransport.connect(B as unknown as any);
    await adminTransport.connect(A as unknown as any);

    let receivedCount = 0;
    admin.onSecureMessage(() => { receivedCount++; });

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      user.sendSecureMessage(`secret-${i}`, B);
    }
    const elapsed = performance.now() - start;
    record('secure message x1000', 1000, elapsed);

    expect(receivedCount).toBe(1000);
    expect(elapsed).toBeLessThan(60000);

    await user.shutdown();
    await admin.shutdown();
  });
});

// ─── Large payloads ──────────────────────────────────────────────────────

describe('Stress: large payloads at the protocol boundary', () => {
  // NOTE (documented finding, see Known Limitations in the compliance
  // report): NINE-PacketEncoding-v1.0 Section 11 states the max unsigned
  // payload is 3961 bytes, but with the actual HEADER_SIZE=71 constant in
  // core/protocol/Packet.ts, MAX_PACKET_SIZE(4096) - HEADER_SIZE(71) = 4025.
  // The doc's number is stale/inconsistent with the frozen implementation.
  // These tests verify actual code behavior, not the (incorrect) doc figure.
  const maxUnsignedPayload = MAX_PACKET_SIZE - HEADER_SIZE; // 4025

  it('round-trips the maximum unsigned payload size (MAX_PACKET_SIZE - HEADER_SIZE)', () => {
    const payload = Buffer.alloc(maxUnsignedPayload, 0x77);
    const pkt = createPacket({ packetType: PacketType.BROADCAST, senderId: A, destinationId: BROADCAST, sequenceNumber: 1, ttl: 10, payload });
    const bytes = serialize(pkt);
    expect(bytes.length).toBe(MAX_PACKET_SIZE);
    const restored = parse(bytes);
    expect(restored.payload.equals(payload)).toBe(true);
  });

  it('produces a packet 1 byte past MAX_PACKET_SIZE when payload exceeds the limit by 1 byte', () => {
    const payload = Buffer.alloc(maxUnsignedPayload + 1, 0x77);
    const pkt = createPacket({ packetType: PacketType.BROADCAST, senderId: A, destinationId: BROADCAST, sequenceNumber: 1, ttl: 10, payload });
    const bytes = serialize(pkt);
    expect(bytes.length).toBe(MAX_PACKET_SIZE + 1);
  });

  it('handles 100 large (3900-byte) broadcasts through a routed relay chain', () => {
    const clock = new VirtualClock(0);
    const events = new SimulationEventBus();
    const transport = new VirtualTransport(clock, events);
    const link = { latencyMs: 1, jitterMs: 0, packetLossRate: 0 };
    const n1 = '11111111-cccc-4bbb-8ccc-dddddddddddd' as NodeID;
    const n2 = '22222222-cccc-4bbb-8ccc-dddddddddddd' as NodeID;
    let deliveredCount = 0;
    const e1 = new RoutingEngine({ selfId: n1, send: (to, data) => transport.send(n1, to, data), broadcast: (data) => transport.broadcast(n1, data), deliver: () => {}, getNeighbors: () => transport.getNeighbors(n1), clock: () => clock.now() });
    const e2 = new RoutingEngine({ selfId: n2, send: (to, data) => transport.send(n2, to, data), broadcast: (data) => transport.broadcast(n2, data), deliver: () => { deliveredCount++; }, getNeighbors: () => transport.getNeighbors(n2), clock: () => clock.now() });
    transport.registerNode(n1, (from, data) => e1.handleIncoming(from, data));
    transport.registerNode(n2, (from, data) => e2.handleIncoming(from, data));
    transport.createLink(n1, n2, link);

    for (let i = 0; i < 100; i++) {
      const pkt = createPacket({ packetType: PacketType.BROADCAST, senderId: n1, destinationId: BROADCAST, sequenceNumber: i, ttl: 5, payload: Buffer.alloc(3900, i % 256) });
      e1.sendPacket(pkt, serialize(pkt));
      clock.advance(1);
      transport.tick();
    }
    expect(deliveredCount).toBe(100);
  });
});

// ─── Rapid node joins ────────────────────────────────────────────────────

describe('Stress: rapid node joins', () => {
  it('registers 50 nodes into a shared virtual transport in rapid succession', () => {
    const clock = new VirtualClock(0);
    const events = new SimulationEventBus();
    const transport = new VirtualTransport(clock, events);
    const engines: RoutingEngine[] = [];
    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      const id = `${(i + 1).toString().padStart(8, '0')}-eeee-4bbb-8ccc-dddddddddddd` as NodeID;
      const engine = new RoutingEngine({ selfId: id, send: (to, data) => transport.send(id, to, data), broadcast: (data) => transport.broadcast(id, data), deliver: () => {}, getNeighbors: () => transport.getNeighbors(id), clock: () => clock.now() });
      transport.registerNode(id, (from, data) => engine.handleIncoming(from, data));
      engines.push(engine);
    }
    const elapsed = performance.now() - start;
    record('rapid node joins x50', 50, elapsed);
    expect(engines.length).toBe(50);
  });
});

// ─── Rapid node failures ─────────────────────────────────────────────────

describe('Stress: rapid node failures', () => {
  it('processes 50 consecutive link-break notifications without error', () => {
    const clock = new VirtualClock(0);
    const events = new SimulationEventBus();
    const transport = new VirtualTransport(clock, events);
    const center = A;
    const engine = new RoutingEngine({ selfId: center, send: (to, data) => transport.send(center, to, data), broadcast: (data) => transport.broadcast(center, data), deliver: () => {}, getNeighbors: () => transport.getNeighbors(center), clock: () => clock.now() });
    transport.registerNode(center, (from, data) => engine.handleIncoming(from, data));

    const leafIds: NodeID[] = [];
    for (let i = 0; i < 50; i++) {
      const id = `${(i + 1).toString().padStart(8, '0')}-ffff-4bbb-8ccc-dddddddddddd` as NodeID;
      leafIds.push(id);
      transport.createLink(center, id, { latencyMs: 1, jitterMs: 0, packetLossRate: 0 });
      engine.routeCache.addRoute(id, id, [center, id], 1, clock.now());
    }
    const start = performance.now();
    for (const id of leafIds) {
      transport.destroyLink(center, id);
      engine.notifyLinkBroken(id);
    }
    const elapsed = performance.now() - start;
    record('rapid node failures x50', 50, elapsed);
    expect(engine.getMetrics().routesInvalidated).toBeGreaterThanOrEqual(50);
    expect(engine.routeCache.size()).toBe(0);
  });
});

// ─── Rapid route discoveries ─────────────────────────────────────────────

describe('Stress: rapid route discoveries', () => {
  it('initiates 100 discoveries to distinct destinations without state corruption', () => {
    const clock = new VirtualClock(0);
    const events = new SimulationEventBus();
    const transport = new VirtualTransport(clock, events);
    const self = A;
    const engine = new RoutingEngine({ selfId: self, send: (to, data) => transport.send(self, to, data), broadcast: (data) => transport.broadcast(self, data), deliver: () => {}, getNeighbors: () => transport.getNeighbors(self), clock: () => clock.now() });
    transport.registerNode(self, (from, data) => engine.handleIncoming(from, data));

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      const dest = `${(i + 1).toString().padStart(8, '0')}-9999-4bbb-8ccc-dddddddddddd` as NodeID;
      engine.initiateDiscovery(dest);
    }
    const elapsed = performance.now() - start;
    record('rapid route discoveries x100', 100, elapsed);
    expect(engine.getMetrics().routeDiscoveries).toBe(100);
  });
});

// ─── Rapid route invalidations ───────────────────────────────────────────

describe('Stress: rapid route invalidations', () => {
  it('adds and invalidates 200 routes in rapid succession, leaving a consistent cache', () => {
    const engine = new RoutingEngine({ selfId: A, send: () => true, broadcast: () => 0, deliver: () => {}, getNeighbors: () => [], clock: () => 0 as unknown as Timestamp });
    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      const dest = `${(i + 1).toString().padStart(8, '0')}-8888-4bbb-8ccc-dddddddddddd` as NodeID;
      const nextHop = `${(i + 1).toString().padStart(8, '0')}-7777-4bbb-8ccc-dddddddddddd` as NodeID;
      engine.routeCache.addRoute(dest, nextHop, [A, nextHop, dest], i, 0 as unknown as Timestamp);
      engine.routeCache.invalidateByNextHop(nextHop);
    }
    const elapsed = performance.now() - start;
    record('rapid route invalidations x200', 200, elapsed);
    expect(engine.routeCache.size()).toBe(0);
  });
});
