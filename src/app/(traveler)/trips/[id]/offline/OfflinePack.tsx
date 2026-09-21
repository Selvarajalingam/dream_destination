'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui/primitives';
import type { OfflineManifest } from '@/modules/offline/domain/manifest';
import { formatSourceDate } from '@/shared/time';

/**
 * Screen T21 — the offline pack controls.
 *
 * Implements all six states the PRD names: not saved, downloading, saved,
 * update available, partially failed, and storage limit reached.
 */

type PackStatus =
  | 'not_saved'
  | 'downloading'
  | 'saved'
  | 'update_available'
  | 'partial'
  | 'storage_limit';

type ResourceResult = {
  url: string;
  label: string;
  ok: boolean;
  required: boolean;
  reason?: string;
};

const STATUS_COPY: Record<PackStatus, { title: string; detail: string }> = {
  not_saved: {
    title: 'Not saved for offline',
    detail: 'Save this trip so the plan, emergency numbers and rules work with no signal.',
  },
  downloading: { title: 'Saving…', detail: 'Fetching each part of your trip pack.' },
  saved: {
    title: 'Saved for offline',
    detail: 'The plan, help numbers and rules are on this device.',
  },
  update_available: {
    title: 'Update available',
    detail: 'This trip has changed since the pack was saved. Save again to bring it up to date.',
  },
  partial: {
    title: 'Partly saved',
    detail: 'Some parts could not be fetched. What did save is listed below and still works.',
  },
  storage_limit: {
    title: 'Not enough storage',
    detail: 'This device refused to store the pack. Freeing some space and trying again usually works.',
  },
};

export function OfflinePack({
  tripId,
  tripTitle,
  tripVersion,
  manifest,
}: {
  tripId: string;
  tripTitle: string;
  tripVersion: number;
  manifest: OfflineManifest;
}) {
  const [status, setStatus] = useState<PackStatus>('not_saved');
  const [results, setResults] = useState<ResourceResult[]>([]);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [supported, setSupported] = useState(true);

  // Register the worker and read back any pack already on this device.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setSupported(false);
      return;
    }

    // Registration itself happens in the root layout; this screen only needs
    // to know whether a worker is available to talk to.

    const onMessage = (event: MessageEvent): void => {
      const data = event.data as
        | { type: 'TRIP_PACK_PROGRESS'; tripId: string; results: ResourceResult[] }
        | { type: 'TRIP_PACK_DONE'; tripId: string; status: 'saved' | 'partial'; results: ResourceResult[] };

      if (data?.tripId !== tripId) return;

      if (data.type === 'TRIP_PACK_PROGRESS') setResults(data.results);

      if (data.type === 'TRIP_PACK_DONE') {
        setResults(data.results);
        setStatus(data.status);
        setSavedAt(new Date());
        try {
          localStorage.setItem(
            `dd.pack.${tripId}`,
            JSON.stringify({ version: tripVersion, savedAt: new Date().toISOString() }),
          );
        } catch {
          // Storage may be blocked; the pack itself is in the Cache API, which
          // is what actually matters offline.
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', onMessage);

    try {
      const raw = localStorage.getItem(`dd.pack.${tripId}`);
      if (raw !== null) {
        const stored = JSON.parse(raw) as { version: number; savedAt: string };
        setSavedAt(new Date(stored.savedAt));
        setStatus(stored.version < tripVersion ? 'update_available' : 'saved');
      }
    } catch {
      // A missing or unreadable record simply means "not saved yet".
    }

    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [tripId, tripVersion]);

  const save = async (): Promise<void> => {
    setStatus('downloading');
    setResults([]);

    try {
      // Ask for persistent storage so the browser is less likely to evict the
      // pack while the traveller is away from signal.
      await navigator.storage?.persist?.().catch(() => false);

      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({ type: 'CACHE_TRIP_PACK', manifest });
    } catch {
      setStatus('storage_limit');
    }
  };

  const remove = async (): Promise<void> => {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: 'REMOVE_TRIP_PACK', tripId });
    try {
      localStorage.removeItem(`dd.pack.${tripId}`);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
    setStatus('not_saved');
    setResults([]);
    setSavedAt(null);
  };

  const copy = STATUS_COPY[status];

  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-[14px]">
        <Link href={`/trips/${tripId}`} className="text-brand-primary underline underline-offset-2">
          {tripTitle}
        </Link>
      </nav>

      <h1 className="mt-2 text-[26px] lg:text-[32px]">Offline trip pack</h1>

      {!supported && (
        <p className="mt-3 rounded-xl border border-status-warn/40 bg-status-warn-surface p-3 text-[14px]">
          This browser cannot store an offline pack. Your plan still works normally with a
          connection, and the emergency numbers are shown on the Nearby Help screen.
        </p>
      )}

      <Card className="mt-4 p-4" data-testid="pack-status" data-status={status}>
        <h2 className="text-[21px]">{copy.title}</h2>
        <p className="mt-1 text-[16px] text-text-secondary">{copy.detail}</p>

        {savedAt !== null && status !== 'downloading' && (
          <p className="mt-2 text-[14px] text-text-secondary">
            Saved on {formatSourceDate(savedAt)} at{' '}
            {new Intl.DateTimeFormat('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Kolkata',
            }).format(savedAt)}
            .
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void save()} disabled={!supported || status === 'downloading'}>
            {status === 'saved' || status === 'partial' ? 'Save again' : 'Save for offline'}
          </Button>
          {(status === 'saved' || status === 'partial' || status === 'update_available') && (
            <Button variant="secondary" onClick={() => void remove()}>
              Remove from this device
            </Button>
          )}
        </div>
      </Card>

      <section className="mt-5">
        <h2 className="text-[21px]">What is included</h2>
        <ul className="mt-3 divide-y divide-border-subtle rounded-[16px] border border-border-subtle">
          {manifest.resources.map((resource) => {
            const result = results.find((entry) => entry.url === resource.url);

            return (
              <li key={resource.url} className="flex items-center gap-3 p-3 text-[14px]">
                <span className="min-w-0 flex-1">
                  {resource.label}
                  {!resource.required && (
                    <span className="ml-2 text-text-secondary">optional</span>
                  )}
                </span>
                <span
                  className={
                    result === undefined
                      ? 'text-text-secondary'
                      : result.ok
                        ? 'font-[650] text-status-good-text'
                        : 'font-[650] text-status-warn-text'
                  }
                >
                  {result === undefined
                    ? status === 'downloading'
                      ? 'Waiting'
                      : 'Not saved'
                    : result.ok
                      ? 'Saved'
                      : 'Could not save'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="mt-4 text-[14px] text-text-secondary">
        The pack expires on {formatSourceDate(new Date(manifest.expiresAt))}, after which it is
        worth saving again. Crowd and weather information is never included as current: offline,
        the app says plainly that it is unavailable.
      </p>
    </div>
  );
}
