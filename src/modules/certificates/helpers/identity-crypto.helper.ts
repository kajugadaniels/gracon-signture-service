import * as crypto from 'crypto';

const IDENTITY_ENCRYPTION_ALGORITHM = 'aes-256-cbc';

function deriveSecretKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

export function decryptIdentityValue(
  encryptedValue: string,
  secret: string,
): string {
  const [ivHex, encryptedHex] = encryptedValue.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(
    IDENTITY_ENCRYPTION_ALGORITHM,
    deriveSecretKey(secret),
    iv,
  );

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}
