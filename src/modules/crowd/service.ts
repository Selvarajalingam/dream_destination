import { crowdRepository } from './repository';
import { resolveCrowdStatus } from './domain/resolve';
import type { CrowdStatus } from './domain/types';

/**
 * Crowd service — composes the repository with the deterministic resolver.
 *
 * The service never decides a band itself; it gathers signals and hands them
 * to the domain, so the precedence ladder and the expiry rule are tested
 * without a database.
 */

export const crowdService = {
  async getStatus(placeId: string, at: Date = new Date()): Promise<CrowdStatus> {
    const [override, observations, forecast] = await Promise.all([
      crowdRepository.findActiveOverride(placeId, at),
      crowdRepository.findRecentObservations(placeId, at),
      crowdRepository.findForecastAt(placeId, at),
    ]);

    return resolveCrowdStatus({ override, observations, forecast }, at);
  },

  /** Bulk status for an itinerary, using two queries rather than 3N. */
  async getStatusForPlaces(placeIds: string[], at: Date = new Date()): Promise<Map<string, CrowdStatus>> {
    const unique = [...new Set(placeIds)];
    if (unique.length === 0) return new Map();

    const [overrides, forecasts] = await Promise.all([
      crowdRepository.findActiveOverridesForPlaces(unique, at),
      crowdRepository.findForecastsForPlaces(unique, at),
    ]);

    // Observations are per-place and only exist for a handful of demonstration
    // places, so they are fetched individually rather than in a wide scan.
    const statuses = new Map<string, CrowdStatus>();
    await Promise.all(
      unique.map(async (placeId) => {
        const observations = await crowdRepository.findRecentObservations(placeId, at, 5);
        statuses.set(
          placeId,
          resolveCrowdStatus(
            {
              override: overrides.get(placeId) ?? null,
              observations,
              forecast: forecasts.get(placeId) ?? null,
            },
            at,
          ),
        );
      }),
    );

    return statuses;
  },

  /**
   * The quietest upcoming hour for a place, powering "Show quieter time"
   * (PRD Part I §12.3).
   */
  async findQuieterTime(
    placeId: string,
    day: Date,
    after: Date = new Date(),
  ): Promise<{ startsAt: Date; band: CrowdStatus['band'] } | null> {
    const forecasts = await crowdRepository.findForecastsForDay(placeId, day);

    const candidates = forecasts
      .filter((forecast) => forecast.startsAt > after && forecast.band !== 'unknown')
      .sort((a, b) => (a.expectedOccupancyRatio ?? 1) - (b.expectedOccupancyRatio ?? 1));

    const best = candidates[0];
    return best === undefined ? null : { startsAt: best.startsAt, band: best.band };
  },

  async sourceHealth(placeId: string) {
    return crowdRepository.sourceHealth(placeId);
  },
};
