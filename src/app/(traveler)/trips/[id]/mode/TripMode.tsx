'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/primitives';
import { CrowdStatusBadge } from '@/components/patterns/CrowdStatusBadge';
import { OfflineBanner, StaleNote } from '@/components/states/states';

/**
 * Trip Mode — Screens T16 (Next) and T17 (Alerts).
 *
 * Navigation is replaced by Next / Map / Alerts / Help. The current or next
 * activity is the first thing on the screen and nothing promotional sits above
 * it. Decorative motion is avoided throughout.
 */

type ModeItem = {
  id: string;
  title: string;
  dayNumber: number;
  startsAt: string;
  durationMinutes: number;
  travelMinutes: number;
  lat: number | null;
  lng: number | null;
  crowdLabel: string | null;
  crowdBand: string | null;
  crowdExplanation: string | null;
};

type ModeConflict = {
  kind: string;
  severity: string;
  message: string;
  suggestedAction: string;
};

/** PRD Part I T17 alert priority, lowest number first. */
const ALERT_PRIORITY: Record<string, number> = {
  weather_closure: 1,
  accessibility_mismatch: 2,
  opening_hours: 3,
  budget_overrun: 3,
  crowd_peak: 4,
  excessive_travel: 4,
};

export function TripMode({
  tripId,
  tripTitle,
  status,
  items,
  conflicts,
}: {
  tripId: string;
  tripTitle: string;
  status: string;
  items: ModeItem[];
  conflicts: ModeConflict[];
}) {
  const [tab, setTab] = useState<'next' | 'alerts'>('next');
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    setOnline(navigator.onLine);

    const goOnline = (): void => setOnline(true);
    const goOffline = (): void => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // A minute is frequent enough for a countdown and cheap enough to run
    // while the screen is open.
    const timer = setInterval(() => setNow(new Date()), 60_000);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(timer);
    };
  }, []);

  // Before hydration there is no "now", so render the first item rather than
  // guessing and flashing a different one.
  const current =
    now === null
      ? items[0]
      : items.find((item) => new Date(item.startsAt).getTime() + item.durationMinutes * 60_000 > now.getTime()) ??
        items[items.length - 1];

  const currentIndex = current === undefined ? -1 : items.indexOf(current);
  const upcoming = currentIndex < 0 ? [] : items.slice(currentIndex + 1, currentIndex + 3);

  const sortedAlerts = [...conflicts].sort(
    (a, b) => (ALERT_PRIORITY[a.kind] ?? 9) - (ALERT_PRIORITY[b.kind] ?? 9),
  );

  return (
    // PRD Part I §3.2: Trip Mode replaces the standard bottom navigation
    // rather than sitting on top of it. globals.css hides the main nav while
    // this attribute is present anywhere on the page.
    <div data-trip-mode="active">
      {!online && <OfflineBanner lastSyncedAt={now} />}

      <header className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[21px] font-[700]">{tripTitle}</h1>
          <p className="text-[14px] text-text-secondary">
            {status === 'active' ? 'Trip in progress' : 'Trip Mode preview'}
          </p>
        </div>
        <Link
          href={`/trips/${tripId}`}
          className="text-[14px] font-[650] text-brand-primary underline underline-offset-2"
        >
          Exit Trip Mode
        </Link>
      </header>

      {!online && now !== null && <StaleNote className="mt-2" savedAt={now} />}

      <div role="tablist" aria-label="Trip Mode" className="mt-3 flex gap-2">
        {(['next', 'alerts'] as const).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={
              tab === key
                ? 'min-h-[44px] rounded-xl bg-brand-deep px-4 text-[14px] font-[650] text-white'
                : 'min-h-[44px] rounded-xl border border-border-subtle px-4 text-[14px] font-[650]'
            }
          >
            {key === 'next' ? 'Next' : `Alerts${sortedAlerts.length > 0 ? ` (${sortedAlerts.length})` : ''}`}
          </button>
        ))}
      </div>

      {tab === 'next' && (
        <div className="mt-4">
          {current === undefined ? (
            <Card className="p-5">
              <h2 className="text-[21px]">Nothing scheduled</h2>
              <p className="mt-1 text-[16px] text-text-secondary">
                This trip has no timed items yet.
              </p>
            </Card>
          ) : (
            <>
              {/* The next action, first on the screen. */}
              <Card data-testid="next-activity" className="p-5">
                <p className="text-[14px] font-[650] text-brand-primary">
                  Day {current.dayNumber} · {formatTime(current.startsAt)}
                </p>
                <h2 className="mt-1 text-[26px]">{current.title}</h2>

                {now !== null && <Countdown startsAt={current.startsAt} now={now} />}

                <p className="mt-2 text-[14px] text-text-secondary">
                  {current.durationMinutes} minutes here
                  {current.travelMinutes > 0 && ` · ${current.travelMinutes} min travel to get here`}
                </p>

                {current.lat !== null && current.lng !== null && (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${current.lat}&mlon=${current.lng}#map=16/${current.lat}/${current.lng}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    data-touch-target
                    className="mt-4 inline-flex min-h-[52px] w-full items-center justify-center rounded-[16px] bg-brand-primary text-[16px] font-[700] text-white"
                  >
                    Navigate
                  </a>
                )}
              </Card>

              {current.crowdLabel !== null && (
                <div className="mt-3">
                  <CrowdStatusBadge
                    status={{
                      band: (current.crowdBand ?? 'unknown') as 'comfortable' | 'moderate' | 'heavy' | 'unknown',
                      label: current.crowdLabel,
                      source: 'forecast',
                      confidence: 0.6,
                      confidenceLabel: 'Medium confidence',
                      observedAt: null,
                      isStale: !online,
                      explanation: online
                        ? current.crowdExplanation ?? ''
                        : 'Live crowd and weather unavailable while offline.',
                    }}
                  />
                </div>
              )}

              {upcoming.length > 0 && (
                <section className="mt-5">
                  <h3 className="text-[18px] font-[650]">Then</h3>
                  <ul className="mt-2 space-y-2">
                    {upcoming.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle p-3 text-[14px]"
                      >
                        <span className="font-[650]">{item.title}</span>
                        <span className="text-text-secondary">{formatTime(item.startsAt)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'alerts' && (
        <div className="mt-4">
          {sortedAlerts.length === 0 ? (
            <Card className="p-5">
              <h2 className="text-[21px]">No alerts</h2>
              <p className="mt-1 text-[16px] text-text-secondary">
                Nothing needs your attention on this trip right now.
              </p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {sortedAlerts.map((alert, index) => (
                <li
                  key={`${alert.kind}-${index}`}
                  data-testid="alert"
                  data-priority={ALERT_PRIORITY[alert.kind] ?? 9}
                  className="rounded-xl border border-status-warn/40 bg-status-warn/10 p-3"
                >
                  <p className="text-[14px]">{alert.message}</p>
                  <p className="mt-1 text-[13px] text-text-secondary">{alert.suggestedAction}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Nearby Help is persistent throughout Trip Mode. */}
      <nav
        aria-label="Trip Mode"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface-base pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-2xl">
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setTab('next')}
              className="flex min-h-[60px] w-full flex-col items-center justify-center text-[13px] font-[650]"
            >
              Next
            </button>
          </li>
          <li className="flex-1">
            <Link
              href={`/trips/${tripId}`}
              data-touch-target
              className="flex min-h-[60px] flex-col items-center justify-center text-[13px] font-[650]"
            >
              Map
            </Link>
          </li>
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setTab('alerts')}
              className="flex min-h-[60px] w-full flex-col items-center justify-center text-[13px] font-[650]"
            >
              Alerts
            </button>
          </li>
          <li className="flex-1">
            <Link
              href="/help"
              data-touch-target
              className="flex min-h-[60px] flex-col items-center justify-center bg-status-danger/10 text-[13px] font-[700] text-status-danger"
            >
              Help
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}

function Countdown({ startsAt, now }: { startsAt: string; now: Date }) {
  const minutes = Math.round((new Date(startsAt).getTime() - now.getTime()) / 60_000);

  if (minutes <= 0) {
    return <p className="mt-2 text-[16px] font-[650] text-status-good">Happening now</p>;
  }

  if (minutes < 60) {
    return (
      <p className="mt-2 text-[16px] font-[650]">
        Starts in {minutes} {minutes === 1 ? 'minute' : 'minutes'}
      </p>
    );
  }

  const hours = Math.round((minutes / 60) * 10) / 10;
  return <p className="mt-2 text-[16px] font-[650]">Starts in about {hours} hours</p>;
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}
