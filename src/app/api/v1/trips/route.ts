import { z } from 'zod';
import { TripBriefSchema } from '@/platform/ai/schemas';
import { catalogRepository } from '@/modules/catalog/repository';
import { tripsRepository } from '@/modules/trips/repository';
import { json, route } from '@/server/handler';
import { guestPlanRemaining } from '@/server/session';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/trips — create a trip from a confirmed brief.
 * GET  /api/v1/trips — the traveller's trip library (Screen T14).
 */

const CreateSchema = z.object({
  brief: TripBriefSchema,
  destinationSlug: z.string().min(1).max(120),
  title: z.string().min(1).max(160).optional(),
  startDate: z.string().date().nullish(),
});

export const POST = route(
  { auth: 'none', body: CreateSchema, rateLimit: { key: 'trip-create', perMinute: 10 } },
  async ({ body, session }) => {
    // PRD Part I T01: a guest may generate one plan before signing in.
    if (session.isGuest && !(await guestPlanRemaining(session))) {
      throw problems.unauthenticated();
    }

    const destination = await catalogRepository.findDestinationBySlug(body.destinationSlug);
    if (destination === null) throw problems.notFound('That destination is not in the catalog.');

    const durationDays = body.brief.durationDays ?? 3;
    const startDate = body.startDate == null ? defaultStartDate(body.brief.dateFlexibility) : new Date(body.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + durationDays - 1);

    const origin = body.brief.origin?.coordinates;

    const trip = await tripsRepository.create({
      ownerUserId: await ownerFor(session),
      destinationId: destination.id,
      title: body.title ?? `${destination.name} trip`,
      startDate,
      endDate,
      originText: body.brief.origin?.label ?? null,
      origin: origin === undefined ? null : { lat: origin[1], lng: origin[0] },
      party: (body.brief.party ?? {}) as Record<string, unknown>,
      tripBrief: body.brief as Record<string, unknown>,
      totalBudgetInr:
        body.brief.budget === undefined ? null : Math.round(body.brief.budget.totalMinor / 100),
    });

    return json({ trip }, { status: 201 });
  },
);

/**
 * GET /api/v1/trips — the caller's own trips. A guest who has planned one
 * sees it too, so "Add to trip" works before signing in.
 */
export const GET = route({ auth: 'none' }, async ({ session }) => {
  const trips = session.userId === null ? [] : await tripsRepository.listForUser(session.userId);
  return json({ trips });
});

/** First day of the month the traveller named, or a week out. */
function defaultStartDate(dateFlexibility: string | undefined): Date {
  if (dateFlexibility !== undefined) {
    const match = /^(\d{4})-(\d{2})/.exec(dateFlexibility);
    if (match !== null) {
      const candidate = new Date(`${match[1]}-${match[2]}-10T00:00:00.000Z`);
      if (candidate.getTime() > Date.now()) return candidate;
    }
  }
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

/**
 * A guest still needs a user row to own their trip, because trips.owner_user_id
 * is NOT NULL. One placeholder user is created per guest session and is
 * upgraded when they sign in.
 */
async function ownerFor(session: { userId: string | null; id: string }): Promise<string> {
  if (session.userId !== null) return session.userId;

  const { sql } = await import('@/platform/db/client');

  const [existing] = await sql<{ user_id: string | null }[]>`
    SELECT user_id FROM sessions WHERE id = ${session.id}
  `;
  if (existing?.user_id != null) return existing.user_id;

  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (display_name, status) VALUES ('Guest traveller', 'active') RETURNING id
  `;
  await sql`INSERT INTO user_roles (user_id, role, scope_type) VALUES (${user.id}, 'traveler', 'global')`;
  await sql`UPDATE sessions SET user_id = ${user.id} WHERE id = ${session.id}`;

  return user.id;
}
