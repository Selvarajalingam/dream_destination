import { ownerService } from '@/modules/businesses/owner-service';
import { isUuid } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/business/listings/{id}/submit — B03.
 *
 * Sends the listing to review. It stays pending, and invisible to
 * travellers, until A07 decides (E10-S05).
 */

export const POST = route({ auth: 'session', idempotent: true }, async ({ params, session, requestId }) => {
  if (!isUuid(params.id)) throw problems.notFound();
  await ownerService.submit(params.id, { userId: session.userId!, requestId });
  return json({ id: params.id, status: 'pending' });
});
