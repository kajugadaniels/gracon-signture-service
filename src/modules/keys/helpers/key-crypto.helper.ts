import * as crypto from 'crypto';

/**
 * Derives a per-user AES-256 encryption key.
 * Each user gets a unique encryption key derived from the master secret + their userId.
 * Even a full DB breach cannot compromise all keys at once.
 */
export function deriveUserKey(masterSecret: string, userId: string): Buffer {
  return crypto.createHmac('sha256', masterSecret).update(userId).digest();
}

/**
 * Encrypts a private key PEM string.
 * Returns "ivHex:encryptedHex" — IV is random per call.
 */
export function encryptPrivateKey(pem: string, derivedKey: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(pem, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an encrypted private key.
 * CRITICAL: Caller must overwrite/discard the returned string immediately after use.
 */
export function decryptPrivateKey(
  encrypted: string,
  derivedKey: Buffer,
): string {
  const [ivHex, encHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encBuf = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, iv);
  return Buffer.concat([decipher.update(encBuf), decipher.final()]).toString(
    'utf8',
  );
}

/**
 * SHA-256 fingerprint of a public key PEM.
 * Used for quick lookups and display.
 */
export function fingerprintPublicKey(publicKeyPem: string): string {
  return crypto.createHash('sha256').update(publicKeyPem).digest('hex');
}
