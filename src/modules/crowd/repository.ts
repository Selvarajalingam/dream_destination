import { sql } from '@/platform/db/client';
import type { CrowdForecast, CrowdObservation, CrowdOverride } from './domain/types';

/**
 * Crowd reads.
 *
 * Expired rows are filtered in SQL as well as in the domain resolver, so a
 * caller that forgets to pass "now" still cannot see a stale reading. PRD
 * Part II §19: "Expired crowd data returns Unknown."
 */

type ObservationRow = {
  band: CrowdObservation['band'];
  observed_at: Date;
  expires_at: Date;
  confidence: string;
  sample_size: number | null;
  occupancy_ratio: string | null;
  source_kind: string | null;
};

type ForecastRow = {
  band: CrowdForecast['band'];
  confidence: string;
  starts_at: Date;
  ends_at: Date;
  expires_at: Date;
  expected_occupancy_ratio: string | null;
};

type OverrideRow = {
  band: CrowdOverride['band'];
  reason: string;
  starts_at: Date;
  expires_at: Date;
};

export const crowdRepository = {
  /** The active override for a place, if any. */
  async findActiveOverride(placeId: string, at: Date): Promise<CrowdOverride | null> {
    const [row] = await sql<OverrideRow[]>`
      SELECT band, reason, starts_at, expires_at
      FROM crowd_overrides
      WHERE place_id = ${placeId} AND starts_at <= ${at} AND expires_at > ${at}
      ORDER BY starts_at DESC
      LIMIT 1
    `;

    return row === undefined
      ? null
      : { band: row.band, reason: row.reason, startsAt: row.starts_at, expiresAt: row.expires_at };
  },

  /** Unexpired observations, newest first. */
  async findRecentObservations(placeId: string, at: Date, limit = 10): Promise<CrowdObservation[]> {
    const rows = await sql<ObservationRow[]>`
      SELECT o.band, o.observed_at, o.expires_at, o.confidence, o.sample_size, o.occupancy_ratio,
             o.metadata->>'sourceKind' AS source_kind
      FROM crowd_observations o
      WHERE o.place_id = ${placeId} AND o.expires_at > ${at}
      ORDER BY o.observed_at DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      band: row.band,
      observedAt: row.observed_at,
      expiresAt: row.expires_at,
      confidence: Number(row.confidence),
      // Anything not explicitly marked as a sensor feed is treated as an
      // aggregated check-in, which is the more restrictive of the two.
      sourceKind: row.source_kind === 'sensor' ? 'sensor' : 'aggregated_checkin',
      sampleSize: row.sample_size,
      occupancyRatio: row.occupancy_ratio === null ? null : Number(row.occupancy_ratio),
    }));
  },

  /** The forecast covering a moment, if one exists and has not expired. */
  async findForecastAt(placeId: string, at: Date): Promise<CrowdForecast | null> {
    const [row] = await sql<ForecastRow[]>`
      SELECT band, confidence, starts_at, ends_at, expires_at, expected_occupancy_ratio
      FROM crowd_forecasts
      WHERE place_id = ${placeId}
        AND starts_at <= ${at}
        AND ends_at > ${at}
        AND expires_at > ${at}
      ORDER BY generated_at DESC
      LIMIT 1
    `;

    return row === undefined
      ? null
      : {
          band: row.band,
          confidence: Number(row.confidence),
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          expiresAt: row.expires_at,
          expectedOccupancyRatio:
            row.expected_occupancy_ratio === null ? null : Number(row.expected_occupancy_ratio),
        };
  },

  /** A day of forecasts, for the "show a quieter time" control. */
  async findForecastsForDay(placeId: string, day: Date): Promise<CrowdForecast[]> {
    const rows = await sql<ForecastRow[]>`
      SELECT band, confidence, starts_at, ends_at, expires_at, expected_occupancy_ratio
      FROM crowd_forecasts
      WHERE place_id = ${placeId}
        AND starts_at >= ${day}::date
        AND starts_at < (${day}::date + interval '1 day')
      ORDER BY starts_at
    `;

    return rows.map((row) => ({
      band: row.band,
      confidence: Number(row.confidence),
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      expiresAt: row.expires_at,
      expectedOccupancyRatio:
        row.expected_occupancy_ratio === null ? null : Number(row.expected_occupancy_ratio),
    }));
  },

  /** Bulk forecast lookup, so an itinerary does not issue one query per stop. */
  async findForecastsForPlaces(
    placeIds: string[],
    at: Date,
  ): Promise<Map<string, CrowdForecast>> {
    if (placeIds.length === 0) return new Map();

    const rows = await sql<Array<ForecastRow & { place_id: string }>>`
      SELECT DISTINCT ON (place_id)
             place_id, band, confidence, starts_at, ends_at, expires_at, expected_occupancy_ratio
      FROM crowd_forecasts
      WHERE place_id = ANY(${sql.array(placeIds)}::uuid[])
        AND starts_at <= ${at} AND ends_at > ${at} AND expires_at > ${at}
      ORDER BY place_id, generated_at DESC
    `;

    return new Map(
      rows.map((row) => [
        row.place_id,
        {
          band: row.band,
          confidence: Number(row.confidence),
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          expiresAt: row.expires_at,
          expectedOccupancyRatio:
            row.expected_occupancy_ratio === null ? null : Number(row.expected_occupancy_ratio),
        },
      ]),
    );
  },

  async findActiveOverridesForPlaces(placeIds: string[], at: Date): Promise<Map<string, CrowdOverride>> {
    if (placeIds.length === 0) return new Map();

    const rows = await sql<Array<OverrideRow & { place_id: string }>>`
      SELECT DISTINCT ON (place_id) place_id, band, reason, starts_at, expires_at
      FROM crowd_overrides
      WHERE place_id = ANY(${sql.array(placeIds)}::uuid[])
        AND starts_at <= ${at} AND expires_at > ${at}
      ORDER BY place_id, starts_at DESC
    `;

    return new Map(
      rows.map((row) => [
        row.place_id,
        { band: row.band, reason: row.reason, startsAt: row.starts_at, expiresAt: row.expires_at },
      ]),
    );
  },

  async createOverride(input: {
    placeId: string;
    band: CrowdOverride['band'];
    reason: string;
    startsAt: Date;
    expiresAt: Date;
    createdBy: string;
  }): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO crowd_overrides (place_id, band, reason, starts_at, expires_at, created_by)
      VALUES (${input.placeId}, ${input.band}, ${input.reason},
              ${input.startsAt}, ${input.expiresAt}, ${input.createdBy})
      RETURNING id
    `;
    return row.id;
  },

  async deleteOverride(id: string): Promise<CrowdOverride | null> {
    const [row] = await sql<OverrideRow[]>`
      DELETE FROM crowd_overrides WHERE id = ${id}
      RETURNING band, reason, starts_at, expires_at
    `;
    return row === undefined
      ? null
      : { band: row.band, reason: row.reason, startsAt: row.starts_at, expiresAt: row.expires_at };
  },

  /** Source health for Screen A04. */
  async sourceHealth(placeId: string): Promise<{
    lastObservationAt: Date | null;
    observationCount24h: number;
    hasForecast: boolean;
  }> {
    const [row] = await sql<{ last_at: Date | null; count_24h: string; has_forecast: boolean }[]>`
      SELECT
        (SELECT max(observed_at) FROM crowd_observations WHERE place_id = ${placeId}) AS last_at,
        (SELECT count(*) FROM crowd_observations
          WHERE place_id = ${placeId} AND observed_at > now() - interval '24 hours') AS count_24h,
        EXISTS (SELECT 1 FROM crowd_forecasts
                 WHERE place_id = ${placeId} AND expires_at > now()) AS has_forecast
    `;

    return {
      lastObservationAt: row.last_at,
      observationCount24h: Number(row.count_24h),
      hasForecast: row.has_forecast,
    };
  },
};
