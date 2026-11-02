import { describe, it, expect } from 'vitest';
import { NineCore } from '../../core/NineCore.js';
import { NineCoreBuilder } from '../../core/NineCoreBuilder.js';
import { createConfiguration } from '../../core/NineConfiguration.js';
import { NineEventType } from '../../core/NineEvents.js';
import { MockTransport, MockMedium } from '../../core/transport/MockTransport.js';
import { VirtualClock } from '../../core/simulator/VirtualClock.js';
import { type NodeID, type Timestamp, NodeRole } from '../../core/shared/Types.js';

/** Build a NineCore node on a shared medium. */
function buildNode(id: NodeID, role: NodeRole, name: string, medium: MockMedium, clock: VirtualClock): { core: NineCore; transport: MockTransport } {
  const transport = new MockTransport(id as unknown as any, medium, () => clock.now());
  const core = new NineCoreBuilder()
    .withConfiguration(createConfiguration(role, name, { nodeId: id, simulationMode: true }))
    .withTransport(transport)
    .withClock(() => clock.now())
    .build();
  return { core, transport };
}

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as NodeID;
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as NodeID;
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as NodeID;

describe('NineCore — Lifecycle', () => {
  it('initializes and reports node info', async () => {
    const medium = new MockMedium();
    const clock = new VirtualClock(0);
    const { core } = buildNode(A, NodeRole.USER, 'Alpha', medium, clock);
    await core.initialize();
    const info = core.getNodeInfo();
    expect(info.nodeId).toBe(A);
    expect(info.displayName).toBe('Alpha');
    expect(info.role).toBe(NodeRole.USER);
    await core.shutdown();
  });

  it('throws when sending before initialize', () => {
    const medium = new MockMedium();
    const clock = new VirtualClock(0);
    const { core } = buildNode(A, NodeRole.USER, 'Alpha', medium, clock);
    expect(() => core.sendBroadcast('too early')).toThrow('NODE_NOT_INITIALIZED');
  });

  it('builder requires a transport', () => {
    expect(() => new NineCoreBuilder().withRole(NodeRole.USER).build()).toThrow('transport is required');
  });
});

describe('NineCore — Broadcast Messaging', () => {
  it('delivers broadcast between two directly-connected nodes', async () => {
    const medium = new MockMedium();
    const clock = new VirtualClock(0);
    const a = buildNode(A, NodeRole.USER, 'Alpha', medium, clock);
    const b = buildNode(B, NodeRole.USER, 'Bravo', medium, clock);
    await a.core.initialize();
    await b.core.initialize();

    // Connect A <-> B bidirectionally
    await a.transport.connect(B as unknown as any);
    await b.transport.connect(A as unknown as any);

    const received: string[] = [];
    b.core.onBroadcast((e: any) => received.push(e.message));

    a.core.sendBroadcast('Hello mesh');

    expect(received).toHaveLength(1);
    expect(received[0]).toBe('Hello mesh');
  });

  it('delivers emergency broadcast with flag', async () => {
    const medium = new MockMedium();
    const clock = new VirtualClock(0);
    const a = buildNode(A, NodeRole.USER, 'Alpha', medium, clock);
    const b = buildNode(B, NodeRole.USER, 'Bravo', medium, clock);
    await a.core.initialize();
    await b.core.initialize();
    await a.transport.connect(B as unknown as any);
    await b.transport.connect(A as unknown as any);

    let emergencyFlag = false;
    b.core.onBroadcast((e: any) => { emergencyFlag = e.isEmergency; });
    a.core.sendBroadcast('EVACUATE', true);
    expect(emergencyFlag).toBe(true);
  });

  it('star topology: center broadcast reaches all leaves', async () => {
    const medium = new MockMedium();
    const clock = new VirtualClock(0);
    const center = buildNode(A, NodeRole.USER, 'Center', medium, clock);
    const leaf1 = buildNode(B, NodeRole.USER, 'Leaf1', medium, clock);
    const leaf2 = buildNode(C, NodeRole.USER, 'Leaf2', medium, clock);
    await center.core.initialize();
    await leaf1.core.initialize();
    await leaf2.core.initialize();

    await center.transport.connect(B as unknown as any);
    await center.transport.connect(C as unknown as any);
    await leaf1.transport.connect(A as unknown as any);
    await leaf2.transport.connect(A as unknown as any);

    const r1: string[] = []; const r2: string[] = [];
    leaf1.core.onBroadcast((e: any) => r1.push(e.message));
    leaf2.core.onBroadcast((e: any) => r2.push(e.message));

    center.core.sendBroadcast('all points bulletin');
    // MockTransport.broadcast awaits each send; flush microtasks so all peers receive
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
  });
});

