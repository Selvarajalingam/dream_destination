import { describe, expect, it } from 'vitest';
import { applyBudgetStyle, summarizeBudget } from '@/modules/budgets/domain/budget';
import type { BudgetLine } from '@/modules/budgets/domain/types';

const line = (over: Partial<BudgetLine> = {}): BudgetLine => ({
  id: 'l1',
  category: 'stay',
  description: 'Hotel',
  lowMinor: 400_000,
  expectedMinor: 500_000,
  highMinor: 600_000,
  priceState: 'historical',
  refreshedAt: new Date('2026-12-01T00:00:00Z'),
  locked: false,
  ...over,
});

describe('summarizeBudget', () => {
  it('sums expected, low and high totals in minor units', () => {
    const summary = summarizeBudget(
      [
        line(),
        line({ id: 'l2', category: 'food', expectedMinor: 300_000, lowMinor: 200_000, highMinor: 400_000 }),
      ],
      2_500_000,
      200_000,
    );
    expect(summary.expectedTotalMinor).toBe(800_000);
    expect(summary.lowTotalMinor).toBe(600_000);
    expect(summary.highTotalMinor).toBe(1_000_000);
  });

  it('subtracts the reserve from the remaining balance', () => {
    const summary = summarizeBudget([line()], 2_500_000, 200_000);
    expect(summary.remainingMinor).toBe(2_500_000 - 200_000 - 500_000);
  });

  it('reports within_budget when the high estimate fits', () => {
    expect(summarizeBudget([line()], 2_500_000, 0).state).toBe('within_budget');
  });

  it('warns when the high estimate exceeds the budget but expected does not', () => {
    const summary = summarizeBudget([line({ expectedMinor: 900_000, highMinor: 1_400_000 })], 1_000_000, 0);
    expect(summary.state).toBe('high_estimate_over');
  });

  it('reports over_budget when the expected total already exceeds the limit', () => {
    const summary = summarizeBudget([line({ expectedMinor: 1_500_000, highMinor: 1_600_000 })], 1_000_000, 0);
    expect(summary.state).toBe('over_budget');
  });

  it('counts the reserve against the limit when deciding the state', () => {
    const summary = summarizeBudget([line({ expectedMinor: 900_000, highMinor: 900_000 })], 1_000_000, 300_000);
    expect(summary.state).toBe('over_budget');
  });

  it('reports missing_price_data when a line has no low or high bound', () => {
    const summary = summarizeBudget([line({ lowMinor: null, highMinor: null })], 2_500_000, 0);
    expect(summary.state).toBe('missing_price_data');
    expect(summary.missingPriceLines).toEqual(['l1']);
  });

  it('counts estimated versus live-priced items separately', () => {
    const summary = summarizeBudget(
      [
        line({ priceState: 'live' }),
        line({ id: 'l2', priceState: 'historical' }),
        line({ id: 'l3', priceState: 'manual' }),
      ],
      5_000_000,
      0,
    );
    expect(summary.livePricedItemCount).toBe(1);
    expect(summary.estimatedItemCount).toBe(2);
  });

  it('computes category shares that sum to 1', () => {
    const summary = summarizeBudget(
      [line({ expectedMinor: 600_000 }), line({ id: 'l2', category: 'food', expectedMinor: 400_000 })],
      2_500_000,
      0,
    );
    const total = summary.byCategory.reduce((sum, category) => sum + category.share, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('handles an empty itinerary without dividing by zero', () => {
    const summary = summarizeBudget([], 2_500_000, 0);
    expect(summary.expectedTotalMinor).toBe(0);
    expect(summary.byCategory).toEqual([]);
    expect(summary.state).toBe('within_budget');
  });

  it('keeps every total an integer so no paise are lost', () => {
    const summary = summarizeBudget([line(), line({ id: 'l2', expectedMinor: 333 })], 2_500_000, 7);
    for (const value of [
      summary.expectedTotalMinor,
      summary.lowTotalMinor,
      summary.highTotalMinor,
      summary.remainingMinor,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe('applyBudgetStyle', () => {
  it('never changes a locked line', () => {
    const [result] = applyBudgetStyle([line({ locked: true, expectedMinor: 500_000 })], 'save_more');
    expect(result.expectedMinor).toBe(500_000);
  });

  it('reduces unlocked discretionary spend under save_more', () => {
    const [result] = applyBudgetStyle([line({ category: 'shopping' })], 'save_more');
    expect(result.expectedMinor).toBeLessThan(500_000);
  });

  it('raises unlocked discretionary spend under more_comfort', () => {
    const [result] = applyBudgetStyle([line({ category: 'activities' })], 'more_comfort');
    expect(result.expectedMinor).toBeGreaterThan(500_000);
  });

  it('leaves essential categories untouched', () => {
    const [stay] = applyBudgetStyle([line({ category: 'stay' })], 'save_more');
    const [transport] = applyBudgetStyle([line({ category: 'transport' })], 'save_more');
    expect(stay.expectedMinor).toBe(500_000);
    expect(transport.expectedMinor).toBe(500_000);
  });

  it('is a no-op under balanced', () => {
    const lines = [line(), line({ id: 'l2', category: 'food' })];
    expect(applyBudgetStyle(lines, 'balanced')).toEqual(lines);
  });

  it('does not mutate the lines it was given', () => {
    const original = line({ category: 'food' });
    applyBudgetStyle([original], 'save_more');
    expect(original.expectedMinor).toBe(500_000);
  });
});
