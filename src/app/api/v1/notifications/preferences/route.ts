import { z } from 'zod';
import { notificationsService } from '@/modules/notifications/service';
import { json, route } from '@/server/handler';

/** GET and PUT /api/v1/notifications/preferences — categories and quiet hours (E12-S06). */

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

const BodySchema = z
  .object({
    categories: z
      .object({
        safety: z.boolean(),
        trip_reminder: z.boolean(),
        crowd: z.boolean(),
        local_offer: z.boolean(),
      })
      .strict(),
    quietFrom: z.string().regex(CLOCK),
    quietUntil: z.string().regex(CLOCK),
  })
  .strict();

export const GET = route({ auth: 'session' }, async ({ session }) => {
  return json({ preferences: await notificationsService.preferences(session.userId!) });
});

export const PUT = route({ auth: 'session', body: BodySchema }, async ({ body, session }) => {
  await notificationsService.savePreferences(session.userId!, body);
  return json({ preferences: await notificationsService.preferences(session.userId!) });
});
