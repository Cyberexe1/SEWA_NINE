import { describe, it, expect, beforeEach } from 'vitest';
import { VirtualClock } from '../../core/simulator/VirtualClock.js';
import { SimulationEventBus, SimEventType } from '../../core/simulator/SimulationEvents.js';
import { VirtualTransport } from '../../core/simulator/VirtualTransport.js';
import { NodeSimulator } from '../../core/simulator/NodeSimulator.js';
import { SimulationController } from '../../core/simulator/SimulationController.js';
import { type NodeID, NodeRole, PacketType } from '../../core/shared/Types.js';

describe('VirtualClock', () => {
  it('starts at given time', () => { const c = new VirtualClock(100); expect(c.now()).toBe(100); });
  it('advances forward', () => { const c = new VirtualClock(0); c.advance(50); expect(c.now()).toBe(50); });
  it('refuses negative advance', () => { const c = new VirtualClock(0); expect(() => c.advance(-1)).toThrow(); });
  it('setTime works forward', () => { const c = new VirtualClock(0); c.setTime(1000); expect(c.now()).toBe(1000); });
  it('refuses backward setTime', () => { const c = new VirtualClock(100); expect(() => c.setTime(50)).toThrow(); });
  it('resets to zero', () => { const c = new VirtualClock(500); c.reset(); expect(c.now()).toBe(0); });
});

describe('SimulationEventBus', () => {
  let bus: SimulationEventBus;
  beforeEach(() => { bus = new SimulationEventBus(); });
  it('starts empty', () => { expect(bus.size()).toBe(0); });
  it('records emitted events', () => { bus.emit({type:SimEventType.NODE_STARTED,timestamp:0,detail:{eventType:SimEventType.NODE_STARTED,nodeId:'x' as NodeID}}); expect(bus.size()).toBe(1); });
  it('notifies handlers', () => { let called = false; bus.on(() => { called = true; }); bus.emit({type:SimEventType.NODE_STARTED,timestamp:0,detail:{eventType:SimEventType.NODE_STARTED,nodeId:'x' as NodeID}}); expect(called).toBe(true); });
  it('filters by type', () => { bus.emit({type:SimEventType.NODE_STARTED,timestamp:0,detail:{eventType:SimEventType.NODE_STARTED,nodeId:'x' as NodeID}}); bus.emit({type:SimEventType.PACKET_SENT,timestamp:1,detail:{eventType:SimEventType.PACKET_SENT,from:'a' as NodeID,to:'b' as NodeID,packetId:'p' as any,packetType:4,size:80}}); expect(bus.getByType(SimEventType.PACKET_SENT)).toHaveLength(1); });
  it('getPacketTrace returns only packet events', () => { bus.emit({type:SimEventType.NODE_STARTED,timestamp:0,detail:{eventType:SimEventType.NODE_STARTED,nodeId:'x' as NodeID}}); bus.emit({type:SimEventType.PACKET_SENT,timestamp:1,detail:{eventType:SimEventType.PACKET_SENT,from:'a' as NodeID,to:'b' as NodeID,packetId:'p' as any,packetType:4,size:80}}); expect(bus.getPacketTrace()).toHaveLength(1); });
  it('clearLog empties log', () => { bus.emit({type:SimEventType.NODE_STARTED,timestamp:0,detail:{eventType:SimEventType.NODE_STARTED,nodeId:'x' as NodeID}}); bus.clearLog(); expect(bus.size()).toBe(0); });
  it('setRecording disables recording', () => { bus.setRecording(false); bus.emit({type:SimEventType.NODE_STARTED,timestamp:0,detail:{eventType:SimEventType.NODE_STARTED,nodeId:'x' as NodeID}}); expect(bus.size()).toBe(0); });
  it('off removes handler', () => { let count = 0; const h = () => { count++; }; bus.on(h); bus.emit({type:SimEventType.NODE_STARTED,timestamp:0,detail:{eventType:SimEventType.NODE_STARTED,nodeId:'x' as NodeID}}); bus.off(h); bus.emit({type:SimEventType.NODE_STARTED,timestamp:1,detail:{eventType:SimEventType.NODE_STARTED,nodeId:'x' as NodeID}}); expect(count).toBe(1); });
});

