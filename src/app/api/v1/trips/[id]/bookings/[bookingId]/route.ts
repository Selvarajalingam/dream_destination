import { z } from 'zod';
import { bookingsService } from '@/modules/bookings/service';
import { assertOwnsTrip, isUuid } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * PATCH /api/v1/trips/{id}/bookings/{bookingId} — add the provider's
 * reference, or mark the booking confirmed (E13-S03).
 * DELETE — forget it again.
 */

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add_reference'), reference: z.string().min(1).max(120) }),
  z.object({ action: z.literal('mark_confirmed'), evidence: z.enum(['provider_callback', 'traveller_attested']) }),
]);

export const PATCH = route({ auth: 'none', body: BodySchema }, async ({ params, session, body, requestId }) => {
  await assertOwnsTrip(session, params.id);
  if (!isUuid(params.bookingId)) throw problems.notFound();

  const booking =
    body.action === 'add_reference'
      ? await bookingsService.addReference(params.id, params.bookingId, body.reference, session.userId, requestId)
      : await bookingsService.markConfirmed(params.id, params.bookingId, body.evidence, session.userId, requestId);

  return json({ booking });
});

export const DELETE = route({ auth: 'none' }, async ({ params, session, requestId }) => {
  await assertOwnsTrip(session, params.id);
  if (!isUuid(params.bookingId)) throw problems.notFound();

  await bookingsService.forget(params.id, params.bookingId, session.userId, requestId);
  return json({ removed: params.bookingId });
});
