import { z } from 'zod';
import { notificationsService } from '@/modules/notifications/service';
import { json, route } from '@/server/handler';

/**
 * POST /api/v1/notifications/subscribe — stores a push subscription,
 * encrypted at rest (PRD Part I §11.4).
 * DELETE — revokes one.
 */

const SubscribeSchema = z
  .object({
    endpoint: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }).strict(),
  })
  .strict();

export const POST = route(
  { auth: 'session', body: SubscribeSchema, rateLimit: { key: 'push-subscribe', perMinute: 10 } },
  async ({ body, session, request, requestId }) => {
    await notificationsService.subscribe(session.userId!, body, request.headers.get('user-agent'), requestId);
    return json({ subscribed: true }, { status: 201 });
  },
);

const UnsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) }).strict();

export const DELETE = route({ auth: 'session', body: UnsubscribeSchema }, async ({ body, session, requestId }) => {
  await notificationsService.unsubscribe(session.userId!, body.endpoint, requestId);
  return json({ subscribed: false });
});
