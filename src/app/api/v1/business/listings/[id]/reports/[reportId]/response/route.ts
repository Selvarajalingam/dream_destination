import { z } from 'zod';
import { ownerService } from '@/modules/businesses/owner-service';
import { isUuid } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/business/listings/{id}/reports/{reportId}/response
 *
 * The owner's side of a traveller report. Triage sees it in A06; the owner
 * never sees who reported.
 */

const BodySchema = z.object({ response: z.string().max(1000) }).strict();

export const POST = route(
  { auth: 'session', body: BodySchema, rateLimit: { key: 'business-report-response', perMinute: 10 } },
  async ({ params, body, session, requestId }) => {
    if (!isUuid(params.id) || !isUuid(params.reportId)) throw problems.notFound();
    await ownerService.respondToReport(params.id, params.reportId, body.response, {
      userId: session.userId!,
      requestId,
    });
    return json({ responded: true });
  },
);
