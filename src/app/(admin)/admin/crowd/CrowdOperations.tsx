'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card } from '@/components/ui/primitives';
import { CrowdStatusBadge } from '@/components/patterns/CrowdStatusBadge';
import { ApiProblemError, api } from '@/lib/api-client';
import { formatAge } from '@/shared/time';

/**
 * Screen A04 — the crowd operations table and override form.
 *
 * An override requires a band, a reason, a start and an expiry. The reason is
 * shown to travellers in the crowd explanation, so the form says so plainly
 * rather than treating it as an internal note.
 */

type PlaceRow = {
  id: string;
  name: string;
  slug: string;
  band: 'comfortable' | 'moderate' | 'heavy' | 'unknown';
  label: string;
  source: string;
  confidence: number;
  confidenceLabel: string;
  explanation: string;
  observedAt: string | null;
  expiresAt: string | null;
  isStale: boolean;
  lastObservationAt: string | null;
  observationCount24h: number;
  hasForecast: boolean;
};

const SOURCE_LABEL: Record<string, string> = {
  override: 'Manual override',
  sensor: 'Gate counter feed',
  aggregated_checkin: 'Aggregated check-ins',
  forecast: 'Historical forecast',
  none: 'No signal',
};

export function CrowdOperations({ places }: { places: PlaceRow[] }) {
  const [overriding, setOverriding] = useState<PlaceRow | null>(null);

  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">Crowd operations</h1>
      <p className="mt-1 text-[16px] text-text-secondary">
        {places.length} places carry crowd signals. An override takes precedence over every other
        source and is shown to travellers with the reason you give.
      </p>

      <ul className="mt-5 space-y-3">
        {places.map((place) => (
          <li key={place.id}>
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[18px] font-[650]">{place.name}</h2>
                  <p className="text-[14px] text-text-secondary">
                    Source: {SOURCE_LABEL[place.source] ?? place.source} · {place.confidenceLabel}
                  </p>
                </div>

                <CrowdStatusBadge
                  compact
                  status={{
                    band: place.band,
                    label: place.label,
                    source: place.source,
                    confidence: place.confidence,
                    confidenceLabel: place.confidenceLabel,
                    observedAt: place.observedAt,
                    isStale: place.isStale,
                    explanation: place.explanation,
                  }}
                />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[14px] sm:grid-cols-3">
                <Health
                  label="Last observation"
                  value={
                    place.lastObservationAt === null
                      ? 'None recorded'
                      : formatAge(new Date(place.lastObservationAt), new Date()).replace('updated ', '')
                  }
                  warn={place.lastObservationAt === null}
                />
                <Health
                  label="Observations (24h)"
                  value={String(place.observationCount24h)}
                  warn={place.observationCount24h === 0}
                />
                <Health
                  label="Forecast"
                  value={place.hasForecast ? 'Available' : 'Missing'}
                  warn={!place.hasForecast}
                />
              </dl>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="small" variant="secondary" onClick={() => setOverriding(place)}>
                  Override
                </Button>
                <a
                  href={`/places/${place.slug}`}
                  data-touch-target
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-3 text-[14px] font-[650]"
                >
                  See traveller view
                </a>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {overriding !== null && (
        <OverrideForm place={overriding} onClose={() => setOverriding(null)} />
      )}
    </div>
  );
}

function Health({ label, value, warn }: { label: string; value: string; warn: boolean }) {
  return (
    <div className="border-t border-border-subtle pt-1">
      <dt className="text-text-secondary">{label}</dt>
      <dd className={warn ? 'font-[650] text-status-warn' : 'font-[650]'}>{value}</dd>
    </div>
  );
}

function OverrideForm({ place, onClose }: { place: PlaceRow; onClose: () => void }) {
  const router = useRouter();

  const [band, setBand] = useState<'comfortable' | 'moderate' | 'heavy'>('heavy');
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState(6);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (reason.trim().length < 10) {
      setError('A reason is required. Travellers see it, so make it something they can act on.');
      return;
    }

    setBusy(true);
    setError(null);

    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + hours * 60 * 60 * 1000);

    try {
      await api.post('/api/v1/admin/crowd-overrides', {
        placeId: place.id,
        band,
        reason: reason.trim(),
        startsAt: startsAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });

      onClose();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiProblemError
          ? caught.problem.detail ?? caught.problem.title
          : 'The override could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/40" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Override crowd status for ${place.name}`}
        className="elevation-3 relative max-h-[85vh] w-full overflow-y-auto rounded-t-[24px] bg-surface-base p-5 sm:max-w-lg sm:rounded-[16px]"
      >
        <h2 className="text-[21px]">Override crowd status</h2>
        <p className="mt-1 text-[14px] text-text-secondary">{place.name}</p>

        <fieldset className="mt-4">
          <legend className="text-[14px] font-[650]">Band</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['comfortable', 'moderate', 'heavy'] as const).map((option) => (
              <Button
                key={option}
                type="button"
                size="small"
                variant={band === option ? 'primary' : 'secondary'}
                aria-pressed={band === option}
                onClick={() => setBand(option)}
                className="capitalize"
              >
                {option === 'heavy' ? 'Heavy crowd' : option}
              </Button>
            ))}
          </div>
        </fieldset>

        <label className="mt-4 block text-[14px] font-[650]">
          Reason (shown to travellers)
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            placeholder="Local festival procession through the garden road, heavy footfall expected"
            className="mt-1 block w-full rounded-[12px] border border-border-subtle p-3 text-[16px]"
          />
        </label>

        <label className="mt-3 block text-[14px] font-[650]">
          Expires after
          <select
            value={hours}
            onChange={(event) => setHours(Number(event.target.value))}
            className="mt-1 block min-h-[44px] rounded-[12px] border border-border-subtle px-3 text-[16px]"
          >
            <option value={2}>2 hours</option>
            <option value={6}>6 hours</option>
            <option value={12}>12 hours</option>
            <option value={24}>24 hours</option>
          </select>
          <span className="mt-1 block text-[13px] font-normal text-text-secondary">
            After this the status returns to whatever the feeds report. Overrides never linger.
          </span>
        </label>

        {error !== null && (
          <p role="alert" className="mt-3 text-[14px] font-[650] text-status-danger">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? 'Saving…' : 'Save override'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
