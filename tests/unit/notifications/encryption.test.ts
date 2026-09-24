import { createDecipheriv, createECDH, createPublicKey, createVerify, generateKeyPairSync, hkdfSync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encryptPayload, vapidHeaders, vapidFromEnvironment } from '@/platform/push/encryption';
import { open, seal } from '@/server/secret-box';

/**
 * The push payload is decrypted here the way a browser would (RFC 8291), so
 * this tests the implementation rather than restating it.
 */

function recipient() {
  const ecdh = createECDH('prime256v1');
  const publicKey = ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    ecdh,
    auth,
    subscription: {
      endpoint: 'https://push.example.com/send/abc',
      keys: { p256dh: publicKey.toString('base64url'), auth: auth.toString('base64url') },
    },
  };
}

/** The receiving half of RFC 8291 §3.4. */
function decrypt(body: Buffer, party: ReturnType<typeof recipient>): string {
  const salt = body.subarray(0, 16);
  const keyLength = body.readUInt8(20);
  const serverPublicKey = body.subarray(21, 21 + keyLength);
  const ciphertext = body.subarray(21 + keyLength);

  const sharedSecret = party.ecdh.computeSecret(serverPublicKey);
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    party.ecdh.getPublicKey(),
    serverPublicKey,
  ]);
  const ikm = Buffer.from(hkdfSync('sha256', sharedSecret, party.auth, keyInfo, 32));
  const key = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12));

  const decipher = createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const record = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);

  // The last byte is the 0x02 delimiter.
  expect(record[record.length - 1]).toBe(0x02);
  return record.subarray(0, record.length - 1).toString('utf8');
}

describe('push payload encryption (RFC 8291)', () => {
  it('produces a body the intended recipient can read', () => {
    const party = recipient();
    const message = JSON.stringify({ title: 'Chinnakallar Falls is closed', body: 'Path collapsed after rain.' });

    const body = encryptPayload(party.subscription, message);
    expect(decrypt(body, party)).toBe(message);
  });

  it('cannot be read by a different subscription', () => {
    const party = recipient();
    const other = recipient();
    const body = encryptPayload(party.subscription, 'secret');
    expect(() => decrypt(body, other)).toThrow();
  });

  it('uses a fresh key each time, so two identical messages differ on the wire', () => {
    const party = recipient();
    const first = encryptPayload(party.subscription, 'same');
    const second = encryptPayload(party.subscription, 'same');
    expect(first.equals(second)).toBe(false);
    expect(decrypt(second, party)).toBe('same');
  });

  it('refuses a subscription whose keys are the wrong size', () => {
    const party = recipient();
    expect(() => encryptPayload({ ...party.subscription, keys: { ...party.subscription.keys, auth: 'c2hvcnQ' } }, 'x')).toThrow(
      /auth secret/,
    );
    expect(() => encryptPayload({ ...party.subscription, keys: { ...party.subscription.keys, p256dh: 'c2hvcnQ' } }, 'x')).toThrow(
      /P-256 point/,
    );
  });

  it('refuses a payload too large for one record', () => {
    const party = recipient();
    expect(() => encryptPayload(party.subscription, 'x'.repeat(5_000))).toThrow(/too large/);
  });
});

describe('VAPID (RFC 8292)', () => {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const privateJwk = pair.privateKey.export({ format: 'jwk' }) as { d: string };
  const publicKey = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ]).toString('base64url');

  const keys = { publicKey, privateKey: privateJwk.d, subject: 'mailto:ops@dreamdestination.invalid' };

  it('signs a token the push service can verify, for its own origin', () => {
    const headers = vapidHeaders('https://push.example.com/send/abc', keys, new Date('2026-09-23T10:00:00Z'));
    const [, token] = /vapid t=([^,]+), k=(.+)/.exec(headers.authorization) ?? [];
    const [header, claims, signature] = token.split('.');

    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    const payload = JSON.parse(Buffer.from(claims, 'base64url').toString());
    expect(payload).toMatchObject({ aud: 'https://push.example.com', sub: keys.subject });
    expect(payload.exp).toBe(Math.floor(Date.parse('2026-09-23T10:00:00Z') / 1000) + 12 * 60 * 60);

    const verifier = createVerify('SHA256');
    verifier.update(`${header}.${claims}`);
    const publicKeyObject = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' });
    expect(verifier.verify({ key: publicKeyObject, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true);
    expect(headers['content-encoding']).toBe('aes128gcm');
  });

  it('reports push as unconfigured when the keys are absent', () => {
    const saved = { ...process.env };
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    expect(vapidFromEnvironment()).toBeNull();
    Object.assign(process.env, saved);
  });
});

describe('subscriptions at rest', () => {
  it('seals and opens a subscription, and refuses a tampered one', () => {
    process.env.PUSH_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const subscription = JSON.stringify({ endpoint: 'https://push.example.com/send/abc', keys: { p256dh: 'x', auth: 'y' } });

    const sealed = seal(subscription);
    expect(sealed.toString('utf8')).not.toContain('push.example.com');
    expect(open(sealed)).toBe(subscription);

    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] ^= 0xff;
    expect(open(tampered)).toBeNull();
    expect(open(Buffer.from('nonsense'))).toBeNull();
  });

  it('cannot be opened with a different key', () => {
    process.env.PUSH_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const sealed = seal('secret');
    process.env.PUSH_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    expect(open(sealed)).toBeNull();
  });
});
