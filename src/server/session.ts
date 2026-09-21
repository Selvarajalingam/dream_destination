import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { sql } from '@/platform/db/client';
import type { UserRole } from '@/modules/verification/domain/types';

/**
 * Sessions — PRD Part II §7.2: "HttpOnly secure session cookie" with CSRF
 * protection and server-side role checks.
 *
 * The token itself is never stored. Only its SHA-256 hash lives in the
 * database, so a database read cannot be replayed as a session.
 *
 * Guest sessions exist because PRD Part I T01 requires a guest to be able to
 * generate one plan before authentication.
 */

export const SESSION_COOKIE = 'dd_session';
export const CSRF_COOKIE = 'dd_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const SESSION_TTL_DAYS = 30;
const GUEST_TRIP_ALLOWANCE = 1;

export type Session = {
  id: string;
  userId: string | null;
  isGuest: boolean;
  roles: UserRole[];
  csrfSecret: string;
  expiresAt: Date;
};

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

type SessionRow = {
  id: string;
  user_id: string | null;
  is_guest: boolean;
  csrf_secret: string;
  expires_at: Date;
};

async function rolesFor(userId: string | null): Promise<UserRole[]> {
  if (userId === null) return [];
  const rows = await sql<{ role: UserRole }[]>`
    SELECT role FROM user_roles WHERE user_id = ${userId}
  `;
  return rows.map((row) => row.role);
}

/** Reads the current session, or null when there is none or it has expired. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token === undefined || token === '') return null;

  const [row] = await sql<SessionRow[]>`
    SELECT id, user_id, is_guest, csrf_secret, expires_at
    FROM sessions
    WHERE token_hash = ${hashToken(token)}
      AND revoked_at IS NULL
      AND expires_at > now()
    LIMIT 1
  `;
  if (row === undefined) return null;

  // Best-effort activity tracking; never fail a request over it.
  void sql`UPDATE sessions SET last_seen_at = now() WHERE id = ${row.id}`.catch(() => {});

  return {
    id: row.id,
    userId: row.user_id,
    isGuest: row.is_guest,
    roles: await rolesFor(row.user_id),
    csrfSecret: row.csrf_secret,
    expiresAt: row.expires_at,
  };
}

type CreateOptions = { userId?: string | null; userAgent?: string | null };

/** Creates a session and sets its cookies. A null userId makes it a guest. */
export async function createSession({ userId = null, userAgent = null }: CreateOptions = {}): Promise<Session> {
  const token = randomBytes(32).toString('base64url');
  const csrfSecret = randomBytes(32).toString('base64url');

  const [row] = await sql<SessionRow[]>`
    INSERT INTO sessions (user_id, token_hash, is_guest, csrf_secret, user_agent, expires_at)
    VALUES (
      ${userId}, ${hashToken(token)}, ${userId === null}, ${csrfSecret}, ${userAgent},
      now() + make_interval(days => ${SESSION_TTL_DAYS})
    )
    RETURNING id, user_id, is_guest, csrf_secret, expires_at
  `;

  const store = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });

  // The CSRF cookie is deliberately readable by scripts: the client reads it
  // and echoes it in a header, which a cross-site page cannot do.
  store.set(CSRF_COOKIE, csrfSecret, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });

  return {
    id: row.id,
    userId: row.user_id,
    isGuest: row.is_guest,
    roles: await rolesFor(row.user_id),
    csrfSecret: row.csrf_secret,
    expiresAt: row.expires_at,
  };
}

/** Returns the current session, creating a guest session when there is none. */
export async function getOrCreateSession(userAgent: string | null = null): Promise<Session> {
  return (await getSession()) ?? (await createSession({ userAgent }));
}

export async function revokeSession(sessionId: string): Promise<void> {
  await sql`UPDATE sessions SET revoked_at = now() WHERE id = ${sessionId}`;

  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(CSRF_COOKIE);
}

/**
 * Whether a guest may still generate a plan. PRD Part I T01: "Guest users can
 * generate one plan before authentication."
 */
export async function guestPlanRemaining(session: Session): Promise<boolean> {
  if (!session.isGuest) return true;

  const [row] = await sql<{ count: string }[]>`
    SELECT count(*) FROM trips WHERE owner_user_id IS NOT DISTINCT FROM ${session.userId}
  `;
  return Number(row.count) < GUEST_TRIP_ALLOWANCE;
}

/** Constant-time comparison, so a token cannot be guessed by timing. */
export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
