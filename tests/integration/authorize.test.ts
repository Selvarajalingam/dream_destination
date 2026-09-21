import { afterAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';
import { assertOwnsTrip, hasRole, isAdmin, recordAudit } from '@/server/authorize';
import { cleanupTestUsers, createTestUser, seedUserWithTrip } from './helpers';

afterAll(async () => {
  await cleanupTestUsers();
  await sql.end();
});

describe('object-level authorization', () => {
  it('lets the owner read their own trip', async () => {
    const { session, tripId } = await seedUserWithTrip();
    await expect(assertOwnsTrip(session, tripId)).resolves.toBeUndefined();
  });

  it("refuses another user's trip and reports it as not found", async () => {
    const { tripId } = await seedUserWithTrip();
    const { session: other } = await seedUserWithTrip();
    await expect(assertOwnsTrip(other, tripId)).rejects.toMatchObject({ status: 404 });
  });

  it('refuses an unknown trip id identically, so ids cannot be probed', async () => {
    const { session } = await seedUserWithTrip();
    await expect(
      assertOwnsTrip(session, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('refuses a malformed id without touching the database', async () => {
    const { session } = await seedUserWithTrip();
    await expect(assertOwnsTrip(session, 'not-a-uuid')).rejects.toMatchObject({ status: 404 });
  });

  it('refuses a guest session holding no user id', async () => {
    const { tripId } = await seedUserWithTrip();
    const guest = {
      id: 'guest',
      userId: null,
      isGuest: true,
      roles: [],
      csrfSecret: 'x',
      expiresAt: new Date(Date.now() + 60_000),
    };
    await expect(assertOwnsTrip(guest, tripId)).rejects.toMatchObject({ status: 404 });
  });
});

describe('role checks', () => {
  it('recognises the roles a user actually holds', async () => {
    const verifier = await createTestUser(['verifier']);
    expect(hasRole(verifier, 'verifier')).toBe(true);
    expect(hasRole(verifier, 'platform_admin')).toBe(false);
    expect(isAdmin(verifier)).toBe(true);
  });

  it('does not treat a traveler as an administrator', async () => {
    const traveler = await createTestUser(['traveler']);
    expect(isAdmin(traveler)).toBe(false);
  });
});

describe('audit logging', () => {
  it('records an audit row with before and after state', async () => {
    const admin = await createTestUser(['tourism_admin']);
    const entityId = '11111111-1111-1111-1111-111111111111';

    await recordAudit({
      actorUserId: admin.userId,
      action: 'test.action',
      entityType: 'place',
      entityId,
      beforeState: { band: 'comfortable' },
      afterState: { band: 'heavy' },
      requestId: 'req_test',
    });

    const [row] = await sql<{ action: string; before_state: unknown; after_state: unknown }[]>`
      SELECT action, before_state, after_state FROM audit_logs
      WHERE entity_id = ${entityId} AND action = 'test.action'
    `;
    expect(row.action).toBe('test.action');
    expect(row.before_state).toEqual({ band: 'comfortable' });
    expect(row.after_state).toEqual({ band: 'heavy' });

    await sql`DELETE FROM audit_logs WHERE entity_id = ${entityId}`;
  });
});
