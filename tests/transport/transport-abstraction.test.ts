import { describe, it, expect, beforeEach } from 'vitest';
import { MockTransport, MockMedium } from '../../core/transport/MockTransport.js';
import { VirtualTransportAdapter } from '../../core/transport/VirtualTransportAdapter.js';
import { TransportManager } from '../../core/transport/TransportManager.js';
import { TransportSelector } from '../../core/transport/TransportSelector.js';
import { TransportFactory } from '../../core/transport/TransportFactory.js';
import { TransportStateMachine, TransportState, ConnectionState } from '../../core/transport/TransportState.js';
import { TransportMetrics } from '../../core/transport/TransportMetrics.js';
import { TransportEventEmitter, TransportEventType } from '../../core/transport/TransportEvents.js';
import { VirtualClock } from '../../core/simulator/VirtualClock.js';
import { SimulationEventBus } from '../../core/simulator/SimulationEvents.js';
import { VirtualTransport } from '../../core/simulator/VirtualTransport.js';
import { type PeerID, type NodeID, type Timestamp } from '../../core/shared/Types.js';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as PeerID;
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as PeerID;
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as PeerID;

describe('TransportStateMachine', () => {
  let fsm: TransportStateMachine;
  beforeEach(() => { fsm = new TransportStateMachine(); });

  it('starts UNINITIALIZED', () => { expect(fsm.state).toBe(TransportState.UNINITIALIZED); });
  it('transitions through valid lifecycle', () => {
    fsm.transitionTo(TransportState.INITIALIZING);
    fsm.transitionTo(TransportState.READY);
    fsm.transitionTo(TransportState.DISCOVERING);
    expect(fsm.state).toBe(TransportState.DISCOVERING);
    expect(fsm.isOperational()).toBe(true);
  });
  it('throws on invalid transition', () => { expect(() => fsm.transitionTo(TransportState.READY)).toThrow(); });
  it('cannot transition from SHUTDOWN', () => {
    fsm.transitionTo(TransportState.INITIALIZING);
    fsm.transitionTo(TransportState.READY);
    fsm.transitionTo(TransportState.SHUTDOWN);
    expect(() => fsm.transitionTo(TransportState.READY)).toThrow();
  });
});

describe('TransportMetrics', () => {
  it('records sends and receives', () => {
    const m = new TransportMetrics();
    m.recordSend(100, 5);
    m.recordReceive(50);
    const snap = m.snapshot();
    expect(snap.bytesSent).toBe(100);
    expect(snap.bytesReceived).toBe(50);
    expect(snap.packetsSent).toBe(1);
    expect(snap.averageSendLatencyMs).toBe(5);
  });
  it('resets correctly', () => {
    const m = new TransportMetrics();
    m.recordSend(100);
    m.reset();
    expect(m.snapshot().bytesSent).toBe(0);
  });
});

describe('TransportEventEmitter', () => {
  it('emits to type-specific handlers', () => {
    const e = new TransportEventEmitter();
    let received = false;
    e.on(TransportEventType.DATA_RECEIVED, () => { received = true; });
    e.emit({ type: TransportEventType.DATA_RECEIVED, peerId: A, transportType: 'simulated' as any, data: Buffer.alloc(0), receivedAt: 0 as Timestamp });
    expect(received).toBe(true);
  });
  it('onAny receives all events', () => {
    const e = new TransportEventEmitter();
    let count = 0;
    e.onAny(() => { count++; });
    e.emit({ type: TransportEventType.PEER_DISCOVERED, peerId: A, transportType: 'simulated' as any });
    e.emit({ type: TransportEventType.PEER_LOST, peerId: A, transportType: 'simulated' as any });
    expect(count).toBe(2);
  });
  it('off removes handler', () => {
    const e = new TransportEventEmitter();
    let count = 0;
    const h = () => { count++; };
    e.on(TransportEventType.PEER_DISCOVERED, h);
    e.emit({ type: TransportEventType.PEER_DISCOVERED, peerId: A, transportType: 'simulated' as any });
    e.off(TransportEventType.PEER_DISCOVERED, h);
    e.emit({ type: TransportEventType.PEER_DISCOVERED, peerId: A, transportType: 'simulated' as any });
    expect(count).toBe(1);
  });
});

