import { describe, it, expect, beforeEach } from 'vitest';
import { generateAESKey, generateIV, encryptAES, decryptAES } from '../../core/security/AES256GCM.js';
import { generateRSAKeyPair, encryptRSA, decryptRSA } from '../../core/security/RSA2048.js';
import { sha256, verifySHA256, hmacSHA256, verifyHMAC } from '../../core/security/SHA256.js';
import { SessionKeyManager } from '../../core/security/SessionKey.js';
import { KeyManager } from '../../core/security/KeyManager.js';
import { ReplayProtection } from '../../core/security/ReplayProtection.js';
import { type NodeID, type PacketID, type Timestamp } from '../../core/shared/Types.js';

const A = '11111111-aaaa-4bbb-8ccc-dddddddddddd' as NodeID;
const B = '22222222-bbbb-4ccc-8ddd-eeeeeeeeeeee' as NodeID;

describe('AES-256-GCM', () => {
  it('encrypts and decrypts correctly', () => {
    const key = generateAESKey();
    const plain = Buffer.from('Hello NINE protocol');
    const { ciphertext, iv, tag } = encryptAES(key, plain);
    const decrypted = decryptAES(key, iv, ciphertext, tag);
    expect(decrypted.toString()).toBe('Hello NINE protocol');
  });

  it('generates 32-byte keys', () => { expect(generateAESKey().length).toBe(32); });
  it('generates 12-byte IVs', () => { expect(generateIV().length).toBe(12); });
  it('generates unique keys each call', () => { expect(generateAESKey().equals(generateAESKey())).toBe(false); });

  it('fails with wrong key', () => {
    const key = generateAESKey();
    const wrongKey = generateAESKey();
    const { ciphertext, iv, tag } = encryptAES(key, Buffer.from('secret'));
    expect(() => decryptAES(wrongKey, iv, ciphertext, tag)).toThrow();
  });

  it('fails with tampered ciphertext', () => {
    const key = generateAESKey();
    const { ciphertext, iv, tag } = encryptAES(key, Buffer.from('data'));
    ciphertext[0] = (ciphertext[0]! ^ 0xFF);
    expect(() => decryptAES(key, iv, ciphertext, tag)).toThrow('INTEGRITY_FAILED');
  });

  it('fails with tampered tag', () => {
    const key = generateAESKey();
    const { ciphertext, iv, tag } = encryptAES(key, Buffer.from('data'));
    tag[0] = (tag[0]! ^ 0xFF);
    expect(() => decryptAES(key, iv, ciphertext, tag)).toThrow();
  });

  it('rejects invalid key size', () => {
    expect(() => encryptAES(Buffer.alloc(16), Buffer.from('x'))).toThrow('32 bytes');
  });
});

describe('RSA-2048', () => {
  it('generates valid key pair', () => {
    const kp = generateRSAKeyPair();
    expect(kp.publicKey.length).toBeGreaterThan(200);
    expect(kp.privateKey.length).toBeGreaterThan(1000);
  });

  it('encrypts and decrypts AES key', () => {
    const kp = generateRSAKeyPair();
    const aesKey = generateAESKey();
    const encrypted = encryptRSA(kp.publicKey, aesKey);
    const decrypted = decryptRSA(kp.privateKey, encrypted);
    expect(decrypted.equals(aesKey)).toBe(true);
  });

  it('fails with wrong private key', () => {
    const kp1 = generateRSAKeyPair();
    const kp2 = generateRSAKeyPair();
    const encrypted = encryptRSA(kp1.publicKey, Buffer.from('secret-key-data!'));
    expect(() => decryptRSA(kp2.privateKey, encrypted)).toThrow('DECRYPTION_FAILED');
  });

  it('rejects plaintext > 190 bytes', () => {
    const kp = generateRSAKeyPair();
    expect(() => encryptRSA(kp.publicKey, Buffer.alloc(200))).toThrow('190 bytes');
  });
});

