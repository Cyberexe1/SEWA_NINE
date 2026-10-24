import { describe, it, expect, beforeEach } from 'vitest';
import { generateNodeId, generateSessionId, isValidNodeId, isValidSessionId, nodeIdEquals } from '../../core/node/NodeID.js';
import { MeshNode, NodeLifecycleState } from '../../core/node/MeshNode.js';
import { NeighborTable, type NeighborEntry } from '../../core/node/NeighborTable.js';
import { RoutingTable, type RoutingEntry } from '../../core/node/RoutingTable.js';
import { NodeRegistry, type KnownNodeEntry } from '../../core/node/NodeRegistry.js';
import { HeartbeatState, HeartbeatStatus } from '../../core/node/HeartbeatState.js';
import { computeNodeHealth, computeNeighborStatuses } from '../../core/node/NodeStatus.js';
import { type NodeID, type SessionID, type Timestamp, NodeRole, TransportType } from '../../core/shared/Types.js';

const NODE_A = '11111111-aaaa-4bbb-8ccc-dddddddddddd' as NodeID;
const NODE_B = '22222222-bbbb-4ccc-8ddd-eeeeeeeeeeee' as NodeID;
const NODE_C = '33333333-cccc-4ddd-8eee-ffffffffffff' as NodeID;
const SESSION_1 = 'abcdef0123456789' as SessionID;
const SESSION_2 = '9876543210fedcba' as SessionID;

function makeNeighbor(nodeId: NodeID, overrides?: Partial<NeighborEntry>): NeighborEntry {
  return { nodeId, sessionId: SESSION_1, role: NodeRole.USER, displayName: 'Test',
    lastHeartbeat: 1000 as Timestamp, linkQuality: 0.85, transportType: TransportType.BLUETOOTH_CLASSIC, capabilities: 0x0B, ...overrides };
}

function makeRoute(destId: NodeID, overrides?: Partial<RoutingEntry>): RoutingEntry {
  return { destinationId: destId, nextHopId: NODE_B, hopCount: 2, routeMetric: 200,
    fullPath: [NODE_A, NODE_B, destId], sequenceNumber: 1, discoveredAt: 1000 as Timestamp, expiresAt: 31000 as Timestamp, ...overrides };
}

describe('NodeID', () => {
  it('generates valid UUID v4', () => { expect(isValidNodeId(generateNodeId())).toBe(true); });
  it('generates unique IDs', () => { const s = new Set(Array.from({length:50}, generateNodeId)); expect(s.size).toBe(50); });
  it('generates valid session IDs', () => { const s = generateSessionId(); expect(isValidSessionId(s)).toBe(true); expect(s.length).toBe(16); });
  it('validates UUID format', () => { expect(isValidNodeId('550e8400-e29b-41d4-a716-446655440000')).toBe(true); });
  it('rejects bad UUID', () => { expect(isValidNodeId('not-a-uuid')).toBe(false); expect(isValidNodeId('')).toBe(false); });
  it('compares case-insensitively', () => { expect(nodeIdEquals(NODE_A, NODE_A.toUpperCase() as NodeID)).toBe(true); });
  it('detects different IDs', () => { expect(nodeIdEquals(NODE_A, NODE_B)).toBe(false); });
});

