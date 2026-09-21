import { clamp } from '@/shared/time';
import type {
  DreamScoreConfidence,
  DreamScoreDestination,
  DreamScoreDimension,
  DreamScoreBrief,
  DreamScoreInput,
  DreamScoreResult,
} from './types';

/**
 * Dream Score — PRD Part II §9.
 *
 * Calculated in application code, never by the LLM (§9.2). Every dimension
 * normalises to 0-100; the total is their weighted sum. Sponsored placement
 * never enters the score. The result is displayed as "Trip match" and must
 * never be presented as a safety guarantee.
 */

export const DREAM_SCORE_ALGORITHM_VERSION = 'dream-score-1.0.0';

/** PRD Part II §9.1, verbatim. */
export const DREAM_SCORE_WEIGHTS: Record<DreamScoreDimension, number> = {
  interestMatch: 0.25,
  budgetMatch: 0.2,
  timeDistanceFit: 0.15,
  crowdComfort: 0.15,
  seasonWeatherFit: 0.1,
  accessibilityFit: 0.1,
  localExperienceFit: 0.05,
};

/** A dimension with no usable input scores neutral and is reported as missing. */
const NEUTRAL = 50;

/** How many minutes of travel a day of trip length can comfortably absorb. */
const TRAVEL_MINUTES_PER_DAY = 150;

type Dimension = { score: number; missing: boolean };

const present = (score: number): Dimension => ({ score: clamp(score, 0, 100), missing: false });
const missing = (): Dimension => ({ score: NEUTRAL, missing: true });

function scoreInterestMatch(brief: DreamScoreBrief, destination: DreamScoreDestination): Dimension {
  if (brief.interests.length === 0) return missing();
  const themes = new Set(destination.themes);
  const matched = brief.interests.filter((interest) => themes.has(interest)).length;
  return present((matched / brief.interests.length) * 100);
}

function scoreBudgetMatch(brief: DreamScoreBrief, destination: DreamScoreDestination): Dimension {
  const { budgetTotalMinor } = brief;
  const { estimatedCostLowMinor, estimatedCostHighMinor } = destination;
  if (budgetTotalMinor === null || budgetTotalMinor <= 0) return missing();
  if (estimatedCostLowMinor === null || estimatedCostHighMinor === null) return missing();

  // The whole expected range fits: nothing to trade off.
  if (estimatedCostHighMinor <= budgetTotalMinor) return present(100);

  // The cheapest credible trip already breaks the budget. Decay sharply with
  // the size of the overrun so an unaffordable destination cannot rank well.
  if (estimatedCostLowMinor > budgetTotalMinor) {
    const overrun = (estimatedCostLowMinor - budgetTotalMinor) / budgetTotalMinor;
    return present(Math.max(0, 25 * (1 - clamp(overrun, 0, 1))));
  }

  // Affordable at the low end, over at the high end. Score by how much of the
  // estimated range the budget covers, anchored at 60.
  const range = estimatedCostHighMinor - estimatedCostLowMinor;
  const covered = range === 0 ? 1 : (budgetTotalMinor - estimatedCostLowMinor) / range;
  return present(35 + clamp(covered, 0, 1) * 55);
}

function scoreTimeDistanceFit(brief: DreamScoreBrief, destination: DreamScoreDestination): Dimension {
  const { durationDays } = brief;
  const { travelMinutesFromOrigin, minimumDays, maximumDays } = destination;
  if (durationDays === null || travelMinutesFromOrigin === null) return missing();

  // Too short to be worth the journey at all.
  if (minimumDays !== null && durationDays < minimumDays) return present(0);

  // Round trip travel measured against what the trip length can absorb.
  const budgetMinutes = durationDays * TRAVEL_MINUTES_PER_DAY;
  const burden = (travelMinutesFromOrigin * 2) / budgetMinutes;
  let score = 100 - clamp(burden, 0, 1) * 100;

  // A trip much longer than the destination sustains wastes days.
  if (maximumDays !== null && durationDays > maximumDays) {
    const excess = (durationDays - maximumDays) / maximumDays;
    score -= clamp(excess, 0, 1) * 30;
  }

  return present(score);
}

/** Crowd comfort by (tolerance, expected band). PRD Part II §10. */
const CROWD_COMFORT: Record<string, Record<string, number>> = {
  low: { comfortable: 100, moderate: 55, heavy: 10 },
  medium: { comfortable: 95, moderate: 80, heavy: 40 },
  high: { comfortable: 85, moderate: 85, heavy: 70 },
};