describe('SHA-256', () => {
  it('produces 32-byte hash', () => { expect(sha256(Buffer.from('test')).length).toBe(32); });
  it('is deterministic', () => { const a = sha256(Buffer.from('hello')); const b = sha256(Buffer.from('hello')); expect(a.equals(b)).toBe(true); });
  it('different inputs produce different hashes', () => { expect(sha256(Buffer.from('a')).equals(sha256(Buffer.from('b')))).toBe(false); });
  it('verifySHA256 accepts correct hash', () => { const data = Buffer.from('payload'); expect(verifySHA256(data, sha256(data))).toBe(true); });
  it('verifySHA256 rejects wrong hash', () => { expect(verifySHA256(Buffer.from('a'), sha256(Buffer.from('b')))).toBe(false); });
  it('HMAC works round-trip', () => { const key = Buffer.from('secret'); const data = Buffer.from('msg'); const mac = hmacSHA256(key, data); expect(verifyHMAC(key, data, mac)).toBe(true); });
  it('HMAC fails with wrong key', () => { const mac = hmacSHA256(Buffer.from('key1'), Buffer.from('msg')); expect(verifyHMAC(Buffer.from('key2'), Buffer.from('msg'), mac)).toBe(false); });
});

describe('SessionKeyManager', () => {
  let mgr: SessionKeyManager;
  beforeEach(() => { mgr = new SessionKeyManager(5000); });

  it('generates unique session keys', () => { const a = mgr.generate(100 as Timestamp); const b = mgr.generate(200 as Timestamp); expect(a.keyId).not.toBe(b.keyId); expect(a.key.equals(b.key)).toBe(false); });
  it('markUsed zeroes the key', () => { const r = mgr.generate(100 as Timestamp); mgr.markUsed(r.keyId); expect(r.key.every(b => b === 0)).toBe(true); expect(mgr.size()).toBe(0); });
  it('evicts expired keys', () => { mgr.generate(100 as Timestamp); mgr.generate(200 as Timestamp); expect(mgr.evictExpired(6000 as Timestamp)).toBe(2); expect(mgr.size()).toBe(0); });
});

describe('ReplayProtection', () => {
  let rp: ReplayProtection;
  beforeEach(() => { rp = new ReplayProtection(60000, 100); });

  it('allows fresh packet', () => { const r = rp.check('p1' as PacketID, A, 1, 1000 as Timestamp, 1500 as Timestamp); expect(r.allowed).toBe(true); });
  it('rejects duplicate packet ID', () => { rp.check('p1' as PacketID, A, 1, 1000 as Timestamp, 1500 as Timestamp); const r = rp.check('p1' as PacketID, A, 2, 2000 as Timestamp, 2500 as Timestamp); expect(r.allowed).toBe(false); expect(r.reason).toBe('duplicate_id'); });
  it('rejects stale timestamp', () => { const r = rp.check('p2' as PacketID, A, 1, 1000 as Timestamp, 70000 as Timestamp); expect(r.allowed).toBe(false); expect(r.reason).toBe('stale_timestamp'); });
  it('rejects replayed sequence number', () => { rp.check('p1' as PacketID, A, 5, 1000 as Timestamp, 1500 as Timestamp); const r = rp.check('p2' as PacketID, A, 3, 2000 as Timestamp, 2500 as Timestamp); expect(r.allowed).toBe(false); expect(r.reason).toBe('sequence_replay'); });
  it('allows higher sequence from same sender', () => { rp.check('p1' as PacketID, A, 5, 1000 as Timestamp, 1500 as Timestamp); const r = rp.check('p2' as PacketID, A, 6, 2000 as Timestamp, 2500 as Timestamp); expect(r.allowed).toBe(true); });
  it('tracks separate senders independently', () => { rp.check('p1' as PacketID, A, 10, 1000 as Timestamp, 1500 as Timestamp); const r = rp.check('p2' as PacketID, B, 1, 2000 as Timestamp, 2500 as Timestamp); expect(r.allowed).toBe(true); });
});

