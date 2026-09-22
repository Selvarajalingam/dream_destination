import { z } from 'zod';
import { ownerService } from '@/modules/businesses/owner-service';
import { isUuid } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * PATCH /api/v1/business/listings/{id} — B02 autosave.
 *
 * Saves every valid field and returns messages for the rest, so one typo
 * never costs the owner the whole form. Only while the listing is editable.
 */

const BodySchema = z
  .record(z.string().max(40), z.unknown())
  .refine((value) => Object.keys(value).length <= 20, 'Too many fields.');

export const PATCH = route(
  { auth: 'session', body: BodySchema, rateLimit: { key: 'business-draft', perMinute: 60 } },
  async ({ params, body, session, requestId }) => {
    if (!isUuid(params.id)) throw problems.notFound();
    const result = await ownerService.saveDraft(params.id, body, { userId: session.userId!, requestId });
    return json({ ...result, savedAt: new Date().toISOString() });
  },
);