describe('VirtualTransport', () => {
  let clock: VirtualClock;
  let events: SimulationEventBus;
  let transport: VirtualTransport;
  const A = '11111111-aaaa-4bbb-8ccc-dddddddddddd' as NodeID;
  const B = '22222222-bbbb-4ccc-8ddd-eeeeeeeeeeee' as NodeID;
  const C = '33333333-cccc-4ddd-8eee-ffffffffffff' as NodeID;

  beforeEach(() => { clock = new VirtualClock(0); events = new SimulationEventBus(); transport = new VirtualTransport(clock, events); });

  it('createLink and hasLink', () => { transport.createLink(A, B); expect(transport.hasLink(A, B)).toBe(true); expect(transport.hasLink(B, A)).toBe(true); });
  it('destroyLink removes link', () => { transport.createLink(A, B); transport.destroyLink(A, B); expect(transport.hasLink(A, B)).toBe(false); });
  it('getNeighbors returns linked nodes', () => { transport.createLink(A, B); transport.createLink(A, C); expect(transport.getNeighbors(A)).toHaveLength(2); });
  it('send fails without link', () => { const received: Buffer[] = []; transport.registerNode(B, (_f, d) => received.push(d)); expect(transport.send(A, B, Buffer.from('test'))).toBe(false); });
  it('send queues delivery with latency', () => { transport.createLink(A, B, {latencyMs:100,jitterMs:0,packetLossRate:0}); const received: Buffer[] = []; transport.registerNode(B, (_f, d) => received.push(d)); transport.send(A, B, Buffer.from('hello')); expect(received).toHaveLength(0); expect(transport.getPendingCount()).toBe(1); clock.advance(100); transport.tick(); expect(received).toHaveLength(1); expect(received[0]!.toString()).toBe('hello'); });
  it('broadcast sends to all neighbors', () => { transport.createLink(A, B, {latencyMs:10,jitterMs:0,packetLossRate:0}); transport.createLink(A, C, {latencyMs:10,jitterMs:0,packetLossRate:0}); const bReceived: Buffer[] = []; const cReceived: Buffer[] = []; transport.registerNode(B, (_f, d) => bReceived.push(d)); transport.registerNode(C, (_f, d) => cReceived.push(d)); const sent = transport.broadcast(A, Buffer.from('msg')); expect(sent).toBe(2); clock.advance(10); transport.tick(); expect(bReceived).toHaveLength(1); expect(cReceived).toHaveLength(1); });
  it('packet loss drops packets', () => { transport.createLink(A, B, {latencyMs:10,jitterMs:0,packetLossRate:1.0}); transport.registerNode(B, () => {}); const result = transport.send(A, B, Buffer.from('x')); expect(result).toBe(false); });
  it('getLinkCount', () => { transport.createLink(A, B); transport.createLink(A, C); expect(transport.getLinkCount()).toBe(2); });
  it('unregisterNode stops delivery', () => { transport.createLink(A, B, {latencyMs:10,jitterMs:0,packetLossRate:0}); let count = 0; transport.registerNode(B, () => { count++; }); transport.send(A, B, Buffer.from('x')); transport.unregisterNode(B); clock.advance(10); transport.tick(); expect(count).toBe(0); });
});

describe('NodeSimulator', () => {
  let clock: VirtualClock;
  let events: SimulationEventBus;
  let transport: VirtualTransport;
  const AID = '11111111-aaaa-4bbb-8ccc-dddddddddddd' as NodeID;
  const BID = '22222222-bbbb-4ccc-8ddd-eeeeeeeeeeee' as NodeID;

  beforeEach(() => { clock = new VirtualClock(0); events = new SimulationEventBus(); transport = new VirtualTransport(clock, events); });

  it('starts and transitions to ACTIVE', () => { const node = new NodeSimulator({nodeId:AID,role:NodeRole.USER,displayName:'A'}, transport, clock, events); node.start(); expect(node.isRunning).toBe(true); });
  it('stops and transitions to TERMINATED', () => { const node = new NodeSimulator({nodeId:AID,role:NodeRole.USER,displayName:'A'}, transport, clock, events); node.start(); node.stop(); expect(node.isRunning).toBe(false); });
  it('broadcastMessage sends to neighbors', () => { const a = new NodeSimulator({nodeId:AID,role:NodeRole.USER,displayName:'A'}, transport, clock, events); const b = new NodeSimulator({nodeId:BID,role:NodeRole.USER,displayName:'B'}, transport, clock, events); a.start(); b.start(); transport.createLink(AID, BID, {latencyMs:10,jitterMs:0,packetLossRate:0}); const sent = a.broadcastMessage('Hello mesh', 1); expect(sent).toBe(1); clock.advance(10); transport.tick(); expect(b.receivedCount).toBe(1); expect(b.getReceivedPackets()[0]!.header.packetType).toBe(PacketType.BROADCAST); });
  it('validates received packets (rejects corrupt)', () => { const a = new NodeSimulator({nodeId:AID,role:NodeRole.USER,displayName:'A'}, transport, clock, events); a.start(); transport.createLink(BID, AID, {latencyMs:5,jitterMs:0,packetLossRate:0}); transport.registerNode(BID, () => {}); const corrupt = Buffer.alloc(100, 0xFF); transport.send(BID, AID, corrupt); clock.advance(5); transport.tick(); expect(a.receivedCount).toBe(0); });
  it('clearReceived empties buffer', () => { const a = new NodeSimulator({nodeId:AID,role:NodeRole.USER,displayName:'A'}, transport, clock, events); const b = new NodeSimulator({nodeId:BID,role:NodeRole.USER,displayName:'B'}, transport, clock, events); a.start(); b.start(); transport.createLink(AID, BID, {latencyMs:5,jitterMs:0,packetLossRate:0}); a.broadcastMessage('test', 1); clock.advance(5); transport.tick(); b.clearReceived(); expect(b.receivedCount).toBe(0); });
});