describe('MeshNode', () => {
  it('creates with UNINITIALIZED state', () => { const n = MeshNode.create({role:NodeRole.USER,displayName:'A'}); expect(n.lifecycleState).toBe(NodeLifecycleState.UNINITIALIZED); expect(n.role).toBe(NodeRole.USER); expect(n.displayName).toBe('A'); });
  it('generates unique nodeId and sessionId', () => { const a = MeshNode.create({role:NodeRole.USER,displayName:'A'}); const b = MeshNode.create({role:NodeRole.USER,displayName:'B'}); expect(a.nodeId).not.toBe(b.nodeId); expect(a.sessionId).not.toBe(b.sessionId); });
  it('accepts provided nodeId', () => { const n = MeshNode.create({role:NodeRole.ADMIN,displayName:'X',nodeId:NODE_A}); expect(n.nodeId).toBe(NODE_A); });
  it('restores from persisted state', () => { const n = MeshNode.restore({nodeId:NODE_A,role:NodeRole.ADMIN,displayName:'X',capabilities:0xF,createdAt:500 as Timestamp}); expect(n.nodeId).toBe(NODE_A); expect(n.lifecycleState).toBe(NodeLifecycleState.UNINITIALIZED); expect(isValidSessionId(n.sessionId)).toBe(true); });
  it('transitions through valid states', () => { const n = MeshNode.create({role:NodeRole.USER,displayName:'N'}); n.transitionTo(NodeLifecycleState.INITIALIZING); n.transitionTo(NodeLifecycleState.IDLE); n.transitionTo(NodeLifecycleState.DISCOVERING); n.transitionTo(NodeLifecycleState.ACTIVE); n.transitionTo(NodeLifecycleState.SHUTTING_DOWN); n.transitionTo(NodeLifecycleState.TERMINATED); expect(n.lifecycleState).toBe(NodeLifecycleState.TERMINATED); });
  it('throws on invalid transition', () => { const n = MeshNode.create({role:NodeRole.USER,displayName:'N'}); expect(() => n.transitionTo(NodeLifecycleState.ACTIVE)).toThrow('Invalid state transition'); });
  it('cannot transition from TERMINATED', () => { const n = MeshNode.create({role:NodeRole.USER,displayName:'N'}); n.transitionTo(NodeLifecycleState.INITIALIZING); n.transitionTo(NodeLifecycleState.IDLE); n.transitionTo(NodeLifecycleState.SHUTTING_DOWN); n.transitionTo(NodeLifecycleState.TERMINATED); expect(() => n.transitionTo(NodeLifecycleState.IDLE)).toThrow(); });
  it('canTransitionTo returns boolean', () => { const n = MeshNode.create({role:NodeRole.USER,displayName:'N'}); expect(n.canTransitionTo(NodeLifecycleState.INITIALIZING)).toBe(true); expect(n.canTransitionTo(NodeLifecycleState.ACTIVE)).toBe(false); });
  it('updates display name', () => { const n = MeshNode.create({role:NodeRole.USER,displayName:'Old'}); n.setDisplayName('New'); expect(n.displayName).toBe('New'); });
  it('getState returns snapshot', () => { const n = MeshNode.create({role:NodeRole.ADMIN,displayName:'X',capabilities:0xFF}); const s = n.getState(); expect(s.role).toBe(NodeRole.ADMIN); expect(s.capabilities).toBe(0xFF); });
});

describe('NeighborTable', () => {
  let t: NeighborTable;
  beforeEach(() => { t = new NeighborTable(); });
  it('starts empty', () => { expect(t.size()).toBe(0); });
  it('upserts and retrieves', () => { t.upsert(makeNeighbor(NODE_A)); expect(t.get(NODE_A)!.nodeId).toBe(NODE_A); });
  it('overwrites on upsert', () => { t.upsert(makeNeighbor(NODE_A,{displayName:'1'})); t.upsert(makeNeighbor(NODE_A,{displayName:'2'})); expect(t.size()).toBe(1); expect(t.get(NODE_A)!.displayName).toBe('2'); });
  it('has() checks existence', () => { t.upsert(makeNeighbor(NODE_A)); expect(t.has(NODE_A)).toBe(true); expect(t.has(NODE_B)).toBe(false); });
  it('removes neighbor', () => { t.upsert(makeNeighbor(NODE_A)); expect(t.remove(NODE_A)).toBe(true); expect(t.size()).toBe(0); });
  it('evicts stale', () => { t.upsert(makeNeighbor(NODE_A,{lastHeartbeat:1000 as Timestamp})); t.upsert(makeNeighbor(NODE_B,{lastHeartbeat:5000 as Timestamp})); const ev = t.evictStale(20000 as Timestamp,15000); expect(ev).toContain(NODE_A); expect(ev).not.toContain(NODE_B); });
  it('filters by role', () => { t.upsert(makeNeighbor(NODE_A,{role:NodeRole.USER})); t.upsert(makeNeighbor(NODE_B,{role:NodeRole.ADMIN})); expect(t.getByRole(NodeRole.ADMIN)).toHaveLength(1); });
  it('filters by transport', () => { t.upsert(makeNeighbor(NODE_A,{transportType:TransportType.WIFI_DIRECT})); t.upsert(makeNeighbor(NODE_B)); expect(t.getByTransport(TransportType.WIFI_DIRECT)).toHaveLength(1); });
  it('getNodeIds', () => { t.upsert(makeNeighbor(NODE_A)); t.upsert(makeNeighbor(NODE_B)); expect(t.getNodeIds()).toHaveLength(2); });
  it('clear removes all', () => { t.upsert(makeNeighbor(NODE_A)); t.clear(); expect(t.size()).toBe(0); });
  it('case-insensitive lookup', () => { t.upsert(makeNeighbor(NODE_A)); expect(t.has(NODE_A.toUpperCase() as NodeID)).toBe(true); });
});

