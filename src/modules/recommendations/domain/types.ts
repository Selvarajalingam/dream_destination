import type { CrowdBand } from '@/modules/crowd/domain/types';

export type CrowdTolerance = 'low' | 'medium' | 'high';
export type TravelPace = 'relaxed' | 'balanced' | 'packed';

export type DreamScoreBrief = {
  /** Theme slugs the traveler cares about. Empty means "not declared". */
  interests: string[];
  /** Total trip budget in minor units, or null when not declared. */
  budgetTotalMinor: number | null;
  durationDays: number | null;
  crowdTolerance: CrowdTolerance | null;
  pace: TravelPace | null;
  /** 1-12. Drives the season fit lookup. */
  travelMonth: number | null;
  constraints: {
    lowWalking?: boolean;
    medicalAccessRequired?: boolean;
  };
};

export type DestinationAccessibility = {
  /** Share of this destination's places with step-free access, 0-1. */
  stepFreeShare: number;
  /** Straight-line distance to the nearest hospital, in kilometres. */
  medicalAccessKm: number;
};

export type DreamScoreDestination = {
  id: string;
  name: string;
  themes: string[];
  estimatedCostLowMinor: number | null;
  estimatedCostHighMinor: number | null;
  travelMinutesFromOrigin: number | null;
  minimumDays: number | null;
  maximumDays: number | null;
  expectedCrowdBand: CrowdBand;
  /** Month number (1-12) to a 0-1 suitability value. */
  seasonFitByMonth: Record<number, number>;
  accessibility: DestinationAccessibility | null;
  /** Count of verified hidden gems and active local businesses. */
  localExperienceCount: number;
};

export type DreamScoreInput = {
  brief: DreamScoreBrief;
  destination: DreamScoreDestination;
  /** Optional per-user weight overrides from "Change what matters" (T07). */
  weightOverrides?: Partial<Record<DreamScoreDimension, number>>;
};

export type DreamScoreDimension =
  | 'interestMatch'
  | 'budgetMatch'
  | 'timeDistanceFit'
  | 'crowdComfort'
  | 'seasonWeatherFit'
  | 'accessibilityFit'
  | 'localExperienceFit';

export type DreamScoreConfidence = 'high' | 'medium' | 'low';

export type DreamScoreResult = {
  /** 0-100, rounded to two decimals. Displayed as "Trip match". */
  total: number;
  components: Record<DreamScoreDimension, number>;
  weights: Record<DreamScoreDimension, number>;
  missingDimensions: DreamScoreDimension[];
  confidence: DreamScoreConfidence;
  /** Plain-language, strongest first. Never mentions safety. */
  reasons: string[];
  /** The weakest scoring dimension, phrased as a limitation. */
  tradeOff: string | null;
  algorithmVersion: string;
};
