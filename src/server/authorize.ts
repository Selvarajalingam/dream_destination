import { sql } from '@/platform/db/client';
import type { UserRole } from '@/modules/verification/domain/types';
import { problems } from './problem';
import type { Session } from './session';

/**
 * Authorization — PRD Part II §12.1 lists "broken object-level authorization
 * on trips/businesses" and "admin privilege escalation" as threats requiring
 * explicit controls, and §19 requires that "users cannot read or modify
 * another user's trip".
 *
 * Object checks report 404 rather than 403 on purpose. A 403 confirms that a
 * record exists, which turns an id into an oracle; a 404 tells an attacker
 * nothing they did not already know.
 */

export function hasRole(session: Session, ...roles: UserRole[]): boolean {
  return session.roles.some((role) => roles.includes(role));
}

export function requireRole(session: Session, ...roles: UserRole[]): void {
  if (!hasRole(session, ...roles)) throw problems.forbidden();
}

/** Roles permitted to use the administration area at all. */
export const ADMIN_ROLES: UserRole[] = ['verifier', 'tourism_admin', 'platform_admin', 'analyst'];

export function isAdmin(session: Session): boolean {
  return hasRole(session, ...ADMIN_ROLES);
}

/** Throws a not-found problem unless this session owns the trip. */
export async function assertOwnsTrip(session: Session, tripId: string): Promise<void> {
  if (!isUuid(tripId)) throw problems.notFound();

  const [row] = await sql<{ owner_user_id: string }[]>`
    SELECT owner_user_id FROM trips WHERE id = ${tripId} LIMIT 1
  `;

  if (row === undefined) throw problems.notFound();
  if (session.userId === null || row.owner_user_id !== session.userId) throw problems.notFound();
}

/** Throws a not-found problem unless this session owns the business listing. */
export async function assertOwnsBusiness(session: Session, businessId: string): Promise<void> {
  if (!isUuid(businessId)) throw problems.notFound();

  const [row] = await sql<{ owner_user_id: string | null }[]>`
    SELECT owner_user_id FROM local_businesses WHERE id = ${businessId} LIMIT 1
  `;

  if (row === undefined) throw problems.notFound();

  // An administrator may act on any listing; an owner only on their own.
  if (isAdmin(session)) return;
  if (session.userId === null || row.owner_user_id !== session.userId) throw problems.notFound();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/**
 * Writes an audit record. PRD Part II §19 requires audit rows for verification
 * decisions, suspensions, source changes and crowd overrides.
 */
export async function recordAudit(options: {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: unknown;
  afterState?: unknown;
  requestId?: string;
}): Promise<void> {
  await sql`
    INSERT INTO audit_logs (
      actor_user_id, action, entity_type, entity_id, before_state, after_state, request_id
    ) VALUES (
      ${options.actorUserId},
      ${options.action},
      ${options.entityType},
      ${options.entityId},
      ${options.beforeState === undefined ? null : sql.json(options.beforeState as never)},
      ${options.afterState === undefined ? null : sql.json(options.afterState as never)},
      ${options.requestId ?? null}
    )
  `;
}
