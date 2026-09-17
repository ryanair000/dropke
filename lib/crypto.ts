import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

export type EncryptedCode = {
  ciphertext: string;
  iv: string;
  tag: string;
  fingerprint: string;
  hint: string;
  keyVersion: number;
};

function currentKeyVersion() {
  const raw = process.env.INVENTORY_ENCRYPTION_KEY_VERSION?.trim();
  if (!raw) return 1;
  const version = Number(raw);
  if (!Number.isInteger(version) || version < 1) throw new Error('INVALID_INVENTORY_ENCRYPTION_KEY_VERSION');
  return version;
}

function inventorySecret(version: number) {
  const versioned = process.env[`INVENTORY_ENCRYPTION_KEY_V${version}`]?.trim();
  const legacy = version === 1 ? process.env.INVENTORY_ENCRYPTION_KEY?.trim() : undefined;
  const secret = versioned || legacy;
  if (!secret || secret.length < 24) throw new Error(`INVENTORY_ENCRYPTION_KEY_V${version}_NOT_CONFIGURED`);
  return secret;
}

function keyMaterial(version: number) {
  const root = createHash('sha256').update(inventorySecret(version)).digest();
  return {
    encryptionKey: createHmac('sha256', root).update('dropke:inventory:encryption').digest(),
    fingerprintKey: createHmac('sha256', root).update('dropke:inventory:fingerprint').digest(),
  };
}

export function inventoryEncryptionReady() {
  try {
    keyMaterial(currentKeyVersion());
    return true;
  } catch {
    return false;
  }
}

export function encryptInventoryCode(value: string): EncryptedCode {
  const normalized = value.trim();
  if (!normalized) throw new Error('EMPTY_INVENTORY_CODE');

  const keyVersion = currentKeyVersion();
  const { encryptionKey, fingerprintKey } = keyMaterial(keyVersion);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    fingerprint: createHmac('sha256', fingerprintKey).update(normalized).digest('hex'),
    hint: normalized.length > 4 ? `••••${normalized.slice(-4)}` : '••••',
    keyVersion,
  };
}

export function decryptInventoryCode(record: {
  ciphertext: string;
  iv: string;
  tag: string;
  key_version?: number | null;
  keyVersion?: number | null;
}) {
  const version = Number(record.key_version ?? record.keyVersion ?? 1);
  if (!Number.isInteger(version) || version < 1) throw new Error('INVALID_INVENTORY_KEY_VERSION');

  const { encryptionKey } = keyMaterial(version);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
