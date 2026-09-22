import { z } from 'zod';
import { ownerService } from '@/modules/businesses/owner-service';
import { isUuid } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/** PUT /api/v1/business/listings/{id}/availability — a short availability note (B06). */

const BodySchema = z.object({ note: z.string().trim().max(140).nullable() }).strict();

export const PUT = route({ auth: 'session', body: BodySchema }, async ({ params, body, session, requestId }) => {
  if (!isUuid(params.id)) throw problems.notFound();
  const note = body.note === null || body.note === '' ? null : body.note;
  await ownerService.setAvailability(params.id, note, { userId: session.userId!, requestId });
  return json({ note });
});
