import { z } from 'zod';
import { getAiGateway } from '@/platform/ai';
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
  async ({ body }) => {
    const gateway = getAiGateway();
    const extraction = await gateway.extractBrief(body.message, body.prior ?? null);

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