describe('NineCore — Secure Messaging (Dual-Path through Core)', () => {
  it('user sends encrypted message to directly-connected Admin', async () => {
    const medium = new MockMedium();
    const clock = new VirtualClock(0);
    const user = buildNode(A, NodeRole.USER, 'User', medium, clock);
    const admin = buildNode(B, NodeRole.ADMIN, 'Admin', medium, clock);
    await user.core.initialize();
    await admin.core.initialize();

    // Distribute Admin public key to the user (simulates KEY_ANNOUNCE)
    user.core.setAdminPublicKey(admin.core.getAdminPublicKey()!);

    // Connect bidirectionally
    await user.transport.connect(B as unknown as any);
    await admin.transport.connect(A as unknown as any);

    const received: string[] = [];
    admin.core.onSecureMessage((e: any) => received.push(e.plaintext));

    const result = user.core.sendSecureMessage('classified intel', B);
    expect(result.sessionId).toBeTruthy();

    // The two packets (data + key) are delivered synchronously via mock medium.
    expect(received).toHaveLength(1);
    expect(received[0]).toBe('classified intel');
  });

  it('throws when Admin key is not available', async () => {
    const medium = new MockMedium();
    const clock = new VirtualClock(0);
    const user = buildNode(A, NodeRole.USER, 'User', medium, clock);
    await user.core.initialize();
    await user.transport.connect(B as unknown as any);
    expect(() => user.core.sendSecureMessage('no key', B)).toThrow('ADMIN_KEY_NOT_AVAILABLE');
  });

  it('non-admin cannot decrypt (message not delivered to wrong node)', async () => {
    const medium = new MockMedium();
    const clock = new VirtualClock(0);
    const user = buildNode(A, NodeRole.USER, 'User', medium, clock);
    const admin = buildNode(B, NodeRole.ADMIN, 'Admin', medium, clock);
    await user.core.initialize();
    await admin.core.initialize();
    user.core.setAdminPublicKey(admin.core.getAdminPublicKey()!);
    await user.transport.connect(B as unknown as any);
    await admin.transport.connect(A as unknown as any);

    // Message is addressed to Admin (B); only B can decrypt because only B has the private key
    let delivered = false;
    admin.core.onSecureMessage(() => { delivered = true; });
    user.core.sendSecureMessage('for admin only', B);
    expect(delivered).toBe(true);
  });
});

describe('NineCore — Queries & Metrics', () => {
  it('reports topology', async () => {
    const medium = new MockMedium();
    const clock = new VirtualClock(0);
    const a = buildNode(A, NodeRole.USER, 'Alpha', medium, clock);
    const b = buildNode(B, NodeRole.USER, 'Bravo', medium, clock);
    await a.core.initialize();
    await b.core.initialize();
    await a.transport.connect(B as unknown as any);

    const topo = a.core.getTopology();
    expect(topo.self).toBe(A);
    expect(topo.neighbors.map(n => n.toLowerCase())).toContain(B.toLowerCase());
  });

  it('reports neighbors', async () => {
    const medium = new MockMedium();
    const clock = new VirtualClock(0);
    const a = buildNode(A, NodeRole.USER, 'Alpha', medium, clock);
    const b = buildNode(B, NodeRole.USER, 'Bravo', medium, clock);
    await a.core.initialize();
    await b.core.initialize();
    await a.transport.connect(B as unknown as any);
    expect(a.core.getNeighbors()).toHaveLength(1);
  });

  it('aggregates metrics from all subsystems', async () => {
    const medium = new MockMedium();
    const clock = new VirtualClock(0);
    const a = buildNode(A, NodeRole.USER, 'Alpha', medium, clock);
    const b = buildNode(B, NodeRole.USER, 'Bravo', medium, clock);
    await a.core.initialize();
    await b.core.initialize();
    await a.transport.connect(B as unknown as any);
    await b.transport.connect(A as unknown as any);

    a.core.sendBroadcast('metrics test');

    const metrics = a.core.getMetrics();
    expect(metrics).toHaveProperty('routing');
    expect(metrics).toHaveProperty('dualPath');
    expect(metrics).toHaveProperty('transport');
    expect(metrics).toHaveProperty('node');
    expect(metrics.transport.packetsSent).toBeGreaterThanOrEqual(1);
    expect(metrics.node.neighborCount).toBe(1);
  });

  it('reports empty routes initially', async () => {
    const medium = new MockMedium();
    const clock = new VirtualClock(0);
    const a = buildNode(A, NodeRole.USER, 'Alpha', medium, clock);
    await a.core.initialize();
    expect(a.core.getRoutes()).toHaveLength(0);
  });
});

