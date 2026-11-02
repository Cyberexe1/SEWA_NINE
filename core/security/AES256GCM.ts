/**
 * NINE Security — AES-256-GCM Encryption/Decryption
 *
 * RFC Section 10.1: Authenticated encryption for message payloads.
 * Uses Node.js native crypto. No external dependencies.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface AESEncryptResult {
  readonly ciphertext: Buffer;
  readonly iv: Buffer;
  readonly tag: Buffer;
}

const KEY_SIZE = 32;  // 256 bits
const IV_SIZE = 12;   // 96 bits for GCM
const TAG_SIZE = 16;  // 128 bits

/** Generate a random AES-256 key (32 bytes). */
export function generateAESKey(): Buffer {
  return randomBytes(KEY_SIZE);
}

/** Generate a random IV for GCM (12 bytes). */
export function generateIV(): Buffer {
  return randomBytes(IV_SIZE);
}

/** Encrypt plaintext with AES-256-GCM. Returns ciphertext + IV + auth tag. */
export function encryptAES(key: Buffer, plaintext: Buffer): AESEncryptResult {
  if (key.length !== KEY_SIZE) throw new Error(`AES key must be ${KEY_SIZE} bytes`);
  const iv = generateIV();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

/** Decrypt ciphertext with AES-256-GCM. Throws on integrity failure. */
export function decryptAES(key: Buffer, iv: Buffer, ciphertext: Buffer, tag: Buffer): Buffer {
  if (key.length !== KEY_SIZE) throw new Error(`AES key must be ${KEY_SIZE} bytes`);
  if (iv.length !== IV_SIZE) throw new Error(`IV must be ${IV_SIZE} bytes`);
  if (tag.length !== TAG_SIZE) throw new Error(`Auth tag must be ${TAG_SIZE} bytes`);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('INTEGRITY_FAILED: Decryption failed — data may be tampered');
  }
}
