import { describe, expect, it } from 'vitest';
import { classifyRatio, computeRatio } from '@/modules/crowd/domain/classify';

describe('classifyRatio', () => {
  it('applies the PRD thresholds exactly at the boundaries', () => {
    expect(classifyRatio(0)).toBe('comfortable');
    expect(classifyRatio(0.4999)).toBe('comfortable');
    expect(classifyRatio(0.5)).toBe('moderate');
    expect(classifyRatio(0.8)).toBe('moderate');
    expect(classifyRatio(0.8001)).toBe('heavy');
    expect(classifyRatio(1.5)).toBe('heavy');
  });
});

describe('computeRatio', () => {
  it('sums base, signal, event and weather factors', () => {
    expect(computeRatio({ base: 0.4, signal: 0.1, eventFactor: 0.1, weatherFactor: -0.05 })).toBeCloseTo(0.55, 6);
  });

  it('clamps to the 0 to 1.5 range', () => {
    expect(computeRatio({ base: 1.2, signal: 0.6, eventFactor: 0.4, weatherFactor: 0 })).toBe(1.5);
    expect(computeRatio({ base: 0.1, signal: -0.5, eventFactor: -0.3, weatherFactor: 0 })).toBe(0);
  });
});
