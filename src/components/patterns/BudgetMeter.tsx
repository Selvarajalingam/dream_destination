'use client';

import clsx from 'clsx';
import { Meter } from '@/components/ui/primitives';
import { formatInr, formatInrRange } from '@/shared/money';

/**
 * Budget meter — PRD Part I §5.5.
 *
 * Shows total budget, planned spend, reserve, remaining balance, the
 * confidence range, and how many items are estimated versus live-priced. A
 * warning state appears when the high estimate exceeds the budget.
 */

export type BudgetView = {
  totalLimitMinor: number;
  reserveMinor: number;
  expectedTotalMinor: number;
  lowTotalMinor: number;
  highTotalMinor: number;
  remainingMinor: number;
  state: 'within_budget' | 'high_estimate_over' | 'over_budget' | 'missing_price_data';
  estimatedItemCount: number;
  livePricedItemCount: number;
};

const STATE_COPY: Record<BudgetView['state'], { tone: 'good' | 'warn' | 'danger'; message: string }> = {
  within_budget: { tone: 'good', message: 'The plan fits inside the budget you set.' },
  high_estimate_over: {
    tone: 'warn',
    message: 'The higher end of these estimates goes past your budget.',
  },
  over_budget: { tone: 'danger', message: 'The planned spend is above the budget you set.' },
  missing_price_data: {
    tone: 'warn',
    message: 'Some items have no price range yet, so the total is less certain.',
  },
};

export function BudgetMeter({ budget, compact = false }: { budget: BudgetView; compact?: boolean }) {
  const copy = STATE_COPY[budget.state];
  const overspent = budget.remainingMinor < 0;

  return (
    <section aria-label="Budget" data-testid="budget-meter" data-state={budget.state}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[14px] text-text-secondary">
          Planned spend
          <span data-testid="expected-total" className="ml-2 text-[21px] font-[700] text-text-primary">
            {formatInr(budget.expectedTotalMinor)}
          </span>
        </p>
        <p className="text-[14px] text-text-secondary">of {formatInr(budget.totalLimitMinor)}</p>
      </div>

      <div className="mt-2">
        <Meter
          value={budget.expectedTotalMinor}
          max={budget.totalLimitMinor}
          tone={copy.tone}
          label={`Planned spend, ${formatInr(budget.expectedTotalMinor)} of ${formatInr(budget.totalLimitMinor)}`}
        />
      </div>

      <p
        className={clsx(
          'mt-2 text-[14px]',
          copy.tone === 'good' && 'text-text-secondary',
          copy.tone === 'warn' && 'font-[650] text-status-warn',
          copy.tone === 'danger' && 'font-[650] text-status-danger',
        )}
        {...(copy.tone === 'good' ? {} : { role: 'alert' })}
      >
        {copy.message}
      </p>

      {!compact && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
          <div className="flex justify-between gap-2 border-t border-border-subtle pt-2">
            <dt className="text-text-secondary">Reserve</dt>
            <dd className="font-[650]">{formatInr(budget.reserveMinor)}</dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-border-subtle pt-2">
            <dt className="text-text-secondary">Remaining</dt>
            <dd className={clsx('font-[650]', overspent && 'text-status-warn')}>
              {formatInr(budget.remainingMinor)}
            </dd>
          </div>
          <div className="col-span-2 flex justify-between gap-2 border-t border-border-subtle pt-2">
            <dt className="text-text-secondary">Likely range</dt>
            <dd className="font-[650]">
              {formatInrRange(budget.lowTotalMinor, budget.highTotalMinor)}
            </dd>
          </div>
          <div className="col-span-2 border-t border-border-subtle pt-2 text-text-secondary">
            {/* PRD §5.5 requires both counts to be visible. */}
            {budget.estimatedItemCount} estimated{' '}
            {budget.estimatedItemCount === 1 ? 'item' : 'items'}, {budget.livePricedItemCount}{' '}
            with checked prices
          </div>
        </dl>
      )}
    </section>
  );
}

/** The four price provenance states, labelled distinctly (T08). */
const PRICE_STATE_COPY = {
  live: { text: 'Checked just now', tone: 'text-status-good' },
  partner: { text: 'From a provider', tone: 'text-text-secondary' },
  historical: { text: 'Typical price', tone: 'text-text-secondary' },
  manual: { text: 'You entered this', tone: 'text-text-secondary' },
} as const;

export function PriceStateLabel({ state }: { state: 'live' | 'partner' | 'historical' | 'manual' }) {
  // An unrecognised state falls back to the most cautious label rather than
  // crashing: a missing provenance is closer to "typical" than to "checked".
  const copy = PRICE_STATE_COPY[state] ?? PRICE_STATE_COPY.historical;

  return (
    <span data-testid="price-state" className={clsx('text-[13px] font-[650]', copy.tone)}>
      {copy.text}
    </span>
  );
}
