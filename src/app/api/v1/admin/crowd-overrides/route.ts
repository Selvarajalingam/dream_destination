import { z } from 'zod';
import { crowdRepository } from '@/modules/crowd/repository';
import { catalogRepository } from '@/modules/catalog/repository';
import { recordAudit } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/admin/crowd-overrides
 *
 * An override requires a reason, a start, an expiry and an affected place
 * (PRD Part I A04), and writes an audit record (PRD Part II §19). The reason
 * is surfaced to travellers in the crowd explanation, so it is not optional
 * and not internal-only.
 */

const BodySchema = z.object({
  placeId: z.string().uuid(),
  band: z.enum(['comfortable', 'moderate', 'heavy']),
  reason: z.string().min(10).max(400),
  startsAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const POST = route(
  {
    auth: 'role',
    roles: ['tourism_admin', 'platform_admin'],
    body: BodySchema,
    idempotent: true,
  },
  async ({ body, session, requestId }) => {
    const startsAt = new Date(body.startsAt);
    const expiresAt = new Date(body.expiresAt);

    if (expiresAt <= startsAt) {
      throw problems.validation('The override must expire after it starts.');
    }

    const place = await catalogRepository.findPlaceById(body.placeId);
    if (place === null) throw problems.notFound('That place is not in the catalog.');

    const before = await crowdRepository.findActiveOverride(body.placeId, new Date());

    const id = await crowdRepository.createOverride({
      placeId: body.placeId,
      band: body.band,
      reason: body.reason,
      startsAt,
      expiresAt,
      createdBy: session.userId!,
    });

    await recordAudit({
      actorUserId: session.userId,
      action: 'crowd_override.created',
      entityType: 'place',
      entityId: body.placeId,
      beforeState: before,
      afterState: { id, band: body.band, reason: body.reason, startsAt, expiresAt },
      requestId,
    });

    return json({ id, placeId: body.placeId, band: body.band }, { status: 201 });
  },
);
