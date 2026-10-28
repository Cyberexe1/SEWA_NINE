/**
 * NINE Security — Key Manager
 *
 * RFC Section 10.4: Orchestrates key lifecycle.
 * Manages Admin RSA key pair and distributes the public key.
 * Coordinates session key generation for secure messages.
 */

import { type Timestamp } from '../shared/Types.js';
import { generateRSAKeyPair, encryptRSA, decryptRSA, type RSAKeyPair } from './RSA2048.js';
import { encryptAES, decryptAES } from './AES256GCM.js';
import { SessionKeyManager } from './SessionKey.js';

export interface SecureMessageBundle {
  readonly ciphertext: Buffer;
  readonly iv: Buffer;
  readonly tag: Buffer;
  readonly encryptedKey: Buffer;
  readonly sessionKeyId: string;
}

export class KeyManager {
  private adminKeyPair: RSAKeyPair | null = null;
  private adminPublicKey: Buffer | null = null;
  readonly sessions: SessionKeyManager;

  constructor(sessionKeyMaxAgeMs: number = 60000) {
    this.sessions = new SessionKeyManager(sessionKeyMaxAgeMs);
  }

  /** Generate the Admin RSA key pair (Admin node only). */
  generateAdminKeys(): RSAKeyPair {
    this.adminKeyPair = generateRSAKeyPair();
    this.adminPublicKey = this.adminKeyPair.publicKey;
    return this.adminKeyPair;
  }

  /** Store the Admin's public key (received from discovery/KEY_ANNOUNCE). */
  setAdminPublicKey(key: Buffer): void {
    this.adminPublicKey = Buffer.from(key);
  }

  /** Get the Admin's public key. */
  getAdminPublicKey(): Buffer | null {
    return this.adminPublicKey;
  }

  /** Get the Admin's private key (Admin node only). */
  getAdminPrivateKey(): Buffer | null {
    return this.adminKeyPair?.privateKey ?? null;
  }

  /** Check if Admin public key is available. */
  hasAdminPublicKey(): boolean {
    return this.adminPublicKey !== null;
  }

  /**
   * Encrypt a message for the Admin.
   * Generates one-time AES session key, encrypts message, wraps key with RSA.
   */
  encryptForAdmin(plaintext: Buffer, now: Timestamp): SecureMessageBundle {
    if (!this.adminPublicKey) throw new Error('ADMIN_KEY_NOT_AVAILABLE');

    // Generate one-time session key
    const sessionRecord = this.sessions.generate(now);
    const sessionKey = Buffer.from(sessionRecord.key); // copy before erasure

    // Encrypt message with AES-256-GCM
    const { ciphertext, iv, tag } = encryptAES(sessionKey, plaintext);

    // Encrypt session key with Admin's RSA public key
    const encryptedKey = encryptRSA(this.adminPublicKey, sessionKey);

    // Securely erase session key from memory
    sessionKey.fill(0);
    this.sessions.markUsed(sessionRecord.keyId);

    return { ciphertext, iv, tag, encryptedKey, sessionKeyId: sessionRecord.keyId };
  }

  /**
   * Decrypt a message as Admin.
   * Unwraps AES key with RSA private key, then decrypts message.
   */
  decryptAsAdmin(bundle: SecureMessageBundle): Buffer {
    if (!this.adminKeyPair) throw new Error('ADMIN_PRIVATE_KEY_NOT_AVAILABLE');

    // Decrypt session key with RSA private key
    const sessionKey = decryptRSA(this.adminKeyPair.privateKey, bundle.encryptedKey);

    // Decrypt message with AES-256-GCM
    const plaintext = decryptAES(sessionKey, bundle.iv, bundle.ciphertext, bundle.tag);

    // Securely erase session key
    sessionKey.fill(0);

    return plaintext;
  }

  /** Periodic maintenance: evict expired session keys. */
  tick(now: Timestamp): void {
    this.sessions.evictExpired(now);
  }

  /** Destroy all key material. */
  destroy(): void {
    if (this.adminKeyPair) {
      this.adminKeyPair.privateKey.fill(0);
      this.adminKeyPair.publicKey.fill(0);
      this.adminKeyPair = null;
    }
    if (this.adminPublicKey) {
      this.adminPublicKey.fill(0);
      this.adminPublicKey = null;
    }
    this.sessions.clear();
  }
}
