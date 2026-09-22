import { z } from 'zod';
import { getAiGateway } from '@/platform/ai';
import { analyticsService } from '@/modules/analytics/service';
import { TripBriefSchema, missingRequiredFields } from '@/platform/ai/schemas';
import { json, route } from '@/server/handler';

/**
 * POST /api/v1/trip-briefs/parse
 *
 * Turns a traveller message into a structured brief. The response reports
 * which mode produced it, so Screen T03 can say plainly when the assistant is
 * unavailable rather than degrading silently (PRD Part II §14.2).
 */

const BodySchema = z.object({
  message: z.string().min(1).max(4000),
  prior: TripBriefSchema.nullish(),
});

export const POST = route(
  {
    auth: 'none',
    body: BodySchema,
    // Generous enough for a real conversation, tight enough to blunt abuse.
    rateLimit: { key: 'brief-parse', perMinute: 20 },
  },
  async ({ body, session }) => {
    const gateway = getAiGateway();
    const extraction = await gateway.extractBrief(body.message, body.prior ?? null);
    const ready = missingRequiredFields(extraction.brief).length === 0;

    // Funnel events carry the mode and a count, never the message itself.
    if (body.prior == null) {
      await analyticsService.track('brief_started', { mode: extraction.mode }, { sessionId: session.id });
    }
    if (ready) {
      await analyticsService.track(
        'brief_completed',
        { mode: extraction.mode, clarifications: extraction.clarification === null ? 0 : 1 },
        { sessionId: session.id },
      );
    }

    return json({
      brief: extraction.brief,
      extractedFields: extraction.extractedFields,
      clarification: extraction.clarification,
      confidence: extraction.confidence,
      mode: extraction.mode,
      missingRequired: missingRequiredFields(extraction.brief),
      readyToGenerate: missingRequiredFields(extraction.brief).length === 0,
    });
  },
);
