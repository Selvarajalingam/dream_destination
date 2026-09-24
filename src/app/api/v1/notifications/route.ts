import { getPushSender } from '@/platform/push';
import { vapidFromEnvironment } from '@/platform/push/encryption';
import { notificationsService } from '@/modules/notifications/service';
import { json, route } from '@/server/handler';

/**
 * GET /api/v1/notifications — the alert centre, plus what the browser needs
 * to subscribe. Says plainly when push is not configured, rather than
 * offering a permission prompt that could never deliver anything.
 */

export const GET = route({ auth: 'none' }, async ({ session }) => {
  const vapid = vapidFromEnvironment();

  if (session.userId === null || session.isGuest) {
    return json({ alerts: [], subscriptions: 0, pushConfigured: vapid !== null, publicKey: vapid?.publicKey ?? null });
  }

  await notificationsService.releaseHeld(session.userId);

  return json({
    alerts: await notificationsService.alerts(session.userId),
    subscriptions: await notificationsService.subscriptionCount(session.userId),
    pushConfigured: vapid !== null && getPushSender().delivers,
    publicKey: vapid?.publicKey ?? null,
  });
});

export const POST = route({ auth: 'session' }, async ({ session }) => {
  await notificationsService.markRead(session.userId!);
  return json({ read: true });
});
