import { z } from 'zod';
import { validateReverification } from '@/modules/operations/domain/freshness';
import { freshnessRepository } from '@/modules/operations/freshness-repository';
import { recordAudit } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/admin/freshness/reverify — mark ONE record re-verified.
 *
 * The body takes a single record, not a list. PRD E11-S07 says bulk approval
 * is not available, and the simplest way to guarantee that is for the only
 * endpoint that makes a record fresh to be structurally incapable of
 * accepting more than one.
 */

const BodySchema = z
  .object({
    entityType: z.enum(['rule', 'help_facility', 'source', 'business']),
    entityId: z.string().uuid(),
    note: z.string().max(1000),
  })
  .strict();

export const POST = route(
  {
    auth: 'role',
    roles: ['verifier', 'tourism_admin', 'platform_admin'],
    body: BodySchema,
    idempotent: true,
  },
  async ({ body, session, requestId }) => {
    const problem = validateReverification(body.note);
    if (problem !== null) throw problems.validation(problem);

    const result = await freshnessRepository.reverify(body.entityType, body.entityId, session.userId!, body.note.trim());
    if (result === null) throw problems.notFound();

    await recordAudit({
      actorUserId: session.userId,
      action: 'freshness.reverified',
      entityType: body.entityType,
      entityId: body.entityId,
      beforeState: { reviewDueAt: result.before },
      afterState: { reviewDueAt: result.after, note: body.note.trim() },
      requestId,
    });

    return json({ entityId: body.entityId, reviewDueAt: result.after.toISOString() });
  },
);
