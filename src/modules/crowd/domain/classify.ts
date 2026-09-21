import { clamp } from '@/shared/time';
import type { CrowdBand, CrowdLabel, RatioInput } from './types';

/**
 * Crowd banding — PRD Part II §10.2, verbatim:
 *
 *   comfortable: ratio < 0.50
 *   moderate:    0.50 <= ratio <= 0.80
 *   heavy:       ratio > 0.80
 */
export function classifyRatio(ratio: number): CrowdBand {
  if (ratio < 0.5) return 'comfortable';
  if (ratio <= 0.8) return 'moderate';
  return 'heavy';
}

/**
 *   ratio = clamp(base + signal + event_factor + weather_factor, 0, 1.5)
 */
export function computeRatio({ base, signal, eventFactor, weatherFactor }: RatioInput): number {
  return clamp(base + signal + eventFactor + weatherFactor, 0, 1.5);
}

/** Text labels — PRD Part I §5.3. Colour is never the only signal. */
export const CROWD_LABELS: Record<CrowdBand, CrowdLabel> = {
  comfortable: 'Comfortable',
  moderate: 'Moderate',
  heavy: 'Heavy crowd',
  unknown: 'Unknown',
};

export function labelFor(band: CrowdBand): CrowdLabel {
  return CROWD_LABELS[band];
}
