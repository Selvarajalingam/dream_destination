import { sql } from '@/platform/db/client';
import { PORTALS, lockUntil, portalAdmits, portalFor, type Portal } from '@/modules/identity/domain/portals';
import { DomainError } from '@/shared/result';
import { recordAudit } from './authorize';
import { decoyHash, verifyPassword } from './password';
import { createSession, revokeSession, type Session } from './session';

/**
 * Email and password sign-in for the three portals.
 *
 * An unknown email and a wrong password get the same message and take the
 * same time, so the form cannot be used to find out who has an account.
 * Only once the password is proven does the answer get specific, such as
 * pointing an owner to the owner sign-in page.
 */

const INCORRECT = 'That email and password do not match an account.';

type CredentialRow = {
  userId: string;
  passwordHash: string;
  failedAttempts: number;
  lockedUntil: Date | null;
  status: string;
};

export async function signIn(input: {
  portal: Portal;
  email: string;
  password: string;
  userAgent: string | null;
  previous: Session | null;
  requestId?: string;
}): Promise<Session> {
  const [row] = await sql<CredentialRow[]>`
    SELECT c.user_id AS "userId", c.password_hash AS "passwordHash",
           c.failed_attempts AS "failedAttempts", c.locked_until AS "lockedUntil",
           u.status::text AS status
    FROM user_credentials c JOIN users u ON u.id = c.user_id
    WHERE u.email = ${input.email.trim()} AND u.deleted_at IS NULL
  `;

  if (row === undefined) {
    await verifyPassword(input.password, await decoyHash());
    throw new DomainError('auth.incorrect', INCORRECT, 401);
  }

  if (row.lockedUntil !== null && row.lockedUntil.getTime() > Date.now()) {
    throw new DomainError(
      'auth.locked',
      'Too many attempts. This account is locked for a few minutes; try again later.',
      429,
    );
  }

  if (!(await verifyPassword(input.password, row.passwordHash))) {
    const failed = row.failedAttempts + 1;
    await sql`
      UPDATE user_credentials
      SET failed_attempts = ${failed}, locked_until = ${lockUntil(failed, new Date())}, updated_at = now()
      WHERE user_id = ${row.userId}
    `;
    throw new DomainError('auth.incorrect', INCORRECT, 401);
  }

  if (row.status !== 'active') {
    throw new DomainError('auth.inactive', 'This account is not active. Contact the operations team.', 403);
  }

  const roles = (
    await sql<{ role: string }[]>`SELECT role::text AS role FROM user_roles WHERE user_id = ${row.userId}`
  ).map((entry) => entry.role);

  if (!portalAdmits(input.portal, roles)) {
    const right = portalFor(roles);
    throw new DomainError(
      'auth.wrong_portal',
      right === null
        ? 'This account cannot sign in here.'
        : `This account signs in on the ${PORTALS[right].label} page.`,
      403,
      // The right sign-in page, for the form to link to.
      right === null ? undefined : [PORTALS[right].path],
    );
  }

  await sql`
    UPDATE user_credentials
    SET failed_attempts = 0, locked_until = NULL, last_signed_in_at = now(), updated_at = now()
    WHERE user_id = ${row.userId}
  `;

  // A new session on every sign-in, so a session fixed before sign-in is
  // worth nothing after it.
  if (input.previous !== null) await revokeSession(input.previous.id);
  const session = await createSession({ userId: row.userId, userAgent: input.userAgent });

  await recordAudit({
    actorUserId: row.userId,
    action: 'auth.signed_in',
    entityType: 'user',
    entityId: row.userId,
    afterState: { portal: input.portal },
    requestId: input.requestId,
  });

  return session;
}
