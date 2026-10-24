/**
 * NINE Protocol - AES-256 Encryption Engine
 *
 * Provides symmetric encryption/decryption using AES-256.
 * Supports GCM (preferred, authenticated) and CBC (fallback) modes.
 *
 * This module does NOT know about packets, routing, or transport.
 * It operates on raw buffers.
 */

import type { AESMode } from '../shared/Types.js';

/**
 * Result of an AES encryption operation.
 */
export interface AESEncryptionResult {
  /** Encrypted data */
  ciphertext: Buffer;

  /** Initialization vector used */
  iv: Buffer;

  /** GCM authentication tag (empty buffer for CBC mode) */
  tag: Buffer;
}

/**
 * AES-256 encryption interface.
 */
export interface IAES {
  /**
   * Generate a random 256-bit key.
   * Uses cryptographically secure random number generation.
   */
  generateKey(): Buffer;

  /**
   * Generate a random IV appropriate for the mode.
   * GCM: 12 bytes (96 bits)
   * CBC: 16 bytes (128 bits)
   */
  generateIV(mode: AESMode): Buffer;

  /**
   * Encrypt plaintext with AES-256.
   *
   * @param key - 32-byte AES key
   * @param iv - Initialization vector
   * @param plaintext - Data to encrypt
   * @param mode - GCM or CBC
   * @returns Ciphertext, IV, and authentication tag
   */
  encrypt(key: Buffer, iv: Buffer, plaintext: Buffer, mode: AESMode): AESEncryptionResult;

  /**
   * Decrypt ciphertext with AES-256.
   *
   * @param key - 32-byte AES key
   * @param iv - Initialization vector (same as used for encryption)
   * @param ciphertext - Data to decrypt
   * @param mode - GCM or CBC
   * @param tag - GCM authentication tag (required for GCM mode)
   * @returns Decrypted plaintext
   * @throws DecryptionError if decryption fails (intentionally vague)
   */
  decrypt(key: Buffer, iv: Buffer, ciphertext: Buffer, mode: AESMode, tag?: Buffer): Buffer;
}
