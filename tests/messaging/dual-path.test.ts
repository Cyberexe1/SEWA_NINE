import { describe, it, expect, beforeEach } from 'vitest';
import { DualPathManager } from '../../core/messaging/DualPathManager.js';
import { PathSelector, type DualPaths } from '../../core/messaging/PathSelector.js';
import { ReassemblyManager } from '../../core/messaging/ReassemblyManager.js';
import { KeyManager } from '../../core/security/KeyManager.js';
import { createPacket } from '../../core/protocol/PacketFactory.js';
import { serialize, } from '../../core/protocol/Serializer.js';
import { parse } from '../../core/protocol/Parser.js';
import { type NodeID, type Timestamp, PacketType } from '../../core/shared/Types.js';

const SENDER = '11111111-aaaa-4bbb-8ccc-dddddddddddd' as NodeID;
const ADMIN = '22222222-bbbb-4ccc-8ddd-eeeeeeeeeeee' as NodeID;
const RELAY_B = '33333333-cccc-4ddd-8eee-ffffffffffff' as NodeID;
const RELAY_C = '44444444-dddd-4eee-8fff-aaaaaaaaaaaa' as NodeID;

describe('ReassemblyManager', () => {
  let rm: ReassemblyManager;
  beforeEach(() => { rm = new ReassemblyManager(5000); });

  it('returns waiting when only data received', () => {
    expect(rm.receiveData('s1', Buffer.from('ct'), Buffer.alloc(12), Buffer.alloc(16), SENDER, 100 as Timestamp)).toBe('waiting');
    expect(rm.getPendingCount()).toBe(1);
  });

  it('returns ready when both halves arrive', () => {
    rm.receiveData('s1', Buffer.from('ct'), Buffer.alloc(12), Buffer.alloc(16), SENDER, 100 as Timestamp);
    expect(rm.receiveKey('s1', Buffer.alloc(256), 200 as Timestamp)).toBe('ready');
  });

  it('returns ready when key arrives first then data', () => {
    rm.receiveKey('s2', Buffer.alloc(256), 100 as Timestamp);
    expect(rm.receiveData('s2', Buffer.from('x'), Buffer.alloc(12), Buffer.alloc(16), SENDER, 200 as Timestamp)).toBe('ready');
  });

  it('detects duplicate data', () => {
    rm.receiveData('s1', Buffer.from('ct'), Buffer.alloc(12), Buffer.alloc(16), SENDER, 100 as Timestamp);
    expect(rm.receiveData('s1', Buffer.from('ct'), Buffer.alloc(12), Buffer.alloc(16), SENDER, 200 as Timestamp)).toBe('duplicate');
  });

  it('detects duplicate after completion', () => {
    rm.receiveData('s1', Buffer.from('ct'), Buffer.alloc(12), Buffer.alloc(16), SENDER, 100 as Timestamp);
    rm.receiveKey('s1', Buffer.alloc(256), 200 as Timestamp);
    rm.complete('s1');
    expect(rm.receiveData('s1', Buffer.from('ct'), Buffer.alloc(12), Buffer.alloc(16), SENDER, 300 as Timestamp)).toBe('duplicate');
  });

  it('evicts expired partials', () => {
    rm.receiveData('s1', Buffer.from('ct'), Buffer.alloc(12), Buffer.alloc(16), SENDER, 100 as Timestamp);
    expect(rm.evictExpired(6000 as Timestamp)).toBe(1);
    expect(rm.getPendingCount()).toBe(0);
  });

  it('getAssembled returns null if incomplete', () => {
    rm.receiveData('s1', Buffer.from('ct'), Buffer.alloc(12), Buffer.alloc(16), SENDER, 100 as Timestamp);
    expect(rm.getAssembled('s1')).toBeNull();
  });

  it('getAssembled returns full message when complete', () => {
    rm.receiveData('s1', Buffer.from('cipher'), Buffer.alloc(12), Buffer.alloc(16), SENDER, 100 as Timestamp);
    rm.receiveKey('s1', Buffer.from('enckey'), 200 as Timestamp);
    const assembled = rm.getAssembled('s1');
    expect(assembled).not.toBeNull();
    expect(assembled!.ciphertext.toString()).toBe('cipher');
    expect(assembled!.encryptedKey.toString()).toBe('enckey');
  });
});

