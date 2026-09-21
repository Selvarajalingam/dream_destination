import { z } from 'zod';
import { TripBriefSchema } from '@/platform/ai/schemas';
import { recommendationsService } from '@/modules/recommendations/service';
import { json, route } from '@/server/handler';

/**
 * POST /api/v1/recommendations/destinations
 *
 * Returns the explainable shortlist for Screen T04. Every entry carries its
 * component scores, the weights used, what was missing and the confidence, so
 * the UI never has to present a bare number.
 */

const DIMENSIONS = [
  'interestMatch',
  'budgetMatch',
  'timeDistanceFit',
  'crowdComfort',
  'seasonWeatherFit',
  'accessibilityFit',
  'localExperienceFit',
] as const;

const BodySchema = z.object({
  brief: TripBriefSchema,
  tripId: z.string().uuid().nullish(),
  /** "Change what matters" on Screen T07. */
  weightOverrides: z.partialRecord(z.enum(DIMENSIONS), z.number().min(0).max(1)).optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

export const POST = route(
  { auth: 'none', body: BodySchema, rateLimit: { key: 'shortlist', perMinute: 30 } },
  async ({ body, session }) => {
    const entries = await recommendationsService.shortlist(body.brief, {
      userId: session.userId,
      tripId: body.tripId ?? null,
      weightOverrides: body.weightOverrides,
      limit: body.limit,
      persist: session.userId !== null,
    });

    return json({
      options: entries.map((entry) => ({
        destination: {
          id: entry.destination.id,
          slug: entry.destination.slug,
          name: entry.destination.name,
          district: entry.destination.district,
          summary: entry.destination.summary,
          themes: entry.destination.themes,
          lat: entry.destination.lat,
          lng: entry.destination.lng,
        },
        // "Trip match", never "safety score". PRD Part I §5.2.
        tripMatch: entry.score.total,
        components: entry.score.components,
        weights: entry.score.weights,
        missingDimensions: entry.score.missingDimensions,
        confidence: entry.score.confidence,
        reasons: entry.score.reasons,
        advantage: entry.advantage,
        tradeOff: entry.tradeOff,
        algorithmVersion: entry.score.algorithmVersion,
        estimatedCost: {
          lowMinor: entry.estimatedCostLowMinor,
          highMinor: entry.estimatedCostHighMinor,
          // Never present an estimate as a quoted price.
          state: 'historical' as const,
        },
        travel: {
          minutes: entry.travelMinutes,
          isEstimate: entry.travelIsEstimate,
        },
        expectedCrowdBand: entry.expectedCrowdBand,
        localExperienceCount: entry.localExperienceCount,
      })),
    });
  },
);
