import { sumMinor } from '@/shared/money';
import type {
  BudgetCategory,
  BudgetCategoryShare,
  BudgetLine,
  BudgetState,
  BudgetStyle,
  BudgetSummary,
} from './types';

/**
 * Budget arithmetic — PRD Part II §8.3 assigns budget totals to deterministic
 * application code. All values are integers in minor units (paise).
 */

/** Categories a budget-style change may touch. Essentials stay fixed. */
const DISCRETIONARY: ReadonlySet<BudgetCategory> = new Set(['food', 'shopping', 'activities']);

const STYLE_FACTOR: Record<BudgetStyle, number> = {
  save_more: 0.8,
  balanced: 1,
  more_comfort: 1.2,
};

/**
 * State ladder, most serious first. PRD governance: when two requirements
 * conflict, the safer and more transparent behavior takes precedence, so an
 * overrun outranks missing data, which outranks a high-estimate warning.
 */
function resolveState(
  expectedTotalMinor: number,
  highTotalMinor: number,
  totalLimitMinor: number,
  missingPriceLines: string[],
): BudgetState {
  // The state is judged against the declared budget, not against the budget
  // minus the reserve. A plan that costs less than the traveller's total is
  // not "over budget" merely because it eats into a reserve they chose to
  // hold back; the meter shows that separately through remainingMinor.
  if (expectedTotalMinor > totalLimitMinor) return 'over_budget';
  if (missingPriceLines.length > 0) return 'missing_price_data';
  if (highTotalMinor > totalLimitMinor) return 'high_estimate_over';
  return 'within_budget';
}

export function summarizeBudget(
  lines: readonly BudgetLine[],
  totalLimitMinor: number,
  reserveMinor: number,
): BudgetSummary {
  const expectedTotalMinor = sumMinor(lines.map((line) => line.expectedMinor));

  // A line with no bound still contributes its expected value to every total,
  // but is reported so the UI can say which prices are incomplete.
  const lowTotalMinor = sumMinor(lines.map((line) => line.lowMinor ?? line.expectedMinor));
  const highTotalMinor = sumMinor(lines.map((line) => line.highMinor ?? line.expectedMinor));

  const missingPriceLines = lines
    .filter((line) => line.lowMinor === null && line.highMinor === null)
    .map((line) => line.id);

  const spendableMinor = totalLimitMinor - reserveMinor;

  const byCategory = summarizeCategories(lines, expectedTotalMinor);

  const livePricedItemCount = lines.filter((line) => line.priceState === 'live').length;

  return {
    totalLimitMinor,
    reserveMinor,
    expectedTotalMinor,
    lowTotalMinor,
    highTotalMinor,
    remainingMinor: spendableMinor - expectedTotalMinor,
    state: resolveState(expectedTotalMinor, highTotalMinor, totalLimitMinor, missingPriceLines),
    byCategory,
    estimatedItemCount: lines.length - livePricedItemCount,
    livePricedItemCount,
    missingPriceLines,
  };
}

function summarizeCategories(
  lines: readonly BudgetLine[],
  expectedTotalMinor: number,
): BudgetCategoryShare[] {
  const totals = new Map<BudgetCategory, number>();
  for (const line of lines) {
    totals.set(line.category, (totals.get(line.category) ?? 0) + line.expectedMinor);
  }

  return [...totals.entries()]
    .map(([category, expected]) => ({
      category,
      expectedMinor: expected,
      share: expectedTotalMinor === 0 ? 0 : expected / expectedTotalMinor,
    }))
    .sort((a, b) => b.expectedMinor - a.expectedMinor);
}

/**
 * "Save more" / "Balanced" / "More comfort" — PRD Part I T08.
 *
 * Locked lines are never touched, and essential categories (stay, transport,
 * buffer) hold steady so the trade-off is visible and predictable.
 */
export function applyBudgetStyle(lines: readonly BudgetLine[], style: BudgetStyle): BudgetLine[] {
  const factor = STYLE_FACTOR[style];
  if (factor === 1) return lines.map((line) => ({ ...line }));

  return lines.map((line) => {
    if (line.locked || !DISCRETIONARY.has(line.category)) return { ...line };
    return {
      ...line,
      lowMinor: line.lowMinor === null ? null : Math.round(line.lowMinor * factor),
      expectedMinor: Math.round(line.expectedMinor * factor),
      highMinor: line.highMinor === null ? null : Math.round(line.highMinor * factor),
    };
  });
}
