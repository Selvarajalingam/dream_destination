import { ownerService } from '@/modules/businesses/owner-service';
import { isUuid } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/business/listings/{id}/sponsorship — asks for sponsored placement.
 *
 * Only a verified live listing may ask, and A07 decides separately from
 * verification.
 */

export const POST = route({ auth: 'session', idempotent: true }, async ({ params, session, requestId }) => {
  if (!isUuid(params.id)) throw problems.notFound();
  await ownerService.requestSponsorship(params.id, { userId: session.userId!, requestId });
  return json({ requested: true });
});
