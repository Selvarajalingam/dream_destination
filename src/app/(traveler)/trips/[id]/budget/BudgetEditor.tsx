'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button, Card, Chip } from '@/components/ui/primitives';
import { BudgetMeter, PriceStateLabel } from '@/components/patterns/BudgetMeter';
import { applyBudgetStyle, summarizeBudget } from '@/modules/budgets/domain/budget';
import type { BudgetCategory, BudgetLine, BudgetStyle } from '@/modules/budgets/domain/types';
import { formatInr, formatInrRange, rupeesToMinor } from '@/shared/money';

/**
 * Screen T08 — the budget editor.
 *
 * The same deterministic domain functions the server uses run here, so the
 * figures a traveller sees while adjusting are the figures that will be saved.
 * Locked categories are never changed by a style switch.
 */

type LineInput = {
  id: string;
  category: string;
  description: string;
  lowMinor: number | null;
  expectedMinor: number;
  highMinor: number | null;
  priceState: 'live' | 'partner' | 'historical' | 'manual';
  refreshedAt: string | null;
  locked: boolean;
};

const STYLES: Array<{ key: BudgetStyle; label: string }> = [
  { key: 'save_more', label: 'Save more' },
  { key: 'balanced', label: 'Balanced' },
  { key: 'more_comfort', label: 'More comfort' },
];

const CATEGORY_LABELS: Record<string, string> = {
  stay: 'Stay',
  transport: 'Transport',
  food: 'Food',
  activities: 'Activities',
  shopping: 'Shopping',
  buffer: 'Buffer',
};

