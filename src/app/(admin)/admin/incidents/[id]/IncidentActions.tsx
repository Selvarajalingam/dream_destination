'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card } from '@/components/ui/primitives';
import { ApiProblemError, api } from '@/lib/api-client';
import { MIN_ACTION_REASON } from '@/modules/incidents/domain/incidents';

/**
 * Screen A06 — the triage actions.
 *
 * "Suspend immediately" is the first control when the report is high risk,
 * and it is absent rather than disabled when it is not, with the reason
 * stated, so nobody hunts for a button that the rule forbids.
 */

type Status = 'open' | 'investigating' | 'resolved' | 'dismissed';
type Severity = 'low' | 'medium' | 'high' | 'critical';

type Pending =
  | { action: 'suspend' | 'reinstate' | 'resolve' | 'dismiss' | 'reopen'; title: string; confirm: string }
  | { action: 'set_severity'; title: string; confirm: string; severity: Severity };

export function IncidentActions({
  incidentId,
  status,
  severity,
  entityStatus,
  assignedTo,
  triagers,
  suspendAvailable,
}: {
  incidentId: string;
  status: Status;
  severity: Severity;
  entityStatus: string | null;
  assignedTo: string | null;
  triagers: Array<{ id: string; name: string }>;
  suspendAvailable: boolean;
}) {
  const router = useRouter();

  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isClosed = status === 'resolved' || status === 'dismissed';
  const isSuspended = entityStatus === 'suspended';

  const send = async (body: Record<string, unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/admin/incidents/${incidentId}/actions`, body, {
        'idempotency-key': `${incidentId}-${String(body.action)}-${Date.now()}`,
      });
      setPending(null);
      setReason('');
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiProblemError
          ? caught.problem.detail ?? caught.problem.title
          : 'The action could not be recorded.',
      );
    } finally {
      setBusy(false);
    }
  };

  const confirm = (): void => {
    if (pending === null) return;
    if (reason.trim().length < MIN_ACTION_REASON) {
      setError('A reason is required. It goes into the action log.');
      return;
    }
    void send(
      pending.action === 'set_severity'
        ? { action: 'set_severity', severity: pending.severity, reason: reason.trim() }
        : { action: pending.action, reason: reason.trim() },
    );
  };

  return (
    <Card className="p-4">
      <h2 className="text-[18px] font-[650]">Actions</h2>

      {!isClosed && suspendAvailable && !isSuspended && (
        <div className="mt-3 rounded-xl border border-status-danger/40 bg-status-danger-surface p-3">
          <p className="text-[14px] font-[650] text-status-danger-text">High-risk report</p>
          <p className="mt-1 text-[14px]">
            Suspending removes this listing from search, destination pages and new plans at once.
            Travellers who already planned to go see a closure warning in their itinerary.
          </p>
          <Button
            variant="danger"
            className="mt-3"
            onClick={() =>
              setPending({ action: 'suspend', title: 'Suspend this listing now', confirm: 'Suspend immediately' })
            }
          >
            Suspend immediately
          </Button>
        </div>
      )}

      {!isClosed && !suspendAvailable && !isSuspended && (
        <p className="mt-3 text-[14px] text-text-secondary">
          Immediate suspension is for high or critical reports. If this report is more serious than
          its current severity, raise it first; that is recorded with your reason.
        </p>
      )}

      {isSuspended && (
        <div className="mt-3 rounded-xl border border-border-subtle bg-surface-subtle p-3">
          <p className="text-[14px] font-[650]">This listing is suspended.</p>
          <Button
            variant="secondary"
            size="small"
            className="mt-2"
            onClick={() =>
              setPending({ action: 'reinstate', title: 'Reinstate this listing', confirm: 'Reinstate listing' })
            }
          >
            Reinstate listing
          </Button>
        </div>
      )}

      <label className="mt-4 flex flex-wrap items-center gap-2 text-[14px]">
        <span className="text-text-secondary">Assigned to</span>
        <select
          value={assignedTo ?? ''}
          disabled={busy}
          onChange={(event) =>
            void send({ action: 'assign', assignedTo: event.target.value === '' ? null : event.target.value })
          }
          className="min-h-[44px] rounded-[12px] border border-border-subtle px-2 text-[14px]"
        >
          <option value="">Unassigned</option>
          {triagers.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="mt-4">
        <legend className="text-[14px] text-text-secondary">Severity</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['low', 'medium', 'high', 'critical'] as const).map((option) => (
            <Button
              key={option}
              size="small"
              variant={option === severity ? 'primary' : 'secondary'}
              aria-pressed={option === severity}
              disabled={busy || option === severity}
              className="capitalize"
              onClick={() =>
                setPending({
                  action: 'set_severity',
                  severity: option,
                  title: `Change severity to ${option}`,
                  confirm: 'Change severity',
                })
              }
            >
              {option}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap gap-2">
        {status === 'open' && (
          <Button size="small" variant="secondary" disabled={busy} onClick={() => void send({ action: 'investigate' })}>
            Mark investigating
          </Button>
        )}
        {!isClosed && (
          <>
            <Button
              size="small"
              variant="secondary"
              onClick={() => setPending({ action: 'resolve', title: 'Resolve this report', confirm: 'Resolve' })}
            >
              Resolve
            </Button>
            <Button
              size="small"
              variant="ghost"
              onClick={() => setPending({ action: 'dismiss', title: 'Dismiss this report', confirm: 'Dismiss' })}
            >
              Dismiss
            </Button>
          </>
        )}
        {isClosed && (
          <Button
            size="small"
            variant="secondary"
            onClick={() => setPending({ action: 'reopen', title: 'Reopen this report', confirm: 'Reopen' })}
          >
            Reopen
          </Button>
        )}
      </div>

      {pending !== null && (
        <div className="mt-4 rounded-xl border border-border-subtle p-3">
          <p className="text-[16px] font-[650]">{pending.title}</p>
          <label className="mt-2 block text-[14px] font-[650]">
            Reason (required, kept in the action log)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-[12px] border border-border-subtle p-3 text-[16px]"
            />
          </label>
          <div className="mt-3 flex gap-2">
            <Button variant={pending.action === 'suspend' ? 'danger' : 'primary'} onClick={confirm} disabled={busy}>
              {busy ? 'Recording…' : pending.confirm}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setPending(null);
                setReason('');
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error !== null && (
        <p role="alert" className="mt-3 text-[14px] font-[650] text-status-danger-text">
          {error}
        </p>
      )}
    </Card>
  );
}