describe('MockTransport (ITransport implementation)', () => {
  let medium: MockMedium;
  let ta: MockTransport;
  let tb: MockTransport;

  beforeEach(async () => {
    medium = new MockMedium();
    ta = new MockTransport(A, medium);
    tb = new MockTransport(B, medium);
    await ta.initialize();
    await tb.initialize();
  });

  it('initializes to READY state', () => { expect(ta.state).toBe(TransportState.READY); });

  it('discovers peers on the medium', async () => {
    const discovered: PeerID[] = [];
    ta.on(TransportEventType.PEER_DISCOVERED, (e: any) => discovered.push(e.peerId));
    await ta.startDiscovery();
    expect(discovered.map(p => p.toLowerCase())).toContain(B.toLowerCase());
  });

  it('connects and reports connection', async () => {
    await ta.connect(B);
    expect(ta.isConnected(B)).toBe(true);
    expect(ta.getConnections()).toHaveLength(1);
  });

  it('sends data to connected peer', async () => {
    const received: Buffer[] = [];
    tb.on(TransportEventType.DATA_RECEIVED, (e: any) => received.push(e.data));
    await ta.connect(B);
    const result = await ta.send(B, Buffer.from('hello transport'));
    expect(result.success).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]!.toString()).toBe('hello transport');
  });

  it('fails to send to unconnected peer', async () => {
    const result = await ta.send(B, Buffer.from('x'));
    expect(result.success).toBe(false);
    expect(result.error).toBe('not_connected');
  });

  it('broadcasts to all connected peers', async () => {
    const tc = new MockTransport(C, medium);
    await tc.initialize();
    const bReceived: Buffer[] = [];
    const cReceived: Buffer[] = [];
    tb.on(TransportEventType.DATA_RECEIVED, (e: any) => bReceived.push(e.data));
    tc.on(TransportEventType.DATA_RECEIVED, (e: any) => cReceived.push(e.data));
    await ta.connect(B);
    await ta.connect(C);
    const count = await ta.broadcast(Buffer.from('broadcast'));
    expect(count).toBe(2);
    expect(bReceived).toHaveLength(1);
    expect(cReceived).toHaveLength(1);
  });

  it('disconnect removes connection', async () => {
    await ta.connect(B);
    await ta.disconnect(B);
    expect(ta.isConnected(B)).toBe(false);
  });

  it('tracks metrics', async () => {
    await ta.connect(B);
    await ta.send(B, Buffer.from('12345'));
    const m = ta.getMetrics();
    expect(m.bytesSent).toBe(5);
    expect(m.packetsSent).toBe(1);
    expect(m.connectionsEstablished).toBe(1);
  });

  it('shutdown transitions to SHUTDOWN', async () => {
    await ta.shutdown();
    expect(ta.state).toBe(TransportState.SHUTDOWN);
  });
});

describe('VirtualTransportAdapter (wraps frozen simulator)', () => {
  it('adapts VirtualTransport to ITransport and delivers data', async () => {
    const clock = new VirtualClock(0);
    const events = new SimulationEventBus();
    const vt = new VirtualTransport(clock, events);

    const nodeA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as NodeID;
    const nodeB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as NodeID;

    const adapterA = new VirtualTransportAdapter(nodeA, vt, () => clock.now());
    const adapterB = new VirtualTransportAdapter(nodeB, vt, () => clock.now());
    await adapterA.initialize();
    await adapterB.initialize();

    vt.createLink(nodeA, nodeB, { latencyMs: 10, jitterMs: 0, packetLossRate: 0 });

    const received: Buffer[] = [];
    adapterB.on(TransportEventType.DATA_RECEIVED, (e: any) => received.push(e.data));

    const result = await adapterA.send(nodeB as unknown as PeerID, Buffer.from('via adapter'));
    expect(result.success).toBe(true);

    clock.advance(10);
    vt.tick();

    expect(received).toHaveLength(1);
    expect(received[0]!.toString()).toBe('via adapter');
    expect(adapterA.getMetrics().bytesSent).toBe(11);
  });

  it('reports connections from virtual links', async () => {
    const clock = new VirtualClock(0);
    const events = new SimulationEventBus();
    const vt = new VirtualTransport(clock, events);
    const nodeA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as NodeID;
    const nodeB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as NodeID;
    const adapterA = new VirtualTransportAdapter(nodeA, vt, () => clock.now());
    await adapterA.initialize();
    vt.createLink(nodeA, nodeB, { latencyMs: 10, jitterMs: 0, packetLossRate: 0 });
    expect(adapterA.isConnected(nodeB as unknown as PeerID)).toBe(true);
    expect(adapterA.getConnections()).toHaveLength(1);
  });
});

describe('TransportSelector', () => {
  it('selects transport connected to peer', async () => {
    const medium = new MockMedium();
    const ta = new MockTransport(A, medium);
    await ta.initialize();
    await ta.connect(B);
    const selector = new TransportSelector();
    selector.register(ta);
    expect(selector.selectForPeer(B)).toBe(ta);
  });

  it('selects broadcast-capable transport', async () => {
    const medium = new MockMedium();
    const ta = new MockTransport(A, medium);
    await ta.initialize();
    const selector = new TransportSelector();
    selector.register(ta);
    expect(selector.selectForBroadcast()).toBe(ta);
  });

  it('respects minPayloadSize criteria', async () => {
    const medium = new MockMedium();
    const ta = new MockTransport(A, medium);
    await ta.initialize();
    const selector = new TransportSelector();
    selector.register(ta);
    // MockTransport max payload is 4096
    expect(selector.selectForPeer(B, { minPayloadSize: 8192 })).toBeNull();
    expect(selector.selectForPeer(B, { minPayloadSize: 1024 })).toBe(ta);
  });
});

