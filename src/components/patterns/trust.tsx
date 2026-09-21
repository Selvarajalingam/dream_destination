'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { Sheet } from '@/components/ui/primitives';
import { formatSourceDate } from '@/shared/time';

/**
 * Trust components — PRD Part I §5.4 (Dream Verified) and §5.7 (source and
 * freshness). Both put the evidence beside the claim rather than in a footer.
 */

export type SourceView = {
  name: string;
  issuingAuthority: string | null;
  verifiedAt: string | null;
  reviewDueAt: string | null;
  url?: string | null;
};

/**
 * "District Tourism Office · Verified 12 Sep 2026"
 *
 * Past its review date the label switches to a warning rather than
 * disappearing, because hiding stale information is worse than showing it
 * with its age.
 */
export function SourceFreshnessLabel({
  source,
  className,
}: {
  source: SourceView;
  className?: string;
}) {
  const isStale =
    source.reviewDueAt !== null && new Date(source.reviewDueAt).getTime() < Date.now();

  const authority = source.issuingAuthority ?? source.name;
  const verified =
    source.verifiedAt === null ? null : formatSourceDate(new Date(source.verifiedAt));

  return (
    <p
      data-testid="source-freshness"
      className={clsx(
        'text-[14px]',
        isStale ? 'font-[650] text-status-warn-text' : 'text-text-secondary',
        className,
      )}
    >
      <span data-testid="issuing-authority">{authority}</span>
      {verified !== null && (
        <>
          {' · '}
          <span data-testid="last-verified">Verified {verified}</span>
        </>
      )}
      {isStale && (
        <>
          {' · '}
          <span data-testid="stale-warning">Due for review — may be out of date</span>
        </>
      )}
      {source.url != null && source.url !== '' && (
        <>
          {' · '}
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-brand-primary underline underline-offset-2"
          >
            Source
          </a>
        </>
      )}
    </p>
  );
}

export type VerificationView = {
  showBadge: boolean;
  status: string;
  verifiedAt: string | null;
  nextReviewAt: string | null;
  knownLimitations: string[];
  reviewerType: string | null;
  checklistGroups: Array<{ key: string; label: string; value: string; checked: boolean }>;
};

/**
 * Dream Verified badge — PRD Part I §5.4.
 *
 * Renders nothing unless the verification is approved and unexpired, because
 * PRD Part II §19 makes that a hard rule. The sheet carries the verification
 * date, next review, verified attributes, known limitations, reviewer type and
 * a report-concern action.
 */
export function DreamVerifiedBadge({ display }: { display: VerificationView }) {
  const [open, setOpen] = useState(false);

  if (!display.showBadge) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="dream-verified-badge"
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-status-good/30 bg-status-good-surface px-3 text-[14px] font-[650] text-status-good-text"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" role="img" fill="none" stroke="currentColor" strokeWidth={2.4}>
          <title>Verified</title>
          <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Dream Verified
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="What Dream Verified covers here">
        <dl className="space-y-3 text-[14px]">
          <div className="flex justify-between gap-4">
            <dt className="text-text-secondary">Verified on</dt>
            <dd data-testid="verified-on" className="font-[650]">
              {display.verifiedAt === null ? 'Not recorded' : formatSourceDate(new Date(display.verifiedAt))}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-secondary">Next review</dt>
            <dd data-testid="next-review" className="font-[650]">
              {display.nextReviewAt === null ? 'Not scheduled' : formatSourceDate(new Date(display.nextReviewAt))}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-secondary">Reviewed by</dt>
            <dd data-testid="reviewer-type" className="text-right font-[650]">
              {display.reviewerType ?? 'Not recorded'}
            </dd>
          </div>
        </dl>

        {display.knownLimitations.length > 0 && (
          <section className="mt-5">
            <h3 className="text-[16px] font-[650]">Known limitations</h3>
            <ul className="mt-2 space-y-2">
              {display.knownLimitations.map((limitation) => (
                <li
                  key={limitation}
                  className="rounded-xl border border-status-warn/30 bg-status-warn-surface p-3 text-[14px]"
                >
                  {limitation}
                </li>
              ))}
            </ul>
          </section>
        )}

        {display.checklistGroups.length > 0 && (
          <section className="mt-5">
            <h3 className="text-[16px] font-[650]">What was checked</h3>
            <dl className="mt-2 space-y-3">
              {display.checklistGroups.map((group) => (
                <div key={group.key} className="border-t border-border-subtle pt-2">
                  <dt className="text-[13px] font-[650] uppercase tracking-wide text-text-secondary">
                    {group.label}
                  </dt>
                  <dd className="mt-1 text-[14px]">{group.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <p className="mt-5 text-[14px] text-text-secondary">
          Dream Verified records what a reviewer checked on a date. It is not a guarantee of current
          conditions, and it does not cover anything outside the list above.
        </p>

        <button
          type="button"
          className="mt-4 min-h-[44px] rounded-xl border border-border-subtle px-4 text-[14px] font-[650]"
        >
          Report a concern
        </button>
      </Sheet>
    </>
  );
}

/** Shown above the visit action, per T11's warning pattern. */
export function KnownLimitations({ limitations }: { limitations: string[] }) {
  if (limitations.length === 0) return null;

  return (
    <section
      data-testid="known-limitations"
      aria-label="Known limitations"
      className="rounded-[16px] border border-status-warn/40 bg-status-warn-surface p-4"
    >
      <h3 className="text-[16px] font-[650] text-status-warn-text">Before you go</h3>
      <ul className="mt-2 space-y-2 text-[14px]">
        {limitations.map((limitation) => (
          <li key={limitation} className="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>{limitation}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
