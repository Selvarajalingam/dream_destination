import { z } from 'zod';
import { ownerService } from '@/modules/businesses/owner-service';
import { json, route } from '@/server/handler';

/**
 * GET  /api/v1/business/listings — the signed-in owner's listings (B05).
 * POST /api/v1/business/listings — starts a draft listing (B01).
 *
 * Any signed-in account can register a business. Access to a listing comes
 * from owning it, not from a role, so starting a draft grants nothing else.
 */

const StartSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    destinationSlug: z.string().min(1).max(80),
  })
  .strict();

export const GET = route({ auth: 'session' }, async ({ session }) => {
  return json({ listings: await ownerService.listMine({ userId: session.userId! }) });
});

export const POST = route(
  { auth: 'session', body: StartSchema, rateLimit: { key: 'business-start', perMinute: 5 }, idempotent: true },
  async ({ body, session, requestId }) => {
    const { id } = await ownerService.start(body, { userId: session.userId!, requestId });
    return json({ id }, { status: 201 });
  },
);
