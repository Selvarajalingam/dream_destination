import { clamp, formatAge } from '@/shared/time';
import { labelFor } from './classify';
import type {
  CrowdConfidenceLabel,
  CrowdObservation,
  CrowdStatus,
  ResolveCrowdInput,
} from './types';

/**
 * Crowd source precedence — PRD Part II §10.1:
 *
 *   1. Active administrator/authority override
 *   2. Fresh authorized sensor, ticketing, or capacity feed
 *   3. Aggregated opt-in check-ins or booking intent
 *   4. Historical forecast adjusted for event and weather
 *   5. Unknown
 *
 * Anything past its validity window is discarded: "If the result expires, the
 * API returns unknown." Nothing here may ever be described as live.
 */

/**
 * Minimum contributor count before an aggregated check-in signal may be shown.
 * PRD Part II §10.3 requires an aggregation threshold; §20 leaves the final
 * value to a production decision, so it is named rather than inlined.
 */
export const AGGREGATION_THRESHOLD = 10;

/** Forecasts are modelled history, never a reading, so they cap lower. */
const FORECAST_CONFIDENCE_CEILING = 0.6;

/** How much confidence an observation loses across its validity window. */
const MAX_FRESHNESS_DECAY = 0.4;

function confidenceLabelFor(confidence: number): CrowdConfidenceLabel {
  if (confidence >= 0.75) return 'High confidence';
  if (confidence >= 0.45) return 'Medium confidence';
  return 'Low confidence';
}

function isUsable(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() > now.getTime();
}

/**
 * Decay confidence by how far through its validity window the reading is, so a
 * reading that is technically unexpired but nearly stale reports as weaker.
 */
function decayed(observation: CrowdObservation, now: Date): { confidence: number; isStale: boolean } {
  const total = observation.expiresAt.getTime() - observation.observedAt.getTime();
  if (total <= 0) return { confidence: observation.confidence, isStale: true };

  const elapsed = now.getTime() - observation.observedAt.getTime();
  const fraction = clamp(elapsed / total, 0, 1);
  return {
    confidence: clamp(observation.confidence * (1 - fraction * MAX_FRESHNESS_DECAY), 0, 1),
    isStale: fraction > 0.5,
  };
}

const unknownStatus = (explanation: string): CrowdStatus => ({
  band: 'unknown',
  label: 'Unknown',
  source: 'none',
  confidence: 0,
  confidenceLabel: 'Low confidence',
  observedAt: null,
  expiresAt: null,
  isStale: false,
  explanation,
});

export function resolveCrowdStatus(input: ResolveCrowdInput, now: Date): CrowdStatus {
  const { override, observations, forecast } = input;

  // 1. Administrator or authority override.
  if (
    override !== null &&
    override.startsAt.getTime() <= now.getTime() &&
    isUsable(override.expiresAt, now)
  ) {
    return {
      band: override.band,
      label: labelFor(override.band),
      source: 'override',
      confidence: 1,
      confidenceLabel: 'High confidence',
      observedAt: override.startsAt,
      expiresAt: override.expiresAt,
      isStale: false,
      explanation: `Set by the local tourism authority: ${override.reason}`,
    };
  }

  const usable = observations.filter((observation) => isUsable(observation.expiresAt, now));

  // 2. Authorized sensor, ticketing or capacity feed.
  const sensors = usable.filter((observation) => observation.sourceKind === 'sensor');
  const freshest = pickFreshest(sensors);
  if (freshest !== null) {
    const { confidence, isStale } = decayed(freshest, now);
    return {
      band: freshest.band,
      label: labelFor(freshest.band),
      source: 'sensor',
      confidence,
      confidenceLabel: confidenceLabelFor(confidence),
      observedAt: freshest.observedAt,
      expiresAt: freshest.expiresAt,
      isStale,
      explanation: `Based on venue counts from an authorised feed, ${formatAge(freshest.observedAt, now)}.`,
    };
  }

  // 3. Aggregated opt-in check-ins, only above the privacy threshold.
  const checkins = usable.filter(
    (observation) =>
      observation.sourceKind === 'aggregated_checkin' &&
      (observation.sampleSize ?? 0) >= AGGREGATION_THRESHOLD,
  );
  const aggregated = pickFreshest(checkins);
  if (aggregated !== null) {
    const { confidence, isStale } = decayed(aggregated, now);
    return {
      band: aggregated.band,
      label: labelFor(aggregated.band),
      source: 'aggregated_checkin',
      confidence,
      confidenceLabel: confidenceLabelFor(confidence),
      observedAt: aggregated.observedAt,
      expiresAt: aggregated.expiresAt,
      isStale,
      explanation: `Based on ${aggregated.sampleSize} anonymous traveller check-ins, ${formatAge(aggregated.observedAt, now)}.`,
    };
  }

  // 4. Historical forecast, adjusted for event and weather.
  if (
    forecast !== null &&
    isUsable(forecast.expiresAt, now) &&
    forecast.band !== 'unknown'
  ) {
    const confidence = Math.min(forecast.confidence, FORECAST_CONFIDENCE_CEILING);
    return {
      band: forecast.band,
      label: labelFor(forecast.band),
      source: 'forecast',
      confidence,
      confidenceLabel: confidenceLabelFor(confidence),
      observedAt: forecast.startsAt,
      expiresAt: forecast.expiresAt,
      isStale: false,
      explanation:
        'Based on historical patterns for this day and hour, adjusted for events and weather. No recent count is available.',
    };
  }

  // 5. Unknown.
  return unknownStatus(
    'No current crowd information is available for this place. Historical patterns are shown where we have them, and are labelled as such.',
  );
}

function pickFreshest(observations: CrowdObservation[]): CrowdObservation | null {
  if (observations.length === 0) return null;
  return observations.reduce((latest, candidate) =>
    candidate.observedAt.getTime() > latest.observedAt.getTime() ? candidate : latest,
  );
}