describe('RoutingTable', () => {
  let t: RoutingTable;
  beforeEach(() => { t = new RoutingTable(); });
  it('starts empty', () => { expect(t.size()).toBe(0); });
  it('accepts new route', () => { expect(t.upsert(makeRoute(NODE_C))).toBe(true); expect(t.size()).toBe(1); });
  it('accepts higher seq', () => { t.upsert(makeRoute(NODE_C,{sequenceNumber:1})); expect(t.upsert(makeRoute(NODE_C,{sequenceNumber:2,routeMetric:500}))).toBe(true); expect(t.get(NODE_C)!.sequenceNumber).toBe(2); });
  it('accepts same seq better metric', () => { t.upsert(makeRoute(NODE_C,{sequenceNumber:1,routeMetric:300})); expect(t.upsert(makeRoute(NODE_C,{sequenceNumber:1,routeMetric:100}))).toBe(true); });
  it('rejects same seq worse metric', () => { t.upsert(makeRoute(NODE_C,{sequenceNumber:1,routeMetric:100})); expect(t.upsert(makeRoute(NODE_C,{sequenceNumber:1,routeMetric:300}))).toBe(false); });
  it('rejects lower seq', () => { t.upsert(makeRoute(NODE_C,{sequenceNumber:5})); expect(t.upsert(makeRoute(NODE_C,{sequenceNumber:3}))).toBe(false); });
  it('hasValidRoute checks expiry', () => { t.upsert(makeRoute(NODE_C,{expiresAt:5000 as Timestamp})); expect(t.hasValidRoute(NODE_C,3000 as Timestamp)).toBe(true); expect(t.hasValidRoute(NODE_C,6000 as Timestamp)).toBe(false); });
  it('evicts expired', () => { t.upsert(makeRoute(NODE_B,{expiresAt:1000 as Timestamp})); t.upsert(makeRoute(NODE_C,{expiresAt:5000 as Timestamp})); const ev = t.evictExpired(2000 as Timestamp); expect(ev).toContain(NODE_B); expect(t.size()).toBe(1); });
  it('invalidates by next hop', () => { t.upsert(makeRoute(NODE_C,{nextHopId:NODE_B})); t.upsert(makeRoute(NODE_A,{nextHopId:NODE_B})); expect(t.invalidateByNextHop(NODE_B)).toHaveLength(2); expect(t.size()).toBe(0); });
  it('refreshes expiry', () => { t.upsert(makeRoute(NODE_C,{expiresAt:5000 as Timestamp})); expect(t.refresh(NODE_C,50000 as Timestamp)).toBe(true); expect(t.get(NODE_C)!.expiresAt).toBe(50000); });
  it('refresh unknown returns false', () => { expect(t.refresh(NODE_C,50000 as Timestamp)).toBe(false); });
  it('removes route', () => { t.upsert(makeRoute(NODE_C)); expect(t.remove(NODE_C)).toBe(true); expect(t.size()).toBe(0); });
  it('clears all', () => { t.upsert(makeRoute(NODE_B)); t.upsert(makeRoute(NODE_C)); t.clear(); expect(t.size()).toBe(0); });
});

