import { describe, expect, it } from 'vitest';
import { concentration, funnelConversion } from '@/modules/analytics/domain/fairness';

describe('concentration', () => {
  it('reads perfectly even attention as widely spread', () => {
    const result = concentration([10, 10, 10, 10, 10], 5);
    expect(result.gini).toBe(0);
    expect(result.reached).toBe(5);
    expect(result.reading).toBe('widely spread');
  });

  it('reads everything going to one business as highly concentrated', () => {
    const result = concentration([100], 10);
    expect(result.gini).toBeGreaterThan(0.85);
    expect(result.topFifthShare).toBe(1);
    expect(result.reading).toBe('highly concentrated');
  });

  it('counts businesses with no actions as zeros, not as absent', () => {
    // Three businesses sharing evenly looks equal among themselves, but not
    // when thirty businesses were eligible.
    const among = concentration([10, 10, 10], 3);
    const within = concentration([10, 10, 10], 30);
    expect(among.gini).toBe(0);
    expect(within.gini).toBeGreaterThan(0.8);
    expect(within.reached).toBe(3);
    expect(within.eligible).toBe(30);
  });

  it('reports no activity when nothing happened', () => {
    expect(concentration([], 20).reading).toBe('no activity');
    expect(concentration([0, 0], 20).reading).toBe('no activity');
  });

  it('keeps the coefficient within 0 and 1', () => {
    for (const counts of [[1], [1, 2, 3, 400], [5, 5, 5, 1]]) {
      const { gini } = concentration(counts, 12);
      expect(gini).toBeGreaterThanOrEqual(0);
      expect(gini).toBeLessThanOrEqual(1);
    }
  });
});

describe('funnelConversion', () => {
  it('reports conversion from the previous stage and from the start', () => {
    const result = funnelConversion([
      { name: 'a', count: 200 },
      { name: 'b', count: 100 },
      { name: 'c', count: 25 },
    ]);
    expect(result.map((stage) => stage.fromPrevious)).toEqual([null, 0.5, 0.25]);
    expect(result.map((stage) => stage.fromStart)).toEqual([1, 0.5, 0.125]);
  });

  it('does not divide by zero on an empty stage', () => {
    const result = funnelConversion([
      { name: 'a', count: 0 },
      { name: 'b', count: 0 },
    ]);
    expect(result.every((stage) => stage.fromPrevious === null && stage.fromStart === null)).toBe(true);
  });
});
