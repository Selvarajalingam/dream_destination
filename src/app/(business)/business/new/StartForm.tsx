'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/primitives';
import { ApiProblemError, api, ensureSession } from '@/lib/api-client';
import { useHydrated } from '../[id]/details/DetailsForm';

type Labels = { businessName: string; area: string; areaHelp: string; startAction: string; starting: string };

export function StartForm({ destinations, labels }: { destinations: Array<{ slug: string; name: string }>; labels: Labels }) {
  const [name, setName] = useState('');
  const [area, setArea] = useState(destinations[0]?.slug ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ensureSession();
      const { id } = await api.post<{ id: string }>(
        '/api/v1/business/listings',
        { name, destinationSlug: area },
        { 'idempotency-key': `start-${crypto.randomUUID()}` },
      );
      window.location.assign(`/business/${id}/details`);
    } catch (caught) {
      setError(caught instanceof ApiProblemError ? caught.problem.detail ?? caught.problem.title : 'Could not start the listing.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-4">
      <fieldset disabled={!hydrated} className="m-0 min-w-0 space-y-4 border-0 p-0">
        <label className="block">
          <span className="block text-[14px] font-[650]">{labels.businessName}</span>
          <input
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 min-h-[44px] w-full rounded-xl border border-text-secondary/60 px-3 text-[16px]"
          />
        </label>

        <label className="block">
          <span className="block text-[14px] font-[650]">{labels.area}</span>
          <select
            value={area}
            onChange={(event) => setArea(event.target.value)}
            aria-describedby="area-help"
            className="mt-1 min-h-[44px] w-full rounded-xl border border-text-secondary/60 bg-surface-base px-3 text-[16px]"
          >
            {destinations.map((destination) => (
              <option key={destination.slug} value={destination.slug}>
                {destination.name}
              </option>
            ))}
          </select>
          <span id="area-help" className="mt-1 block text-[13px] text-text-secondary">
            {labels.areaHelp}
          </span>
        </label>

        {error !== null && (
          <p role="alert" className="text-[14px] font-[650] text-status-danger-text">
            {error}
          </p>
        )}

        <Button type="submit" disabled={busy || name.trim().length < 2}>
          {busy ? labels.starting : labels.startAction}
        </Button>
      </fieldset>
    </form>
  );
}