describe('TransportManager', () => {
  let manager: TransportManager;
  let medium: MockMedium;
  let ta: MockTransport;
  let tb: MockTransport;

  beforeEach(async () => {
    manager = new TransportManager();
    medium = new MockMedium();
    ta = new MockTransport(A, medium);
    tb = new MockTransport(B, medium);
    await ta.initialize();
    await tb.initialize();
    manager.register(ta);
  });

  it('registers transports', () => { expect(manager.transportCount).toBe(1); });

  it('sends via best transport', async () => {
    const received: Buffer[] = [];
    tb.on(TransportEventType.DATA_RECEIVED, (e: any) => received.push(e.data));
    await ta.connect(B);
    const result = await manager.send(B, Buffer.from('managed send'));
    expect(result.success).toBe(true);
    expect(received[0]!.toString()).toBe('managed send');
  });

  it('returns error when no transport available', async () => {
    const empty = new TransportManager();
    const result = await empty.send(B, Buffer.from('x'));
    expect(result.success).toBe(false);
    expect(result.error).toBe('no_transport_available');
  });

  it('broadcasts through manager', async () => {
    const received: Buffer[] = [];
    tb.on(TransportEventType.DATA_RECEIVED, (e: any) => received.push(e.data));
    await ta.connect(B);
    const count = await manager.broadcast(Buffer.from('mgr broadcast'));
    expect(count).toBe(1);
  });

  it('forwards events to subscribers', async () => {
    let eventCount = 0;
    manager.on(() => { eventCount++; });
    await ta.connect(B);
    expect(eventCount).toBeGreaterThanOrEqual(1);
  });

  it('aggregates metrics', async () => {
    await ta.connect(B);
    await manager.send(B, Buffer.from('12345'));
    const agg = manager.getAggregateMetrics();
    expect(agg.bytesSent).toBe(5);
  });

  it('lists connected peers', async () => {
    await ta.connect(B);
    expect(manager.getConnectedPeers()).toHaveLength(1);
  });

  it('shuts down all transports', async () => {
    await manager.shutdownAll();
    expect(manager.transportCount).toBe(0);
  });
});

describe('TransportFactory', () => {
  it('creates mock transport via static builder', async () => {
    const medium = new MockMedium();
    const t = TransportFactory.createMock(A, medium);
    await t.initialize();
    expect(t.state).toBe(TransportState.READY);
  });

  it('registers and creates by type', () => {
    const factory = new TransportFactory();
    const medium = new MockMedium();
    factory.register('simulated' as any, (id: PeerID) => new MockTransport(id, medium));
    expect(factory.has('simulated' as any)).toBe(true);
    const t = factory.create('simulated' as any, A);
    expect(t.type).toBe('simulated');
  });

  it('throws for unregistered type', () => {
    const factory = new TransportFactory();
    expect(() => factory.create('lora' as any)).toThrow('No transport registered');
  });
});

describe('Transport Overhead Benchmark', () => {
  it('measures send overhead through abstraction', async () => {
    const medium = new MockMedium();
    const ta = new MockTransport(A, medium);
    const tb = new MockTransport(B, medium);
    await ta.initialize();
    await tb.initialize();
    await ta.connect(B);

    const payload = Buffer.alloc(256, 0x42);
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      await ta.send(B, payload);
    }
    const elapsed = performance.now() - start;
    console.log(`Transport abstraction: 10000 sends in ${elapsed.toFixed(1)}ms (${(elapsed/10000*1000).toFixed(1)}μs/send)`);
    expect(elapsed).toBeLessThan(5000);
    expect(ta.getMetrics().packetsSent).toBe(10000);
  });

  it('measures manager routing overhead', async () => {
    const manager = new TransportManager();
    const medium = new MockMedium();
    const ta = new MockTransport(A, medium);
    const tb = new MockTransport(B, medium);
    await ta.initialize();
    await tb.initialize();
    manager.register(ta);
    await ta.connect(B);

    const payload = Buffer.alloc(256, 0x42);
    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      await manager.send(B, payload);
    }
    const elapsed = performance.now() - start;
    console.log(`TransportManager: 10000 sends in ${elapsed.toFixed(1)}ms (${(elapsed/10000*1000).toFixed(1)}μs/send)`);
    expect(elapsed).toBeLessThan(8000);
  });
});
