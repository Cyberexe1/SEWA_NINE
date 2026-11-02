/**
 * NINE Security — RSA-2048 Key Wrapping/Unwrapping
 *
 * RFC Section 10.2: Asymmetric encryption for AES session key encapsulation.
 * Only Admin holds the private key.
 */

import { generateKeyPairSync, publicEncrypt, privateDecrypt, createPublicKey, createPrivateKey, constants } from 'node:crypto';

export interface RSAKeyPair {
  readonly publicKey: Buffer;
  readonly privateKey: Buffer;
}

/** Generate an RSA-2048 key pair. Returns DER-encoded keys. */
export function generateRSAKeyPair(): RSAKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return { publicKey, privateKey };
}

/** Encrypt data with RSA public key using OAEP-SHA256. */
export function encryptRSA(publicKeyDer: Buffer, plaintext: Buffer): Buffer {
  if (plaintext.length > 190) throw new Error('RSA plaintext exceeds max size (190 bytes)');
  const keyObject = createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' });
  return publicEncrypt({ key: keyObject, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, plaintext);
}

/** Decrypt data with RSA private key using OAEP-SHA256. */
export function decryptRSA(privateKeyDer: Buffer, ciphertext: Buffer): Buffer {
  const keyObject = createPrivateKey({ key: privateKeyDer, format: 'der', type: 'pkcs8' });
  try {
    return privateDecrypt({ key: keyObject, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, ciphertext);
  } catch {
    throw new Error('DECRYPTION_FAILED');
  }
}
