/**
 * NINE Protocol — CRC-32 Checksum
 *
 * Conforms to NINE-PacketEncoding-v1.0 Section 7.
 * ISO 3309 CRC-32, polynomial 0x04C11DB7.
 */

const CRC_TABLE = buildTable();

function buildTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
    }
    table[i] = crc >>> 0;
  }
  return table;
}

/**
 * Compute CRC-32 over a buffer.
 */
export function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i]!;
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
