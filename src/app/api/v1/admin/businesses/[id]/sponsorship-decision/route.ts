import { z } from 'zod';
import { businessReviewService } from '@/modules/businesses/review-service';
import { isUuid } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/admin/businesses/{id}/sponsorship-decision — Screen A07.
 *
 * A separate endpoint from the listing decision on purpose: PRD Part I A07
 * keeps sponsored placement approval apart from listing verification, and a
 * single endpoint that did both would invite doing both at once.
 */

const BodySchema = z.object({
  decision: z.enum(['approved', 'declined', 'revoked']),
  reason: z.string().min(10).max(1000),
});

export const POST = route(
  {
    auth: 'role',
    roles: ['tourism_admin', 'platform_admin'],
    body: BodySchema,
    idempotent: true,
  },
  async ({ params, body, session, requestId }) => {
    if (!isUuid(params.id)) throw problems.notFound();

    await businessReviewService.decideSponsorship({
      businessId: params.id,
      decision: body.decision,
      reason: body.reason.trim(),
      reviewer: { userId: session.userId!, roles: session.roles },
      requestId,
    });

    return json({ businessId: params.id, decision: body.decision });
  },
);
