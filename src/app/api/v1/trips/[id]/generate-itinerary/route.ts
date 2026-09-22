import { getAiGateway } from '@/platform/ai';
import { tripsService } from '@/modules/trips/service';
import { analyticsService } from '@/modules/analytics/service';
import { assertOwnsTrip } from '@/server/authorize';
import { json, route } from '@/server/handler';

/**
 * POST /api/v1/trips/{id}/generate-itinerary
 *
 * The plan is built deterministically first; the gateway only writes the prose
 * describing it. Accepts an Idempotency-Key so a retry cannot produce a second
 * plan (PRD Part II §7.1).
 */
export const POST = route(
  {
    auth: 'none',
    idempotent: true,
    rateLimit: { key: 'generate-itinerary', perMinute: 10 },
  },
  async ({ params, session }) => {
    await assertOwnsTrip(session, params.id);

    const detail = await tripsService.generateItinerary(params.id);

    await analyticsService.track(
      'itinerary_generated',
      {
        tripId: detail.trip.id,
        days: detail.days.length,
        itemCount: detail.days.reduce((total, day) => total + day.items.length, 0),
      },
      { sessionId: session.id },
    );

    const prose = await getAiGateway().describeItinerary({
      destinationName: detail.trip.destinationName ?? 'your destination',
      days: detail.days.map((day) => ({
        dayNumber: day.dayNumber,
        itemTitles: day.items.map((item) => item.title),
      })),
    });

    return json({
      trip: detail.trip,
      days: detail.days,
      budget: detail.budget,
      conflicts: detail.conflicts,
      crowdByPlaceId: detail.crowdByPlaceId,
      prose,
      // Source ids are recorded per place; the UI renders them beside claims.
      generatedBy: 'dream-itinerary-1.0.0',
    });
  },
);
