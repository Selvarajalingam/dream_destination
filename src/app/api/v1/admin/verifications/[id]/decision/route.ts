import { z } from 'zod';
import { canDecide } from '@/modules/verification/domain/gate';
import { verificationRepository } from '@/modules/verification/repository';
import { recordAudit } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/admin/verifications/{id}/decision
 *
 * A reason is mandatory (PRD Part I A03), a business owner cannot decide on
 * their own submission (PRD Part II §19), and every decision writes an audit
 * record. The decision is also accepted only once per idempotency key.
 */

const BodySchema = z.object({
  decision: z.enum(['approved', 'changes_requested', 'rejected', 'suppressed']),
  reason: z.string().min(10).max(1000),
  /** Months until the next review. Required when approving. */
  validForMonths: z.number().int().min(1).max(36).optional(),
});

export const POST = route(
  {
    auth: 'role',
    roles: ['verifier', 'tourism_admin', 'platform_admin'],
    body: BodySchema,
    idempotent: true,
  },
  async ({ params, body, session, requestId }) => {
    const verification = await verificationRepository.findById(params.id);
    if (verification === null) throw problems.notFound();

    // Separation of duties, enforced in the domain rather than the route.
    if (!canDecide({ userId: session.userId!, roles: session.roles }, verification)) {
      throw problems.forbidden('You cannot decide on a submission you are connected to.');
    }

    if (body.decision === 'approved' && body.validForMonths === undefined) {
      throw problems.validation('An approval must state how long it is valid for.');
    }

    const expiresAt =
      body.decision === 'approved'
        ? new Date(Date.now() + (body.validForMonths ?? 6) * 30 * 24 * 60 * 60 * 1000)
        : null;

    const updated = await verificationRepository.recordDecision({
      verificationId: params.id,
      status: body.decision,
      reviewerUserId: session.userId!,
      reason: body.reason,
      expiresAt,
    });

    if (updated === null) throw problems.notFound();

    await recordAudit({
      actorUserId: session.userId,
      action: `verification.${body.decision}`,
      entityType: 'hidden_gem_verification',
      entityId: params.id,
      beforeState: { status: verification.status, expiresAt: verification.expiresAt },
      afterState: { status: updated.status, expiresAt: updated.expiresAt, reason: body.reason },
      requestId,
    });

    return json({
      id: updated.id,
      placeId: updated.placeId,
      status: updated.status,
      expiresAt: updated.expiresAt?.toISOString() ?? null,
    });
  },
);
