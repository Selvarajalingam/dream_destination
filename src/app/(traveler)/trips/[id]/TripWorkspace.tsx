'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button, Card, SegmentedControl } from '@/components/ui/primitives';
import { BudgetMeter, PriceStateLabel, type BudgetView } from '@/components/patterns/BudgetMeter';
import { CrowdStatusBadge } from '@/components/patterns/CrowdStatusBadge';
import { ErrorState, LoadingState } from '@/components/states/states';
import { ApiProblemError, api } from '@/lib/api-client';
import { formatInr } from '@/shared/money';
import { formatDistance } from '@/shared/geo';
import { track } from '@/lib/track';

/**
 * Screen T09 — the itinerary workspace.
 *
 * Mobile uses a Timeline/Map segmented control; desktop a 45/55 split.
 * Reordering recalculates travel time and budget, AI optimization never moves
 * a locked item, and undo stays available after an AI change.
 */

const TripMap = dynamic(() => import('./TripMap').then((module) => module.TripMap), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-[16px] bg-surface-subtle" />,
});

type Item = {
  id: string;
  title: string;
  itemType: string;
  placeId: string | null;
  localBusinessId: string | null;
  startsAt: string | null;
  durationMinutes: number;
  lockedByUser: boolean;
  travelMinutes: number;
  travelMeters: number;
  expectedMinor: number;
  priceState: 'live' | 'partner' | 'historical' | 'manual';
};

type Day = { id: string; dayNumber: number; date: string | null; items: Item[] };

type Conflict = {
  kind: string;
  severity: string;
  message: string;
  suggestedAction: string;
  itemId: string | null;
};

type CrowdEntry = { band: string; label: string; explanation: string; isStale: boolean };

export type TripState = {
  trip: {
    id: string;
    title: string;
    status: string;
    version: number;
    destinationName: string | null;
    startDate: string | null;
  };
  days: Day[];
  budget: BudgetView | null;
  conflicts: Conflict[];
  crowdByPlaceId: Record<string, CrowdEntry>;
  places: Array<{ id: string; slug: string; name: string; lat: number; lng: number; category: string }>;
  businesses: Array<{
    id: string;
    slug: string;
    name: string;
    category: string;
    sponsored: boolean;
    priceBand: number | null;
  }>;
};

