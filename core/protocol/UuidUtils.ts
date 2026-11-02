/**
 * NINE Protocol — UUID Conversion Utilities
 *
 * Converts between UUID string representation (e.g., "550e8400-e29b-41d4-...")
 * and 16-byte binary representation as per RFC 4122.
 */

/**
 * Convert a UUID string to a 16-byte Buffer.
 * Input: "550e8400-e29b-41d4-a716-446655440000"
 * Output: Buffer of 16 bytes
 */
export function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32) {
    throw new Error(`Invalid UUID: "${uuid}" (expected 32 hex chars, got ${hex.length})`);
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Convert a 16-byte Buffer to a UUID string.
 * Input: Buffer of 16 bytes
 * Output: "550e8400-e29b-41d4-a716-446655440000"
 */
export function bytesToUuid(bytes: Buffer | Uint8Array): string {
  if (bytes.length !== 16) {
    throw new Error(`Invalid UUID bytes: expected 16 bytes, got ${bytes.length}`);
  }
  const hex = Buffer.from(bytes).toString('hex');
  return (
    hex.substring(0, 8) + '-' +
    hex.substring(8, 12) + '-' +
    hex.substring(12, 16) + '-' +
    hex.substring(16, 20) + '-' +
    hex.substring(20, 32)
  );
}