describe('SimulationController', () => {
  let sim: SimulationController;
  beforeEach(() => { sim = new SimulationController(); });

  it('starts empty', () => { expect(sim.nodeCount).toBe(0); });
  it('adds and starts nodes', () => { const n = sim.addNode({role:NodeRole.USER,displayName:'A'}); expect(n.isRunning).toBe(true); expect(sim.nodeCount).toBe(1); });
  it('getNode retrieves by ID', () => { const n = sim.addNode({role:NodeRole.USER,displayName:'A'}); expect(sim.getNode(n.nodeId)).toBe(n); });
  it('stopNode simulates failure', () => { const n = sim.addNode({role:NodeRole.USER,displayName:'A'}); sim.stopNode(n.nodeId); expect(n.isRunning).toBe(false); expect(sim.getActiveNodes()).toHaveLength(0); });
  it('link and unlink', () => { const a = sim.addNode({role:NodeRole.USER,displayName:'A'}); const b = sim.addNode({role:NodeRole.USER,displayName:'B'}); sim.link(a.nodeId, b.nodeId); expect(sim.isLinked(a.nodeId, b.nodeId)).toBe(true); sim.unlink(a.nodeId, b.nodeId); expect(sim.isLinked(a.nodeId, b.nodeId)).toBe(false); });
  it('advanceTime delivers packets', () => { const a = sim.addNode({role:NodeRole.USER,displayName:'A'}); const b = sim.addNode({role:NodeRole.USER,displayName:'B'}); sim.link(a.nodeId, b.nodeId, {latencyMs:20,jitterMs:0,packetLossRate:0}); a.broadcastMessage('Hi', 1); const delivered = sim.advanceTime(20); expect(delivered).toBe(1); expect(b.receivedCount).toBe(1); });
  it('deliverAll processes all pending', () => { const a = sim.addNode({role:NodeRole.USER,displayName:'A'}); const b = sim.addNode({role:NodeRole.USER,displayName:'B'}); sim.link(a.nodeId, b.nodeId, {latencyMs:100,jitterMs:0,packetLossRate:0}); a.broadcastMessage('Hello', 1); sim.deliverAll(); expect(b.receivedCount).toBe(1); });
  it('getStats reports correctly', () => { const a = sim.addNode({role:NodeRole.USER,displayName:'A'}); const b = sim.addNode({role:NodeRole.USER,displayName:'B'}); sim.link(a.nodeId, b.nodeId, {latencyMs:10,jitterMs:0,packetLossRate:0}); a.broadcastMessage('msg', 1); sim.advanceTime(10); const stats = sim.getStats(); expect(stats.totalPacketsSent).toBe(1); expect(stats.totalPacketsReceived).toBe(1); expect(stats.activeNodes).toBe(2); expect(stats.totalLinks).toBe(1); });
  it('createLinearTopology', () => { const nodes = sim.createLinearTopology(5); expect(nodes).toHaveLength(5); expect(sim.isLinked(nodes[0]!.nodeId, nodes[1]!.nodeId)).toBe(true); expect(sim.isLinked(nodes[0]!.nodeId, nodes[4]!.nodeId)).toBe(false); });
  it('createStarTopology', () => { const nodes = sim.createStarTopology(4); expect(nodes).toHaveLength(4); expect(sim.isLinked(nodes[0]!.nodeId, nodes[1]!.nodeId)).toBe(true); expect(sim.isLinked(nodes[0]!.nodeId, nodes[3]!.nodeId)).toBe(true); });
  it('createFullMeshTopology', () => { const nodes = sim.createFullMeshTopology(4); expect(sim.getStats().totalLinks).toBe(6); });
  it('reset clears everything', () => { sim.createLinearTopology(3); sim.reset(); expect(sim.nodeCount).toBe(0); expect(sim.events.size()).toBe(0); });
  it('supports 20 nodes', () => { sim.createFullMeshTopology(20); expect(sim.nodeCount).toBe(20); expect(sim.getActiveNodes()).toHaveLength(20); });
});

// ═══════════════════════════════════════════════════════════════════
// DEMONSTRATION: Broadcast delivery without routing
// ═══════════════════════════════════════════════════════════════════

