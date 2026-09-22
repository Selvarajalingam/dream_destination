import { ownerService } from '@/modules/businesses/owner-service';
import { isUuid } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/** POST /api/v1/business/listings/{id}/confirm — "my details are still right" (B05, E10-S07). */

export const POST = route({ auth: 'session' }, async ({ params, session, requestId }) => {
  if (!isUuid(params.id)) throw problems.notFound();
  await ownerService.confirmDetails(params.id, { userId: session.userId!, requestId });
  return json({ confirmedAt: new Date().toISOString() });
});