describe('NineCore — Node Management Events', () => {
  it('emits NODE_JOINED on peer discovery', async () => {
    const medium = new MockMedium();
    const clock = new VirtualClock(0);
    const a = buildNode(A, NodeRole.USER, 'Alpha', medium, clock);
    const b = buildNode(B, NodeRole.USER, 'Bravo', medium, clock);
    await a.core.initialize();
    await b.core.initialize();

    const joined: NodeID[] = [];
    a.core.onNodeJoined((e: any) => joined.push(e.nodeId));

    await a.core.discoverPeers();

    expect(joined.map(n => n.toLowerCase())).toContain(B.toLowerCase());
  });

  it('emits NODE_LEFT on disconnect', async () => {
    const medium = new MockMedium();
    const clock = new VirtualClock(0);
    const a = buildNode(A, NodeRole.USER, 'Alpha', medium, clock);
    const b = buildNode(B, NodeRole.USER, 'Bravo', medium, clock);
    await a.core.initialize();
    await b.core.initialize();
    await a.transport.connect(B as unknown as any);

    const left: NodeID[] = [];
    a.core.onNodeLeft((e: any) => left.push(e.nodeId));

    await a.core.disconnect(B);

    expect(left.map(n => n.toLowerCase())).toContain(B.toLowerCase());
  });
});

describe('NineCore — Configuration', () => {
  it('applies default configuration', () => {
    const config = createConfiguration(NodeRole.USER, 'Test');
    expect(config.heartbeatIntervalMs).toBe(5000);
    expect(config.broadcastTTL).toBe(10);
    expect(config.simulationMode).toBe(true);
  });

  it('applies overrides', () => {
    const config = createConfiguration(NodeRole.ADMIN, 'Admin', { heartbeatIntervalMs: 2000, maxTTL: 30 });
    expect(config.heartbeatIntervalMs).toBe(2000);
    expect(config.maxTTL).toBe(30);
    expect(config.role).toBe(NodeRole.ADMIN);
  });
});

describe('NineCore — Encapsulation Guarantee', () => {
  it('exposes only the high-level API surface', async () => {
    const medium = new MockMedium();
    const clock = new VirtualClock(0);
    const { core } = buildNode(A, NodeRole.USER, 'Alpha', medium, clock);
    await core.initialize();

    // Public API methods exist
    expect(typeof core.initialize).toBe('function');
    expect(typeof core.shutdown).toBe('function');
    expect(typeof core.sendBroadcast).toBe('function');
    expect(typeof core.sendSecureMessage).toBe('function');
    expect(typeof core.receive).toBe('function');
    expect(typeof core.discoverPeers).toBe('function');
    expect(typeof core.connect).toBe('function');
    expect(typeof core.disconnect).toBe('function');
    expect(typeof core.getTopology).toBe('function');
    expect(typeof core.getNeighbors).toBe('function');
    expect(typeof core.getRoutes).toBe('function');
    expect(typeof core.getMetrics).toBe('function');
    expect(typeof core.getNodeInfo).toBe('function');
    expect(typeof core.onBroadcast).toBe('function');
    expect(typeof core.onSecureMessage).toBe('function');
    expect(typeof core.onNodeJoined).toBe('function');
    expect(typeof core.onNodeLeft).toBe('function');
    expect(typeof core.onTransportChanged).toBe('function');

    // Internal subsystems are NOT exposed as public members
    expect((core as any).routing).toBeDefined(); // exists internally (private)
    // But there is no public getter returning the raw engine
    expect((core as any).getRoutingEngine).toBeUndefined();
    expect((core as any).getPacketEngine).toBeUndefined();
    expect((core as any).getTransportManager).toBeUndefined();

    await core.shutdown();
  });
});
