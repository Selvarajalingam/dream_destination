import { z } from 'zod';
import { ownerService } from '@/modules/businesses/owner-service';
import { isUuid } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/** PUT /api/v1/business/listings/{id}/closure — a temporary closure, or null to reopen (B06). */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const BodySchema = z
  .object({
    closure: z
      .object({
        from: z.string().regex(ISO_DATE),
        until: z.string().regex(ISO_DATE),
        note: z.string().trim().max(140).nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export const PUT = route({ auth: 'session', body: BodySchema }, async ({ params, body, session, requestId }) => {
  if (!isUuid(params.id)) throw problems.notFound();
  const closure =
    body.closure === null ? null : { ...body.closure, note: body.closure.note === '' ? null : body.closure.note };
  await ownerService.setClosure(params.id, closure, { userId: session.userId!, requestId });
  return json({ closure });
});
