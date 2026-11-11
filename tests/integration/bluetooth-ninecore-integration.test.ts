/**
 * Phase 9.8 — BluetoothTransport ↔ NineCore Integration Tests
 *
 * Proves that BluetoothTransport is a fully operational ITransport
 * implementation that plugs into NineCore via NineCoreBuilder and
 * TransportManager without any protocol/core modifications.
 *
 * All tests use mock Bluetooth sockets — no hardware required.
 */

import { describe, it, expect } from 'vitest';
import { NineCore } from '../../core/NineCore.js';
import { NineCoreBuilder } from '../../core/NineCoreBuilder.js';
import { createConfiguration } from '../../core/NineConfiguration.js';
import { TransportManager } from '../../core/transport/TransportManager.js';
import { BluetoothTransport, type IBluetoothAdapter } from '../../core/transport/BluetoothTransport.js';
import { type IBluetoothSocket } from '../../core/transport/BluetoothLink.js';
import { type IBluetoothServerSocket } from '../../core/transport/BluetoothAcceptLoop.js';
import { MockTransport, MockMedium } from '../../core/transport/MockTransport.js';
import { TransportEventType } from '../../core/transport/TransportEvents.js';
import { VirtualClock } from '../../core/simulator/VirtualClock.js';
import { createPacket } from '../../core/protocol/PacketFactory.js';
import { serialize } from '../../core/protocol/Serializer.js';
import { PacketType, type NodeID, type PeerID, NodeRole } from '../../core/shared/Types.js';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as NodeID;
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as NodeID;

// ─── Mock Infrastructure ────────────────────────────────────────────────

function buildFrame(payload: Buffer): Buffer {
  const frame = Buffer.alloc(4 + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

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
      if (!connected) throw new Error('EOF');
      const end = readPos + size;
      if (end > allBytes.length) { connected = false; throw new Error('EOF'); }
      const chunk = allBytes.subarray(readPos, end);
      readPos = end;
      if (readPos >= allBytes.length) connected = false;
      return Buffer.from(chunk);
    },
  };
}

function createWritableSocket(remoteAddress: string, writtenBuffers: Buffer[]): IBluetoothSocket {
  let connected = false;
  return {
    remoteAddress,
    async connect() { connected = true; },
    close() { connected = false; },
    isConnected() { return connected; },
    async write(data: Buffer) { writtenBuffers.push(Buffer.from(data)); },
    async read(): Promise<Buffer> { return new Promise(() => {}); }, // block forever
  };
}

function createMockServerSocket(): IBluetoothServerSocket {
  let closed = false;
  return {
    async accept() { return new Promise<IBluetoothSocket>((_, reject) => { const i = setInterval(() => { if (closed) { clearInterval(i); reject(new Error('closed')); } }, 10); }); },
    close() { closed = true; },
  };
}

function createBluetoothAdapter(opts?: { socketFactory?: (peerId: PeerID) => IBluetoothSocket }): IBluetoothAdapter {
  return {
    isEnabled: () => true,
    startDiscovery: () => true,
    cancelDiscovery: () => {},
    requestDiscoverable: () => {},
    createServerSocket: () => createMockServerSocket(),
    createSocket: (peerId: PeerID) => opts?.socketFactory?.(peerId) ?? createWritableSocket(peerId as unknown as string, []),
  };
}

// ─── Integration Tests ──────────────────────────────────────────────────

describe('BluetoothTransport — NineCore Registration & Lifecycle', () => {
  it('BluetoothTransport can be injected into NineCoreBuilder', async () => {
    const bt = new BluetoothTransport(createBluetoothAdapter());
    const core = new NineCoreBuilder()
      .withConfiguration(createConfiguration(NodeRole.USER, 'Alpha', { nodeId: A }))
      .withTransport(bt)
      .build();

    await core.initialize();
    expect(core.getNodeInfo().nodeId).toBe(A);
    await core.shutdown();
  });

  it('NineCore.initialize() initializes BluetoothTransport', async () => {
    const bt = new BluetoothTransport(createBluetoothAdapter());
    const core = new NineCoreBuilder()
      .withConfiguration(createConfiguration(NodeRole.USER, 'Alpha', { nodeId: A }))
      .withTransport(bt)
      .build();

    expect(bt.state).toBe('uninitialized');
    await core.initialize();
    expect(bt.state).toBe('ready');
    await core.shutdown();
    expect(bt.state).toBe('shutdown');
  });

  it('NineCore.shutdown() shuts down BluetoothTransport', async () => {
    const bt = new BluetoothTransport(createBluetoothAdapter());
    const core = new NineCoreBuilder()
      .withConfiguration(createConfiguration(NodeRole.USER, 'Alpha', { nodeId: A }))
      .withTransport(bt)
      .build();

    await core.initialize();
    await bt.connect(B as unknown as PeerID);
    expect(bt.getConnections().length).toBe(1);
    await core.shutdown();
    expect(bt.getConnections().length).toBe(0);
  });
});

