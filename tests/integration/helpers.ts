import { randomBytes } from 'node:crypto';
import { sql } from '@/platform/db/client';
import type { Session } from '@/server/session';
import type { UserRole } from '@/modules/verification/domain/types';

/** Creates a user with roles and an in-memory session object for tests. */
export async function createTestUser(roles: UserRole[] = ['traveler']): Promise<Session & { userId: string }> {
  const suffix = randomBytes(6).toString('hex');

  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (email, display_name)
    VALUES (${`test.${suffix}@example.invalid`}, ${`Test ${suffix}`})
    RETURNING id
  `;

  for (const role of roles) {
    await sql`INSERT INTO user_roles (user_id, role, scope_type) VALUES (${user.id}, ${role}, 'global')`;
  }

  const [session] = await sql<{ id: string; csrf_secret: string; expires_at: Date }[]>`
    INSERT INTO sessions (user_id, token_hash, is_guest, csrf_secret, expires_at)
    VALUES (${user.id}, ${randomBytes(16).toString('hex')}, false, ${randomBytes(16).toString('hex')},
            now() + interval '1 day')
    RETURNING id, csrf_secret, expires_at
  `;

  return {
    id: session.id,
    userId: user.id,
    isGuest: false,
    roles,
    csrfSecret: session.csrf_secret,
    expiresAt: session.expires_at,
  };
}

export async function createTestTrip(ownerUserId: string): Promise<string> {
  const [destination] = await sql<{ id: string }[]>`
    SELECT id FROM destinations WHERE slug = 'ooty-nilgiris' LIMIT 1
  `;

  const [trip] = await sql<{ id: string }[]>`
    INSERT INTO trips (owner_user_id, destination_id, title, status, trip_brief, total_budget_inr)
    VALUES (
      ${ownerUserId}, ${destination?.id ?? null}, 'Test trip', 'draft',
      ${sql.json({ durationDays: 4 })}, 25000
    )
    RETURNING id
  `;
  return trip.id;
}

export async function seedUserWithTrip(): Promise<{ session: Session; tripId: string; userId: string }> {
  const session = await createTestUser();
  const tripId = await createTestTrip(session.userId);
  return { session, tripId, userId: session.userId };
}

/** Removes rows created by a test run, leaving the seeded catalog intact. */
export async function cleanupTestUsers(): Promise<void> {
  await sql`DELETE FROM users WHERE email LIKE 'test.%@example.invalid'`;
}
