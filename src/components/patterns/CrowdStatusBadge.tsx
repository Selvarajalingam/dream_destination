'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { Sheet } from '@/components/ui/primitives';
import { formatAge } from '@/shared/time';

/**
 * Crowd status — PRD Part I §5.3.
 *
 * Every state carries a coloured icon, a text label, the time it was updated,
 * a confidence label and a "Why?" action. Colour is never the only signal
 * (§2 principle 9), and nothing is ever described as live (§12.2).
 */

export type CrowdStatusView = {
  band: 'comfortable' | 'moderate' | 'heavy' | 'unknown';
  label: string;
  source: string;
  confidence: number;
  confidenceLabel: string;
  observedAt: string | null;
  isStale: boolean;
  explanation: string;
};

const TONE: Record<CrowdStatusView['band'], { text: string; bg: string; border: string }> = {
  comfortable: { text: 'text-status-good', bg: 'bg-status-good/10', border: 'border-status-good/30' },
  moderate: { text: 'text-status-warn', bg: 'bg-status-warn/10', border: 'border-status-warn/30' },
  heavy: { text: 'text-status-danger', bg: 'bg-status-danger/10', border: 'border-status-danger/30' },
  unknown: { text: 'text-status-unknown', bg: 'bg-status-unknown/10', border: 'border-status-unknown/30' },
};

/** Icons carry an accessible name, so the state survives without colour. */
function CrowdIcon({ band, label }: { band: CrowdStatusView['band']; label: string }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', 'aria-hidden': false } as const;

  if (band === 'unknown') {
    return (
      <svg {...common} role="img" fill="none" stroke="currentColor" strokeWidth={2}>
        <title>{label}</title>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.2-1.2.9-1.2 1.6v.5" strokeLinecap="round" />
        <circle cx="11.5" cy="17" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (band === 'heavy') {
    return (
      <svg {...common} role="img" fill="none" stroke="currentColor" strokeWidth={2}>
        <title>{label}</title>
        <path d="M12 3 2 20h20L12 3Z" strokeLinejoin="round" />
        <path d="M12 10v4" strokeLinecap="round" />
        <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  // Comfortable and moderate differ by how tightly the figures are packed.
  const spacing = band === 'comfortable' ? 7 : 4;
  return (
    <svg {...common} role="img" fill="none" stroke="currentColor" strokeWidth={2}>
      <title>{label}</title>
      <circle cx={12 - spacing} cy="9" r="2.2" />
      <path d={`M${12 - spacing - 3.2} 19v-2a3.2 3.2 0 0 1 6.4 0v2`} strokeLinecap="round" />
      <circle cx={12 + spacing} cy="9" r="2.2" />
      <path d={`M${12 + spacing - 3.2} 19v-2a3.2 3.2 0 0 1 6.4 0v2`} strokeLinecap="round" />
    </svg>
  );
}

export function CrowdStatusBadge({
  status,
  timeRange,
  compact = false,
}: {
  status: CrowdStatusView;
  /** e.g. "11:00–13:00", shown when the status is tied to a visit window. */
  timeRange?: string;
  compact?: boolean;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const tone = TONE[status.band];

  const updated =
    status.observedAt === null ? null : formatAge(new Date(status.observedAt), new Date());

  return (
    <>
      <div
        data-testid="crowd-status"
        data-band={status.band}
        className={clsx(
          'inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border px-3 py-2',
          tone.bg,
          tone.border,
        )}
      >
        <span className={clsx('inline-flex items-center gap-1.5', tone.text)}>
          <CrowdIcon band={status.band} label={status.label} />
          <span data-testid="crowd-label" className="text-[14px] font-[650]">
            {status.label}
          </span>
        </span>

        {timeRange !== undefined && (
          <span className="text-[14px] text-text-secondary">{timeRange}</span>
        )}

        {!compact && (
          <>
            {updated !== null && (
              <span className="text-[14px] text-text-secondary">· {updated}</span>
            )}
            <span className="text-[14px] text-text-secondary">· {status.confidenceLabel}</span>
            {status.isStale && (
              <span className="text-[14px] font-[650] text-status-warn">· May be out of date</span>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => setShowWhy(true)}
          className="ml-1 min-h-[44px] rounded-lg px-2 text-[14px] font-[650] text-brand-primary underline underline-offset-2"
        >
          Why?
        </button>
      </div>

      <Sheet open={showWhy} onClose={() => setShowWhy(false)} title={`Crowd status: ${status.label}`}>
        <p className="text-[16px] leading-relaxed">{status.explanation}</p>

        <dl className="mt-4 space-y-2 text-[14px]">
          <div className="flex justify-between gap-4 border-t border-border-subtle pt-2">
            <dt className="text-text-secondary">Confidence</dt>
            <dd className="font-[650]">{status.confidenceLabel}</dd>
          </div>
          {updated !== null && (
            <div className="flex justify-between gap-4 border-t border-border-subtle pt-2">
              <dt className="text-text-secondary">Last reading</dt>
              <dd className="font-[650]">{updated}</dd>
            </div>
          )}
        </dl>

        <p className="mt-4 text-[14px] text-text-secondary">
          Crowd information is gathered periodically and can change quickly. Treat it as guidance
          rather than a current count.
        </p>
      </Sheet>
    </>
  );
}