function scoreCrowdComfort(brief: DreamScoreBrief, destination: DreamScoreDestination): Dimension {
  // An unknown band is missing data. It must never read as "quiet".
  if (destination.expectedCrowdBand === 'unknown') return missing();
  const tolerance = brief.crowdTolerance ?? 'medium';
  const score = CROWD_COMFORT[tolerance]?.[destination.expectedCrowdBand];
  return score === undefined ? missing() : present(score);
}

function scoreSeasonWeatherFit(brief: DreamScoreBrief, destination: DreamScoreDestination): Dimension {
  if (brief.travelMonth === null) return missing();
  const fit = destination.seasonFitByMonth[brief.travelMonth];
  return fit === undefined ? missing() : present(fit * 100);
}

function scoreAccessibilityFit(brief: DreamScoreBrief, destination: DreamScoreDestination): Dimension {
  const { accessibility } = destination;
  if (accessibility === null) return missing();

  const needsStepFree = brief.constraints.lowWalking === true;
  const needsMedical = brief.constraints.medicalAccessRequired === true;

  // No declared needs: report how accessible the destination is anyway, so the
  // dimension still contributes something honest.
  if (!needsStepFree && !needsMedical) {
    return present(50 + accessibility.stepFreeShare * 50);
  }

  const parts: number[] = [];
  if (needsStepFree) parts.push(accessibility.stepFreeShare * 100);
  if (needsMedical) {
    // Within 5 km is full marks; beyond 40 km scores nothing.
    const km = accessibility.medicalAccessKm;
    parts.push(clamp((40 - km) / 35, 0, 1) * 100);
  }
  return present(parts.reduce((a, b) => a + b, 0) / parts.length);
}

/** Roughly the count at which a destination has plenty to offer locally. */
const LOCAL_EXPERIENCE_TARGET = 15;

function scoreLocalExperienceFit(destination: DreamScoreDestination): Dimension {
  return present(clamp(destination.localExperienceCount / LOCAL_EXPERIENCE_TARGET, 0, 1) * 100);
}

function confidenceFor(missingCount: number): DreamScoreConfidence {
  if (missingCount === 0) return 'high';
  if (missingCount <= 2) return 'medium';
  return 'low';
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  if (hours < 1) return `${Math.round(minutes)} minutes`;
  const rounded = Math.round(hours * 2) / 2;
  return rounded === 1 ? 'about 1 hour' : `about ${rounded} hours`;
}

function listInterests(interests: string[]): string {
  const readable = interests.map((interest) => interest.replace(/_/g, ' '));
  if (readable.length === 1) return readable[0];
  if (readable.length === 2) return `${readable[0]} and ${readable[1]}`;
  return `${readable.slice(0, -1).join(', ')} and ${readable[readable.length - 1]}`;
}

/** User-facing sentences. Deliberately avoids score, weight and safety language. */
function reasonFor(
  dimension: DreamScoreDimension,
  brief: DreamScoreBrief,
  destination: DreamScoreDestination,
): string | null {
  switch (dimension) {
    case 'interestMatch': {
      const themes = new Set(destination.themes);
      const matched = brief.interests.filter((interest) => themes.has(interest));
      return matched.length === 0 ? null : `Matches your interest in ${listInterests(matched)}`;
    }
    case 'budgetMatch':
      return 'The estimated trip cost fits inside the budget you set';
    case 'timeDistanceFit':
      return destination.travelMinutesFromOrigin === null
        ? null
        : `${formatHours(destination.travelMinutesFromOrigin)} of travel each way`;
    case 'crowdComfort':
      return destination.expectedCrowdBand === 'comfortable'
        ? 'Usually comfortable at this time of year'
        : 'Crowd levels usually suit the tolerance you set';
    case 'seasonWeatherFit':
      return 'A good time of year to visit';
    case 'accessibilityFit':
      return brief.constraints.medicalAccessRequired === true
        ? 'Medical facilities are close to the main places'
        : 'Most places here have step-free access';
    case 'localExperienceFit':
      return `${destination.localExperienceCount} verified local experiences and businesses nearby`;
    default:
      return null;
  }
}

