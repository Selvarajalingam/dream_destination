/** PRD Part II §6.6 — the four price provenance states. */
export type PriceState = 'live' | 'partner' | 'historical' | 'manual';

export type BudgetCategory =
  | 'stay'
  | 'transport'
  | 'food'
  | 'activities'
  | 'shopping'
  | 'buffer';

export type BudgetStyle = 'save_more' | 'balanced' | 'more_comfort';

export type BudgetLine = {
  id: string;
  category: BudgetCategory;
  description: string;
  /** Minor units. Null means no lower bound is known for this line. */
  lowMinor: number | null;
  expectedMinor: number;
  highMinor: number | null;
  priceState: PriceState;
  refreshedAt: Date | null;
  locked: boolean;
  sourceId?: string | null;
  itineraryItemId?: string | null;
};

/** PRD Part I T08 — the four states the budget planner must render. */
export type BudgetState =
  | 'within_budget'
  | 'high_estimate_over'
  | 'over_budget'
  | 'missing_price_data';

export type BudgetCategoryShare = {
  category: BudgetCategory;
  expectedMinor: number;
  /** 0-1 share of the expected total. */
  share: number;
};

export type BudgetSummary = {
  totalLimitMinor: number;
  reserveMinor: number;
  expectedTotalMinor: number;
  lowTotalMinor: number;
  highTotalMinor: number;
  /** limit - reserve - expected. May be negative. */
  remainingMinor: number;
  state: BudgetState;
  byCategory: BudgetCategoryShare[];
  /** Lines not priced 'live'. PRD Part I §5.5 requires both counts. */
  estimatedItemCount: number;
  livePricedItemCount: number;
  /** Ids of lines with no low or high bound. */
  missingPriceLines: string[];
};