describe('NodeRegistry', () => {
  let r: NodeRegistry;
  beforeEach(() => { r = new NodeRegistry(); });
  const entry = (id: NodeID, ov?: Partial<KnownNodeEntry>): KnownNodeEntry => ({nodeId:id,role:NodeRole.USER,displayName:'N',lastSeen:1000 as Timestamp,reachable:true,hopDistance:1,...ov});
  it('starts empty', () => { expect(r.size()).toBe(0); });
  it('registers and retrieves', () => { r.upsert(entry(NODE_A)); expect(r.has(NODE_A)).toBe(true); });
  it('updates existing', () => { r.upsert(entry(NODE_A,{hopDistance:3})); r.upsert(entry(NODE_A,{hopDistance:1})); expect(r.get(NODE_A)!.hopDistance).toBe(1); });
  it('returns reachable only', () => { r.upsert(entry(NODE_A,{reachable:true})); r.upsert(entry(NODE_B,{reachable:false})); expect(r.getReachable()).toHaveLength(1); });
  it('marks unreachable', () => { r.upsert(entry(NODE_A)); r.markUnreachable(NODE_A); expect(r.get(NODE_A)!.reachable).toBe(false); });
  it('marks reachable', () => { r.upsert(entry(NODE_A,{reachable:false,hopDistance:5})); r.markReachable(NODE_A,2); expect(r.get(NODE_A)!.reachable).toBe(true); expect(r.get(NODE_A)!.hopDistance).toBe(2); });
  it('filters by role', () => { r.upsert(entry(NODE_A,{role:NodeRole.USER})); r.upsert(entry(NODE_B,{role:NodeRole.ADMIN})); expect(r.getByRole(NodeRole.ADMIN)).toHaveLength(1); });
  it('finds Admin', () => { r.upsert(entry(NODE_B,{role:NodeRole.ADMIN})); expect(r.findAdmin()!.nodeId).toBe(NODE_B); });
  it('returns undefined if no Admin', () => { r.upsert(entry(NODE_A)); expect(r.findAdmin()).toBeUndefined(); });
  it('removes node', () => { r.upsert(entry(NODE_A)); expect(r.remove(NODE_A)).toBe(true); expect(r.size()).toBe(0); });
  it('clears all', () => { r.upsert(entry(NODE_A)); r.upsert(entry(NODE_B)); r.clear(); expect(r.size()).toBe(0); });
});

