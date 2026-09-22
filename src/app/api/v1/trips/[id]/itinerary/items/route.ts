import { z } from 'zod';
import { tripsService } from '@/modules/trips/service';
import { analyticsService } from '@/modules/analytics/service';
import { businessRepository } from '@/modules/businesses/repository';
import { assertOwnsTrip } from '@/server/authorize';
import { json, route } from '@/server/handler';

/**
 * POST /api/v1/trips/{id}/itinerary/items — adds one place or local business.
 *
 * PRD backlog E10-S04: "User can add a business at a feasible time. Travel
 * time and budget update. User can undo." The server picks the slot; the
 * response names it and returns the item id, and removing that item through
 * PATCH /itinerary is the undo.
 */

const BodySchema = z
  .object({
    kind: z.enum(['place', 'business']),
    id: z.string().uuid(),
    dayId: z.string().uuid().optional(),
  })
  .strict();

export const POST = route(
  { auth: 'none', body: BodySchema, idempotent: true, rateLimit: { key: 'itinerary-add', perMinute: 20 } },
  async ({ params, session, body }) => {
    await assertOwnsTrip(session, params.id);

    const { itemId, slot, detail } = await tripsService.addStop(params.id, { kind: body.kind, id: body.id }, { dayId: body.dayId });

    if (body.kind === 'business') {
      const business = await businessRepository.findById(body.id);
      await analyticsService.trackUnchecked(
        'business_itinerary_add',
        { businessId: body.id, category: business?.category },
        { sessionId: session.id },
      );
    }

    return json(
      {
        added: {
          itemId,
          dayId: slot.dayId,
          dayNumber: slot.dayNumber,
          startsAt: detail.days.flatMap((day) => day.items).find((item) => item.id === itemId)?.startsAt ?? slot.startsAt,
          addedTravelMinutes: slot.addedTravelMinutes,
        },
        trip: detail.trip,
        days: detail.days,
        budget: detail.budget,
        conflicts: detail.conflicts,
        crowdByPlaceId: detail.crowdByPlaceId,
      },
      { status: 201 },
    );
  },
);
