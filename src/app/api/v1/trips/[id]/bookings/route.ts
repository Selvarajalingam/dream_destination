import { z } from 'zod';
import { bookingsService } from '@/modules/bookings/service';
import { analyticsService } from '@/modules/analytics/service';
import { assertOwnsTrip } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/trips/{id}/bookings — records that the traveller is leaving
 * for a provider (T13, E13-S02).
 *
 * The browser names the offer; the server fetches it again and stores what
 * the provider says now, so the snapshot cannot be dictated by the caller.
 */

const BodySchema = z
  .object({ kind: z.enum(['stay', 'transport']), providerId: z.string().min(1).max(120) })
  .strict();

export const POST = route(
  { auth: 'none', body: BodySchema, idempotent: true, rateLimit: { key: 'booking-handoff', perMinute: 20 } },
  async ({ params, session, body, requestId }) => {
    await assertOwnsTrip(session, params.id);

    const options = await bookingsService.options(params.id, body.kind);
    const offer = options.offers.find((candidate) => candidate.providerId === body.providerId);
    if (offer === undefined) {
      throw problems.notFound('That offer is no longer available from the provider. Refresh the options.');
    }

    const booking = await bookingsService.recordHandoff(params.id, offer, session.userId, requestId);

    await analyticsService.trackUnchecked(
      'booking_handoff',
      { tripId: params.id, kind: body.kind },
      { sessionId: session.id },
    );

    return json({ booking, url: offer.url }, { status: 201 });
  },
);
