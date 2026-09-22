import { z } from 'zod';
import {
  MAX_REPORT_LENGTH,
  MIN_REPORT_LENGTH,
  initialSeverity,
  redactReport,
} from '@/modules/incidents/domain/incidents';
import { incidentsRepository } from '@/modules/incidents/repository';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/incidents — a traveller reports a concern about a place or a
 * business.
 *
 * Guests may report: a safety problem should not wait for someone to create
 * an account. The description is redacted of contact details and precise
 * coordinates before it is stored, and severity comes from the category
 * rather than the reporter's own judgement.
 */

/** Reports one signed-in person may file in a day before being refused. */
const DAILY_REPORT_LIMIT = 10;

const BodySchema = z.object({
  entityType: z.enum(['place', 'business']),
  slug: z.string().min(1).max(160),
  category: z.enum(['danger', 'access', 'closed', 'crowding', 'information', 'conduct', 'other']),
  description: z.string().min(MIN_REPORT_LENGTH).max(MAX_REPORT_LENGTH),
});

export const POST = route(
  { auth: 'none', body: BodySchema, rateLimit: { key: 'incident-report', perMinute: 5 } },
  async ({ body, session }) => {
    const entity = await incidentsRepository.resolveEntity(body.entityType, body.slug);
    if (entity === null) throw problems.notFound('That listing does not exist.');

    if (session.userId !== null) {
      const recent = await incidentsRepository.recentCountForReporter(session.userId, 24);
      if (recent >= DAILY_REPORT_LIMIT) throw problems.rateLimited(3600);
    }

    const description = redactReport(body.description);
    const severity = initialSeverity(body.category);

    const id = await incidentsRepository.create({
      reporterUserId: session.userId,
      entityType: body.entityType,
      entityId: entity.id,
      category: body.category,
      severity,
      description,
    });

    return json(
      {
        id,
        received: true,
        // Tell the reporter what happens next rather than leaving them to wonder.
        message:
          severity === 'critical'
            ? 'Thank you. This has been sent to the tourism authority as urgent. If anyone is in danger now, call 112.'
            : 'Thank you. The tourism authority reviews reports like this and will check the listing.',
        redacted: description !== body.description.trim(),
      },
      { status: 201 },
    );
  },
);