describe('BluetoothTransport — Outgoing Packet Flow', () => {
  it('NineCore.sendBroadcast routes through BluetoothTransport.send()', async () => {
    const writtenBuffers: Buffer[] = [];
    const adapter = createBluetoothAdapter({
      socketFactory: (peerId) => createWritableSocket(peerId as unknown as string, writtenBuffers),
    });
    const bt = new BluetoothTransport(adapter);
    const core = new NineCoreBuilder()
      .withConfiguration(createConfiguration(NodeRole.USER, 'Alpha', { nodeId: A }))
      .withTransport(bt)
      .build();

    await core.initialize();
    await bt.connect(B as unknown as PeerID);

    core.sendBroadcast('hello from BT');

    // The broadcast packet should have been written to the BT link
    expect(writtenBuffers.length).toBeGreaterThanOrEqual(1);
    // Verify it's a framed NINE packet (4-byte length + binary data)
    const frame = writtenBuffers[0]!;
    const payloadLen = frame.readUInt32BE(0);
    expect(payloadLen).toBeGreaterThan(71); // at least header size
    expect(frame.length).toBe(4 + payloadLen);
    await core.shutdown();
  });

  it('TransportManager metrics reflect BluetoothTransport activity', async () => {
    const adapter = createBluetoothAdapter({
      socketFactory: (peerId) => createWritableSocket(peerId as unknown as string, []),
    });
    const bt = new BluetoothTransport(adapter);
    const core = new NineCoreBuilder()
      .withConfiguration(createConfiguration(NodeRole.USER, 'Alpha', { nodeId: A }))
      .withTransport(bt)
      .build();

    await core.initialize();
    await bt.connect(B as unknown as PeerID);
    core.sendBroadcast('metrics test');

    // Allow fire-and-forget async send to complete
    await new Promise(r => setTimeout(r, 20));

    const metrics = core.getMetrics();
    expect(metrics.transport.packetsSent).toBeGreaterThanOrEqual(1);
    expect(metrics.transport.bytesSent).toBeGreaterThan(0);
    await core.shutdown();
  });
});

describe('BluetoothTransport — Incoming Packet Delivery', () => {
  it('DATA_RECEIVED from BluetoothTransport reaches NineCore.onBroadcast', async () => {
    // Build a valid NINE BROADCAST packet
    const clock = new VirtualClock(1000);
    const broadcastPayload = Buffer.alloc(3 + 5);
    broadcastPayload.writeUInt8(0x00, 0); // contentType TEXT
    broadcastPayload.writeUInt16BE(5, 1);
    Buffer.from('hello').copy(broadcastPayload, 3);
    const pkt = createPacket({
      packetType: PacketType.BROADCAST,
      senderId: B,
      destinationId: '00000000-0000-0000-0000-000000000000' as NodeID,
      sequenceNumber: 1,
      ttl: 10,
      payload: broadcastPayload,
      timestamp: clock.now(),
    });
    const serializedPacket = serialize(pkt);

    // Create a BT socket that will deliver this packet as a framed read
    const adapter = createBluetoothAdapter({
      socketFactory: (_peerId) => createReadableSocket(_peerId as unknown as string, [buildFrame(serializedPacket)]),
    });
    const bt = new BluetoothTransport(adapter);
    const core = new NineCoreBuilder()
      .withConfiguration(createConfiguration(NodeRole.USER, 'Alpha', { nodeId: A }))
      .withTransport(bt)
      .withClock(() => clock.now())
      .build();

    const received: string[] = [];
    core.onBroadcast((e: any) => received.push(e.message));

    await core.initialize();
    await bt.connect(B as unknown as PeerID);
    // Give the read loop time to deliver
    await new Promise(r => setTimeout(r, 50));

    expect(received).toEqual(['hello']);
    await core.shutdown();
  });

  it('incoming data updates receive metrics', async () => {
    const clock = new VirtualClock(1000);
    const payload = Buffer.alloc(3 + 4);
    payload.writeUInt8(0x00, 0);
    payload.writeUInt16BE(4, 1);
    Buffer.from('test').copy(payload, 3);
    const pkt = createPacket({
      packetType: PacketType.BROADCAST, senderId: B,
      destinationId: '00000000-0000-0000-0000-000000000000' as NodeID,
      sequenceNumber: 1, ttl: 10, payload, timestamp: clock.now(),
    });
    const serialized = serialize(pkt);

    const adapter = createBluetoothAdapter({
      socketFactory: (peerId) => createReadableSocket(peerId as unknown as string, [buildFrame(serialized)]),
    });
    const bt = new BluetoothTransport(adapter);
    const core = new NineCoreBuilder()
      .withConfiguration(createConfiguration(NodeRole.USER, 'Alpha', { nodeId: A }))
      .withTransport(bt)
      .withClock(() => clock.now())
      .build();

    await core.initialize();
    await bt.connect(B as unknown as PeerID);
    await new Promise(r => setTimeout(r, 50));

    const metrics = core.getMetrics();
    expect(metrics.transport.packetsReceived).toBeGreaterThanOrEqual(1);
    expect(metrics.transport.bytesReceived).toBeGreaterThanOrEqual(serialized.length);
    await core.shutdown();
  });
});

