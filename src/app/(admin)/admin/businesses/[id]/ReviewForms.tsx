'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card } from '@/components/ui/primitives';
import { ApiProblemError, api } from '@/lib/api-client';

/**
 * Screen A07 — the two decision forms.
 *
 * Kept as separate components with separate submit buttons, so there is no
 * single action that verifies a listing and approves its sponsorship at once.
 */

type Check = { key: string; label: string; evidence: string };

export function ListingDecisionForm({ businessId, checks }: { businessId: string; checks: Check[] }) {
  const router = useRouter();

  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const allConfirmed = confirmed.size === checks.length;

  const decide = async (decision: 'approved' | 'changes_requested' | 'rejected'): Promise<void> => {
    if (reason.trim().length < 10) {
      setError('A reason is required. It is kept with the decision.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.post(
        `/api/v1/admin/businesses/${businessId}/listing-decision`,
        { decision, reason: reason.trim(), confirmedChecks: [...confirmed] },
        { 'idempotency-key': `listing-${businessId}-${decision}-${Date.now()}` },
      );
      setDone(
        decision === 'approved'
          ? 'Listing verified and now visible to travellers.'
          : decision === 'rejected'
            ? 'Listing rejected. It will not appear to travellers.'
            : 'Changes requested. The owner can resubmit.',
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiProblemError ? caught.problem.detail ?? caught.problem.title : 'The decision could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  if (done !== null) {
    return (
      <Card className="p-4">
        <p role="status" className="text-[16px] font-[650] text-status-good-text">
          {done}
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h2 className="text-[18px] font-[650]">Listing verification</h2>
      <p className="mt-1 text-[14px] text-text-secondary">
        Confirm each check against its evidence. Approval needs all five.
      </p>

      <ul className="mt-3 space-y-2">
        {checks.map((check) => (
          <li key={check.key}>
            <label className="flex cursor-pointer gap-3 rounded-xl border border-border-subtle p-3">
              <input
                type="checkbox"
                data-testid={`check-${check.key}`}
                checked={confirmed.has(check.key)}
                onChange={() =>
                  setConfirmed((current) => {
                    const next = new Set(current);
                    if (next.has(check.key)) next.delete(check.key);
                    else next.add(check.key);
                    return next;
                  })
                }
                className="mt-0.5 h-5 w-5 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-[14px] font-[650]">{check.label}</span>
                <span className="block text-[14px] text-text-secondary">{check.evidence}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <label className="mt-4 block text-[14px] font-[650]">
        Reason (required)
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-[12px] border border-border-subtle p-3 text-[16px]"
        />
      </label>

      {error !== null && (
        <p role="alert" className="mt-3 text-[14px] font-[650] text-status-danger-text">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => void decide('approved')} disabled={busy || !allConfirmed}>
          Verify listing
        </Button>
        <Button variant="secondary" onClick={() => void decide('changes_requested')} disabled={busy}>
          Request changes
        </Button>
        <Button variant="danger" onClick={() => void decide('rejected')} disabled={busy}>
          Reject
        </Button>
      </div>
      {!allConfirmed && (
        <p className="mt-2 text-[13px] text-text-secondary">
          {checks.length - confirmed.size} check{checks.length - confirmed.size === 1 ? '' : 's'} still to confirm
          before this listing can be verified.
        </p>
      )}
    </Card>
  );
}

export function SponsorshipDecisionForm({
  businessId,
  sponsored,
  requested,
  approveBlocker,
  lastReason,
}: {
  businessId: string;
  sponsored: boolean;
  requested: boolean;
  approveBlocker: string | null;
  lastReason: string | null;
}) {
  const router = useRouter();

  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const decide = async (decision: 'approved' | 'declined' | 'revoked'): Promise<void> => {
    if (reason.trim().length < 10) {
      setError('A reason is required for any sponsorship decision.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.post(
        `/api/v1/admin/businesses/${businessId}/sponsorship-decision`,
        { decision, reason: reason.trim() },
        { 'idempotency-key': `sponsor-${businessId}-${decision}-${Date.now()}` },
      );
      setReason('');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiProblemError ? caught.problem.detail ?? caught.problem.title : 'The decision could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4" data-testid="sponsorship-panel">
      <h2 className="text-[18px] font-[650]">Sponsored placement</h2>
      <p className="mt-1 text-[14px] text-text-secondary">
        Decided separately from verification. Sponsorship adds a visible &ldquo;Sponsored&rdquo; label
        and never affects any Dream Score or destination ranking.
      </p>

      <p className="mt-3 text-[14px] font-[650]">
        {sponsored ? 'Currently sponsored.' : requested ? 'Sponsorship requested.' : 'Not sponsored, and no request is open.'}
      </p>
      {lastReason !== null && !requested && (
        <p className="mt-1 text-[14px] text-text-secondary">Last decision: {lastReason}</p>
      )}

      {requested && approveBlocker !== null && (
        <p className="mt-2 rounded-xl bg-status-warn-surface p-3 text-[14px] text-status-warn-text">{approveBlocker}</p>
      )}

      {(requested || sponsored) && (
        <>
          <label className="mt-3 block text-[14px] font-[650]">
            Reason (required)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-[12px] border border-border-subtle p-3 text-[16px]"
            />
          </label>

          {error !== null && (
            <p role="alert" className="mt-3 text-[14px] font-[650] text-status-danger-text">
              {error}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {requested && (
              <>
                <Button size="small" onClick={() => void decide('approved')} disabled={busy || approveBlocker !== null}>
                  Approve sponsorship
                </Button>
                <Button size="small" variant="secondary" onClick={() => void decide('declined')} disabled={busy}>
                  Decline
                </Button>
              </>
            )}
            {sponsored && !requested && (
              <Button size="small" variant="danger" onClick={() => void decide('revoked')} disabled={busy}>
                Revoke sponsorship
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
