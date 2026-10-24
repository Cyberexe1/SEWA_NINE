/**
 * NINE Protocol - RSA-2048 Encryption Engine
 *
 * Provides asymmetric encryption for key encapsulation.
 * The AES session key is encrypted with the Admin's RSA public key,
 * ensuring only the Admin can decrypt it.
 */

export interface RSAKeyPair {
  /** DER or PEM encoded public key */
  publicKey: Buffer;

  /** DER or PEM encoded private key */
  privateKey: Buffer;

  /** Key size in bits */
  keySize: number;
}

/**
 * RSA-2048 encryption interface.
 */
export interface IRSA {
  /**
   * Generate an RSA-2048 key pair.
   * This is computationally expensive (~100-500ms).
   * Should be called once during Admin initialization.
   */
  generateKeyPair(): Promise<RSAKeyPair>;

  /**
   * Encrypt data with a public key (OAEP padding, SHA-256).
   * Used to encrypt AES session keys for the Admin.
   *
   * @param publicKey - Admin's RSA public key
   * @param data - Data to encrypt (max ~190 bytes for RSA-2048-OAEP)
   * @returns Encrypted data (256 bytes for RSA-2048)
   */
  encrypt(publicKey: Buffer, data: Buffer): Buffer;

  /**
   * Decrypt data with a private key (OAEP padding, SHA-256).
   * Used by Admin to recover AES session keys.
   *
   * @param privateKey - Admin's RSA private key
   * @param data - Encrypted data
   * @returns Decrypted plaintext
   * @throws DecryptionError on failure (intentionally vague)
   */
  decrypt(privateKey: Buffer, data: Buffer): Buffer;

  /**
   * Get the maximum plaintext size for encryption
   * (RSA-2048-OAEP-SHA256 = 190 bytes).
   */
  getMaxPlaintextSize(): number;
}
