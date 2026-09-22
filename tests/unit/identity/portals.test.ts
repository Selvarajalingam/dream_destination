import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS } from '@/modules/identity/domain/demo-accounts';
import { MAX_FAILED_ATTEMPTS, lockUntil, portalAdmits, portalFor, safeNext } from '@/modules/identity/domain/portals';
import { hashPassword, verifyPassword } from '@/server/password';

describe('portals', () => {
  it('admits each account only on its own page', () => {
    expect(portalAdmits('traveller', ['traveler'])).toBe(true);
    expect(portalAdmits('staff', ['traveler'])).toBe(false);
    expect(portalAdmits('business', ['business_owner'])).toBe(true);
    expect(portalAdmits('staff', ['verifier'])).toBe(true);
    expect(portalAdmits('staff', ['business_owner'])).toBe(false);
  });

  it('points an account at the page it should use, staff first', () => {
    expect(portalFor(['traveler'])).toBe('traveller');
    expect(portalFor(['business_owner'])).toBe('business');
    expect(portalFor(['tourism_admin', 'verifier'])).toBe('staff');
    expect(portalFor([])).toBeNull();
  });

  it('lists every demonstration account under a portal that admits its seeded roles', () => {
    const seededRoles: Record<string, string[]> = {
      'traveller@demo.dreamdestination.invalid': ['traveler'],
      'owner.kitchen@demo.dreamdestination.invalid': ['business_owner'],
      'owner.tea@demo.dreamdestination.invalid': ['business_owner'],
      'admin@demo.dreamdestination.invalid': ['tourism_admin', 'verifier'],
      'verifier@demo.dreamdestination.invalid': ['verifier'],
    };
    for (const account of DEMO_ACCOUNTS) {
      expect(portalAdmits(account.portal, seededRoles[account.email])).toBe(true);
    }
  });
});

describe('lockUntil', () => {
  it('locks only once the failed attempts reach the limit', () => {
    const now = new Date('2026-09-22T10:00:00Z');
    expect(lockUntil(MAX_FAILED_ATTEMPTS - 1, now)).toBeNull();
    expect(lockUntil(MAX_FAILED_ATTEMPTS, now)).toEqual(new Date('2026-09-22T10:15:00Z'));
  });
});

describe('safeNext', () => {
  it('honours a same-site path', () => {
    expect(safeNext('/trips/abc', 'traveller')).toBe('/trips/abc');
  });

  it('falls back to the portal home for anything that could leave the site', () => {
    for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/ok\r\nSet-Cookie: x']) {
      expect(safeNext(next, 'staff')).toBe('/admin');
    }
    expect(safeNext(undefined, 'business')).toBe('/business');
  });
});

describe('password hashing', () => {
  it('verifies the right password and refuses a wrong one', async () => {
    const stored = await hashPassword('Correct horse 2026');
    expect(stored).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword('Correct horse 2026', stored)).toBe(true);
    expect(await verifyPassword('correct horse 2026', stored)).toBe(false);
  });

  it('salts every hash, so equal passwords do not produce equal hashes', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('refuses a malformed stored value rather than throwing', async () => {
    expect(await verifyPassword('anything', 'plaintext-password')).toBe(false);
  });
});
