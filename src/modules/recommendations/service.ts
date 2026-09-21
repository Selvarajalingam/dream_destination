import { sql } from '@/platform/db/client';
import { getMapsProvider } from '@/platform/maps';
import { catalogRepository, type DestinationRow } from '@/modules/catalog/repository';
import { crowdService } from '@/modules/crowd/service';
import type { CrowdBand } from '@/modules/crowd/domain/types';
import type { TripBrief } from '@/platform/ai/schemas';
import { computeDreamScore, DREAM_SCORE_ALGORITHM_VERSION } from './domain/dream-score';
import type { DreamScoreBrief, DreamScoreDimension, DreamScoreResult } from './domain/types';

/**
 * Shortlist generation — PRD Part II §8.1.
 *
 * Deterministic filters run first, then every survivor is scored by
 * application code (§9.2: "Calculate the score in application code, not the
 * LLM"). Components, weights, algorithm version and the input snapshot are
 * persisted so any score can be re-explained later (§9.2, §9.3).
 */

/** PRD Part I T04 compares two or three realistic options. */
const SHORTLIST_SIZE = 3;

/** A destination whose cheapest estimate is far past the budget is dropped. */
const BUDGET_HEADROOM = 1.5;

/** Season fit by month, mirroring the seeded catalog. */
const SEASON_FIT: Record<string, Record<number, number>> = {
  'ooty-nilgiris': { 1: 0.8, 2: 0.85, 3: 0.9, 4: 0.95, 5: 0.9, 6: 0.5, 7: 0.4, 8: 0.45, 9: 0.7, 10: 0.8, 11: 0.85, 12: 0.9 },
  'coonoor-valley': { 1: 0.85, 2: 0.9, 3: 0.9, 4: 0.9, 5: 0.85, 6: 0.55, 7: 0.45, 8: 0.5, 9: 0.75, 10: 0.85, 11: 0.9, 12: 0.92 },
  'valparai-anamalai': { 1: 0.85, 2: 0.9, 3: 0.85, 4: 0.7, 5: 0.6, 6: 0.3, 7: 0.25, 8: 0.3, 9: 0.6, 10: 0.75, 11: 0.85, 12: 0.88 },
  'coimbatore-city': { 1: 0.9, 2: 0.85, 3: 0.7, 4: 0.55, 5: 0.5, 6: 0.6, 7: 0.65, 8: 0.7, 9: 0.75, 10: 0.85, 11: 0.9, 12: 0.92 },
};

export type ShortlistEntry = {
  destination: DestinationRow;
  score: DreamScoreResult;
  travelMinutes: number;
  travelIsEstimate: boolean;
  estimatedCostLowMinor: number;
  estimatedCostHighMinor: number;
  expectedCrowdBand: CrowdBand;
  localExperienceCount: number;
  /** The single clearest advantage, for the T04 card. */
  advantage: string;
  /** The single clearest trade-off, for the T04 card. */
  tradeOff: string;
};

export type ShortlistOptions = {
  userId?: string | null;
  tripId?: string | null;
  weightOverrides?: Partial<Record<DreamScoreDimension, number>>;
  /** Persist the scores. Off for preview recalculations. */
  persist?: boolean;
  limit?: number;
};

function monthFrom(dateFlexibility: string | undefined): number | null {
  if (dateFlexibility === undefined) return null;
  const match = /^(\d{4})-(\d{2})/.exec(dateFlexibility);
  return match === null ? null : Number(match[2]);
}

function toScoreBrief(brief: TripBrief): DreamScoreBrief {
  return {
    interests: brief.interests ?? [],
    budgetTotalMinor: brief.budget?.totalMinor ?? null,
    durationDays: brief.durationDays ?? null,
    crowdTolerance: brief.crowdTolerance ?? null,
    pace: brief.pace ?? null,
    travelMonth: monthFrom(brief.dateFlexibility),
    constraints: {
      lowWalking: brief.constraints?.lowWalking,
      medicalAccessRequired: brief.constraints?.medicalAccessRequired,
    },
  };
}

/**
 * Trip cost for this party and duration, from the destination's per-trip base
 * range. Stored values are whole rupees; everything downstream is minor units.
 */
function estimateCost(
  destination: DestinationRow,
  durationDays: number,
  travellers: number,
): { lowMinor: number; highMinor: number } {
  const baseLow = destination.baseCostLowInr ?? 8_000;
  const baseHigh = destination.baseCostHighInr ?? 20_000;

  // The catalog range assumes a two-person, two-night trip; scale from there.
  const dayFactor = Math.max(1, durationDays) / 2;
  const partyFactor = 0.6 + 0.4 * Math.max(1, travellers);

  return {
    lowMinor: Math.round(baseLow * 100 * dayFactor * partyFactor * 0.5),
    highMinor: Math.round(baseHigh * 100 * dayFactor * partyFactor * 0.5),
  };
}

