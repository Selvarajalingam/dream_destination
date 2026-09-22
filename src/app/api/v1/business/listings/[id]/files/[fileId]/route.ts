import { ownerService } from '@/modules/businesses/owner-service';
import { isUuid } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/** DELETE /api/v1/business/listings/{id}/files/{fileId} — removes a photo or evidence file. */

export const DELETE = route({ auth: 'session' }, async ({ params, session, requestId }) => {
  if (!isUuid(params.id) || !isUuid(params.fileId)) throw problems.notFound();
  await ownerService.deleteFile(params.id, params.fileId, { userId: session.userId!, requestId });
  return json({ removed: params.fileId });
});
