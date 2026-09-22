import { z } from 'zod';
import { freshnessRepository } from '@/modules/operations/freshness-repository';
import { recordAudit } from '@/server/authorize';
import { json, route } from '@/server/handler';

/**
 * POST /api/v1/admin/freshness/assign — assign a stale record to a reviewer.
 * PRD E11-S07: "Assignment and reminders are available."
 */

const BodySchema = z.object({
  entityType: z.enum(['rule', 'help_facility', 'source', 'business']),
  entityId: z.string().uuid(),
  assignedTo: z.string().uuid().nullable(),
  note: z.string().max(500).optional(),
});

export const POST = route(
  { auth: 'role', roles: ['verifier', 'tourism_admin', 'platform_admin'], body: BodySchema },
  async ({ body, session, requestId }) => {
    await freshnessRepository.assign({
      entityType: body.entityType,
      entityId: body.entityId,
      assignedTo: body.assignedTo,
      assignedBy: session.userId!,
      note: body.note ?? null,
    });

    await recordAudit({
      actorUserId: session.userId,
      action: 'freshness.assigned',
      entityType: body.entityType,
      entityId: body.entityId,
      afterState: { assignedTo: body.assignedTo, note: body.note ?? null },
      requestId,
    });

    return json({ ok: true });
  },
);
