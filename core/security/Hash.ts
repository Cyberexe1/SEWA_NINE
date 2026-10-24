/**
 * NINE Protocol - SHA-256 Hashing
 *
 * Provides integrity verification through cryptographic hashing.
 * Used for checksums, data integrity, and key derivation.
 */

/**
 * SHA-256 hashing interface.
 */
export interface IHash {
  /**
   * Compute SHA-256 hash of data.
   *
   * @param data - Input buffer
   * @returns 32-byte hash
   */
  hash(data: Buffer): Buffer;

  /**
   * Verify data against an expected hash.
   * Uses CONSTANT-TIME comparison to prevent timing attacks.
   *
   * @param data - Data to verify
   * @param expectedHash - Expected 32-byte hash
   * @returns true if hash matches
   */
  verify(data: Buffer, expectedHash: Buffer): boolean;

  /**
   * Compute HMAC-SHA-256 (for AES-CBC integrity when GCM is unavailable).
   *
   * @param key - HMAC key
   * @param data - Data to authenticate
   * @returns 32-byte HMAC
   */
  hmac(key: Buffer, data: Buffer): Buffer;

  /**
   * Verify HMAC-SHA-256 with constant-time comparison.
   */
  verifyHmac(key: Buffer, data: Buffer, expectedHmac: Buffer): boolean;
}
