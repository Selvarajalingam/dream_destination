import { z } from 'zod';
import { ownerService } from '@/modules/businesses/owner-service';
import { isUuid } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/business/listings/{id}/updates — B06.
 *
 * Hours, price band, contact and similar apply at once. Name, category,
 * address, pin and owner changes are held for review and need a reason.
 */

const BodySchema = z
  .object({
    fields: z
      .record(z.string().max(40), z.unknown())
      .refine((value) => Object.keys(value).length > 0, 'Change at least one field.'),
    note: z.string().max(500).optional(),
  })
  .strict();

export const POST = route(
  { auth: 'session', body: BodySchema, rateLimit: { key: 'business-update', perMinute: 30 }, idempotent: true },
  async ({ params, body, session, requestId }) => {
    if (!isUuid(params.id)) throw problems.notFound();
    const result = await ownerService.update(params.id, body, { userId: session.userId!, requestId });
    return json(result);
  },
);