describe('PathSelector', () => {
  it('returns disjoint paths when available', () => {
    const selector = new PathSelector((_source, to) => ({
      pathA: [SENDER, RELAY_B, to], pathB: [SENDER, RELAY_C, to], disjoint: true, overlapScore: 0,
    }));
    const result = selector.selectPaths(SENDER, ADMIN);
    expect(result.disjoint).toBe(true);
    expect(result.hasRoute).toBe(true);
    expect(result.pathA).toContain(RELAY_B);
    expect(result.pathB).toContain(RELAY_C);
  });

  it('falls back to same path when no disjoint pair', () => {
    const selector = new PathSelector((_source, to) => ({
      pathA: [SENDER, RELAY_B, to], pathB: [SENDER, RELAY_B, to], disjoint: false, overlapScore: 1,
    }));
    const result = selector.selectPaths(SENDER, ADMIN);
    expect(result.disjoint).toBe(false);
    expect(result.pathA).toEqual(result.pathB);
  });

  it('reports hasRoute=false when no route exists', () => {
    const selector = new PathSelector(() => null);
    const result = selector.selectPaths(SENDER, ADMIN);
    expect(result.hasRoute).toBe(false);
  });
});

describe('DualPathManager — End-to-End', () => {
  function createDualPathSetup(disjoint: boolean = true) {
    const senderKM = new KeyManager();
    const adminKM = new KeyManager();
    adminKM.generateAdminKeys();
    senderKM.setAdminPublicKey(adminKM.getAdminPublicKey()!);

    let time = 1000;
    const sentPackets: { bytes: Buffer; path: NodeID[] }[] = [];

    const pathSelector = new PathSelector((_source, to) => {
      if (disjoint) {
        return { pathA: [SENDER, RELAY_B, to], pathB: [SENDER, RELAY_C, to], disjoint: true, overlapScore: 0 };
      }
      return { pathA: [SENDER, RELAY_B, to], pathB: [SENDER, RELAY_B, to], disjoint: false, overlapScore: 1 };
    });

    const sender = new DualPathManager({
      selfId: SENDER,
      keyManager: senderKM,
      pathSelector,
      routedSend: (bytes, path) => { sentPackets.push({ bytes, path }); },
      clock: () => time as Timestamp,
    });

    const admin = new DualPathManager({
      selfId: ADMIN,
      keyManager: adminKM,
      pathSelector,
      routedSend: () => {},
      clock: () => time as Timestamp,
    });

    return { sender, admin, sentPackets, advanceTime: (ms: number) => { time += ms; } };
  }

  it('Scenario 1: Successful dual-path delivery', () => {
    const { sender, admin, sentPackets } = createDualPathSetup(true);
    sender.sendSecureMessage('Top secret intel', ADMIN);

    expect(sentPackets).toHaveLength(2);

    // Deliver both packets to admin
    const pkt1 = parse(sentPackets[0]!.bytes);
    const pkt2 = parse(sentPackets[1]!.bytes);

    let result: string | null = null;
    if (pkt1.header.packetType === PacketType.ENCRYPTED_MESSAGE) {
      admin.handleSecureData(pkt1);
      result = admin.handleSecureKey(pkt2);
    } else {
      admin.handleSecureKey(pkt1);
      result = admin.handleSecureData(pkt2);
    }

    expect(result).toBe('Top secret intel');
    expect(sender.getMetrics().dualPathUsed).toBe(1);
    expect(admin.getMetrics().messagesDelivered).toBe(1);
  });

  it('Scenario 2: Key delayed — message arrives first', () => {
    const { sender, admin, sentPackets, advanceTime } = createDualPathSetup();
    sender.sendSecureMessage('delayed key test', ADMIN);

    const dataIdx = sentPackets.findIndex(s => parse(s.bytes).header.packetType === PacketType.ENCRYPTED_MESSAGE);
    const keyIdx = dataIdx === 0 ? 1 : 0;

    // Deliver data first
    const dataPkt = parse(sentPackets[dataIdx]!.bytes);
    expect(admin.handleSecureData(dataPkt)).toBeNull(); // waiting

    advanceTime(5000); // 5 seconds delay

    // Deliver key
    const keyPkt = parse(sentPackets[keyIdx]!.bytes);
    const result = admin.handleSecureKey(keyPkt);
    expect(result).toBe('delayed key test');
  });

  it('Scenario 3: Message delayed — key arrives first', () => {
    const { sender, admin, sentPackets, advanceTime } = createDualPathSetup();
    sender.sendSecureMessage('delayed data test', ADMIN);

    const keyIdx = sentPackets.findIndex(s => parse(s.bytes).header.packetType === PacketType.KEY_PACKET);
    const dataIdx = keyIdx === 0 ? 1 : 0;

    // Deliver key first
    const keyPkt = parse(sentPackets[keyIdx]!.bytes);
    expect(admin.handleSecureKey(keyPkt)).toBeNull();

    advanceTime(3000);

    // Deliver data
    const dataPkt = parse(sentPackets[dataIdx]!.bytes);
    const result = admin.handleSecureData(dataPkt);
    expect(result).toBe('delayed data test');
  });

  it('Scenario 4: Primary path failure (data lost) — timeout', () => {
    const { sender, admin, sentPackets, advanceTime } = createDualPathSetup();
    sender.sendSecureMessage('will be lost', ADMIN);

    // Only deliver key, not data
    const keyIdx = sentPackets.findIndex(s => parse(s.bytes).header.packetType === PacketType.KEY_PACKET);
    const keyPkt = parse(sentPackets[keyIdx]!.bytes);
    admin.handleSecureKey(keyPkt);

    expect(admin.reassembly.getPendingCount()).toBe(1);
    advanceTime(31000);
    const timedOut = admin.tick();
    expect(timedOut).toBe(1);
    expect(admin.getMetrics().messagesTimedOut).toBe(1);
  });

  it('Scenario 5: Secondary path failure (key lost) — timeout', () => {
    const { sender, admin, sentPackets, advanceTime } = createDualPathSetup();
    sender.sendSecureMessage('key will be lost', ADMIN);

    const dataIdx = sentPackets.findIndex(s => parse(s.bytes).header.packetType === PacketType.ENCRYPTED_MESSAGE);
    const dataPkt = parse(sentPackets[dataIdx]!.bytes);
    admin.handleSecureData(dataPkt);

    advanceTime(31000);
    expect(admin.tick()).toBe(1);
  });

  it('Scenario 6: Duplicate packet suppression', () => {
    const { sender, admin, sentPackets } = createDualPathSetup();
    sender.sendSecureMessage('no duplicates', ADMIN);

    const dataPkt = parse(sentPackets.find(s => parse(s.bytes).header.packetType === PacketType.ENCRYPTED_MESSAGE)!.bytes);
    const keyPkt = parse(sentPackets.find(s => parse(s.bytes).header.packetType === PacketType.KEY_PACKET)!.bytes);

    admin.handleSecureData(dataPkt);
    admin.handleSecureData(dataPkt); // duplicate
    const result = admin.handleSecureKey(keyPkt);

    expect(result).toBe('no duplicates');
    expect(admin.getMetrics().duplicatesSuppressed).toBe(1);
  });

  it('Scenario 7: Timeout handling with no delivery', () => {
    const { admin, advanceTime } = createDualPathSetup();

    // Manually inject a partial
    admin.reassembly.receiveData('orphan', Buffer.from('x'), Buffer.alloc(12), Buffer.alloc(16), SENDER, 100 as Timestamp);
    advanceTime(40000);
    expect(admin.tick()).toBe(1);
    expect(admin.reassembly.getPendingCount()).toBe(0);
  });

  it('single-path fallback when no disjoint path available', () => {
    const { sender } = createDualPathSetup(false);
    const result = sender.sendSecureMessage('fallback', ADMIN);
    expect(result.dualPathAchieved).toBe(false);
    expect(sender.getMetrics().singlePathFallback).toBe(1);
  });

  it('metrics track correctly across multiple messages', () => {
    const { sender, admin, sentPackets } = createDualPathSetup(true);

    for (let i = 0; i < 5; i++) {
      sender.sendSecureMessage(`msg ${i}`, ADMIN);
    }
    expect(sentPackets).toHaveLength(10); // 5 messages × 2 packets

    // Deliver all
    for (const sp of sentPackets) {
      const pkt = parse(sp.bytes);
      if (pkt.header.packetType === PacketType.ENCRYPTED_MESSAGE) admin.handleSecureData(pkt);
      else admin.handleSecureKey(pkt);
    }

    expect(admin.getMetrics().messagesDelivered).toBe(5);
    expect(sender.getMetrics().messagesSent).toBe(5);
    expect(sender.getMetrics().dualPathUsed).toBe(5);
  });
});
