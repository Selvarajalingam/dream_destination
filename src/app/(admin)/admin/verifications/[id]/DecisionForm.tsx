'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { ApiProblemError, api } from '@/lib/api-client';

/**
 * Screen A03 — the decision actions.
 *
 * A reason is mandatory for every decision, enforced here for immediacy and
 * again in the API so it cannot be bypassed. Approvals must also state how
 * long they are valid, because an approval with no expiry would never come
 * back for review.
 */

type Decision = 'approved' | 'changes_requested' | 'rejected' | 'suppressed';

const DECISIONS: Array<{ key: Decision; label: string; tone: 'primary' | 'secondary' | 'danger' }> = [
  { key: 'approved', label: 'Approve', tone: 'primary' },
  { key: 'changes_requested', label: 'Request changes', tone: 'secondary' },
  { key: 'rejected', label: 'Reject', tone: 'danger' },
  { key: 'suppressed', label: 'Suppress listing', tone: 'danger' },
];

/** A reason short enough to be meaningless helps nobody reading the audit log. */
const MIN_REASON_LENGTH = 10;

export function DecisionForm({
  verificationId,
  placeSlug,
}: {
  verificationId: string;
  placeSlug: string;
}) {
  const router = useRouter();

  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const [validForMonths, setValidForMonths] = useState(6);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (decision === null) {
      setError('Choose a decision first.');
      return;
    }

    if (reason.trim().length < MIN_REASON_LENGTH) {
      setError('A reason is required, and it needs to say enough to be useful later.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await api.post(
        `/api/v1/admin/verifications/${verificationId}/decision`,
        {
          decision,
          reason: reason.trim(),
          ...(decision === 'approved' ? { validForMonths } : {}),
        },
        { 'idempotency-key': `decision-${verificationId}-${decision}` },
      );

      setDone(true);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiProblemError
          ? caught.problem.detail ?? caught.problem.title
          : 'The decision could not be recorded.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div role="status" className="mt-3 rounded-[16px] border border-status-good/40 bg-status-good-surface p-4">
        <p className="text-[16px] font-[650] text-status-good-text">Decision recorded</p>
        <p className="mt-1 text-[14px]">
          The audit log has the reason and who made the decision.{' '}
          <a
            href={`/places/${placeSlug}`}
            className="text-brand-primary underline underline-offset-2"
          >
            See how travellers now see this place
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-[16px] border border-border-subtle p-4">
      <fieldset>
        <legend className="text-[14px] font-[650]">Decision</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {DECISIONS.map((option) => (
            <Button
              key={option.key}
              type="button"
              size="small"
              variant={decision === option.key ? option.tone : 'secondary'}
              aria-pressed={decision === option.key}
              onClick={() => setDecision(option.key)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 block text-[14px] font-[650]">
        Reason (required)
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          placeholder="What was checked, and what decided this. This is kept in the audit log."
          className="mt-1 block w-full rounded-[12px] border border-border-subtle p-3 text-[16px]"
        />
      </label>

      {decision === 'approved' && (
        <label className="mt-3 block text-[14px] font-[650]">
          Valid for
          <select
            value={validForMonths}
            onChange={(event) => setValidForMonths(Number(event.target.value))}
            className="mt-1 block min-h-[44px] rounded-[12px] border border-border-subtle px-3 text-[16px]"
          >
            <option value={3}>3 months</option>
            <option value={6}>6 months</option>
            <option value={12}>12 months</option>
          </select>
          <span className="mt-1 block text-[13px] font-normal text-text-secondary">
            After this, the Dream Verified badge stops showing until it is reviewed again.
          </span>
        </label>
      )}

      {error !== null && (
        <p role="alert" className="mt-3 text-[14px] font-[650] text-status-danger-text">
          {error}
        </p>
      )}

      <Button className="mt-4" onClick={() => void submit()} disabled={busy}>
        {busy ? 'Recording…' : 'Record decision'}
      </Button>
    </div>
  );
}
