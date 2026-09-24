import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Authenticated encryption for values that must be stored but never read
 * casually — today, push subscriptions (PRD Part I §11.4: "Store encrypted
 * subscriptions", §12.1 lists stolen endpoints as a threat).
 *
 * AES-256-GCM, with the key from PUSH_ENCRYPTION_KEY when set and otherwise
 * derived from SESSION_SECRET, so a development database is not holding
 * endpoints in the clear either. Rotating the secret makes stored
 * subscriptions unreadable, which is the right failure: browsers resubscribe.
 */

const VERSION = 1;

function key(): Buffer {
  const configured = process.env.PUSH_ENCRYPTION_KEY;
  if (configured !== undefined && configured.trim() !== '') {
    const raw = Buffer.from(configured, 'base64');
    if (raw.length === 32) return raw;
    return createHash('sha256').update(configured).digest();
  }

  const session = process.env.SESSION_SECRET;
  if (session === undefined || session.trim() === '') {
    throw new Error('PUSH_ENCRYPTION_KEY or SESSION_SECRET must be set to store push subscriptions.');
  }
  // Separated by purpose, so this key is not the session key.
  return createHash('sha256').update(`push-subscriptions:${session}`).digest();
}

/** version | iv (12) | tag (16) | ciphertext */
export function seal(plaintext: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]);
}

export function open(sealed: Buffer | Uint8Array): string | null {
  const buffer = Buffer.from(sealed);
  if (buffer.length < 29 || buffer[0] !== VERSION) return null;

  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), buffer.subarray(1, 13));
    decipher.setAuthTag(buffer.subarray(13, 29));
    return Buffer.concat([decipher.update(buffer.subarray(29)), decipher.final()]).toString('utf8');
  } catch {
    // Tampered, or encrypted under a key we no longer have.
    return null;
  }
}
