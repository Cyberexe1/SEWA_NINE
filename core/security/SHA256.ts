/**
 * NINE Security — SHA-256 Hashing
 *
 * RFC Section 10.3: Integrity verification and key derivation.
 * Uses constant-time comparison to prevent timing attacks.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Compute SHA-256 hash. Returns 32-byte Buffer. */
export function sha256(data: Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}

/** Verify data matches expected hash (constant-time). */
export function verifySHA256(data: Buffer, expectedHash: Buffer): boolean {
  if (expectedHash.length !== 32) return false;
  const computed = sha256(data);
  return timingSafeEqual(computed, expectedHash);
}

/** Compute HMAC-SHA-256. Returns 32-byte Buffer. */
export function hmacSHA256(key: Buffer, data: Buffer): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

/** Verify HMAC-SHA-256 (constant-time). */
export function verifyHMAC(key: Buffer, data: Buffer, expectedMac: Buffer): boolean {
  if (expectedMac.length !== 32) return false;
  const computed = hmacSHA256(key, data);
  return timingSafeEqual(computed, expectedMac);
}
