import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';
import { signIn } from '@/server/login';
import { hashPassword } from '@/server/password';
import { cleanupTestUsers, createTestUser } from './helpers';

/**
 * The refusal paths of sign-in. They all return before a session is created,
 * so they run without a request. A successful sign-in sets cookies and is
 * covered end to end in tests/e2e/sign-in.spec.ts.
 */

let email: string;
let userId: string;

beforeAll(async () => {
  const user = await createTestUser(['traveler']);
  userId = user.userId;
  [{ email }] = await sql<{ email: string }[]>`SELECT email FROM users WHERE id = ${userId}`;
  await sql`INSERT INTO user_credentials (user_id, password_hash) VALUES (${userId}, ${await hashPassword('Right-password-1')})`;
});

afterAll(async () => {
  await cleanupTestUsers();
  await sql.end();
});

const attempt = (password: string, portal: 'traveller' | 'business' | 'staff' = 'traveller', who = email) =>
  signIn({ portal, email: who, password, userAgent: null, previous: null });

describe('sign-in refusals', () => {
  it('gives an unknown email and a wrong password the same answer', async () => {
    const unknown = await attempt('Right-password-1', 'traveller', 'nobody@example.invalid').catch((error) => error);
    const wrong = await attempt('wrong').catch((error) => error);
    expect(unknown).toMatchObject({ status: 401 });
    expect(wrong).toMatchObject({ status: 401, message: unknown.message });
  });

  it('points a correct account at its own page, only after the password is proven', async () => {
    await expect(attempt('Right-password-1', 'staff')).rejects.toMatchObject({
      status: 403,
      message: expect.stringMatching(/traveller sign-in page/),
      actions: ['/login'],
    });
    // A wrong password on the wrong page reveals nothing about the account.
    await expect(attempt('wrong', 'staff')).rejects.toMatchObject({ status: 401 });
  });

  it('locks the account after five wrong passwords, even against the right one', async () => {
    await sql`UPDATE user_credentials SET failed_attempts = 0, locked_until = NULL WHERE user_id = ${userId}`;
    for (let index = 0; index < 5; index += 1) {
      await expect(attempt('wrong')).rejects.toMatchObject({ status: 401 });
    }
    await expect(attempt('Right-password-1')).rejects.toMatchObject({ status: 429 });

    const [row] = await sql<{ locked_until: Date }[]>`SELECT locked_until FROM user_credentials WHERE user_id = ${userId}`;
    expect(row.locked_until.getTime()).toBeGreaterThan(Date.now());
  });

  it('refuses a suspended account', async () => {
    await sql`UPDATE user_credentials SET failed_attempts = 0, locked_until = NULL WHERE user_id = ${userId}`;
    await sql`UPDATE users SET status = 'suspended' WHERE id = ${userId}`;
    await expect(attempt('Right-password-1')).rejects.toMatchObject({ status: 403 });
    await sql`UPDATE users SET status = 'active' WHERE id = ${userId}`;
  });

  it('stores seeded demonstration passwords only as hashes', async () => {
    const rows = await sql<{ hash: string }[]>`SELECT password_hash AS hash FROM user_credentials`;
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const row of rows) expect(row.hash).toMatch(/^scrypt\$/);
    expect(rows.some((row) => row.hash.includes('@2026'))).toBe(false);
  });
});
