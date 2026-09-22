import { z } from 'zod';
import { MAX_BULK_REMINDER, validateBulkReminder } from '@/modules/operations/domain/freshness';
import { freshnessRepository } from '@/modules/operations/freshness-repository';
import { recordAudit } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/admin/freshness/remind — record a reminder against many
 * records at once. This is the only bulk action on the freshness screen;
 * approval is deliberately never bulk (PRD E11-S07).
 */

const BodySchema = z.object({
  entries: z
    .array(
      z.object({
        entityType: z.enum(['rule', 'help_facility', 'source', 'business']),
        entityId: z.string().uuid(),
      }),
    )
    .max(MAX_BULK_REMINDER),
});

export const POST = route(
  { auth: 'role', roles: ['verifier', 'tourism_admin', 'platform_admin'], body: BodySchema },
  async ({ body, session, requestId }) => {
    const problem = validateBulkReminder(body.entries.map((entry) => `${entry.entityType}:${entry.entityId}`));
    if (problem !== null) throw problems.validation(problem);

    const reminded = await freshnessRepository.remind(body.entries, session.userId!);

    for (const entry of body.entries) {
      await recordAudit({
        actorUserId: session.userId,
        action: 'freshness.reminded',
        entityType: entry.entityType,
        entityId: entry.entityId,
        requestId,
      });
    }

    return json({ reminded });
  },
);