describe('KeyManager', () => {
  let km: KeyManager;
  beforeEach(() => { km = new KeyManager(); });

  it('generates Admin keys', () => { const kp = km.generateAdminKeys(); expect(kp.publicKey.length).toBeGreaterThan(200); expect(km.hasAdminPublicKey()).toBe(true); });
  it('stores external Admin public key', () => { const kp = generateRSAKeyPair(); km.setAdminPublicKey(kp.publicKey); expect(km.hasAdminPublicKey()).toBe(true); });

  it('encrypts and decrypts message end-to-end', () => {
    km.generateAdminKeys();
    const plaintext = Buffer.from('Mission status: complete');
    const bundle = km.encryptForAdmin(plaintext, 1000 as Timestamp);
    const decrypted = km.decryptAsAdmin(bundle);
    expect(decrypted.toString()).toBe('Mission status: complete');
  });

  it('decryption fails with wrong Admin key', () => {
    km.generateAdminKeys();
    const bundle = km.encryptForAdmin(Buffer.from('secret'), 1000 as Timestamp);
    // Create a new KeyManager with different keys
    const km2 = new KeyManager();
    km2.generateAdminKeys();
    // Try to decrypt with km2's keys using km's bundle
    expect(() => km2.decryptAsAdmin(bundle)).toThrow();
  });

  it('throws if no Admin public key for encryption', () => {
    expect(() => km.encryptForAdmin(Buffer.from('x'), 1000 as Timestamp)).toThrow('ADMIN_KEY_NOT_AVAILABLE');
  });

  it('session key is erased after encryption', () => {
    km.generateAdminKeys();
    km.encryptForAdmin(Buffer.from('test'), 1000 as Timestamp);
    expect(km.sessions.size()).toBe(0); // key was marked used and evicted
  });

  it('destroy zeroes all key material', () => {
    km.generateAdminKeys();
    km.destroy();
    expect(km.getAdminPublicKey()).toBeNull();
    expect(km.getAdminPrivateKey()).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// SIMULATOR DEMONSTRATIONS
// ═══════════════════════════════════════════════════════════════════════

describe('Demo 1: Successful encrypted message delivery', () => {
  it('encrypts at sender, decrypts at Admin', () => {
    const senderKM = new KeyManager();
    const adminKM = new KeyManager();
    adminKM.generateAdminKeys();
    senderKM.setAdminPublicKey(adminKM.getAdminPublicKey()!);

    const message = Buffer.from('Emergency intel from field');
    const bundle = senderKM.encryptForAdmin(message, 1000 as Timestamp);
    const plaintext = adminKM.decryptAsAdmin(bundle);
    expect(plaintext.toString()).toBe('Emergency intel from field');
  });
});

describe('Demo 2: Failed decryption with incorrect key', () => {
  it('rejects message encrypted with different Admin key', () => {
    const km1 = new KeyManager();
    km1.generateAdminKeys();
    const km2 = new KeyManager();
    km2.generateAdminKeys();

    // Sender uses km1's public key
    const senderKM = new KeyManager();
    senderKM.setAdminPublicKey(km1.getAdminPublicKey()!);
    const bundle = senderKM.encryptForAdmin(Buffer.from('classified'), 1000 as Timestamp);

    // km2 (different Admin) tries to decrypt
    expect(() => km2.decryptAsAdmin(bundle)).toThrow();
  });
});

describe('Demo 3: Replay attack detection', () => {
  it('rejects replayed packet ID', () => {
    const rp = new ReplayProtection();
    const r1 = rp.check('pkt-abc' as PacketID, A, 1, 5000 as Timestamp, 5500 as Timestamp);
    expect(r1.allowed).toBe(true);
    const r2 = rp.check('pkt-abc' as PacketID, A, 1, 5000 as Timestamp, 5500 as Timestamp);
    expect(r2.allowed).toBe(false);
    expect(r2.reason).toBe('duplicate_id');
  });

  it('rejects stale timestamp as potential replay', () => {
    const rp = new ReplayProtection(30000);
    const r = rp.check('pkt-old' as PacketID, A, 1, 1000 as Timestamp, 50000 as Timestamp);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('stale_timestamp');
  });
});

describe('Demo 4: Integrity failure after packet modification', () => {
  it('GCM detects tampered ciphertext', () => {
    const km = new KeyManager();
    km.generateAdminKeys();
    const bundle = km.encryptForAdmin(Buffer.from('original'), 1000 as Timestamp);
    // Tamper with ciphertext
    const tampered = { ...bundle, ciphertext: Buffer.from(bundle.ciphertext) };
    tampered.ciphertext[0] = (tampered.ciphertext[0]! ^ 0xFF);
    expect(() => km.decryptAsAdmin(tampered)).toThrow();
  });

  it('GCM detects tampered IV', () => {
    const km = new KeyManager();
    km.generateAdminKeys();
    const bundle = km.encryptForAdmin(Buffer.from('data'), 1000 as Timestamp);
    const tampered = { ...bundle, iv: Buffer.from(bundle.iv) };
    tampered.iv[0] = (tampered.iv[0]! ^ 0xFF);
    expect(() => km.decryptAsAdmin(tampered)).toThrow();
  });
});

describe('Demo 5: Automatic session key generation', () => {
  it('each message uses a unique session key', () => {
    const km = new KeyManager();
    km.generateAdminKeys();
    const b1 = km.encryptForAdmin(Buffer.from('msg1'), 1000 as Timestamp);
    const b2 = km.encryptForAdmin(Buffer.from('msg2'), 2000 as Timestamp);
    // Encrypted keys should differ (different session keys)
    expect(b1.encryptedKey.equals(b2.encryptedKey)).toBe(false);
    // Both decrypt correctly
    expect(km.decryptAsAdmin(b1).toString()).toBe('msg1');
    expect(km.decryptAsAdmin(b2).toString()).toBe('msg2');
  });
});

describe('Demo 6: Session key expiration', () => {
  it('expired keys are evicted', () => {
    const km = new KeyManager(1000); // 1 second max age
    km.generateAdminKeys();
    // Generate keys without using them
    km.sessions.generate(100 as Timestamp);
    km.sessions.generate(200 as Timestamp);
    expect(km.sessions.size()).toBe(2);
    km.tick(5000 as Timestamp);
    expect(km.sessions.size()).toBe(0);
  });
});

describe('Demo 7: Secure message validation before routing', () => {
  it('validates integrity before accepting message', () => {
    const km = new KeyManager();
    km.generateAdminKeys();
    const bundle = km.encryptForAdmin(Buffer.from('valid message'), 1000 as Timestamp);

    // Simulate a relay node tampering with the ciphertext
    const tamperedBundle = { ...bundle, ciphertext: Buffer.alloc(bundle.ciphertext.length, 0xAA) };

    // Admin rejects tampered message
    expect(() => km.decryptAsAdmin(tamperedBundle)).toThrow();

    // Original bundle still decrypts fine
    expect(km.decryptAsAdmin(bundle).toString()).toBe('valid message');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// BENCHMARKS
// ═══════════════════════════════════════════════════════════════════════

describe('Security Benchmarks', () => {
  it('AES-256-GCM: 1000 encrypt/decrypt cycles', () => {
    const key = generateAESKey();
    const plaintext = Buffer.alloc(256, 0x42); // 256 bytes
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      const { ciphertext, iv, tag } = encryptAES(key, plaintext);
      decryptAES(key, iv, ciphertext, tag);
    }
    const elapsed = performance.now() - start;
    console.log(`AES-256-GCM: 1000 cycles in ${elapsed.toFixed(1)}ms (${(elapsed/1000).toFixed(3)}ms/op)`);
    expect(elapsed).toBeLessThan(5000); // Should be well under 5s
  });

  it('RSA-2048: 10 key-wrap/unwrap cycles', () => {
    const kp = generateRSAKeyPair();
    const aesKey = generateAESKey();
    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      const enc = encryptRSA(kp.publicKey, aesKey);
      decryptRSA(kp.privateKey, enc);
    }
    const elapsed = performance.now() - start;
    console.log(`RSA-2048 wrap/unwrap: 10 cycles in ${elapsed.toFixed(1)}ms (${(elapsed/10).toFixed(1)}ms/op)`);
    expect(elapsed).toBeLessThan(10000);
  });

  it('SHA-256: 10000 hash operations', () => {
    const data = Buffer.alloc(512);
    const start = performance.now();
    for (let i = 0; i < 10000; i++) sha256(data);
    const elapsed = performance.now() - start;
    console.log(`SHA-256: 10000 ops in ${elapsed.toFixed(1)}ms (${(elapsed/10000*1000).toFixed(1)}μs/op)`);
    expect(elapsed).toBeLessThan(5000);
  });

  it('Full secure message: encrypt + decrypt latency', () => {
    const km = new KeyManager();
    km.generateAdminKeys();
    const msg = Buffer.from('Benchmark message for latency measurement');
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      const bundle = km.encryptForAdmin(msg, (1000 + i) as Timestamp);
      km.decryptAsAdmin(bundle);
    }
    const elapsed = performance.now() - start;
    console.log(`Full secure message: 100 cycles in ${elapsed.toFixed(1)}ms (${(elapsed/100).toFixed(2)}ms/op)`);
    expect(elapsed).toBeLessThan(30000);
  });
});