describe('Demonstration: Direct Broadcast Delivery', () => {
  it('Node A broadcasts → all direct neighbors receive the validated packet', () => {
    const sim = new SimulationController();

    // Create 5-node star: A in the center, B/C/D/E are leaves
    const a = sim.addNode({ role: NodeRole.USER, displayName: 'Alpha' });
    const b = sim.addNode({ role: NodeRole.USER, displayName: 'Bravo' });
    const c = sim.addNode({ role: NodeRole.USER, displayName: 'Charlie' });
    const d = sim.addNode({ role: NodeRole.USER, displayName: 'Delta' });
    const e = sim.addNode({ role: NodeRole.ADMIN, displayName: 'Admin' });

    // Link A to all others (star topology)
    sim.link(a.nodeId, b.nodeId, { latencyMs: 15, jitterMs: 0, packetLossRate: 0 });
    sim.link(a.nodeId, c.nodeId, { latencyMs: 15, jitterMs: 0, packetLossRate: 0 });
    sim.link(a.nodeId, d.nodeId, { latencyMs: 15, jitterMs: 0, packetLossRate: 0 });
    sim.link(a.nodeId, e.nodeId, { latencyMs: 15, jitterMs: 0, packetLossRate: 0 });

    // Alpha sends a broadcast message
    const sent = a.broadcastMessage('EMERGENCY: Building evacuation', 1);
    expect(sent).toBe(4); // Sent to 4 neighbors

    // Advance time to deliver
    sim.advanceTime(15);

    // Verify all neighbors received the validated packet
    expect(b.receivedCount).toBe(1);
    expect(c.receivedCount).toBe(1);
    expect(d.receivedCount).toBe(1);
    expect(e.receivedCount).toBe(1);

    // Verify packet contents are intact
    const received = b.getReceivedPackets()[0]!;
    expect(received.header.packetType).toBe(PacketType.BROADCAST);
    expect(received.header.senderId).toBe(a.nodeId);
    expect(received.header.ttl).toBe(10);
    expect(received.header.hopCount).toBe(0);
    expect(received.header.version).toBe(1);

    // Verify the payload contains our message
    const msgLen = received.payload.readUInt16BE(1);
    const msg = received.payload.subarray(3, 3 + msgLen).toString('utf-8');
    expect(msg).toBe('EMERGENCY: Building evacuation');

    // Verify simulation statistics
    const stats = sim.getStats();
    expect(stats.totalPacketsSent).toBe(4);
    expect(stats.totalPacketsReceived).toBe(4);
    expect(stats.totalPacketsDropped).toBe(0);
    expect(stats.totalPacketsLost).toBe(0);

    // Verify packet trace log
    const trace = sim.events.getPacketTrace();
    expect(trace.length).toBe(8); // 4 sent + 4 received
  });

  it('Packet loss simulation: some neighbors do not receive', () => {
    const sim = new SimulationController();
    const a = sim.addNode({ role: NodeRole.USER, displayName: 'A' });
    const b = sim.addNode({ role: NodeRole.USER, displayName: 'B' });

    // 100% packet loss — nothing gets through
    sim.link(a.nodeId, b.nodeId, { latencyMs: 10, jitterMs: 0, packetLossRate: 1.0 });
    a.broadcastMessage('lost message', 1);
    sim.deliverAll();

    expect(b.receivedCount).toBe(0);
    expect(sim.getStats().totalPacketsLost).toBe(1);
  });

  it('Node failure: stopped node does not receive packets', () => {
    const sim = new SimulationController();
    const a = sim.addNode({ role: NodeRole.USER, displayName: 'A' });
    const b = sim.addNode({ role: NodeRole.USER, displayName: 'B' });
    sim.link(a.nodeId, b.nodeId, { latencyMs: 10, jitterMs: 0, packetLossRate: 0 });

    // Stop B before the message
    sim.stopNode(b.nodeId);
    a.broadcastMessage('hello?', 1);
    sim.deliverAll();

    expect(b.receivedCount).toBe(0);
  });

  it('Link failure: unlinked node does not receive', () => {
    const sim = new SimulationController();
    const a = sim.addNode({ role: NodeRole.USER, displayName: 'A' });
    const b = sim.addNode({ role: NodeRole.USER, displayName: 'B' });
    sim.link(a.nodeId, b.nodeId, { latencyMs: 10, jitterMs: 0, packetLossRate: 0 });

    // Break the link
    sim.unlink(a.nodeId, b.nodeId);
    a.broadcastMessage('after disconnect', 1);
    sim.deliverAll();

    expect(b.receivedCount).toBe(0);
    // No send attempted because no neighbors found after unlink
    expect(sim.getStats().totalPacketsSent).toBe(0);
  });
});
