/**
 * Distribution fairness — PRD Part I A08 asks the impact dashboard to show
 * "distribution fairness", and E14-S03 asks for "distribution across
 * businesses/categories".
 *
 * The question behind it: is traveller attention reaching many small
 * businesses, or piling onto a few? A product meant to spread tourism income
 * should be able to see if it is instead concentrating it.
 */

export type Concentration = {
  /** Businesses that received at least one action. */
  reached: number;
  /** All businesses that could have. */
  eligible: number;
  /** Share of all actions that went to the top fifth of businesses. 0-1. */
  topFifthShare: number;
  /** Gini coefficient across every eligible business, zeros included. 0-1. */
  gini: number;
  /** A plain-language reading of the numbers. */
  reading: 'widely spread' | 'moderately concentrated' | 'highly concentrated' | 'no activity';
};

/**
 * @param counts actions per business, for businesses that received any
 * @param eligible total number of businesses that could have received actions
 */
export function concentration(counts: readonly number[], eligible: number): Concentration {
  const positive = counts.filter((value) => value > 0);
  const total = positive.reduce((sum, value) => sum + value, 0);
  const population = Math.max(eligible, positive.length);

  if (total === 0 || population === 0) {
    return { reached: 0, eligible: population, topFifthShare: 0, gini: 0, reading: 'no activity' };
  }

  // Businesses with no actions count as zeros. Leaving them out would make a
  // market where three businesses get everything look perfectly equal.
  const values = [...positive, ...Array.from({ length: population - positive.length }, () => 0)].sort(
    (a, b) => a - b,
  );

  // Gini via the sorted-rank formula.
  let weighted = 0;
  values.forEach((value, index) => {
    weighted += (index + 1) * value;
  });
  const gini = (2 * weighted) / (population * total) - (population + 1) / population;

  const topCount = Math.max(1, Math.ceil(population / 5));
  const topShare = values.slice(-topCount).reduce((sum, value) => sum + value, 0) / total;

  const rounded = Math.round(Math.max(0, Math.min(1, gini)) * 1000) / 1000;

  return {
    reached: positive.length,
    eligible: population,
    topFifthShare: Math.round(topShare * 1000) / 1000,
    gini: rounded,
    reading: rounded < 0.35 ? 'widely spread' : rounded < 0.6 ? 'moderately concentrated' : 'highly concentrated',
  };
}

/** Stage-to-stage conversion for a funnel, as a share of the previous stage. */
export function funnelConversion(stages: ReadonlyArray<{ name: string; count: number }>): Array<{
  name: string;
  count: number;
  fromPrevious: number | null;
  fromStart: number | null;
}> {
  const start = stages[0]?.count ?? 0;

  return stages.map((stage, index) => {
    const previous = index === 0 ? null : stages[index - 1].count;
    return {
      name: stage.name,
      count: stage.count,
      fromPrevious: previous === null || previous === 0 ? null : Math.round((stage.count / previous) * 1000) / 1000,
      fromStart: start === 0 ? null : Math.round((stage.count / start) * 1000) / 1000,
    };
  });
}