/** The crowd band a destination is typically in, from its busiest places. */
async function expectedCrowdBand(destinationId: string): Promise<CrowdBand> {
  const places = await catalogRepository.listPlacesForDestination(destinationId);
  const notable = places.filter((place) => !place.isHiddenGem).slice(0, 6);
  if (notable.length === 0) return 'unknown';

  const statuses = await crowdService.getStatusForPlaces(notable.map((place) => place.id));
  const bands = [...statuses.values()].map((status) => status.band).filter((band) => band !== 'unknown');

  if (bands.length === 0) return 'unknown';

  // Report the worst band a traveler is likely to meet, not the average, so
  // the score does not flatter a destination with one very busy site.
  if (bands.includes('heavy')) return 'heavy';
  if (bands.includes('moderate')) return 'moderate';
  return 'comfortable';
}

export const recommendationsService = {
  async shortlist(brief: TripBrief, options: ShortlistOptions = {}): Promise<ShortlistEntry[]> {
    const { userId = null, tripId = null, weightOverrides, persist = true, limit = SHORTLIST_SIZE } = options;

    const durationDays = brief.durationDays ?? 3;
    const travellers = (brief.party?.adults ?? 2) + (brief.party?.children ?? 0);
    const budgetMinor = brief.budget?.totalMinor ?? null;

    // --- Deterministic filters first (PRD Part II §8.1) ---
    const candidates = await catalogRepository.searchDestinations({
      durationDays,
      limit: 20,
    });

    const origin =
      brief.origin?.coordinates === undefined
        ? null
        : { lat: brief.origin.coordinates[1], lng: brief.origin.coordinates[0] };

    const maps = getMapsProvider();
    const scoreBrief = toScoreBrief(brief);

    const entries: ShortlistEntry[] = [];

    for (const destination of candidates) {
      const cost = estimateCost(destination, durationDays, travellers);

      // Drop anything far beyond the declared budget rather than ranking it low.
      if (budgetMinor !== null && cost.lowMinor > budgetMinor * BUDGET_HEADROOM) continue;

      const route =
        origin === null
          ? { minutes: 0, isEstimate: true }
          : await maps
              .route(origin, { lat: destination.lat, lng: destination.lng }, 'car')
              .then((result) => ({ minutes: result.minutes, isEstimate: result.isEstimate }));

      const [band, localExperienceCount, accessibility] = await Promise.all([
        expectedCrowdBand(destination.id),
        catalogRepository.countLocalExperiences(destination.id),
        catalogRepository.accessibilitySummary(destination.id),
      ]);

      const score = computeDreamScore({
        brief: scoreBrief,
        destination: {
          id: destination.id,
          name: destination.name,
          themes: destination.themes,
          estimatedCostLowMinor: cost.lowMinor,
          estimatedCostHighMinor: cost.highMinor,
          travelMinutesFromOrigin: origin === null ? null : route.minutes,
          minimumDays: destination.minimumDays,
          maximumDays: destination.maximumDays,
          expectedCrowdBand: band,
          seasonFitByMonth: SEASON_FIT[destination.slug] ?? {},
          accessibility,
          localExperienceCount,
        },
        weightOverrides,
      });

      entries.push({
        destination,
        score,
        travelMinutes: route.minutes,
        travelIsEstimate: route.isEstimate,
        estimatedCostLowMinor: cost.lowMinor,
        estimatedCostHighMinor: cost.highMinor,
        expectedCrowdBand: band,
        localExperienceCount,
        advantage: score.reasons[0] ?? 'Matches several parts of your trip brief',
        tradeOff: score.tradeOff ?? 'Some information for this destination is still incomplete',
      });
    }

    entries.sort((a, b) => b.score.total - a.score.total);
    const shortlist = entries.slice(0, limit);

    if (persist && shortlist.length > 0) {
      await this.persistScores(shortlist, brief, userId, tripId);
    }

    return shortlist;
  },

  /**
   * Persists component values, weights, algorithm version and the input
   * snapshot, so a score shown to a traveler can always be reconstructed.
   */
  async persistScores(
    entries: ShortlistEntry[],
    brief: TripBrief,
    userId: string | null,
    tripId: string | null,
  ): Promise<void> {
    for (const entry of entries) {
      await sql`
        INSERT INTO recommendation_scores (
          user_id, trip_id, destination_id, total_score,
          components, weights, algorithm_version, input_snapshot
        ) VALUES (
          ${userId}, ${tripId}, ${entry.destination.id}, ${entry.score.total},
          ${sql.json(entry.score.components)},
          ${sql.json(entry.score.weights)},
          ${DREAM_SCORE_ALGORITHM_VERSION},
          ${sql.json({
            brief,
            expectedCrowdBand: entry.expectedCrowdBand,
            estimatedCostLowMinor: entry.estimatedCostLowMinor,
            estimatedCostHighMinor: entry.estimatedCostHighMinor,
            travelMinutes: entry.travelMinutes,
            localExperienceCount: entry.localExperienceCount,
            missingDimensions: entry.score.missingDimensions,
          })}
        )
      `;
    }
  },

  /** A single destination's score, for the T07 detail screen. */
  async scoreFor(
    destinationSlug: string,
    brief: TripBrief,
    weightOverrides?: Partial<Record<DreamScoreDimension, number>>,
  ): Promise<ShortlistEntry | null> {
    const destination = await catalogRepository.findDestinationBySlug(destinationSlug);
    if (destination === null) return null;

    const entries = await this.shortlist(brief, {
      persist: false,
      limit: 20,
      weightOverrides,
    });

    return entries.find((entry) => entry.destination.id === destination.id) ?? null;
  },
};
