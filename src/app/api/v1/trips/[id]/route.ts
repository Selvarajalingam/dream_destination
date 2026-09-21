import { z } from 'zod';
import { tripsRepository } from '@/modules/trips/repository';
import { tripsService } from '@/modules/trips/service';
import { assertOwnsTrip } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * GET   /api/v1/trips/{id} — the full trip with budget, conflicts and crowd.
 * PATCH /api/v1/trips/{id} — title, dates, status.
 *
 * Both check ownership first and report a foreign trip as not found, so an id
 * never confirms that a record exists.
 */

export const GET = route({ auth: 'none' }, async ({ params, session }) => {
  await assertOwnsTrip(session, params.id);

  const detail = await tripsService.getDetail(params.id);
  if (detail === null) throw problems.notFound();

  return json({
    trip: detail.trip,
    days: detail.days,
    budget: detail.budget,
    conflicts: detail.conflicts,
    crowdByPlaceId: detail.crowdByPlaceId,
  });
});

const PatchSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  status: z.enum(['draft', 'upcoming', 'active', 'completed', 'cancelled']).optional(),
});

export const PATCH = route({ auth: 'none', body: PatchSchema }, async ({ params, session, body }) => {
  await assertOwnsTrip(session, params.id);

  // The state machine decides whether a move is permitted, not this handler.
  if (body.status !== undefined) {
    await tripsService.setStatus(params.id, body.status);
  }

  const trip = await tripsRepository.findById(params.id);
  if (trip === null) throw problems.notFound();

  return json({ trip });
});
