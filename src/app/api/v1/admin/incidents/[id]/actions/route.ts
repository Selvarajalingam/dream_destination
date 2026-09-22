import { z } from 'zod';
import { MIN_ACTION_REASON } from '@/modules/incidents/domain/incidents';
import { incidentsService } from '@/modules/incidents/service';
import { isUuid } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/admin/incidents/{id}/actions — PRD Part II §7.3.
 *
 * Validation only; the triage rules live in incidentsService so they can be
 * tested without HTTP. Suspension and reinstatement carry a mandatory reason,
 * because an audit row without one explains nothing.
 */

const reason = z.string().min(MIN_ACTION_REASON).max(1000);

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('assign'), assignedTo: z.string().uuid().nullable() }),
  z.object({
    action: z.literal('set_severity'),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    reason,
  }),
  z.object({ action: z.literal('investigate') }),
  z.object({ action: z.literal('suspend'), reason }),
  z.object({ action: z.literal('reinstate'), reason }),
  z.object({ action: z.literal('resolve'), reason }),
  z.object({ action: z.literal('dismiss'), reason }),
  z.object({ action: z.literal('reopen'), reason }),
]);

export const POST = route(
  {
    auth: 'role',
    roles: ['tourism_admin', 'platform_admin'],
    body: BodySchema,
    idempotent: true,
  },
  async ({ params, body, session, requestId }) => {
    if (!isUuid(params.id)) throw problems.notFound();

    const incident = await incidentsService.act(params.id, body, session.userId!, requestId);
    return json({ incident });
  },
);