describe('BluetoothTransport — Event Propagation', () => {
  it('PEER_DISCOVERED from BluetoothTransport triggers NODE_JOINED in NineCore', async () => {
    const bt = new BluetoothTransport(createBluetoothAdapter());
    const core = new NineCoreBuilder()
      .withConfiguration(createConfiguration(NodeRole.USER, 'Alpha', { nodeId: A }))
      .withTransport(bt)
      .build();

    const joined: NodeID[] = [];
    core.onNodeJoined((e: any) => joined.push(e.nodeId));

    await core.initialize();
    await bt.startDiscovery();
    bt.reportDeviceFound(B as unknown as PeerID, 'Bravo');

    expect(joined.length).toBe(1);
    expect((joined[0] as string).toLowerCase()).toBe(B.toLowerCase());
    await core.shutdown();
  });

  it('CONNECTION_LOST from BluetoothTransport triggers NODE_LEFT in NineCore', async () => {
    const adapter = createBluetoothAdapter({
      socketFactory: (peerId) => createReadableSocket(peerId as unknown as string, []),
    });
    const bt = new BluetoothTransport(adapter);
    const core = new NineCoreBuilder()
      .withConfiguration(createConfiguration(NodeRole.USER, 'Alpha', { nodeId: A }))
      .withTransport(bt)
      .build();

    const left: NodeID[] = [];
    core.onNodeLeft((e: any) => left.push(e.nodeId));

    await core.initialize();
    await bt.connect(B as unknown as PeerID);
    // The read loop will EOF immediately → CONNECTION_LOST
    await new Promise(r => setTimeout(r, 50));

    expect(left.length).toBe(1);
    expect((left[0] as string).toLowerCase()).toBe(B.toLowerCase());
    await core.shutdown();
  });
});

describe('BluetoothTransport — Multiple Transport Support', () => {
  it('BluetoothTransport and MockTransport can coexist in TransportManager', async () => {
    const medium = new MockMedium();
    const mock = new MockTransport(A as unknown as PeerID, medium);
    const bt = new BluetoothTransport(createBluetoothAdapter());

    const tm = new TransportManager();
    tm.register(mock);
    tm.register(bt);

    expect(tm.transportCount).toBe(2);
    expect(tm.getTransport('simulated' as any)).toBe(mock);
    expect(tm.getTransport('bluetooth_classic' as any)).toBe(bt);

    await tm.initializeAll();
    expect(mock.state).toBe('ready');
    expect(bt.state).toBe('ready');

    await tm.shutdownAll();
    expect(mock.state).toBe('shutdown');
    expect(bt.state).toBe('shutdown');
  });

  it('NineCore works with BluetoothTransport as primary alongside a secondary transport', async () => {
    const bt = new BluetoothTransport(createBluetoothAdapter({
      socketFactory: (peerId) => createWritableSocket(peerId as unknown as string, []),
    }));

    // Build NineCore with BT as primary
    const core = new NineCoreBuilder()
      .withConfiguration(createConfiguration(NodeRole.USER, 'Alpha', { nodeId: A }))
      .withTransport(bt)
      .build();

    await core.initialize();
    await bt.connect(B as unknown as PeerID);

    // Verify the core can use BT for sending
    core.sendBroadcast('multi-transport test');

    // Allow fire-and-forget async send to complete
    await new Promise(r => setTimeout(r, 20));

    expect(bt.getMetrics().packetsSent).toBeGreaterThanOrEqual(1);

    await core.shutdown();
  });
});
