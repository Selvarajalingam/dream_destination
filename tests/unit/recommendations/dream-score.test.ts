import { describe, expect, it } from 'vitest';
import {
  DREAM_SCORE_ALGORITHM_VERSION,
  DREAM_SCORE_WEIGHTS,
  computeDreamScore,
} from '@/modules/recommendations/domain/dream-score';
import type { DreamScoreInput } from '@/modules/recommendations/domain/types';

const baseInput: DreamScoreInput = {
  brief: {
    interests: ['nature', 'heritage'],
    budgetTotalMinor: 2_500_000,
    durationDays: 4,
    crowdTolerance: 'low',
    pace: 'relaxed',
    travelMonth: 12,
    constraints: { lowWalking: true, medicalAccessRequired: true },
  },
  destination: {
    id: 'd1',
    name: 'Ooty and the Nilgiris',
    themes: ['nature', 'heritage', 'tea'],
    estimatedCostLowMinor: 900_000,
    estimatedCostHighMinor: 2_200_000,
    travelMinutesFromOrigin: 180,
    minimumDays: 2,
    maximumDays: 5,
    expectedCrowdBand: 'moderate',
    seasonFitByMonth: { 12: 0.9 },
    accessibility: { stepFreeShare: 0.6, medicalAccessKm: 4 },
    localExperienceCount: 12,
  },
};

describe('computeDreamScore', () => {
  it('uses exactly the PRD weights and sums to 1', () => {
    expect(DREAM_SCORE_WEIGHTS).toEqual({
      interestMatch: 0.25,
      budgetMatch: 0.2,
      timeDistanceFit: 0.15,
      crowdComfort: 0.15,
      seasonWeatherFit: 0.1,
      accessibilityFit: 0.1,
      localExperienceFit: 0.05,
    });
    const sum = Object.values(DREAM_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('is deterministic for identical input', () => {
    expect(computeDreamScore(baseInput)).toEqual(computeDreamScore(baseInput));
  });

  it('keeps the total within 0 and 100 and equal to the weighted components', () => {
    const result = computeDreamScore(baseInput);
    const expected = (Object.keys(DREAM_SCORE_WEIGHTS) as Array<keyof typeof DREAM_SCORE_WEIGHTS>).reduce(
      (total, key) => total + result.components[key] * DREAM_SCORE_WEIGHTS[key],
      0,
    );
    expect(result.total).toBeCloseTo(Math.round(expected * 100) / 100, 2);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it('scores interest match by overlap with destination themes', () => {
    const none = computeDreamScore({
      ...baseInput,
      destination: { ...baseInput.destination, themes: ['nightlife', 'shopping'] },
    });
    expect(none.components.interestMatch).toBe(0);

    const full = computeDreamScore({
      ...baseInput,
      brief: { ...baseInput.brief, interests: ['nature'] },
      destination: { ...baseInput.destination, themes: ['nature'] },
    });
    expect(full.components.interestMatch).toBe(100);
  });

  it('scores budget match at 100 when the high estimate fits inside the budget', () => {
    expect(computeDreamScore(baseInput).components.budgetMatch).toBe(100);
  });

  it('penalises a destination whose low estimate already exceeds the budget', () => {
    const result = computeDreamScore({
      ...baseInput,
      destination: {
        ...baseInput.destination,
        estimatedCostLowMinor: 4_000_000,
        estimatedCostHighMinor: 6_000_000,
      },
    });
    expect(result.components.budgetMatch).toBeLessThan(25);
  });

  it('rewards low crowd for a crowd-averse traveler', () => {
    const comfortable = computeDreamScore({
      ...baseInput,
      destination: { ...baseInput.destination, expectedCrowdBand: 'comfortable' },
    });
    const heavy = computeDreamScore({
      ...baseInput,
      destination: { ...baseInput.destination, expectedCrowdBand: 'heavy' },
    });
    expect(comfortable.components.crowdComfort).toBeGreaterThan(heavy.components.crowdComfort);
  });

  it('treats an unknown crowd band as missing data, not as a good score', () => {
    const result = computeDreamScore({
      ...baseInput,
      destination: { ...baseInput.destination, expectedCrowdBand: 'unknown' },
    });
    expect(result.missingDimensions).toContain('crowdComfort');
    expect(result.confidence).not.toBe('high');
  });

  it('lowers confidence as more dimensions go missing', () => {
    const result = computeDreamScore({
      ...baseInput,
      destination: {
        ...baseInput.destination,
        expectedCrowdBand: 'unknown',
        seasonFitByMonth: {},
        accessibility: null,
      },
    });
    expect(result.confidence).toBe('low');
    expect(result.missingDimensions.length).toBeGreaterThanOrEqual(3);
  });

  it('zeroes the time and distance fit when the trip is shorter than the destination minimum', () => {
    const result = computeDreamScore({
      ...baseInput,
      brief: { ...baseInput.brief, durationDays: 1 },
    });
    expect(result.components.timeDistanceFit).toBe(0);
  });

  it('produces at least three plain-language reasons and one trade-off', () => {
    const result = computeDreamScore(baseInput);
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
    expect(result.reasons[0]).not.toMatch(/score|weight|dimension/i);
    expect(result.tradeOff).toBeTruthy();
  });

  it('never describes the score as safety', () => {
    const result = computeDreamScore(baseInput);
    const text = [...result.reasons, result.tradeOff ?? ''].join(' ');
    expect(text).not.toMatch(/\bsafe\b|\bsafety\b/i);
  });

  it('stamps the algorithm version and echoes the weights it used', () => {
    const result = computeDreamScore(baseInput);
    expect(result.algorithmVersion).toBe(DREAM_SCORE_ALGORITHM_VERSION);
    expect(result.weights).toEqual(DREAM_SCORE_WEIGHTS);
  });
});
