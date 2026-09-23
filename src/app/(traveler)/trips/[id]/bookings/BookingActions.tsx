'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/primitives';
import { ApiProblemError, api, ensureSession } from '@/lib/api-client';
import { HANDOFF_NOTICE, canConfirm, type BookingState } from '@/modules/bookings/domain/booking';

/** The two actions on T13: leaving for a provider, and what happens after. */

const describe = (caught: unknown, fallback: string): string =>
  caught instanceof ApiProblemError ? caught.problem.detail ?? caught.problem.title : fallback;

/**
 * These actions change what the server renders, so the page is reloaded
 * rather than refreshed in place: a dropped refresh would leave the traveller
 * looking at a state that is no longer true.
 */
export function HandoffButton({
  tripId,
  kind,
  providerId,
  providerName,
}: {
  tripId: string;
  kind: 'stay' | 'transport';
  providerId: string;
  providerName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await ensureSession();
      const { url } = await api.post<{ url: string }>(
        `/api/v1/trips/${tripId}/bookings`,
        { kind, providerId },
        { 'idempotency-key': `handoff-${tripId}-${providerId}-${Date.now()}` },
      );
      // Opened after the intention is recorded, so leaving is never silent.
      window.open(url, '_blank', 'noopener,noreferrer');
      setConfirming(false);
      window.location.reload();
    } catch (caught) {
      setError(describe(caught, 'The provider could not be opened.'));
    } finally {
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <div>
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          Open {providerName}
        </Button>
        {error !== null && (
          <p role="alert" className="mt-2 text-[14px] font-[650] text-status-danger-text">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[16px] border border-status-warn/40 bg-status-warn-surface p-3" data-testid="leaving-notice">
      <p className="text-[14px] font-[650] text-status-warn-text">{HANDOFF_NOTICE}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="small" disabled={busy} onClick={() => void go()}>
          {busy ? 'Opening…' : `Continue to ${providerName}`}
        </Button>
        <Button size="small" variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
          Stay here
        </Button>
      </div>
    </div>
  );
}

export function BookingActions({
  tripId,
  bookingId,
  state,
  hasReference,
}: {
  tripId: string;
  bookingId: string;
  state: BookingState;
  hasReference: boolean;
}) {
  const [reference, setReference] = useState('');
  const [evidence, setEvidence] = useState<'provider_callback' | 'traveller_attested'>('traveller_attested');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (body: unknown, fallback: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/v1/trips/${tripId}/bookings/${bookingId}`, body);
      window.location.reload();
    } catch (caught) {
      setError(describe(caught, fallback));
      setBusy(false);
    }
  };

  const confirmBlocker = canConfirm(state, evidence, hasReference);

  return (
    <div className="mt-3 space-y-3">
      {state !== 'confirmed_by_provider' && (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void run({ action: 'add_reference', reference }, 'The reference could not be saved.');
          }}
        >
          <label className="block">
            <span className="block text-[14px] font-[650]">
              {hasReference ? 'Change the provider’s reference' : 'Add the provider’s reference'}
            </span>
            <input
              name="reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={60}
              aria-describedby={`reference-help-${bookingId}`}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-text-secondary/60 bg-surface-base px-3 text-[16px]"
            />
            <span id={`reference-help-${bookingId}`} className="mt-1 block text-[13px] text-text-secondary">
              The booking code the provider gave you. Never card, UPI or login details: those are refused.
            </span>
          </label>
          <Button type="submit" size="small" className="mt-2" disabled={busy || reference.trim() === ''}>
            Save reference
          </Button>
        </form>
      )}

      {state === 'reference_added' && (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void run({ action: 'mark_confirmed', evidence }, 'It could not be marked as confirmed.');
          }}
        >
          <fieldset>
            <legend className="text-[14px] font-[650]">Mark as confirmed</legend>
            <p className="text-[13px] text-text-secondary">
              We cannot see the provider’s system, so say where the confirmation came from.
            </p>
            <label className="mt-2 flex min-h-[44px] items-center gap-2 text-[14px]">
              <input
                type="radio"
                name={`evidence-${bookingId}`}
                checked={evidence === 'traveller_attested'}
                onChange={() => setEvidence('traveller_attested')}
              />
              I received the provider’s confirmation
            </label>
            <label className="flex min-h-[44px] items-center gap-2 text-[14px]">
              <input
                type="radio"
                name={`evidence-${bookingId}`}
                checked={evidence === 'provider_callback'}
                onChange={() => setEvidence('provider_callback')}
              />
              The provider confirmed it to Dream Destination
            </label>
          </fieldset>
          <Button type="submit" size="small" className="mt-2" disabled={busy || confirmBlocker !== null}>
            Mark as confirmed
          </Button>
          {confirmBlocker !== null && <p className="mt-1 text-[13px] text-text-secondary">{confirmBlocker}</p>}
        </form>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void api
            .delete(`/api/v1/trips/${tripId}/bookings/${bookingId}`)
            .then(() => window.location.reload())
            .catch((caught: unknown) => {
              setError(describe(caught, 'It could not be removed.'));
              setBusy(false);
            });
        }}
        className="min-h-[44px] text-[14px] font-[650] text-status-danger-text underline underline-offset-2"
      >
        Remove from this trip
      </button>

      {error !== null && (
        <p role="alert" className="text-[14px] font-[650] text-status-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