export function BudgetEditor({
  tripId,
  tripTitle,
  initial,
}: {
  tripId: string;
  tripTitle: string;
  initial: { totalLimitMinor: number; reserveMinor: number; lines: LineInput[] };
}) {
  const [totalRupees, setTotalRupees] = useState(initial.totalLimitMinor / 100);
  const [reserveRupees, setReserveRupees] = useState(initial.reserveMinor / 100);
  const [style, setStyle] = useState<BudgetStyle>('balanced');
  const [lines, setLines] = useState<LineInput[]>(initial.lines);
  const [expanded, setExpanded] = useState<string | null>(null);

  const domainLines = useMemo<BudgetLine[]>(
    () =>
      lines.map((line) => ({
        id: line.id,
        category: line.category as BudgetCategory,
        description: line.description,
        lowMinor: line.lowMinor,
        expectedMinor: line.expectedMinor,
        highMinor: line.highMinor,
        priceState: line.priceState,
        refreshedAt: line.refreshedAt === null ? null : new Date(line.refreshedAt),
        locked: line.locked,
      })),
    [lines],
  );

  const styled = useMemo(() => applyBudgetStyle(domainLines, style), [domainLines, style]);

  const summary = useMemo(
    () => summarizeBudget(styled, rupeesToMinor(totalRupees), rupeesToMinor(reserveRupees)),
    [styled, totalRupees, reserveRupees],
  );

  // Announce the new total, which PRD Part I §11 requires for budget changes.
  const announce = (text: string): void => {
    const region = document.getElementById('live-region');
    if (region !== null) region.textContent = text;
  };

  const byCategory = useMemo(() => {
    const map = new Map<string, BudgetLine[]>();
    for (const line of styled) {
      map.set(line.category, [...(map.get(line.category) ?? []), line]);
    }
    return map;
  }, [styled]);

  const toggleLock = (category: string): void => {
    setLines((current) =>
      current.map((line) => (line.category === category ? { ...line, locked: !line.locked } : line)),
    );
  };

  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-[14px]">
        <Link href={`/trips/${tripId}`} className="text-brand-primary underline underline-offset-2">
          {tripTitle}
        </Link>
      </nav>

      <h1 className="mt-2 text-[26px] lg:text-[32px]">Budget planner</h1>

      <Card className="mt-4 p-4">
        <BudgetMeter budget={summary} />
      </Card>

      <section className="mt-5">
        <h2 className="text-[21px]">Your budget</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-[14px] font-[650]">
            Total budget
            <input
              type="number"
              min={0}
              step={500}
              aria-label="Total budget"
              value={totalRupees}
              onChange={(event) => {
                const next = Number(event.target.value);
                setTotalRupees(next);
                announce(`Total budget is now ${formatInr(rupeesToMinor(next))}`);
              }}
              className="mt-1 block min-h-[44px] w-full rounded-[12px] border border-border-subtle px-3 text-[16px]"
            />
          </label>

          <label className="block text-[14px] font-[650]">
            Reserve held back
            <input
              type="number"
              min={0}
              step={500}
              aria-label="Reserve"
              value={reserveRupees}
              onChange={(event) => setReserveRupees(Number(event.target.value))}
              className="mt-1 block min-h-[44px] w-full rounded-[12px] border border-border-subtle px-3 text-[16px]"
            />
            <span className="mt-1 block text-[13px] font-normal text-text-secondary">
              Kept aside for the unexpected, not spent by the plan.
            </span>
          </label>
        </div>
      </section>

      <section className="mt-5">
        <h2 className="text-[21px]">Trade-offs</h2>
        <div
          role="radiogroup"
          aria-label="Budget style"
          className="mt-3 flex flex-wrap gap-2"
        >
          {STYLES.map((option) => (
            <Chip
              key={option.key}
              role="radio"
              aria-checked={style === option.key}
              selected={style === option.key}
              onClick={() => {
                setStyle(option.key);
                announce(`Budget style set to ${option.label}`);
              }}
            >
              {option.label}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-[14px] text-text-secondary">
          This adjusts food, activities and shopping only. Stay and transport are left alone, and
          any category you lock is never changed.
        </p>
      </section>

      <section className="mt-5">
        <h2 className="text-[21px]">Where the money goes</h2>
        <ul className="mt-3 space-y-2">
          {summary.byCategory.map((entry) => {
            const categoryLines = byCategory.get(entry.category) ?? [];
            const isLocked = categoryLines.some((line) => line.locked);
            const isOpen = expanded === entry.category;

            return (
              <li key={entry.category}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[16px] font-[650]">
                        {CATEGORY_LABELS[entry.category] ?? entry.category}
                      </p>
                      <p className="text-[14px] text-text-secondary">
                        {Math.round(entry.share * 100)}% of the plan
                      </p>
                    </div>

                    <p
                      data-testid={`category-${entry.category}-amount`}
                      className="text-[18px] font-[700]"
                    >
                      {formatInr(entry.expectedMinor)}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border-subtle px-3 text-[14px] font-[650]">
                      <input
                        type="checkbox"
                        role="switch"
                        aria-label={`Lock ${CATEGORY_LABELS[entry.category] ?? entry.category}`}
                        checked={isLocked}
                        onChange={() => toggleLock(entry.category)}
                        className="h-5 w-5"
                      />
                      {isLocked ? 'Locked' : 'Lock'}
                    </label>

                    <Button
                      size="small"
                      variant="secondary"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : entry.category)}
                    >
                      {isOpen ? 'Hide items' : `Show ${categoryLines.length} items`}
                    </Button>
                  </div>

                  {isOpen && (
                    <ul className="mt-3 divide-y divide-border-subtle border-t border-border-subtle">
                      {categoryLines.map((line) => (
                        <li key={line.id} className="flex flex-wrap items-center gap-2 py-2">
                          <span className="min-w-0 flex-1 text-[14px]">{line.description}</span>
                          <span className="text-right">
                            <span className="block text-[14px] font-[650]">
                              {line.lowMinor === null || line.highMinor === null
                                ? formatInr(line.expectedMinor)
                                : formatInrRange(line.lowMinor, line.highMinor)}
                            </span>
                            <PriceStateLabel state={line.priceState} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      {summary.missingPriceLines.length > 0 && (
        <p role="status" className="mt-4 rounded-xl border border-status-warn/40 bg-status-warn-surface p-3 text-[14px]">
          {summary.missingPriceLines.length} item
          {summary.missingPriceLines.length === 1 ? ' has' : 's have'} no price range yet, so the
          total is less certain than it looks.
        </p>
      )}

      <p className="mt-4 text-[14px] text-text-secondary">
        These are estimates from typical prices, not quotes. Checking booking options will replace
        an estimate with a provider price where one is available.
      </p>
    </div>
  );
}
