/**
 * Phase 9.2 — BluetoothTransport Skeleton Unit Tests
 *
 * Verifies: construction, initial state, lifecycle transitions, invalid
 * state transitions, interface compliance (all ITransport methods exist
 * and behave correctly at the skeleton level), resource cleanup, and the
 * PeerIdMapper data structure.
 *
 * No Android hardware required — IBluetoothAdapter is mocked.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BluetoothTransport, type IBluetoothAdapter, BLUETOOTH_CAPABILITIES } from '../../core/transport/BluetoothTransport.js';
import { PeerIdMapper } from '../../core/transport/PeerIdMapper.js';
import { BluetoothLink, type IBluetoothSocket, LinkState } from '../../core/transport/BluetoothLink.js';
import { BluetoothAcceptLoop, type IBluetoothServerSocket } from '../../core/transport/BluetoothAcceptLoop.js';
import { TransportState, ConnectionState } from '../../core/transport/TransportState.js';
import { TransportEventType, type TransportEvent } from '../../core/transport/TransportEvents.js';
import { type PeerID, type NodeID } from '../../core/shared/Types.js';

// ─── Mock Bluetooth Socket ──────────────────────────────────────────────

function createMockSocket(remoteAddress: string, opts?: { failConnect?: boolean; connectDelayMs?: number; failWrite?: boolean }): IBluetoothSocket {
  let connected = false;
  return {
    remoteAddress,
    async connect() {
      if (opts?.connectDelayMs) await new Promise(r => setTimeout(r, opts.connectDelayMs));
      if (opts?.failConnect) throw new Error('RFCOMM connect failed');
      connected = true;
    },
    close() { connected = false; },
    isConnected() { return connected; },
    async write(data: Buffer) {
      if (!connected) throw new Error('Socket not connected');
      if (opts?.failWrite) throw new Error('RFCOMM write failed');
    },
    async read(_size: number): Promise<Buffer> {
      // Default mock: block forever (simulate idle socket waiting for data)
      return new Promise<Buffer>(() => {}); // never resolves — link read loop blocks here
    },
  };
}

function createMockServerSocket(sockets: IBluetoothSocket[] = []): IBluetoothServerSocket {
  let idx = 0;
  let closed = false;
  return {
    async accept() {
      if (closed) throw new Error('Server socket closed');
      if (idx < sockets.length) return sockets[idx++]!;
      // Block forever (simulate waiting) until closed
      return new Promise<IBluetoothSocket>((_, reject) => {
        const check = setInterval(() => { if (closed) { clearInterval(check); reject(new Error('closed')); } }, 10);
      });
    },
    close() { closed = true; },
  };
}

// ─── Mock Bluetooth Adapter ─────────────────────────────────────────────

function createMockAdapter(enabled = true, opts?: { socketOpts?: Parameters<typeof createMockSocket>[1] }): IBluetoothAdapter {
  return {
    isEnabled: () => enabled,
    startDiscovery: () => enabled,
    cancelDiscovery: () => {},
    requestDiscoverable: () => {},
    createServerSocket: () => createMockServerSocket(),
    createSocket: (_peerId: PeerID) => createMockSocket(_peerId as unknown as string, opts?.socketOpts),
  };
}

const PEER_A = 'AA:BB:CC:DD:EE:FF' as unknown as PeerID;
const PEER_B = '11:22:33:44:55:66' as unknown as PeerID;
const NODE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as NodeID;
const NODE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as NodeID;

// ─── PeerIdMapper Tests ─────────────────────────────────────────────────

describe('PeerIdMapper', () => {
  let mapper: PeerIdMapper;
  beforeEach(() => { mapper = new PeerIdMapper(); });

  it('starts empty', () => {
    expect(mapper.size()).toBe(0);
    expect(mapper.getNodeId(PEER_A)).toBeUndefined();
    expect(mapper.getPeerId(NODE_A)).toBeUndefined();
  });

  it('registers and retrieves a bidirectional mapping', () => {
    mapper.register(PEER_A, NODE_A);
    expect(mapper.getNodeId(PEER_A)).toBe(NODE_A);
    expect(mapper.getPeerId(NODE_A)).toBe(PEER_A);
    expect(mapper.size()).toBe(1);
  });

  it('is case-insensitive for lookups', () => {
    mapper.register(PEER_A, NODE_A);
    expect(mapper.getNodeId(PEER_A.toUpperCase() as unknown as PeerID)).toBe(NODE_A);
    expect(mapper.hasPeerId(PEER_A.toLowerCase() as unknown as PeerID)).toBe(true);
  });

  it('removes by PeerID and cleans both directions', () => {
    mapper.register(PEER_A, NODE_A);
    mapper.removeByPeerId(PEER_A);
    expect(mapper.getNodeId(PEER_A)).toBeUndefined();
    expect(mapper.getPeerId(NODE_A)).toBeUndefined();
    expect(mapper.size()).toBe(0);
  });

  it('removes by NodeID and cleans both directions', () => {
    mapper.register(PEER_A, NODE_A);
    mapper.removeByNodeId(NODE_A);
    expect(mapper.getNodeId(PEER_A)).toBeUndefined();
    expect(mapper.getPeerId(NODE_A)).toBeUndefined();
  });

  it('supports multiple independent mappings', () => {
    mapper.register(PEER_A, NODE_A);
    mapper.register(PEER_B, NODE_B);
    expect(mapper.size()).toBe(2);
    expect(mapper.getNodeId(PEER_B)).toBe(NODE_B);
    mapper.removeByPeerId(PEER_A);
    expect(mapper.size()).toBe(1);
    expect(mapper.getNodeId(PEER_B)).toBe(NODE_B);
  });

  it('clear removes all mappings', () => {
    mapper.register(PEER_A, NODE_A);
    mapper.register(PEER_B, NODE_B);
    mapper.clear();
    expect(mapper.size()).toBe(0);
  });
});

// ─── BluetoothTransport Construction & State ────────────────────────────

describe('BluetoothTransport — Construction', () => {
  it('starts in UNINITIALIZED state', () => {
    const bt = new BluetoothTransport(createMockAdapter());
    expect(bt.state).toBe(TransportState.UNINITIALIZED);
  });

  it('exposes correct type and capabilities', () => {
    const bt = new BluetoothTransport(createMockAdapter());
    expect(bt.type).toBe('bluetooth_classic');
    expect(bt.capabilities).toEqual(BLUETOOTH_CAPABILITIES);
    expect(bt.capabilities.maxConnections).toBe(7);
    expect(bt.capabilities.maxPayloadSize).toBe(4096);
  });

  it('initial metrics are all zero', () => {
    const bt = new BluetoothTransport(createMockAdapter());
    const m = bt.getMetrics();
    expect(m.bytesSent).toBe(0);
    expect(m.packetsSent).toBe(0);
    expect(m.connectionsEstablished).toBe(0);
  });

  it('starts with no connections', () => {
    const bt = new BluetoothTransport(createMockAdapter());
    expect(bt.getConnections()).toEqual([]);
  });
});

// ─── Lifecycle Transitions ──────────────────────────────────────────────

describe('BluetoothTransport — Lifecycle', () => {
  it('initialize transitions UNINITIALIZED → READY when adapter is enabled', async () => {
    const bt = new BluetoothTransport(createMockAdapter(true));
    await bt.initialize();
    expect(bt.state).toBe(TransportState.READY);
  });

  it('initialize transitions to ERROR when adapter is disabled', async () => {
    const bt = new BluetoothTransport(createMockAdapter(false));
    await expect(bt.initialize()).rejects.toThrow('BLUETOOTH_DISABLED');
    expect(bt.state).toBe(TransportState.ERROR);
  });

  it('shutdown transitions to SHUTDOWN from READY', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.shutdown();
    expect(bt.state).toBe(TransportState.SHUTDOWN);
  });

  it('shutdown clears all connections and the peer mapper', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.connect(PEER_A);
    bt.peerIdMapper.register(PEER_A, NODE_A);
    expect(bt.getConnections().length).toBe(1);
    await bt.shutdown();
    expect(bt.getConnections().length).toBe(0);
    expect(bt.peerIdMapper.size()).toBe(0);
  });

  it('double initialize throws (READY → INITIALIZING is invalid)', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await expect(bt.initialize()).rejects.toThrow(/Invalid transport state/);
  });

  it('operations throw when not operational (UNINITIALIZED)', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await expect(bt.startDiscovery()).rejects.toThrow('TRANSPORT_NOT_OPERATIONAL');
    await expect(bt.connect(PEER_A)).rejects.toThrow('TRANSPORT_NOT_OPERATIONAL');
  });

  it('operations throw when SHUTDOWN', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.shutdown();
    await expect(bt.startDiscovery()).rejects.toThrow(/Invalid transport state|TRANSPORT_NOT_OPERATIONAL/);
  });
});

// ─── Discovery & Advertising ────────────────────────────────────────────

describe('BluetoothTransport — Discovery', () => {
  it('startDiscovery transitions READY → DISCOVERING', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.startDiscovery();
    expect(bt.state).toBe(TransportState.DISCOVERING);
  });

  it('stopDiscovery transitions back to READY', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.startDiscovery();
    await bt.stopDiscovery();
    expect(bt.state).toBe(TransportState.READY);
  });

  it('startDiscovery throws if adapter fails to start', async () => {
    const adapter = createMockAdapter(true);
    adapter.startDiscovery = () => false;
    const bt = new BluetoothTransport(adapter);
    await bt.initialize();
    await expect(bt.startDiscovery()).rejects.toThrow('DISCOVERY_FAILED');
    expect(bt.state).toBe(TransportState.READY); // reverted
  });

  it('advertise transitions READY → ADVERTISING', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.advertise(30000);
    expect(bt.state).toBe(TransportState.ADVERTISING);
  });
});

// ─── Connection Management ──────────────────────────────────────────────

describe('BluetoothTransport — Connections', () => {
  it('connect registers a peer and emits CONNECTION_ESTABLISHED', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    const events: TransportEvent[] = [];
    bt.on(TransportEventType.CONNECTION_ESTABLISHED, (e) => events.push(e));

    const conn = await bt.connect(PEER_A);
    expect(conn.peerId).toBe(PEER_A);
    expect(conn.state).toBe(ConnectionState.CONNECTED);
    expect(conn.transportType).toBe('bluetooth_classic');
    expect(bt.isConnected(PEER_A)).toBe(true);
    expect(bt.getConnections().length).toBe(1);
    expect(events.length).toBe(1);
  });

  it('disconnect removes peer and emits CONNECTION_LOST', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.connect(PEER_A);
    const events: TransportEvent[] = [];
    bt.on(TransportEventType.CONNECTION_LOST, (e) => events.push(e));

    await bt.disconnect(PEER_A);
    expect(bt.isConnected(PEER_A)).toBe(false);
    expect(bt.getConnections().length).toBe(0);
    expect(events.length).toBe(1);
  });

  it('disconnect on unknown peer is a no-op', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.disconnect(PEER_A); // should not throw
    expect(bt.getConnections().length).toBe(0);
  });

  it('getConnection returns the correct peer or undefined', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    expect(bt.getConnection(PEER_A)).toBeUndefined();
    await bt.connect(PEER_A);
    expect(bt.getConnection(PEER_A)).toBeDefined();
    expect(bt.getConnection(PEER_A)!.peerId).toBe(PEER_A);
  });
});

// ─── Data Transfer (skeleton) ───────────────────────────────────────────

describe('BluetoothTransport — Send/Broadcast (skeleton)', () => {
  it('send returns success for connected peer (skeleton behavior)', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.connect(PEER_A);
    const result = await bt.send(PEER_A, Buffer.from('hello'));
    expect(result.success).toBe(true);
    expect(result.bytesSent).toBe(5);
  });

  it('send returns failure for unconnected peer', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    const events: TransportEvent[] = [];
    bt.on(TransportEventType.SEND_FAILED, (e) => events.push(e));
    const result = await bt.send(PEER_A, Buffer.from('fail'));
    expect(result.success).toBe(false);
    expect(result.error).toBe('not_connected');
    expect(events.length).toBe(1);
  });

  it('broadcast sends to all connected peers', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.connect(PEER_A);
    await bt.connect(PEER_B);
    const count = await bt.broadcast(Buffer.from('all'));
    expect(count).toBe(2);
  });

  it('metrics track send operations', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.connect(PEER_A);
    await bt.send(PEER_A, Buffer.alloc(100));
    await bt.send(PEER_A, Buffer.alloc(50));
    const m = bt.getMetrics();
    expect(m.packetsSent).toBe(2);
    expect(m.bytesSent).toBe(150);
  });

  it('metrics track send failures', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.send(PEER_A, Buffer.from('x')); // not connected
    expect(bt.getMetrics().sendFailures).toBe(1);
  });
});

// ─── Events ─────────────────────────────────────────────────────────────

describe('BluetoothTransport — Events', () => {
  it('on/off subscribe and unsubscribe handlers', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    const events: TransportEvent[] = [];
    const handler = (e: TransportEvent) => events.push(e);
    bt.on(TransportEventType.CONNECTION_ESTABLISHED, handler);
    await bt.connect(PEER_A);
    expect(events.length).toBe(1);
    bt.off(TransportEventType.CONNECTION_ESTABLISHED, handler);
    await bt.connect(PEER_B);
    expect(events.length).toBe(1); // handler removed, no new event
  });

  it('shutdown emits CONNECTION_LOST for all connected peers', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.connect(PEER_A);
    await bt.connect(PEER_B);
    const events: TransportEvent[] = [];
    bt.on(TransportEventType.CONNECTION_LOST, (e) => events.push(e));
    await bt.shutdown();
    expect(events.length).toBe(2);
  });
});

// ─── Interface Compliance ───────────────────────────────────────────────

describe('BluetoothTransport — Interface Compliance', () => {
  it('implements every ITransport method', () => {
    const bt = new BluetoothTransport(createMockAdapter());
    // All ITransport methods must exist and be functions
    expect(typeof bt.initialize).toBe('function');
    expect(typeof bt.shutdown).toBe('function');
    expect(typeof bt.startDiscovery).toBe('function');
    expect(typeof bt.stopDiscovery).toBe('function');
    expect(typeof bt.advertise).toBe('function');
    expect(typeof bt.connect).toBe('function');
    expect(typeof bt.disconnect).toBe('function');
    expect(typeof bt.getConnections).toBe('function');
    expect(typeof bt.getConnection).toBe('function');
    expect(typeof bt.isConnected).toBe('function');
    expect(typeof bt.send).toBe('function');
    expect(typeof bt.broadcast).toBe('function');
    expect(typeof bt.on).toBe('function');
    expect(typeof bt.off).toBe('function');
    expect(typeof bt.getMetrics).toBe('function');
    // Readonly properties
    expect(bt.type).toBeDefined();
    expect(bt.capabilities).toBeDefined();
    expect(bt.state).toBeDefined();
  });
});


// ═══════════════════════════════════════════════════════════════════════
// PHASE 9.3 — Connection Management Tests
// ═══════════════════════════════════════════════════════════════════════

// ─── BluetoothLink ──────────────────────────────────────────────────────

describe('BluetoothLink — Lifecycle', () => {
  it('starts in IDLE state', () => {
    const socket = createMockSocket('AA:BB:CC:DD:EE:FF');
    const link = new BluetoothLink(socket, PEER_A, true);
    expect(link.state).toBe(LinkState.IDLE);
    expect(link.peerId).toBe(PEER_A);
    expect(link.initiatedByUs).toBe(true);
  });

  it('transitions IDLE → CONNECTING → CONNECTED on successful connect', async () => {
    const socket = createMockSocket('AA:BB:CC:DD:EE:FF');
    const link = new BluetoothLink(socket, PEER_A, true);
    await link.connect();
    expect(link.state).toBe(LinkState.CONNECTED);
    expect(link.isAlive()).toBe(true);
  });

  it('transitions IDLE → CONNECTING → FAILED on connect failure', async () => {
    const socket = createMockSocket('AA:BB:CC:DD:EE:FF', { failConnect: true });
    const link = new BluetoothLink(socket, PEER_A, true);
    await expect(link.connect()).rejects.toThrow('RFCOMM connect failed');
    expect(link.state).toBe(LinkState.FAILED);
    expect(link.isAlive()).toBe(false);
  });

  it('cannot connect twice', async () => {
    const socket = createMockSocket('AA:BB:CC:DD:EE:FF');
    const link = new BluetoothLink(socket, PEER_A, true);
    await link.connect();
    await expect(link.connect()).rejects.toThrow(/Cannot connect/);
  });

  it('close transitions to CLOSED and marks link dead', async () => {
    const socket = createMockSocket('AA:BB:CC:DD:EE:FF');
    const link = new BluetoothLink(socket, PEER_A, true);
    await link.connect();
    link.close();
    expect(link.state).toBe(LinkState.CLOSED);
    expect(link.isAlive()).toBe(false);
  });

  it('close is idempotent (calling twice does not throw)', async () => {
    const socket = createMockSocket('AA:BB:CC:DD:EE:FF');
    const link = new BluetoothLink(socket, PEER_A, true);
    await link.connect();
    link.close();
    link.close(); // second call — should not throw
    expect(link.state).toBe(LinkState.CLOSED);
  });

  it('close from IDLE state works (never connected)', () => {
    const socket = createMockSocket('AA:BB:CC:DD:EE:FF');
    const link = new BluetoothLink(socket, PEER_A, false);
    link.close();
    expect(link.state).toBe(LinkState.CLOSED);
  });
});

// ─── BluetoothAcceptLoop ────────────────────────────────────────────────

describe('BluetoothAcceptLoop', () => {
  it('accepts connections and calls onAccepted', async () => {
    const s1 = createMockSocket('11:11:11:11:11:11');
    const s2 = createMockSocket('22:22:22:22:22:22');
    const serverSocket = createMockServerSocket([s1, s2]);
    const accepted: IBluetoothSocket[] = [];
    const loop = new BluetoothAcceptLoop(serverSocket, (s) => accepted.push(s));
    
    // Start the loop — it will process both sockets then block
    const loopPromise = loop.start();
    // Give it time to process
    await new Promise(r => setTimeout(r, 50));
    loop.cancel();
    await loopPromise;

    expect(accepted.length).toBe(2);
    expect(accepted[0]!.remoteAddress).toBe('11:11:11:11:11:11');
    expect(accepted[1]!.remoteAddress).toBe('22:22:22:22:22:22');
  });

  it('cancel stops the loop', async () => {
    const serverSocket = createMockServerSocket([]); // no sockets, will block
    const loop = new BluetoothAcceptLoop(serverSocket, () => {});
    const loopPromise = loop.start();
    expect(loop.running).toBe(true);
    loop.cancel();
    await loopPromise;
    expect(loop.running).toBe(false);
  });

  it('start is idempotent (second call is a no-op)', async () => {
    const serverSocket = createMockServerSocket([]);
    const loop = new BluetoothAcceptLoop(serverSocket, () => {});
    const p1 = loop.start();
    const p2 = loop.start(); // should be immediate no-op
    loop.cancel();
    await p1;
    await p2;
  });
});

// ─── BluetoothTransport — Connection Management (Phase 9.3) ────────────

describe('BluetoothTransport — Connection Management (Phase 9.3)', () => {
  it('connect creates a link and registers the connection', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    const conn = await bt.connect(PEER_A);
    expect(conn.state).toBe(ConnectionState.CONNECTED);
    expect(bt.isConnected(PEER_A)).toBe(true);
    expect(bt.getLink(PEER_A)).toBeDefined();
    expect(bt.getLink(PEER_A)!.state).toBe(LinkState.CONNECTED);
    await bt.shutdown();
  });

  it('connect fails gracefully when socket.connect() throws', async () => {
    const bt = new BluetoothTransport(createMockAdapter(true, { socketOpts: { failConnect: true } }));
    await bt.initialize();
    await expect(bt.connect(PEER_A)).rejects.toThrow('CONNECTION_FAILED');
    expect(bt.isConnected(PEER_A)).toBe(false);
    expect(bt.getLink(PEER_A)).toBeUndefined();
    await bt.shutdown();
  });

  it('connect rejects duplicate connections to the same peer', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.connect(PEER_A);
    await expect(bt.connect(PEER_A)).rejects.toThrow('ALREADY_CONNECTED');
    await bt.shutdown();
  });

  it('connect times out after the configured timeout', async () => {
    // Use a socket that delays connection beyond the timeout
    const adapter = createMockAdapter(true, { socketOpts: { connectDelayMs: 200 } });
    const bt = new BluetoothTransport(adapter, { connectTimeoutMs: 50 });
    await bt.initialize();
    await expect(bt.connect(PEER_A)).rejects.toThrow('CONNECTION_FAILED');
    expect(bt.isConnected(PEER_A)).toBe(false);
    await bt.shutdown();
  });

  it('disconnect closes the link and removes the connection', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.connect(PEER_A);
    await bt.disconnect(PEER_A);
    expect(bt.isConnected(PEER_A)).toBe(false);
    expect(bt.getLink(PEER_A)).toBeUndefined();
    expect(bt.getMetrics().connectionsLost).toBe(1);
    await bt.shutdown();
  });

  it('disconnect on unknown peer is a no-op (does not throw)', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.disconnect(PEER_A);
    expect(bt.getMetrics().connectionsLost).toBe(0);
    await bt.shutdown();
  });

  it('shutdown closes all links and cancels the accept loop', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.connect(PEER_A);
    await bt.connect(PEER_B);
    expect(bt.getConnections().length).toBe(2);
    await bt.shutdown();
    expect(bt.getConnections().length).toBe(0);
    expect(bt.state).toBe(TransportState.SHUTDOWN);
  });

  it('accepted inbound connections are registered automatically', async () => {
    // Create a server socket that immediately yields one accepted socket
    const inboundSocket = createMockSocket('99:88:77:66:55:44');
    (inboundSocket as any)._connected = true; // already connected via accept()
    // Override isConnected for accepted sockets
    const origIsConnected = inboundSocket.isConnected;
    (inboundSocket as any).isConnected = () => true;

    const adapter = createMockAdapter();
    adapter.createServerSocket = () => createMockServerSocket([inboundSocket]);
    const bt = new BluetoothTransport(adapter);
    const events: TransportEvent[] = [];
    bt.on(TransportEventType.CONNECTION_ESTABLISHED, (e) => events.push(e));

    await bt.initialize();
    // Give the accept loop time to process
    await new Promise(r => setTimeout(r, 50));

    expect(bt.isConnected('99:88:77:66:55:44' as unknown as PeerID)).toBe(true);
    expect(events.length).toBe(1);
    await bt.shutdown();
  });

  it('duplicate inbound connections from same address are rejected', async () => {
    const s1 = createMockSocket('99:88:77:66:55:44');
    const s2 = createMockSocket('99:88:77:66:55:44');

    const adapter = createMockAdapter();
    adapter.createServerSocket = () => createMockServerSocket([s1, s2]);
    const bt = new BluetoothTransport(adapter);
    await bt.initialize();
    await new Promise(r => setTimeout(r, 50));

    // Only one connection should be registered (duplicate closed)
    expect(bt.getConnections().length).toBe(1);
    await bt.shutdown();
  });
});


// ═══════════════════════════════════════════════════════════════════════
// PHASE 9.4 — Discovery & Advertisement Tests
// ═══════════════════════════════════════════════════════════════════════

import { BluetoothDiscoveryManager } from '../../core/transport/BluetoothDiscovery.js';

// ─── BluetoothDiscoveryManager (unit) ───────────────────────────────────

describe('BluetoothDiscoveryManager', () => {
  it('starts inactive with zero discovered peers', () => {
    const mgr = new BluetoothDiscoveryManager({ onPeerDiscovered: () => {}, onFinished: () => {} });
    expect(mgr.active).toBe(false);
    expect(mgr.discoveredCount).toBe(0);
  });

  it('start activates the manager and clears previous results', () => {
    const mgr = new BluetoothDiscoveryManager({ onPeerDiscovered: () => {}, onFinished: () => {}, timeoutMs: 5000 });
    mgr.reportDeviceFound(PEER_A); // before start — ignored
    mgr.start();
    expect(mgr.active).toBe(true);
    expect(mgr.discoveredCount).toBe(0); // previous cleared
  });

  it('reportDeviceFound calls onPeerDiscovered for new peers', () => {
    const found: PeerID[] = [];
    const mgr = new BluetoothDiscoveryManager({ onPeerDiscovered: (p) => found.push(p.peerId), onFinished: () => {}, timeoutMs: 5000 });
    mgr.start();
    mgr.reportDeviceFound(PEER_A, 'DeviceA');
    mgr.reportDeviceFound(PEER_B, 'DeviceB');
    expect(found).toEqual([PEER_A, PEER_B]);
    expect(mgr.discoveredCount).toBe(2);
  });

  it('suppresses duplicate discoveries (same peerId)', () => {
    const found: PeerID[] = [];
    const mgr = new BluetoothDiscoveryManager({ onPeerDiscovered: (p) => found.push(p.peerId), onFinished: () => {}, timeoutMs: 5000 });
    mgr.start();
    mgr.reportDeviceFound(PEER_A, 'DeviceA');
    mgr.reportDeviceFound(PEER_A, 'DeviceA-again'); // duplicate
    mgr.reportDeviceFound(PEER_A, 'DeviceA-third'); // duplicate
    expect(found.length).toBe(1);
    expect(mgr.discoveredCount).toBe(1);
  });

  it('ignores reports when not active', () => {
    const found: PeerID[] = [];
    const mgr = new BluetoothDiscoveryManager({ onPeerDiscovered: (p) => found.push(p.peerId), onFinished: () => {} });
    mgr.reportDeviceFound(PEER_A); // not started
    expect(found.length).toBe(0);
  });

  it('stop deactivates and prevents further reports', () => {
    const found: PeerID[] = [];
    const mgr = new BluetoothDiscoveryManager({ onPeerDiscovered: (p) => found.push(p.peerId), onFinished: () => {}, timeoutMs: 5000 });
    mgr.start();
    mgr.reportDeviceFound(PEER_A);
    mgr.stop();
    mgr.reportDeviceFound(PEER_B); // after stop — ignored
    expect(found.length).toBe(1);
    expect(mgr.active).toBe(false);
  });

  it('reportDiscoveryFinished triggers onFinished and deactivates', () => {
    let finished = false;
    const mgr = new BluetoothDiscoveryManager({ onPeerDiscovered: () => {}, onFinished: () => { finished = true; }, timeoutMs: 5000 });
    mgr.start();
    mgr.reportDiscoveryFinished();
    expect(finished).toBe(true);
    expect(mgr.active).toBe(false);
  });

  it('auto-finishes after timeout', async () => {
    let finished = false;
    const mgr = new BluetoothDiscoveryManager({ onPeerDiscovered: () => {}, onFinished: () => { finished = true; }, timeoutMs: 50 });
    mgr.start();
    expect(mgr.active).toBe(true);
    await new Promise(r => setTimeout(r, 80));
    expect(finished).toBe(true);
    expect(mgr.active).toBe(false);
  });

  it('hasDiscovered checks by peerId', () => {
    const mgr = new BluetoothDiscoveryManager({ onPeerDiscovered: () => {}, onFinished: () => {}, timeoutMs: 5000 });
    mgr.start();
    mgr.reportDeviceFound(PEER_A);
    expect(mgr.hasDiscovered(PEER_A)).toBe(true);
    expect(mgr.hasDiscovered(PEER_B)).toBe(false);
  });

  it('clear resets all state', () => {
    const mgr = new BluetoothDiscoveryManager({ onPeerDiscovered: () => {}, onFinished: () => {}, timeoutMs: 5000 });
    mgr.start();
    mgr.reportDeviceFound(PEER_A);
    mgr.clear();
    expect(mgr.active).toBe(false);
    expect(mgr.discoveredCount).toBe(0);
  });
});

// ─── BluetoothTransport — Discovery Integration (Phase 9.4) ────────────

describe('BluetoothTransport — Discovery (Phase 9.4)', () => {
  it('startDiscovery emits PEER_DISCOVERED events when devices are reported', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    const events: TransportEvent[] = [];
    bt.on(TransportEventType.PEER_DISCOVERED, (e) => events.push(e));

    await bt.startDiscovery();
    bt.reportDeviceFound(PEER_A, 'Alpha');
    bt.reportDeviceFound(PEER_B, 'Bravo');

    expect(events.length).toBe(2);
    expect((events[0] as any).peerId).toBe(PEER_A);
    expect((events[0] as any).displayName).toBe('Alpha');
    expect((events[1] as any).peerId).toBe(PEER_B);
    await bt.shutdown();
  });

  it('duplicate devices are suppressed (only one event per peer per scan)', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    const events: TransportEvent[] = [];
    bt.on(TransportEventType.PEER_DISCOVERED, (e) => events.push(e));

    await bt.startDiscovery();
    bt.reportDeviceFound(PEER_A, 'Alpha');
    bt.reportDeviceFound(PEER_A, 'Alpha-dup');
    bt.reportDeviceFound(PEER_A, 'Alpha-dup-2');

    expect(events.length).toBe(1);
    await bt.shutdown();
  });

  it('stopDiscovery stops the scan and transitions to READY', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.startDiscovery();
    expect(bt.state).toBe(TransportState.DISCOVERING);
    await bt.stopDiscovery();
    expect(bt.state).toBe(TransportState.READY);

    // Subsequent reports are ignored
    const events: TransportEvent[] = [];
    bt.on(TransportEventType.PEER_DISCOVERED, (e) => events.push(e));
    bt.reportDeviceFound(PEER_A);
    expect(events.length).toBe(0);
    await bt.shutdown();
  });

  it('discovery times out and auto-transitions back to READY', async () => {
    const bt = new BluetoothTransport(createMockAdapter(), { discoveryTimeoutMs: 50 });
    await bt.initialize();
    await bt.startDiscovery();
    expect(bt.state).toBe(TransportState.DISCOVERING);
    await new Promise(r => setTimeout(r, 80));
    expect(bt.state).toBe(TransportState.READY);
    await bt.shutdown();
  });

  it('reportDiscoveryFinished transitions back to READY', async () => {
    const bt = new BluetoothTransport(createMockAdapter(), { discoveryTimeoutMs: 5000 });
    await bt.initialize();
    await bt.startDiscovery();
    bt.reportDiscoveryFinished();
    expect(bt.state).toBe(TransportState.READY);
    await bt.shutdown();
  });

  it('startDiscovery throws when adapter.startDiscovery fails', async () => {
    const adapter = createMockAdapter(true);
    adapter.startDiscovery = () => false;
    const bt = new BluetoothTransport(adapter);
    await bt.initialize();
    await expect(bt.startDiscovery()).rejects.toThrow('DISCOVERY_FAILED');
    expect(bt.state).toBe(TransportState.READY);
    await bt.shutdown();
  });

  it('metrics track discovered peers', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.startDiscovery();
    bt.reportDeviceFound(PEER_A);
    bt.reportDeviceFound(PEER_B);
    expect(bt.getMetrics().peersDiscovered).toBe(2);
    await bt.shutdown();
  });

  it('getDiscoveredPeers returns the current scan results', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.startDiscovery();
    bt.reportDeviceFound(PEER_A, 'Alpha');
    const peers = bt.getDiscoveredPeers();
    expect(peers.length).toBe(1);
    expect(peers[0]!.peerId).toBe(PEER_A);
    expect(peers[0]!.displayName).toBe('Alpha');
    await bt.shutdown();
  });

  it('shutdown cleans up discovery state', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.startDiscovery();
    bt.reportDeviceFound(PEER_A);
    await bt.shutdown();
    expect(bt.getDiscoveredPeers().length).toBe(0);
  });
});

// ─── BluetoothTransport — Advertisement (Phase 9.4) ─────────────────────

describe('BluetoothTransport — Advertisement (Phase 9.4)', () => {
  it('advertise transitions to ADVERTISING and back to READY after duration', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.advertise(50);
    expect(bt.state).toBe(TransportState.ADVERTISING);
    await new Promise(r => setTimeout(r, 80));
    expect(bt.state).toBe(TransportState.READY);
    await bt.shutdown();
  });

  it('advertise calls adapter.requestDiscoverable with the correct duration', async () => {
    let requestedDuration = 0;
    const adapter = createMockAdapter();
    adapter.requestDiscoverable = (ms: number) => { requestedDuration = ms; };
    const bt = new BluetoothTransport(adapter);
    await bt.initialize();
    await bt.advertise(30000);
    expect(requestedDuration).toBe(30000);
    await bt.shutdown();
  });

  it('shutdown cancels a pending advertise timer', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.advertise(5000); // long duration
    expect(bt.state).toBe(TransportState.ADVERTISING);
    await bt.shutdown(); // should not leave a dangling timer
    expect(bt.state).toBe(TransportState.SHUTDOWN);
  });
});


// ═══════════════════════════════════════════════════════════════════════
// PHASE 9.5 — Connection Policy Tests
// ═══════════════════════════════════════════════════════════════════════

import { ConnectionPolicy } from '../../core/transport/ConnectionPolicy.js';

const PEER_C = '33:33:33:33:33:33' as unknown as PeerID;
const PEER_D = '44:44:44:44:44:44' as unknown as PeerID;
const PEER_E = '55:55:55:55:55:55' as unknown as PeerID;
const PEER_F = '66:66:66:66:66:66' as unknown as PeerID;
const PEER_G = '77:77:77:77:77:77' as unknown as PeerID;
const PEER_H = '88:88:88:88:88:88' as unknown as PeerID;

// ─── ConnectionPolicy (unit) ────────────────────────────────────────────

describe('ConnectionPolicy — Basics', () => {
  it('allows connection when under max and no failure history', () => {
    const policy = new ConnectionPolicy({ maxConnections: 3 });
    expect(policy.shouldConnect(PEER_A)).toEqual({ allowed: true });
  });

  it('denies connection when at max capacity', () => {
    const policy = new ConnectionPolicy({ maxConnections: 2 });
    policy.recordConnected(PEER_A);
    policy.recordConnected(PEER_B);
    const result = policy.shouldConnect(PEER_C);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('MAX_CONNECTIONS_REACHED');
  });

  it('frees a slot after disconnect', () => {
    const policy = new ConnectionPolicy({ maxConnections: 2 });
    policy.recordConnected(PEER_A);
    policy.recordConnected(PEER_B);
    policy.recordDisconnected(PEER_A);
    expect(policy.shouldConnect(PEER_C).allowed).toBe(true);
  });

  it('activeCount tracks connections correctly', () => {
    const policy = new ConnectionPolicy();
    expect(policy.activeCount).toBe(0);
    policy.recordConnected(PEER_A);
    policy.recordConnected(PEER_B);
    expect(policy.activeCount).toBe(2);
    policy.recordDisconnected(PEER_A);
    expect(policy.activeCount).toBe(1);
  });
});

describe('ConnectionPolicy — Backoff', () => {
  it('denies connection during backoff after a failure', () => {
    const policy = new ConnectionPolicy({ baseBackoffMs: 1000, maxBackoffMs: 10000 });
    const now = 10000;
    policy.recordFailure(PEER_A, now);
    // Within backoff window (1000ms after failure)
    const result = policy.shouldConnect(PEER_A, now + 500);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('BACKOFF_ACTIVE');
  });

  it('allows connection after backoff period expires', () => {
    const policy = new ConnectionPolicy({ baseBackoffMs: 1000, maxBackoffMs: 10000 });
    const now = 10000;
    policy.recordFailure(PEER_A, now);
    // After backoff window (1000ms)
    expect(policy.shouldConnect(PEER_A, now + 1100).allowed).toBe(true);
  });

  it('backoff grows exponentially with consecutive failures', () => {
    const policy = new ConnectionPolicy({ baseBackoffMs: 1000, maxBackoffMs: 30000 });
    expect(policy.getBackoffMs(PEER_A)).toBe(0); // no failures
    policy.recordFailure(PEER_A, 0);
    expect(policy.getBackoffMs(PEER_A)).toBe(1000);  // 1000 * 2^0
    policy.recordFailure(PEER_A, 1000);
    expect(policy.getBackoffMs(PEER_A)).toBe(2000);  // 1000 * 2^1
    policy.recordFailure(PEER_A, 3000);
    expect(policy.getBackoffMs(PEER_A)).toBe(4000);  // 1000 * 2^2
  });

  it('backoff is capped at maxBackoffMs', () => {
    const policy = new ConnectionPolicy({ baseBackoffMs: 1000, maxBackoffMs: 5000 });
    for (let i = 0; i < 10; i++) policy.recordFailure(PEER_A, i * 1000);
    expect(policy.getBackoffMs(PEER_A)).toBe(5000);
  });

  it('successful connection resets backoff', () => {
    const policy = new ConnectionPolicy({ baseBackoffMs: 1000 });
    policy.recordFailure(PEER_A, 0);
    policy.recordFailure(PEER_A, 1000);
    expect(policy.getFailureCount(PEER_A)).toBe(2);
    policy.recordConnected(PEER_A);
    expect(policy.getFailureCount(PEER_A)).toBe(0);
    expect(policy.getBackoffMs(PEER_A)).toBe(0);
  });
});

describe('ConnectionPolicy — Blacklisting', () => {
  it('blacklists a peer after maxFailures consecutive failures', () => {
    const policy = new ConnectionPolicy({ maxFailures: 3, baseBackoffMs: 0 });
    policy.recordFailure(PEER_A, 0);
    policy.recordFailure(PEER_A, 0);
    expect(policy.isBlacklisted(PEER_A)).toBe(false);
    policy.recordFailure(PEER_A, 0); // 3rd failure = blacklisted
    expect(policy.isBlacklisted(PEER_A)).toBe(true);
    expect(policy.shouldConnect(PEER_A, 999999).allowed).toBe(false);
    expect(policy.shouldConnect(PEER_A, 999999).reason).toBe('PEER_BLACKLISTED');
  });

  it('resetPeer clears blacklist and failure state', () => {
    const policy = new ConnectionPolicy({ maxFailures: 2, baseBackoffMs: 0 });
    policy.recordFailure(PEER_A, 0);
    policy.recordFailure(PEER_A, 0);
    expect(policy.isBlacklisted(PEER_A)).toBe(true);
    policy.resetPeer(PEER_A);
    expect(policy.isBlacklisted(PEER_A)).toBe(false);
    expect(policy.shouldConnect(PEER_A).allowed).toBe(true);
  });
});

describe('ConnectionPolicy — Reconnect Cooldown', () => {
  it('denies reconnect during cooldown period after clean disconnect', () => {
    const policy = new ConnectionPolicy({ reconnectCooldownMs: 5000 });
    policy.recordConnected(PEER_A);
    policy.recordDisconnected(PEER_A, 10000);
    // Within cooldown
    expect(policy.shouldConnect(PEER_A, 12000).allowed).toBe(false);
    expect(policy.shouldConnect(PEER_A, 12000).reason).toBe('RECONNECT_COOLDOWN');
  });

  it('allows reconnect after cooldown expires', () => {
    const policy = new ConnectionPolicy({ reconnectCooldownMs: 5000 });
    policy.recordConnected(PEER_A);
    policy.recordDisconnected(PEER_A, 10000);
    expect(policy.shouldConnect(PEER_A, 16000).allowed).toBe(true);
  });
});

describe('ConnectionPolicy — Inbound Acceptance', () => {
  it('accepts inbound connection when under capacity', () => {
    const policy = new ConnectionPolicy({ maxConnections: 3 });
    policy.recordConnected(PEER_A);
    expect(policy.shouldAcceptInbound(PEER_B).allowed).toBe(true);
  });

  it('rejects inbound when at max capacity', () => {
    const policy = new ConnectionPolicy({ maxConnections: 2 });
    policy.recordConnected(PEER_A);
    policy.recordConnected(PEER_B);
    const result = policy.shouldAcceptInbound(PEER_C);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('MAX_CONNECTIONS_REACHED');
  });

  it('rejects inbound from blacklisted peer', () => {
    const policy = new ConnectionPolicy({ maxFailures: 1, baseBackoffMs: 0 });
    policy.recordFailure(PEER_A, 0);
    expect(policy.shouldAcceptInbound(PEER_A).allowed).toBe(false);
    expect(policy.shouldAcceptInbound(PEER_A).reason).toBe('PEER_BLACKLISTED');
  });
});

describe('ConnectionPolicy — clear', () => {
  it('resets all state', () => {
    const policy = new ConnectionPolicy({ maxConnections: 2 });
    policy.recordConnected(PEER_A);
    policy.recordConnected(PEER_B);
    policy.recordFailure(PEER_C, 0);
    policy.clear();
    expect(policy.activeCount).toBe(0);
    expect(policy.isBlacklisted(PEER_C)).toBe(false);
    expect(policy.shouldConnect(PEER_A).allowed).toBe(true);
  });
});

// ─── BluetoothTransport — Policy Integration (Phase 9.5) ───────────────

describe('BluetoothTransport — Connection Policy Integration', () => {
  it('rejects connect when policy maxConnections is reached', async () => {
    const bt = new BluetoothTransport(createMockAdapter(), { connectionPolicy: { maxConnections: 2 } });
    await bt.initialize();
    await bt.connect(PEER_A);
    await bt.connect(PEER_B);
    await expect(bt.connect(PEER_C)).rejects.toThrow('CONNECTION_DENIED');
    expect(bt.getConnections().length).toBe(2);
    await bt.shutdown();
  });

  it('allows connect after a peer disconnects (frees slot)', async () => {
    const bt = new BluetoothTransport(createMockAdapter(), { connectionPolicy: { maxConnections: 2 } });
    await bt.initialize();
    await bt.connect(PEER_A);
    await bt.connect(PEER_B);
    await bt.disconnect(PEER_A);
    const conn = await bt.connect(PEER_C);
    expect(conn.state).toBe(ConnectionState.CONNECTED);
    await bt.shutdown();
  });

  it('enforces backoff after a failed connection', async () => {
    const adapter = createMockAdapter(true, { socketOpts: { failConnect: true } });
    const bt = new BluetoothTransport(adapter, { connectionPolicy: { baseBackoffMs: 5000 } });
    await bt.initialize();
    // First attempt fails
    await expect(bt.connect(PEER_A)).rejects.toThrow('CONNECTION_FAILED');
    // Immediate retry is denied by policy (backoff active)
    await expect(bt.connect(PEER_A)).rejects.toThrow('CONNECTION_DENIED');
    expect(bt.connectionPolicy.getFailureCount(PEER_A)).toBe(1);
    await bt.shutdown();
  });

  it('rejects inbound connections when at max capacity', async () => {
    const s1 = createMockSocket('99:99:99:99:99:01');
    const s2 = createMockSocket('99:99:99:99:99:02');
    const s3 = createMockSocket('99:99:99:99:99:03'); // should be rejected

    const adapter = createMockAdapter();
    adapter.createServerSocket = () => createMockServerSocket([s1, s2, s3]);
    const bt = new BluetoothTransport(adapter, { connectionPolicy: { maxConnections: 2 } });
    await bt.initialize();
    await new Promise(r => setTimeout(r, 50));

    // Only 2 should be accepted
    expect(bt.getConnections().length).toBe(2);
    await bt.shutdown();
  });

  it('shutdown clears connection policy state', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    await bt.connect(PEER_A);
    expect(bt.connectionPolicy.activeCount).toBe(1);
    await bt.shutdown();
    expect(bt.connectionPolicy.activeCount).toBe(0);
  });
});


// ═══════════════════════════════════════════════════════════════════════
// PHASE 9.6 — Packet Transmission Tests
// ═══════════════════════════════════════════════════════════════════════

describe('BluetoothLink — writeFrame', () => {
  it('writes a 4-byte length prefix followed by data', async () => {
    const writtenBuffers: Buffer[] = [];
    const socket: IBluetoothSocket = {
      remoteAddress: 'AA:BB:CC:DD:EE:FF',
      async connect() {},
      close() {},
      isConnected() { return true; },
      async write(data: Buffer) { writtenBuffers.push(Buffer.from(data)); },
    };
    const link = new BluetoothLink(socket, PEER_A, true);
    await link.connect();

    const payload = Buffer.from('hello NINE');
    await link.writeFrame(payload);

    expect(writtenBuffers.length).toBe(1);
    const frame = writtenBuffers[0]!;
    // Frame = 4-byte big-endian length + payload
    expect(frame.length).toBe(4 + payload.length);
    expect(frame.readUInt32BE(0)).toBe(payload.length);
    expect(frame.subarray(4).equals(payload)).toBe(true);
  });

  it('writes correct frame for empty payload', async () => {
    const writtenBuffers: Buffer[] = [];
    const socket: IBluetoothSocket = {
      remoteAddress: 'AA:BB:CC:DD:EE:FF',
      async connect() {},
      close() {},
      isConnected() { return true; },
      async write(data: Buffer) { writtenBuffers.push(Buffer.from(data)); },
    };
    const link = new BluetoothLink(socket, PEER_A, true);
    await link.connect();

    await link.writeFrame(Buffer.alloc(0));
    const frame = writtenBuffers[0]!;
    expect(frame.length).toBe(4);
    expect(frame.readUInt32BE(0)).toBe(0);
  });

  it('writes correct frame for large payload (4096 bytes)', async () => {
    const writtenBuffers: Buffer[] = [];
    const socket: IBluetoothSocket = {
      remoteAddress: 'AA:BB:CC:DD:EE:FF',
      async connect() {},
      close() {},
      isConnected() { return true; },
      async write(data: Buffer) { writtenBuffers.push(Buffer.from(data)); },
    };
    const link = new BluetoothLink(socket, PEER_A, true);
    await link.connect();

    const payload = Buffer.alloc(4096, 0xAB);
    await link.writeFrame(payload);
    const frame = writtenBuffers[0]!;
    expect(frame.length).toBe(4100);
    expect(frame.readUInt32BE(0)).toBe(4096);
    expect(frame.subarray(4).equals(payload)).toBe(true);
  });

  it('throws LINK_NOT_ALIVE if link is not connected', async () => {
    const socket: IBluetoothSocket = {
      remoteAddress: 'AA:BB:CC:DD:EE:FF',
      async connect() {},
      close() {},
      isConnected() { return false; },
      async write() {},
    };
    const link = new BluetoothLink(socket, PEER_A, true);
    // Never connected — state is IDLE
    await expect(link.writeFrame(Buffer.from('x'))).rejects.toThrow('LINK_NOT_ALIVE');
  });

  it('throws LINK_NOT_ALIVE if link is closed', async () => {
    const socket: IBluetoothSocket = {
      remoteAddress: 'AA:BB:CC:DD:EE:FF',
      async connect() {},
      close() {},
      isConnected() { return true; },
      async write() {},
    };
    const link = new BluetoothLink(socket, PEER_A, true);
    await link.connect();
    link.close();
    await expect(link.writeFrame(Buffer.from('x'))).rejects.toThrow('LINK_NOT_ALIVE');
  });

  it('propagates socket write errors', async () => {
    const socket: IBluetoothSocket = {
      remoteAddress: 'AA:BB:CC:DD:EE:FF',
      async connect() {},
      close() {},
      isConnected() { return true; },
      async write() { throw new Error('RFCOMM write failed'); },
    };
    const link = new BluetoothLink(socket, PEER_A, true);
    await link.connect();
    await expect(link.writeFrame(Buffer.from('data'))).rejects.toThrow('RFCOMM write failed');
  });
});

describe('BluetoothTransport — Packet Transmission (Phase 9.6)', () => {
  it('send writes framed data through the link', async () => {
    const writtenBuffers: Buffer[] = [];
    const adapter = createMockAdapter();
    const originalCreateSocket = adapter.createSocket;
    adapter.createSocket = (peerId: PeerID) => {
      const sock = originalCreateSocket(peerId);
      const origWrite = sock.write;
      sock.write = async (data: Buffer) => { writtenBuffers.push(Buffer.from(data)); return origWrite.call(sock, data); };
      return sock;
    };
    const bt = new BluetoothTransport(adapter);
    await bt.initialize();
    await bt.connect(PEER_A);

    const payload = Buffer.from('NINE packet bytes');
    const result = await bt.send(PEER_A, payload);

    expect(result.success).toBe(true);
    expect(result.bytesSent).toBe(payload.length);
    expect(writtenBuffers.length).toBe(1);
    // Verify framing
    const frame = writtenBuffers[0]!;
    expect(frame.readUInt32BE(0)).toBe(payload.length);
    expect(frame.subarray(4).equals(payload)).toBe(true);
    await bt.shutdown();
  });

  it('send multiple packets sequentially', async () => {
    const writtenBuffers: Buffer[] = [];
    const adapter = createMockAdapter();
    adapter.createSocket = (peerId: PeerID) => {
      const sock = createMockSocket(peerId as unknown as string);
      sock.write = async (data: Buffer) => { writtenBuffers.push(Buffer.from(data)); };
      return sock;
    };
    const bt = new BluetoothTransport(adapter);
    await bt.initialize();
    await bt.connect(PEER_A);

    await bt.send(PEER_A, Buffer.from('pkt1'));
    await bt.send(PEER_A, Buffer.from('pkt2'));
    await bt.send(PEER_A, Buffer.from('pkt3'));

    expect(writtenBuffers.length).toBe(3);
    expect(bt.getMetrics().packetsSent).toBe(3);
    expect(bt.getMetrics().bytesSent).toBe(12); // 4+4+4 bytes of payload
    await bt.shutdown();
  });

  it('broadcast sends to all connected peers', async () => {
    const writtenByPeer: Record<string, Buffer[]> = {};
    const adapter = createMockAdapter();
    adapter.createSocket = (peerId: PeerID) => {
      const key = (peerId as unknown as string).toLowerCase();
      writtenByPeer[key] = [];
      const sock = createMockSocket(peerId as unknown as string);
      sock.write = async (data: Buffer) => { writtenByPeer[key]!.push(Buffer.from(data)); };
      return sock;
    };
    const bt = new BluetoothTransport(adapter);
    await bt.initialize();
    await bt.connect(PEER_A);
    await bt.connect(PEER_B);

    const payload = Buffer.from('broadcast data');
    const count = await bt.broadcast(payload);

    expect(count).toBe(2);
    expect(writtenByPeer[(PEER_A as unknown as string).toLowerCase()]!.length).toBe(1);
    expect(writtenByPeer[(PEER_B as unknown as string).toLowerCase()]!.length).toBe(1);
    await bt.shutdown();
  });

  it('send fails for unknown peer (not connected)', async () => {
    const bt = new BluetoothTransport(createMockAdapter());
    await bt.initialize();
    const events: TransportEvent[] = [];
    bt.on(TransportEventType.SEND_FAILED, (e) => events.push(e));

    const result = await bt.send(PEER_A, Buffer.from('data'));
    expect(result.success).toBe(false);
    expect(result.error).toBe('not_connected');
    expect(events.length).toBe(1);
    expect(bt.getMetrics().sendFailures).toBe(1);
    await bt.shutdown();
  });

  it('send fails when link is no longer alive (socket disconnected)', async () => {
    const adapter = createMockAdapter();
    let socketRef: IBluetoothSocket | null = null;
    adapter.createSocket = (peerId: PeerID) => {
      const sock = createMockSocket(peerId as unknown as string);
      socketRef = sock;
      return sock;
    };
    const bt = new BluetoothTransport(adapter);
    await bt.initialize();
    await bt.connect(PEER_A);

    // Simulate the underlying socket disconnecting (remote walked away)
    socketRef!.close();

    const result = await bt.send(PEER_A, Buffer.from('data'));
    expect(result.success).toBe(false);
    expect(result.error).toBe('link_not_alive');
    expect(bt.getMetrics().sendFailures).toBe(1);
    await bt.shutdown();
  });

  it('send reports socket write failure', async () => {
    const adapter = createMockAdapter();
    adapter.createSocket = (peerId: PeerID) => {
      const sock = createMockSocket(peerId as unknown as string);
      sock.write = async () => { throw new Error('RFCOMM write failed'); };
      return sock;
    };
    const bt = new BluetoothTransport(adapter);
    await bt.initialize();
    await bt.connect(PEER_A);

    const events: TransportEvent[] = [];
    bt.on(TransportEventType.SEND_FAILED, (e) => events.push(e));
    const result = await bt.send(PEER_A, Buffer.from('fail'));

    expect(result.success).toBe(false);
    expect(result.error).toBe('RFCOMM write failed');
    expect(events.length).toBe(1);
    expect((events[0] as any).reason).toBe('RFCOMM write failed');
    expect(bt.getMetrics().sendFailures).toBe(1);
    await bt.shutdown();
  });

  it('metrics accurately track bytes sent across multiple peers', async () => {
    const adapter = createMockAdapter();
    adapter.createSocket = (peerId: PeerID) => {
      const sock = createMockSocket(peerId as unknown as string);
      sock.write = async () => {};
      return sock;
    };
    const bt = new BluetoothTransport(adapter);
    await bt.initialize();
    await bt.connect(PEER_A);
    await bt.connect(PEER_B);

    await bt.send(PEER_A, Buffer.alloc(100));
    await bt.send(PEER_B, Buffer.alloc(200));
    await bt.send(PEER_A, Buffer.alloc(50));

    const m = bt.getMetrics();
    expect(m.packetsSent).toBe(3);
    expect(m.bytesSent).toBe(350);
    expect(m.sendFailures).toBe(0);
    await bt.shutdown();
  });
});


// ═══════════════════════════════════════════════════════════════════════
// PHASE 9.7 — Packet Reception Tests
// ═══════════════════════════════════════════════════════════════════════

/** Helper: build a framed buffer [4-byte length][payload] */
function buildFrame(payload: Buffer): Buffer {
  const frame = Buffer.alloc(4 + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

/** Create a mock socket with a programmable read queue */
function createReadableSocket(remoteAddress: string, frames: Buffer[]): IBluetoothSocket {
  let connected = true;
  let readPos = 0;
  const allBytes = Buffer.concat(frames);

  return {
    remoteAddress,
    async connect() { connected = true; },
    close() { connected = false; },
    isConnected() { return connected; },
    async write() {},
    async read(size: number): Promise<Buffer> {
      if (!connected) throw new Error('EOF: socket closed');
      const end = readPos + size;
      if (end > allBytes.length) {
        connected = false;
        throw new Error('EOF: not enough data');
      }
      const chunk = allBytes.subarray(readPos, end);
      readPos = end;
      // If we've consumed all bytes, next isConnected check will see this
      if (readPos >= allBytes.length) connected = false;
      return Buffer.from(chunk);
    },
  };
}

describe('BluetoothLink — startReadLoop', () => {
  it('reads a single frame and delivers the payload', async () => {
    const payload = Buffer.from('hello NINE protocol');
    const socket = createReadableSocket('AA:BB:CC:DD:EE:FF', [buildFrame(payload)]);
    const link = new BluetoothLink(socket, PEER_A, false);
    (link as any)._state = LinkState.CONNECTED;

    const received: Buffer[] = [];
    const errors: Error[] = [];
    await link.startReadLoop((data) => received.push(data), (err) => errors.push(err));

    expect(received.length).toBe(1);
    expect(received[0]!.equals(payload)).toBe(true);
  });

  it('reads multiple frames in sequence', async () => {
    const p1 = Buffer.from('frame-one');
    const p2 = Buffer.from('frame-two');
    const p3 = Buffer.from('frame-three');
    const socket = createReadableSocket('AA:BB:CC:DD:EE:FF', [buildFrame(p1), buildFrame(p2), buildFrame(p3)]);
    const link = new BluetoothLink(socket, PEER_A, false);
    (link as any)._state = LinkState.CONNECTED;

    const received: Buffer[] = [];
    await link.startReadLoop((data) => received.push(data), () => {});

    expect(received.length).toBe(3);
    expect(received[0]!.toString()).toBe('frame-one');
    expect(received[1]!.toString()).toBe('frame-two');
    expect(received[2]!.toString()).toBe('frame-three');
  });

  it('delivers zero-length frames', async () => {
    const socket = createReadableSocket('AA:BB:CC:DD:EE:FF', [buildFrame(Buffer.alloc(0))]);
    const link = new BluetoothLink(socket, PEER_A, false);
    (link as any)._state = LinkState.CONNECTED;

    const received: Buffer[] = [];
    await link.startReadLoop((data) => received.push(data), () => {});

    expect(received.length).toBe(1);
    expect(received[0]!.length).toBe(0);
  });

  it('rejects oversized frames (> MAX_FRAME_SIZE) and calls onError', async () => {
    // Build a frame header claiming 5000 bytes (> 4096 max)
    const header = Buffer.alloc(4);
    header.writeUInt32BE(5000, 0);
    const socket = createReadableSocket('AA:BB:CC:DD:EE:FF', [header]);
    const link = new BluetoothLink(socket, PEER_A, false);
    (link as any)._state = LinkState.CONNECTED;

    const errors: Error[] = [];
    await link.startReadLoop(() => {}, (err) => errors.push(err));

    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('FRAME_TOO_LARGE');
    expect(link.state).toBe(LinkState.CLOSED);
  });

  it('handles socket close (EOF) gracefully via onError', async () => {
    // Empty socket — first read will throw EOF
    const socket = createReadableSocket('AA:BB:CC:DD:EE:FF', []);
    const link = new BluetoothLink(socket, PEER_A, false);
    (link as any)._state = LinkState.CONNECTED;

    const errors: Error[] = [];
    await link.startReadLoop(() => {}, (err) => errors.push(err));

    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('EOF');
  });

  it('handles truncated frame (header present, payload short) via onError', async () => {
    // Write a header claiming 100 bytes, but only provide 10
    const header = Buffer.alloc(4);
    header.writeUInt32BE(100, 0);
    const partialPayload = Buffer.alloc(10);
    const socket = createReadableSocket('AA:BB:CC:DD:EE:FF', [Buffer.concat([header, partialPayload])]);
    const link = new BluetoothLink(socket, PEER_A, false);
    (link as any)._state = LinkState.CONNECTED;

    const errors: Error[] = [];
    await link.startReadLoop(() => {}, (err) => errors.push(err));

    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('EOF');
  });

  it('delivers large payloads (4096 bytes) correctly', async () => {
    const payload = Buffer.alloc(4096, 0xCD);
    const socket = createReadableSocket('AA:BB:CC:DD:EE:FF', [buildFrame(payload)]);
    const link = new BluetoothLink(socket, PEER_A, false);
    (link as any)._state = LinkState.CONNECTED;

    const received: Buffer[] = [];
    await link.startReadLoop((data) => received.push(data), () => {});

    expect(received.length).toBe(1);
    expect(received[0]!.length).toBe(4096);
    expect(received[0]!.equals(payload)).toBe(true);
  });
});

describe('BluetoothTransport — Packet Reception (Phase 9.7)', () => {
  it('emits DATA_RECEIVED events when frames arrive on a connected link', async () => {
    const payload = Buffer.from('NINE binary packet');
    const adapter = createMockAdapter();
    adapter.createSocket = (peerId: PeerID) => {
      return createReadableSocket(peerId as unknown as string, [buildFrame(payload)]);
    };
    const bt = new BluetoothTransport(adapter);
    const received: Array<{ peerId: PeerID; data: Buffer }> = [];
    bt.on(TransportEventType.DATA_RECEIVED, (e: any) => received.push({ peerId: e.peerId, data: e.data }));

    await bt.initialize();
    await bt.connect(PEER_A);
    // Give the read loop time to process
    await new Promise(r => setTimeout(r, 30));

    expect(received.length).toBe(1);
    expect(received[0]!.peerId).toBe(PEER_A);
    expect(received[0]!.data.equals(payload)).toBe(true);
    expect(bt.getMetrics().packetsReceived).toBe(1);
    expect(bt.getMetrics().bytesReceived).toBe(payload.length);
    await bt.shutdown();
  });

  it('emits CONNECTION_LOST when a link read loop encounters an error', async () => {
    // Socket with no data — will EOF immediately
    const adapter = createMockAdapter();
    adapter.createSocket = (peerId: PeerID) => createReadableSocket(peerId as unknown as string, []);
    const bt = new BluetoothTransport(adapter);
    const lost: Array<{ peerId: PeerID; reason: string }> = [];
    bt.on(TransportEventType.CONNECTION_LOST, (e: any) => lost.push({ peerId: e.peerId, reason: e.reason }));

    await bt.initialize();
    await bt.connect(PEER_A);
    await new Promise(r => setTimeout(r, 30));

    expect(lost.length).toBe(1);
    expect(lost[0]!.peerId).toBe(PEER_A);
    expect(bt.isConnected(PEER_A)).toBe(false);
    expect(bt.getMetrics().connectionsLost).toBe(1);
    await bt.shutdown();
  });

  it('receives multiple frames and emits one event per frame', async () => {
    const p1 = Buffer.from('pkt1');
    const p2 = Buffer.from('pkt2');
    const p3 = Buffer.from('pkt3');
    const adapter = createMockAdapter();
    adapter.createSocket = (peerId: PeerID) => createReadableSocket(peerId as unknown as string, [buildFrame(p1), buildFrame(p2), buildFrame(p3)]);
    const bt = new BluetoothTransport(adapter);
    const received: Buffer[] = [];
    bt.on(TransportEventType.DATA_RECEIVED, (e: any) => received.push(e.data));

    await bt.initialize();
    await bt.connect(PEER_A);
    await new Promise(r => setTimeout(r, 30));

    expect(received.length).toBe(3);
    expect(received[0]!.toString()).toBe('pkt1');
    expect(received[1]!.toString()).toBe('pkt2');
    expect(received[2]!.toString()).toBe('pkt3');
    expect(bt.getMetrics().packetsReceived).toBe(3);
    await bt.shutdown();
  });

  it('metrics track received bytes accurately', async () => {
    const p1 = Buffer.alloc(100, 0xAA);
    const p2 = Buffer.alloc(200, 0xBB);
    const adapter = createMockAdapter();
    adapter.createSocket = (peerId: PeerID) => createReadableSocket(peerId as unknown as string, [buildFrame(p1), buildFrame(p2)]);
    const bt = new BluetoothTransport(adapter);

    await bt.initialize();
    await bt.connect(PEER_A);
    await new Promise(r => setTimeout(r, 30));

    expect(bt.getMetrics().bytesReceived).toBe(300);
    expect(bt.getMetrics().packetsReceived).toBe(2);
    await bt.shutdown();
  });
});