/** The weakest dimension, phrased as a limitation rather than a warning. */
function tradeOffFor(
  dimension: DreamScoreDimension,
  brief: DreamScoreBrief,
  destination: DreamScoreDestination,
): string {
  switch (dimension) {
    case 'interestMatch':
      return 'Fewer of your chosen interests are covered here than elsewhere';
    case 'budgetMatch':
      return 'The higher estimate for this trip goes past the budget you set';
    case 'timeDistanceFit':
      return destination.travelMinutesFromOrigin === null
        ? 'Travel time is longer than for the other options'
        : `Travel takes ${formatHours(destination.travelMinutesFromOrigin)} each way`;
    case 'crowdComfort':
      return 'Expect busier conditions than the quieter options';
    case 'seasonWeatherFit':
      return 'This is not the strongest month to visit';
    case 'accessibilityFit':
      return brief.constraints.lowWalking === true
        ? 'Several places here involve more walking or uneven ground'
        : 'Accessible facilities are limited at some places';
    case 'localExperienceFit':
      return 'Fewer verified local businesses and experiences are listed here';
    default:
      return 'Some information for this destination is still incomplete';
  }
}

export function computeDreamScore(input: DreamScoreInput): DreamScoreResult {
  const { brief, destination, weightOverrides } = input;

  const dimensions: Record<DreamScoreDimension, Dimension> = {
    interestMatch: scoreInterestMatch(brief, destination),
    budgetMatch: scoreBudgetMatch(brief, destination),
    timeDistanceFit: scoreTimeDistanceFit(brief, destination),
    crowdComfort: scoreCrowdComfort(brief, destination),
    seasonWeatherFit: scoreSeasonWeatherFit(brief, destination),
    accessibilityFit: scoreAccessibilityFit(brief, destination),
    localExperienceFit: scoreLocalExperienceFit(destination),
  };

  const weights = normalizeWeights(weightOverrides);

  const keys = Object.keys(DREAM_SCORE_WEIGHTS) as DreamScoreDimension[];
  const components = {} as Record<DreamScoreDimension, number>;
  let total = 0;
  for (const key of keys) {
    const score = Math.round(dimensions[key].score * 100) / 100;
    components[key] = score;
    total += score * weights[key];
  }

  const missingDimensions = keys.filter((key) => dimensions[key].missing);

  // Reasons: strongest scoring dimensions that are present and genuinely good.
  const ranked = keys
    .filter((key) => !dimensions[key].missing && dimensions[key].score >= 70)
    .sort((a, b) => dimensions[b].score * weights[b] - dimensions[a].score * weights[a]);

  const reasons = ranked
    .map((key) => reasonFor(key, brief, destination))
    .filter((reason): reason is string => reason !== null);

  // Fill to three so the UI always has a collapsed view to show (PRD §5.2).
  if (reasons.length < 3) {
    for (const key of keys) {
      if (reasons.length >= 3) break;
      if (dimensions[key].missing || ranked.includes(key)) continue;
      const reason = reasonFor(key, brief, destination);
      if (reason !== null && !reasons.includes(reason)) reasons.push(reason);
    }
  }

  const weakest = keys
    .filter((key) => !dimensions[key].missing)
    .sort((a, b) => dimensions[a].score - dimensions[b].score)[0];

  return {
    total: Math.round(total * 100) / 100,
    components,
    weights,
    missingDimensions,
    confidence: confidenceFor(missingDimensions.length),
    reasons: reasons.slice(0, 5),
    tradeOff: weakest === undefined ? null : tradeOffFor(weakest, brief, destination),
    algorithmVersion: DREAM_SCORE_ALGORITHM_VERSION,
  };
}

/**
 * "Change what matters" (T07) adjusts emphasis, but the weights must still sum
 * to 1 so the total stays on a 0-100 scale and remains comparable.
 */
function normalizeWeights(
  overrides: Partial<Record<DreamScoreDimension, number>> | undefined,
): Record<DreamScoreDimension, number> {
  if (overrides === undefined || Object.keys(overrides).length === 0) {
    return { ...DREAM_SCORE_WEIGHTS };
  }

  const keys = Object.keys(DREAM_SCORE_WEIGHTS) as DreamScoreDimension[];
  const raw = {} as Record<DreamScoreDimension, number>;
  for (const key of keys) {
    raw[key] = Math.max(0, overrides[key] ?? DREAM_SCORE_WEIGHTS[key]);
  }

  const sum = keys.reduce((total, key) => total + raw[key], 0);
  if (sum === 0) return { ...DREAM_SCORE_WEIGHTS };

  const normalized = {} as Record<DreamScoreDimension, number>;
  for (const key of keys) {
    normalized[key] = raw[key] / sum;
  }
  return normalized;
}
