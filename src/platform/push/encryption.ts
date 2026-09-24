import { createCipheriv, createECDH, createPrivateKey, createSign, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Web Push message encryption (RFC 8291) and VAPID (RFC 8292).
 *
 * A push service is an untrusted relay: it forwards bytes it cannot read.
 * The payload is encrypted to the browser's own key, and the request is
 * signed so the service knows which application sent it.
 *
 * Written against the RFCs rather than pulled in as a dependency, because it
 * is a hundred lines and the alternative is a supply-chain risk for something
 * that handles keys.
 */

export type PushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const b64url = (input: Buffer): string => input.toString('base64url');
const fromB64url = (input: string): Buffer => Buffer.from(input, 'base64url');

/** RFC 8291 §3.4: one record, so the whole message must fit in it. */
const RECORD_SIZE = 4_096;

export function encryptPayload(subscription: PushSubscription, payload: string): Buffer {
  const clientPublicKey = fromB64url(subscription.keys.p256dh);
  const authSecret = fromB64url(subscription.keys.auth);
  if (clientPublicKey.length !== 65) throw new Error('The subscription key is not an uncompressed P-256 point.');
  if (authSecret.length !== 16) throw new Error('The subscription auth secret is not 16 bytes.');

  const ecdh = createECDH('prime256v1');
  const serverPublicKey = ecdh.generateKeys();
  const sharedSecret = ecdh.computeSecret(clientPublicKey);

  // RFC 8291 §3.3: the key derivation binds both public keys, so a message
  // encrypted for one browser cannot be replayed to another.
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    clientPublicKey,
    serverPublicKey,
  ]);
  const ikm = Buffer.from(hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));

  const salt = randomBytes(16);
  const contentEncryptionKey = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16),
  );
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12));

  const body = Buffer.from(payload, 'utf8');
  // The 0x02 delimiter marks the last record; nothing is padded after it.
  const record = Buffer.concat([body, Buffer.from([0x02])]);
  if (record.length + 16 > RECORD_SIZE) throw new Error('The notification payload is too large for one record.');

  const cipher = createCipheriv('aes-128-gcm', contentEncryptionKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(record), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(5);
  header.writeUInt32BE(RECORD_SIZE, 0);
  header.writeUInt8(serverPublicKey.length, 4);

  return Buffer.concat([salt, header, serverPublicKey, ciphertext]);
}

export type VapidKeys = { publicKey: string; privateKey: string; subject: string };

/** A P-256 private key object from the raw 32-byte VAPID private key. */
function privateKeyObject(keys: VapidKeys) {
  const publicKey = fromB64url(keys.publicKey);
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) throw new Error('VAPID_PUBLIC_KEY is not an uncompressed P-256 point.');

  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: keys.privateKey,
      x: b64url(publicKey.subarray(1, 33)),
      y: b64url(publicKey.subarray(33, 65)),
    },
    format: 'jwk',
  });
}

/** RFC 8292 §2: a signed JWT for the push service's origin. */
export function vapidHeaders(endpoint: string, keys: VapidKeys, now = new Date()): Record<string, string> {
  const audience = new URL(endpoint).origin;
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' }), 'utf8'));
  const claims = b64url(
    Buffer.from(
      JSON.stringify({
        aud: audience,
        // Twelve hours, the maximum RFC 8292 allows.
        exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60,
        sub: keys.subject,
      }),
      'utf8',
    ),
  );

  const signer = createSign('SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign({ key: privateKeyObject(keys), dsaEncoding: 'ieee-p1363' });

  return {
    authorization: `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`,
    'content-encoding': 'aes128gcm',
    'content-type': 'application/octet-stream',
  };
}

/** Reads the VAPID configuration, or null when push is not configured. */
export function vapidFromEnvironment(): VapidKeys | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if ([publicKey, privateKey, subject].some((value) => value === undefined || value.trim() === '')) return null;
  return { publicKey: publicKey!.trim(), privateKey: privateKey!.trim(), subject: subject!.trim() };
}
