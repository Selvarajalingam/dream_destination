import { recordAudit } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { revokeSession } from '@/server/session';

/** POST /api/v1/auth/logout — ends the session on the server, not only in the browser. */

export const POST = route({ auth: 'none' }, async ({ session, requestId }) => {
  if (session.userId !== null && !session.isGuest) {
    await recordAudit({
      actorUserId: session.userId,
      action: 'auth.signed_out',
      entityType: 'user',
      entityId: session.userId,
      requestId,
    });
  }
  await revokeSession(session.id);
  return json({ signedOut: true });
});
