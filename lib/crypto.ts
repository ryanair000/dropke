import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

export type EncryptedCode = {
  ciphertext: string;
  iv: string;
  tag: string;
  fingerprint: string;
  hint: string;
};

function inventoryKey() {
  const secret = process.env.INVENTORY_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 24) throw new Error('INVENTORY_ENCRYPTION_KEY_NOT_CONFIGURED');
  return createHash('sha256').update(secret).digest();
}

export function inventoryEncryptionReady() {
  try {
    inventoryKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptInventoryCode(value: string): EncryptedCode {
  const normalized = value.trim();
  if (!normalized) throw new Error('EMPTY_INVENTORY_CODE');
  const key = inventoryKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    fingerprint: createHmac('sha256', key).update(normalized).digest('hex'),
    hint: normalized.length > 4 ? `••••${normalized.slice(-4)}` : '••••',
  };
}

export function decryptInventoryCode(record: { ciphertext: string; iv: string; tag: string }) {
  const key = inventoryKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
