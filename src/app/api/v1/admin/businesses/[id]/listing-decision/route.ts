import { z } from 'zod';
import { businessReviewService } from '@/modules/businesses/review-service';
import { isUuid } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/admin/businesses/{id}/listing-decision — Screen A07.
 *
 * Approval requires every PRD check confirmed; the service enforces it.
 */

const BodySchema = z.object({
  decision: z.enum(['approved', 'changes_requested', 'rejected']),
  reason: z.string().min(10).max(1000),
  confirmedChecks: z.array(z.enum(['ownership', 'address', 'businessType', 'hours', 'contact'])).max(5),
});

export const POST = route(
  {
    auth: 'role',
    roles: ['verifier', 'tourism_admin', 'platform_admin'],
    body: BodySchema,
    idempotent: true,
  },
  async ({ params, body, session, requestId }) => {
    if (!isUuid(params.id)) throw problems.notFound();

    await businessReviewService.decideListing({
      businessId: params.id,
      decision: body.decision,
      reason: body.reason.trim(),
      confirmedChecks: [...new Set(body.confirmedChecks)],
      reviewer: { userId: session.userId!, roles: session.roles },
      requestId,
    });

    return json({ businessId: params.id, decision: body.decision });
  },
);
