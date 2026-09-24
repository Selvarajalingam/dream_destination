import { sql } from '@/platform/db/client';
import { notificationsService } from '@/modules/notifications/service';
import { tripsRepository } from '@/modules/trips/repository';
import { assertOwnsTrip } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/trips/{id}/reminders — works out which reminders this trip has
 * earned by now, and releases anything held over quiet hours (E12-S07).
 *
 * Called when the traveller opens a trip or starts Trip Mode, so the
 * demonstration needs no scheduler. A pilot would run the same service from a
 * queue worker.
 */

export const POST = route(
  { auth: 'session', rateLimit: { key: 'trip-reminders', perMinute: 20 } },
  async ({ params, session }) => {
    await assertOwnsTrip(session, params.id);

    const trip = await tripsRepository.findById(params.id);
    if (trip === null) throw problems.notFound();

    const [pack] = await sql<{ id: string }[]>`
      SELECT id FROM offline_packs WHERE trip_id = ${params.id} LIMIT 1
    `;

    const scheduled = await notificationsService.scheduleTripReminders(session.userId!, {
      id: trip.id,
      title: trip.title,
      startDate: trip.startDate,
      offlinePackSaved: pack !== undefined,
    });

    const released = await notificationsService.releaseHeld(session.userId!);
    return json({ scheduled: scheduled.length, released });
  },
);
