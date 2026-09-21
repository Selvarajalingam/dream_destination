export type CrowdBand = 'comfortable' | 'moderate' | 'heavy' | 'unknown';

export type CrowdLabel = 'Comfortable' | 'Moderate' | 'Heavy crowd' | 'Unknown';

/** PRD Part II §10.1 source precedence, highest first. */
export type CrowdSourceKind =
  | 'override'
  | 'sensor'
  | 'aggregated_checkin'
  | 'forecast'
  | 'none';

export type CrowdConfidenceLabel = 'High confidence' | 'Medium confidence' | 'Low confidence';

export type CrowdObservation = {
  band: CrowdBand;
  observedAt: Date;
  expiresAt: Date;
  /** 0-1 as recorded by the source. */
  confidence: number;
  sourceKind: 'sensor' | 'aggregated_checkin';
  sampleSize: number | null;
  occupancyRatio?: number | null;
};

export type CrowdForecast = {
  band: CrowdBand;
  confidence: number;
  startsAt: Date;
  endsAt: Date;
  expiresAt: Date;
  expectedOccupancyRatio?: number | null;
};

export type CrowdOverride = {
  band: CrowdBand;
  reason: string;
  startsAt: Date;
  expiresAt: Date;
};

export type ResolveCrowdInput = {
  override: CrowdOverride | null;
  observations: CrowdObservation[];
  forecast: CrowdForecast | null;
};

export type CrowdStatus = {
  band: CrowdBand;
  label: CrowdLabel;
  source: CrowdSourceKind;
  /** 0-1 after freshness decay. */
  confidence: number;
  confidenceLabel: CrowdConfidenceLabel;
  observedAt: Date | null;
  expiresAt: Date | null;
  /** True when the winning signal is past half its validity window. */
  isStale: boolean;
  /** Powers the "Why?" action. Never contains the word "live". */
  explanation: string;
};

export type RatioInput = {
  base: number;
  signal: number;
  eventFactor: number;
  weatherFactor: number;
};
