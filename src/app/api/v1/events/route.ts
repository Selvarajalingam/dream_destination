import { z } from 'zod';
import { analyticsService } from '@/modules/analytics/service';
import { json, route } from '@/server/handler';

/**
 * POST /api/v1/events — browser-side analytics events.
 *
 * Each event is validated against the catalogue individually. A rejected
 * event is counted and logged but does not fail the batch, because analytics
 * must never surface as an error to a traveller.
 */

const BodySchema = z.object({
  events: z
    .array(z.object({ name: z.string().min(1).max(60), properties: z.record(z.string(), z.unknown()).optional() }))
    .min(1)
    .max(20),
});

export const POST = route(
  { auth: 'none', body: BodySchema, rateLimit: { key: 'analytics-events', perMinute: 60 } },
  async ({ body, session }) => {
    let accepted = 0;
    for (const event of body.events) {
      const ok = await analyticsService.trackUnchecked(event.name, event.properties ?? {}, { sessionId: session.id });
      if (ok) accepted += 1;
    }

    return json({ accepted, rejected: body.events.length - accepted }, { status: 202 });
  },
);
