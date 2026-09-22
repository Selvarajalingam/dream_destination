'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { Sheet } from '@/components/ui/primitives';
import { track } from '@/lib/track';

/**
 * Dream Score — PRD Part I §5.2.
 *
 * Displayed as "Trip match", never "Safety score". The collapsed view shows
 * the three strongest reasons; the expanded view shows dimensions, weights and
 * limitations. Missing data lowers confidence and is shown, not hidden (§9.2).
 */

export type DreamScoreView = {
  tripMatch: number;
  components: Record<string, number>;
  weights: Record<string, number>;
  missingDimensions: string[];
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  tradeOff: string;
  algorithmVersion: string;
};

const DIMENSION_LABELS: Record<string, string> = {
  interestMatch: 'Interest match',
  budgetMatch: 'Budget match',
  timeDistanceFit: 'Time and distance',
  crowdComfort: 'Crowd comfort',
  seasonWeatherFit: 'Season and weather',
  accessibilityFit: 'Accessibility',
  localExperienceFit: 'Local experiences',
};

const CONFIDENCE_LABEL: Record<DreamScoreView['confidence'], string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence — some information is missing',
};

export function DreamScoreBadge({ score, className }: { score: DreamScoreView; className?: string }) {
  return (
    <div className={clsx('inline-flex items-baseline gap-2', className)}>
      <span data-testid="total-score" className="text-[26px] font-[750] text-brand-deep">
        {Math.round(score.tripMatch)}%
      </span>
      <span className="text-[14px] font-[650] text-text-secondary">Trip match</span>
    </div>
  );
}

export function DreamScoreSummary({ score, destinationId }: { score: DreamScoreView; destinationId?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div>
        <DreamScoreBadge score={score} />

        <ul className="mt-2 space-y-1 text-[14px]">
          {score.reasons.slice(0, 3).map((reason) => (
            <li key={reason} className="flex gap-2">
              <span aria-hidden="true" className="text-status-good-text">
                ✓
              </span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => {
            setOpen(true);
            if (destinationId !== undefined) track('dream_score_opened', { destinationId });
          }}
          className="mt-2 min-h-[44px] text-[14px] font-[650] text-brand-primary underline underline-offset-2"
        >
          Why this matches
        </button>
      </div>

      <DreamScoreDetailSheet score={score} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function DreamScoreDetailSheet({
  score,
  open,
  onClose,
}: {
  score: DreamScoreView;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Why this matches your trip">
      <DreamScoreBadge score={score} />
      <p className="mt-1 text-[14px] text-text-secondary">{CONFIDENCE_LABEL[score.confidence]}</p>

      <section className="mt-5">
        <h3 className="text-[16px] font-[650]">What we compared</h3>
        <dl className="mt-2 space-y-2">
          {Object.entries(score.components).map(([key, value]) => {
            const isMissing = score.missingDimensions.includes(key);
            return (
              <div key={key} className="flex items-center gap-3 border-t border-border-subtle pt-2">
                <dt className="flex-1 text-[14px]">
                  {DIMENSION_LABELS[key] ?? key}
                  <span className="ml-1 text-text-secondary">
                    ({Math.round((score.weights[key] ?? 0) * 100)}%)
                  </span>
                </dt>
                <dd className="text-[14px] font-[650]">
                  {isMissing ? (
                    <span className="text-status-unknown-text">Not enough information</span>
                  ) : (
                    `${Math.round(value)}/100`
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      {score.missingDimensions.length > 0 && (
        <section data-testid="missing-information" className="mt-5 rounded-xl bg-surface-subtle p-3">
          <h3 className="text-[14px] font-[650]">Missing information</h3>
          <p className="mt-1 text-[14px] text-text-secondary">
            We could not compare{' '}
            {score.missingDimensions.map((key) => DIMENSION_LABELS[key] ?? key).join(', ').toLowerCase()}
            {' '}for this destination, so the match is less certain than it looks.
          </p>
        </section>
      )}

      <section className="mt-5">
        <h3 className="text-[16px] font-[650]">The trade-off</h3>
        <p className="mt-1 text-[14px]">{score.tradeOff}</p>
      </section>

      <p className="mt-5 text-[14px] text-text-secondary">
        This is how well a destination matches the preferences you set. It is not a rating of the
        place, and it does not measure risk. Sponsored listings never affect it.
      </p>

      <p className="mt-2 text-[13px] text-text-secondary">Method {score.algorithmVersion}</p>
    </Sheet>
  );
}