function formatTime(iso: string | null): string {
  if (iso === null) return '--:--';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

export function TripWorkspace({
  initial,
  autoGenerate,
}: {
  initial: TripState;
  autoGenerate: boolean;
}) {
  const [state, setState] = useState<TripState>(initial);
  const [view, setView] = useState<'timeline' | 'map'>('timeline');
  const [activeDay, setActiveDay] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<TripState[]>([]);

  const generated = useRef(false);

  const announce = (text: string): void => {
    const region = document.getElementById('live-region');
    if (region !== null) region.textContent = text;
  };

  const applyResult = (result: Partial<TripState>): void => {
    setState((current) => ({
      ...current,
      ...result,
      // The API returns items in their domain shape, with travel and price
      // nested. The workspace works in a flat shape, so everything arriving
      // from the API goes through one normaliser rather than each call site
      // remembering to convert.
      days: result.days === undefined ? current.days : normalizeDays(result.days),
      trip: { ...current.trip, ...(result.trip ?? {}) },
    }));

    if (result.budget != null) {
      announce(`Planned spend is now ${formatInr(result.budget.expectedTotalMinor)}`);
    }
  };

  // Generate on first arrival from the shortlist.
  useEffect(() => {
    if (!autoGenerate || generated.current || state.days.length > 0) return;
    generated.current = true;

    void (async () => {
      setBusy('generate');
      announce('Creating your plan');
      try {
        const result = await api.post<TripState>(
          `/api/v1/trips/${state.trip.id}/generate-itinerary`,
          {},
          { 'idempotency-key': `generate-${state.trip.id}` },
        );
        applyResult(result);
        announce('Your plan is ready');
      } catch (caught) {
        setError(describeError(caught));
      } finally {
        setBusy(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate]);

  const mutate = async (body: Record<string, unknown>, label: string): Promise<void> => {
    setBusy(label);
    setError(null);
    setUndoStack((stack) => [...stack.slice(-4), state]);

    // A toggle that does not move until a round trip completes reads as
    // broken. The lock is reflected immediately and reconciled from the
    // response; a failure restores the previous state below.
    if (body.action === 'lock') {
      setState((current) => ({
        ...current,
        days: current.days.map((day) => ({
          ...day,
          items: day.items.map((item) =>
            item.id === body.itemId ? { ...item, lockedByUser: body.locked === true } : item,
          ),
        })),
      }));
    }

    try {
      const result = await api.patch<TripState>(`/api/v1/trips/${state.trip.id}/itinerary`, {
        ...body,
        version: state.trip.version,
      });
      applyResult(result);
    } catch (caught) {
      setError(describeError(caught));
      // Roll back to exactly what was on screen before this attempt.
      setState(state);
      setUndoStack((stack) => stack.slice(0, -1));
    } finally {
      setBusy(null);
    }
  };

  const day = state.days[activeDay];

  if (busy === 'generate' && state.days.length === 0) {
    return (
      <div>
        <h1 className="text-[26px]">Creating your plan</h1>
        <p className="mt-1 text-[16px] text-text-secondary">
          Checking opening hours, travel time and your budget.
        </p>
        <div className="mt-4">
          <LoadingState label="Creating your plan" rows={4} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] lg:text-[32px]">{state.trip.destinationName ?? state.trip.title}</h1>
          <p data-testid="trip-duration" className="mt-1 text-[14px] text-text-secondary">
            {state.days.length} {state.days.length === 1 ? 'day' : 'days'}
            {state.trip.startDate !== null &&
              ` from ${new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(state.trip.startDate))}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/trips/${state.trip.id}/budget`}
            data-touch-target
            className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-4 text-[14px] font-[650]"
          >
            Budget planner
          </Link>
          <Link
            href={`/trips/${state.trip.id}/offline`}
            data-touch-target
            className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-4 text-[14px] font-[650]"
          >
            Save for offline
          </Link>
          <Link
            href={`/trips/${state.trip.id}/mode`}
            data-touch-target
            className="inline-flex min-h-[44px] items-center rounded-xl bg-brand-primary px-4 text-[14px] font-[650] text-white"
          >
            Start Trip Mode
          </Link>
        </div>
      </header>

      {error !== null && (
        <div className="mt-4">
          <ErrorState
            title="That change did not save"
            whatFailed={error}
            stillAvailable="Your plan is unchanged and nothing was lost."
            action={
              <Button variant="secondary" size="small" onClick={() => setError(null)}>
                Dismiss
              </Button>
            }
          />
        </div>
      )}

      {/* Sticky budget summary. Does not overlay content: it sits in flow. */}
      {state.budget !== null && (
        <Card className="mt-4 p-4">
          <BudgetMeter budget={state.budget} compact />
        </Card>
      )}

      {state.conflicts.length > 0 && (
        <ul className="mt-4 space-y-2">
          {state.conflicts.map((conflict, index) => (
            <li
              key={`${conflict.kind}-${index}`}
              role="alert"
              data-testid="conflict"
              data-kind={conflict.kind}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-status-warn/40 bg-status-warn-surface p-3 text-[14px]"
            >
              <span>{conflict.message}</span>
              <Button
                size="small"
                variant="secondary"
                onClick={() => {
                  if (conflict.kind === 'crowd_peak' && conflict.itemId !== null) {
                    const placeId = state.days
                      .flatMap((entry) => entry.items)
                      .find((entry) => entry.id === conflict.itemId)?.placeId;
                    if (placeId != null) track('crowd_alternative_accepted', { tripId: state.trip.id, placeId });
                  }
                  if (conflict.kind === 'budget_overrun') {
                    window.location.href = `/trips/${state.trip.id}/budget`;
                  } else if (day !== undefined) {
                    void mutate({ action: 'optimize', dayId: day.id }, 'optimize');
                  }
                }}
              >
                {shortAction(conflict)}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="lg:hidden">
          <SegmentedControl
            label="Itinerary view"
            value={view}
            onChange={(next) => setView(next as 'timeline' | 'map')}
            options={[
              { value: 'timeline', label: 'Timeline' },
              { value: 'map', label: 'Map' },
            ]}
          />
        </div>

        <nav aria-label="Days" className="flex flex-wrap gap-2">
          {state.days.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setActiveDay(index)}
              aria-current={index === activeDay ? 'true' : undefined}
              className={
                index === activeDay
                  ? 'min-h-[44px] rounded-xl bg-brand-deep px-4 text-[14px] font-[650] text-white'
                  : 'min-h-[44px] rounded-xl border border-border-subtle px-4 text-[14px] font-[650]'
              }
            >
              Day {entry.dayNumber}
            </button>
          ))}
        </nav>

        {day !== undefined && (
          <div className="ml-auto flex gap-2">
            <Button
              size="small"
              variant="secondary"
              onClick={() => void mutate({ action: 'optimize', dayId: day.id }, 'optimize')}
              disabled={busy !== null}
            >
              Optimize unlocked items
            </Button>
            {undoStack.length > 0 && (
              <Button
                size="small"
                variant="ghost"
                onClick={() => {
                  const previous = undoStack[undoStack.length - 1];
                  setState(previous);
                  setUndoStack((stack) => stack.slice(0, -1));
                  announce('Change undone');
                }}
              >
                Undo
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 gap-4 lg:grid lg:grid-cols-[45fr_55fr]">
        <section
          aria-label="Timeline"
          className={view === 'map' ? 'hidden min-w-0 lg:block' : 'block min-w-0'}
        >
          {day === undefined ? (
            <p className="text-[16px] text-text-secondary">This trip has no days yet.</p>
          ) : (
            <ol className="space-y-3">
              {day.items.map((item, index) => {
                const crowd = item.placeId === null ? null : state.crowdByPlaceId[item.placeId];
                const place = state.places.find((candidate) => candidate.id === item.placeId);

                return (
                  <li key={item.id}>
                    <Card
                      data-testid="itinerary-item"
                      data-item-id={item.id}
                      className="p-4"
                    >
                      {index > 0 && item.travelMinutes > 0 && (
                        <p
                          data-testid="travel-time"
                          className="mb-2 text-[13px] font-[650] text-text-secondary"
                        >
                          {item.travelMinutes} min travel · {formatDistance(item.travelMeters)}
                        </p>
                      )}

                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[14px] font-[650] text-brand-primary">
                            {formatTime(item.startsAt)}
                          </p>
                          <h3 className="text-[18px] font-[650]">
                            {place === undefined ? (
                              item.title
                            ) : (
                              <Link href={`/places/${place.slug}`} className="underline-offset-2 hover:underline">
                                {item.title}
                              </Link>
                            )}
                          </h3>
                          <p className="mt-1 text-[14px] text-text-secondary">
                            {item.durationMinutes} min
                            {item.itemType === 'meal' && ' · local business'}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-[16px] font-[650]">{formatInr(item.expectedMinor)}</p>
                          <PriceStateLabel state={item.priceState} />
                        </div>
                      </div>

                      {crowd != null && (
                        <div className="mt-3">
                          <CrowdStatusBadge
                            compact
                            status={{
                              band: crowd.band as 'comfortable' | 'moderate' | 'heavy' | 'unknown',
                              label: crowd.label,
                              source: 'forecast',
                              confidence: 0.6,
                              confidenceLabel: 'Medium confidence',
                              observedAt: null,
                              isStale: crowd.isStale,
                              explanation: crowd.explanation,
                            }}
                          />
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <label className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border-subtle px-3 text-[14px] font-[650]">
                          <input
                            type="checkbox"
                            role="switch"
                            aria-label={`Lock ${item.title}`}
                            checked={item.lockedByUser}
                            onChange={(event) =>
                              void mutate(
                                { action: 'lock', itemId: item.id, locked: event.target.checked },
                                'lock',
                              )
                            }
                            className="h-5 w-5"
                          />
                          {item.lockedByUser ? 'Locked' : 'Lock'}
                        </label>

                        <Button
                          size="small"
                          variant="secondary"
                          disabled={busy !== null || index === 0}
                          onClick={() =>
                            void mutate(
                              { action: 'reorder', dayId: day.id, fromIndex: index, toIndex: index - 1 },
                              'reorder',
                            )
                          }
                        >
                          Move up
                        </Button>
                        <Button
                          size="small"
                          variant="secondary"
                          disabled={busy !== null || index === day.items.length - 1}
                          onClick={() =>
                            void mutate(
                              { action: 'reorder', dayId: day.id, fromIndex: index, toIndex: index + 1 },
                              'reorder',
                            )
                          }
                        >
                          Move down
                        </Button>
                        <Button
                          size="small"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() => void mutate({ action: 'remove', itemId: item.id }, 'remove')}
                        >
                          Remove
                        </Button>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ol>
          )}

          <SupportLocal businesses={state.businesses} />
        </section>

        <section
          aria-label="Map"
          className={view === 'timeline' ? 'hidden min-w-0 lg:block' : 'block min-w-0'}
        >
          <TripMap
            places={state.places.filter((place) =>
              (day?.items ?? []).some((item) => item.placeId === place.id),
            )}
          />
        </section>
      </div>
    </div>
  );
}

function SupportLocal({ businesses }: { businesses: TripState['businesses'] }) {
  if (businesses.length === 0) return null;

  return (
    <section className="mt-6 rounded-[16px] bg-surface-warm p-4">
      <h2 className="text-[18px] font-[650]">Support local</h2>
      <p className="mt-1 text-[14px] text-text-secondary">
        Small businesses near this trip. Adding one puts it in your plan.
      </p>
      <ul className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {businesses.map((business) => (
          <li key={business.id} className="min-w-[200px] flex-1">
            <Link
              href={`/businesses/${business.slug}`}
              className="block rounded-xl border border-border-subtle bg-surface-base p-3"
            >
              <p className="text-[14px] font-[650]">{business.name}</p>
              <p className="text-[13px] capitalize text-text-secondary">
                {business.category.replace(/_/g, ' ')}
              </p>
              {business.sponsored && (
                <span
                  data-testid="sponsored-label"
                  className="mt-1 inline-block rounded-full bg-surface-subtle px-2 text-[13px] font-[650] text-text-secondary"
                >
                  Sponsored
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A short label for the conflict's action button. The full sentence lives in
 * the message beside it, so the button says what tapping does rather than
 * truncating the sentence mid-word.
 */
function shortAction(conflict: Conflict): string {
  switch (conflict.kind) {
    case 'budget_overrun':
      return 'Open budget planner';
    case 'crowd_peak':
      return 'Show a quieter time';
    case 'excessive_travel':
      return 'Reorder this day';
    case 'opening_hours':
      return 'Fix the timing';
    case 'accessibility_mismatch':
      return 'View access details';
    case 'weather_closure':
      return 'Check the source';
    default:
      return 'Review';
  }
}

function describeError(caught: unknown): string {
  return caught instanceof ApiProblemError
    ? caught.problem.detail ?? caught.problem.title
    : 'Something went wrong.';
}

/** Domain shape from the API, before it is flattened for the workspace. */
type ApiItem = Item & {
  travelFromPrevious?: { minutes: number; meters: number };
  priceEstimate?: { expectedMinor: number; priceState: Item['priceState'] };
};

type ApiDay = Omit<Day, 'items'> & { items: ApiItem[] };

function normalizeDays(days: ApiDay[] | Day[]): Day[] {
  return (days as ApiDay[]).map((day) => ({
    id: day.id,
    dayNumber: day.dayNumber,
    date: day.date,
    items: day.items.map((item) => ({
      id: item.id,
      title: item.title,
      itemType: item.itemType,
      placeId: item.placeId ?? null,
      localBusinessId: item.localBusinessId ?? null,
      startsAt: item.startsAt ?? null,
      durationMinutes: item.durationMinutes,
      lockedByUser: item.lockedByUser,
      travelMinutes: item.travelMinutes ?? item.travelFromPrevious?.minutes ?? 0,
      travelMeters: item.travelMeters ?? item.travelFromPrevious?.meters ?? 0,
      expectedMinor: item.expectedMinor ?? item.priceEstimate?.expectedMinor ?? 0,
      priceState: item.priceState ?? item.priceEstimate?.priceState ?? 'historical',
    })),
  }));
}
