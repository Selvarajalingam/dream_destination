import type { SeedSql } from './types';
import type { PlaceIds } from './places';
import type { SourceKey } from './sources';
import type { UserKey } from './users';

/**
 * Crowd fixtures. PRD Part II §17 asks for historical crowd patterns for key
 * places, one simulated live observation stream, and one manual override
 * scenario.
 *
 * Forecast bands are derived through the same rule model the runtime uses
 * (base + signal + event + weather, clamped, then banded at 0.50 and 0.80), so
 * the seeded data and the service agree.
 */

/** Places with a modelled weekly pattern. */
const BUSY_PLACES = [
  'ooty-botanical-garden',
  'ooty-lake',
  'doddabetta-peak',
  'rose-garden-ooty',
  'nilgiri-mountain-railway',
  'pykara-falls',
  'sims-park',
  'dolphins-nose',
  'marudamalai-temple',
  'monkey-falls',
  'kovai-kutralam',
  'siruvani-waterfall',
] as const;

/** Places carrying a rolling observation stream. */
const OBSERVED_PLACES = ['ooty-botanical-garden', 'doddabetta-peak', 'sims-park'] as const;

/** The manual override scenario the demo walks through. */
const OVERRIDE_PLACE = 'ooty-botanical-garden';
const OVERRIDE_REASON = 'Local festival procession through the garden road, heavy footfall expected';

const FORECAST_MODEL_VERSION = 'crowd-rules-1.0.0';

/** Base occupancy by hour of day, shaped like a typical sightseeing curve. */
function baseForHour(hour: number): number {
  if (hour < 8) return 0.12;
  if (hour < 10) return 0.34;
  if (hour < 12) return 0.62;
  if (hour < 15) return 0.71;
  if (hour < 17) return 0.55;
  if (hour < 19) return 0.3;
  return 0.1;
}

/** Weekends and holidays run far busier in the hills. */
function dayFactor(dayOfWeek: number): number {
  if (dayOfWeek === 0) return 0.22; // Sunday
  if (dayOfWeek === 6) return 0.18; // Saturday
  if (dayOfWeek === 5) return 0.06; // Friday
  return 0;
}

function bandFor(ratio: number): 'comfortable' | 'moderate' | 'heavy' {
  if (ratio < 0.5) return 'comfortable';
  if (ratio <= 0.8) return 'moderate';
  return 'heavy';
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export async function seedCrowd(
  tx: SeedSql,
  placeIds: PlaceIds,
  sourceIds: Record<SourceKey, string>,
  userIds: Record<UserKey, string>,
): Promise<void> {
  const now = new Date();

  // --- Historical forecasts: 14 days ahead, hourly between 06:00 and 19:00 ---
  for (const slug of BUSY_PLACES) {
    const placeId = placeIds[slug];
    if (placeId === undefined) continue;

    // A stable per-place offset so places differ from one another but each one
    // stays the same across re-seeds.
    const offset = (slug.length % 5) * 0.03;

    for (let dayAhead = 0; dayAhead < 14; dayAhead += 1) {
      for (let hour = 6; hour <= 19; hour += 1) {
        const startsAt = new Date(now);
        startsAt.setDate(startsAt.getDate() + dayAhead);
        startsAt.setHours(hour, 0, 0, 0);

        const endsAt = new Date(startsAt);
        endsAt.setHours(hour + 1, 0, 0, 0);

        const ratio = clamp(baseForHour(hour) + dayFactor(startsAt.getDay()) + offset, 0, 1.5);

        // Confidence falls off the further out the forecast reaches.
        const confidence = Number((0.62 - dayAhead * 0.02).toFixed(3));

        await tx`
          INSERT INTO crowd_forecasts (
            place_id, starts_at, ends_at, band, expected_occupancy_ratio,
            confidence, model_version, generated_at, expires_at
          ) VALUES (
            ${placeId}, ${startsAt}, ${endsAt}, ${bandFor(ratio)}, ${ratio.toFixed(4)},
            ${Math.max(0.2, confidence)}, ${FORECAST_MODEL_VERSION}, now(),
            ${endsAt}
          )
          ON CONFLICT (place_id, starts_at, model_version) DO NOTHING
        `;
      }
    }
  }

  // --- Simulated observation stream: the last two hours, every 15 minutes ---
  for (const slug of OBSERVED_PLACES) {
    const placeId = placeIds[slug];
    if (placeId === undefined) continue;

    for (let minutesAgo = 120; minutesAgo >= 0; minutesAgo -= 15) {
      const observedAt = new Date(now.getTime() - minutesAgo * 60_000);
      const ratio = clamp(
        baseForHour(observedAt.getHours()) + dayFactor(observedAt.getDay()) + (minutesAgo % 30) / 100,
        0,
        1.5,
      );

      // Gate counters are an authorised sensor feed; check-ins are aggregated
      // and only shown above the privacy threshold.
      const isSensor = slug !== 'sims-park';

      await tx`
        INSERT INTO crowd_observations (
          place_id, observed_at, band, occupancy_ratio, source_id,
          sample_size, confidence, expires_at, is_aggregate, metadata
        ) VALUES (
          ${placeId}, ${observedAt}, ${bandFor(ratio)}, ${ratio.toFixed(4)},
          ${isSensor ? sourceIds.crowd_sensor : sourceIds.crowd_checkin},
          ${isSensor ? 180 + (minutesAgo % 7) * 11 : 14 + (minutesAgo % 5) * 3},
          ${isSensor ? 0.88 : 0.52},
          ${new Date(observedAt.getTime() + 90 * 60_000)},
          true,
          ${tx.json({ sourceKind: isSensor ? 'sensor' : 'aggregated_checkin', demonstrationData: true })}
        )
      `;
    }
  }

  // --- The manual override scenario ---
  const overridePlaceId = placeIds[OVERRIDE_PLACE];
  if (overridePlaceId !== undefined) {
    await tx`
      INSERT INTO crowd_overrides (
        place_id, band, reason, starts_at, expires_at, created_by
      ) VALUES (
        ${overridePlaceId}, 'heavy', ${OVERRIDE_REASON},
        now() - interval '30 minutes', now() + interval '6 hours',
        ${userIds.admin}
      )
    `;

    // An override is an audited action. PRD Part II §19.
    await tx`
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after_state)
      VALUES (
        ${userIds.admin}, 'crowd_override.created', 'place', ${overridePlaceId},
        ${tx.json({ band: 'heavy', reason: OVERRIDE_REASON, seeded: true })}
      )
    `;
  }
}
