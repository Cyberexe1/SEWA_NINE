/**
 * NINE Protocol - Key Manager
 *
 * Orchestrates key generation, storage, distribution, and lifecycle.
 * Coordinates between AES, RSA, and the storage layer.
 */

import type { AESMode, RSAMode } from '../shared/Types.js';
import type { RSAKeyPair } from './RSA.js';

/**
 * Secure message bundle — the output of encrypting a message for Admin.
 * Contains everything needed for dual-path delivery.
 */
export interface SecureMessageBundle {
  /** AES-encrypted message content */
  ciphertext: Buffer;

  /** AES initialization vector */
  iv: Buffer;

  /** GCM authentication tag */
  tag: Buffer;

  /** RSA-encrypted AES session key */
  encryptedKey: Buffer;

  /** Which symmetric algorithm was used */
  algorithm: AESMode;

  /** Which asymmetric algorithm was used for the key */
  keyAlgorithm: RSAMode;
}

/**
 * Key Manager interface.
 */
export interface IKeyManager {
  /** Initialize the key manager (load stored keys, generate if needed) */
  initialize(): Promise<void>;

  /** Generate Admin RSA key pair (Admin nodes only) */
  generateAdminKeyPair(): Promise<RSAKeyPair>;

  /** Get the Admin's public key (returns null if not yet received) */
  getAdminPublicKey(): Promise<Buffer | null>;

  /** Store the Admin's public key (received during discovery) */
  storeAdminPublicKey(key: Buffer): Promise<void>;

  /** Get the Admin's private key (Admin nodes only) */
  getAdminPrivateKey(): Promise<Buffer | null>;

  /**
   * Encrypt a message for the Admin.
   * Generates session key, encrypts message, encrypts key.
   *
   * @param plaintext - Message to encrypt
   * @param adminPublicKey - Admin's RSA public key
   * @returns Bundle ready for dual-path delivery
   */
  encryptForAdmin(plaintext: string, adminPublicKey: Buffer): SecureMessageBundle;

  /**
   * Decrypt a message received as Admin.
   * Decrypts session key, then decrypts message.
   *
   * @param bundle - Received secure message bundle
   * @param adminPrivateKey - Admin's RSA private key
   * @returns Decrypted plaintext
   */
  decryptAsAdmin(bundle: SecureMessageBundle, adminPrivateKey: Buffer): string;

  /** Securely erase all key material from memory */
  destroy(): void;
}