describe('HeartbeatState', () => {
  let hb: HeartbeatState;
  beforeEach(() => { hb = new HeartbeatState(5000, 15000); });
  it('enforces timeout >= 3x interval', () => { expect(() => new HeartbeatState(5000,10000)).toThrow(); });
  it('reports ALIVE after heartbeat', () => { hb.recordHeartbeat(NODE_A,SESSION_1,1000 as Timestamp,3,50); expect(hb.getStatus(NODE_A,2000 as Timestamp)).toBe(HeartbeatStatus.ALIVE); });
  it('reports DEGRADED after 2x interval', () => { hb.recordHeartbeat(NODE_A,SESSION_1,1000 as Timestamp,3,50); expect(hb.getStatus(NODE_A,11001 as Timestamp)).toBe(HeartbeatStatus.DEGRADED); });
  it('reports DEAD after timeout', () => { hb.recordHeartbeat(NODE_A,SESSION_1,1000 as Timestamp,3,50); expect(hb.getStatus(NODE_A,16001 as Timestamp)).toBe(HeartbeatStatus.DEAD); });
  it('reports DEAD for unknown', () => { expect(hb.getStatus(NODE_A,1000 as Timestamp)).toBe(HeartbeatStatus.DEAD); });
  it('detects session change', () => { hb.recordHeartbeat(NODE_A,SESSION_1,1000 as Timestamp,3,50); const prev = hb.recordHeartbeat(NODE_A,SESSION_2,2000 as Timestamp,2,30); expect(prev).toBe(SESSION_1); });
  it('returns null for first heartbeat', () => { expect(hb.recordHeartbeat(NODE_A,SESSION_1,1000 as Timestamp,3,50)).toBeNull(); });
  it('returns null if session unchanged', () => { hb.recordHeartbeat(NODE_A,SESSION_1,1000 as Timestamp,3,50); expect(hb.recordHeartbeat(NODE_A,SESSION_1,6000 as Timestamp,3,50)).toBeNull(); });
  it('getDeadNeighbors', () => { hb.recordHeartbeat(NODE_A,SESSION_1,1000 as Timestamp,3,50); hb.recordHeartbeat(NODE_B,SESSION_2,10000 as Timestamp,2,30); const d = hb.getDeadNeighbors(20000 as Timestamp); expect(d).toContain(NODE_A); expect(d).not.toContain(NODE_B); });
  it('removes record', () => { hb.recordHeartbeat(NODE_A,SESSION_1,1000 as Timestamp,3,50); expect(hb.remove(NODE_A)).toBe(true); expect(hb.size()).toBe(0); });
  it('clears all', () => { hb.recordHeartbeat(NODE_A,SESSION_1,1000 as Timestamp,3,50); hb.clear(); expect(hb.size()).toBe(0); });
  it('exposes config', () => { expect(hb.getInterval()).toBe(5000); expect(hb.getTimeout()).toBe(15000); });
});

describe('NodeStatus', () => {
  let nt: NeighborTable; let rt: RoutingTable; let hb: HeartbeatState;
  beforeEach(() => { nt = new NeighborTable(); rt = new RoutingTable(); hb = new HeartbeatState(5000,15000); });
  it('empty tables', () => { const h = computeNodeHealth(nt,rt,hb,1000 as Timestamp); expect(h.neighborCount).toBe(0); expect(h.meshConnected).toBe(false); });
  it('with alive neighbors', () => { nt.upsert(makeNeighbor(NODE_A,{linkQuality:0.9})); nt.upsert(makeNeighbor(NODE_B,{linkQuality:0.7})); hb.recordHeartbeat(NODE_A,SESSION_1,9000 as Timestamp,2,30); hb.recordHeartbeat(NODE_B,SESSION_2,9000 as Timestamp,1,20); const h = computeNodeHealth(nt,rt,hb,10000 as Timestamp); expect(h.aliveNeighbors).toBe(2); expect(h.meshConnected).toBe(true); expect(h.averageLinkQuality).toBe(0.8); });
  it('counts dead neighbors', () => { nt.upsert(makeNeighbor(NODE_A)); hb.recordHeartbeat(NODE_A,SESSION_1,1000 as Timestamp,2,30); const h = computeNodeHealth(nt,rt,hb,20000 as Timestamp); expect(h.deadNeighbors).toBe(1); expect(h.meshConnected).toBe(false); });
  it('includes route count', () => { rt.upsert(makeRoute(NODE_C)); const h = computeNodeHealth(nt,rt,hb,1000 as Timestamp); expect(h.routeCount).toBe(1); });
  it('computeNeighborStatuses', () => { nt.upsert(makeNeighbor(NODE_A,{linkQuality:0.95,displayName:'Alpha'})); hb.recordHeartbeat(NODE_A,SESSION_1,8000 as Timestamp,3,40); const s = computeNeighborStatuses(nt,hb,10000 as Timestamp); expect(s).toHaveLength(1); expect(s[0]!.displayName).toBe('Alpha'); expect(s[0]!.heartbeatStatus).toBe(HeartbeatStatus.ALIVE); expect(s[0]!.lastHeartbeatAge).toBe(2000); });
});
