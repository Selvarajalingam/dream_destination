'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { ApiProblemError, api, ensureSession } from '@/lib/api-client';

/**
 * "Add to trip" for a place (T10) and "Add to itinerary" for a local
 * business (T12) — PRD backlog E10-S04.
 *
 * The server chooses the feasible slot. The outcome says where the stop
 * landed, what it added in travel and what the budget now is, and offers
 * an undo that removes exactly what was added.
 */

type TripSummary = { id: string; title: string; status: string; destinationName: string | null };

type Added = {
  tripId: string;
  itemId: string;
  version: number;
  dayNumber: number;
  startsAt: string | null;
  addedTravelMinutes: number;
  plannedMinor: number | null;
};

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'choose'; trips: TripSummary[] }
  | { kind: 'no_trips' }
  | { kind: 'added'; added: Added }
  | { kind: 'undone' };

const OPEN_STATUSES = new Set(['draft', 'upcoming', 'active']);

const formatTime = (iso: string | null): string =>
  iso === null
    ? ''
    : new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

const formatInr = (minor: number): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(minor / 100);

export function AddToTrip({
  kind,
  targetId,
  label,
  className,
}: {
  kind: 'place' | 'business';
  targetId: string;
  label: string;
  className?: string;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const describe = (caught: unknown, fallback: string) =>
    caught instanceof ApiProblemError ? caught.problem.detail ?? caught.problem.title : fallback;

  const add = async (tripId: string): Promise<void> => {
    setState({ kind: 'loading' });
    setError(null);
    try {
      const result = await api.post<{
        added: { itemId: string; dayNumber: number; startsAt: string | null; addedTravelMinutes: number };
        trip: { version: number };
        budget: { expectedTotalMinor: number } | null;
      }>(`/api/v1/trips/${tripId}/itinerary/items`, { kind, id: targetId }, { 'idempotency-key': `add-${tripId}-${targetId}-${Date.now()}` });
      setState({
        kind: 'added',
        added: {
          tripId,
          itemId: result.added.itemId,
          version: result.trip.version,
          dayNumber: result.added.dayNumber,
          startsAt: result.added.startsAt,
          addedTravelMinutes: result.added.addedTravelMinutes,
          plannedMinor: result.budget?.expectedTotalMinor ?? null,
        },
      });
    } catch (caught) {
      setError(describe(caught, 'It could not be added.'));
      setState({ kind: 'idle' });
    }
  };

  const start = async (): Promise<void> => {
    setState({ kind: 'loading' });
    setError(null);
    try {
      await ensureSession();
      const { trips } = await api.get<{ trips: TripSummary[] }>('/api/v1/trips');
      const open = trips.filter((trip) => OPEN_STATUSES.has(trip.status));
      if (open.length === 0) setState({ kind: 'no_trips' });
      else if (open.length === 1) await add(open[0].id);
      else setState({ kind: 'choose', trips: open });
    } catch (caught) {
      setError(describe(caught, 'Your trips could not be loaded.'));
      setState({ kind: 'idle' });
    }
  };

  const undo = async (added: Added): Promise<void> => {
    setError(null);
    try {
      await api.patch(`/api/v1/trips/${added.tripId}/itinerary`, { action: 'remove', version: added.version, itemId: added.itemId });
      setState({ kind: 'undone' });
    } catch (caught) {
      setError(
        caught instanceof ApiProblemError && caught.problem.status === 409
          ? 'The plan changed since this was added. Remove it from the trip page instead.'
          : describe(caught, 'Undo failed.'),
      );
    }
  };

  return (
    <div className={className} data-testid="add-to-trip">
      {(state.kind === 'idle' || state.kind === 'loading' || state.kind === 'undone') && (
        <Button className="w-full sm:w-auto" disabled={state.kind === 'loading'} onClick={() => void start()}>
          {state.kind === 'loading' ? 'Finding a time…' : label}
        </Button>
      )}

      {state.kind === 'choose' && (
        <fieldset className="rounded-[16px] border border-border-subtle p-3">
          <legend className="px-1 text-[14px] font-[650]">Add it to which trip?</legend>
          <ul className="space-y-2">
            {state.trips.map((trip) => (
              <li key={trip.id}>
                <Button variant="secondary" className="w-full justify-start" onClick={() => void add(trip.id)}>
                  {trip.title}
                  {trip.destinationName !== null && <span className="ml-1 font-normal text-text-secondary">· {trip.destinationName}</span>}
                </Button>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      <div role="status" aria-live="polite">
        {state.kind === 'added' && (
          <div data-testid="added-to-trip" className="rounded-[16px] border border-status-good/30 bg-status-good-surface p-3 text-[14px]">
            <p className="font-[650] text-status-good-text">
              Added to day {state.added.dayNumber}
              {state.added.startsAt !== null && ` at ${formatTime(state.added.startsAt)}`}.
            </p>
            <p className="mt-1">
              {state.added.addedTravelMinutes > 0
                ? `Adds about ${state.added.addedTravelMinutes} minutes of travel that day.`
                : 'It fits on the way, with no extra travel.'}
              {state.added.plannedMinor !== null && ` The plan now comes to ${formatInr(state.added.plannedMinor)}.`}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="small" variant="secondary" onClick={() => void undo(state.added)}>
                Undo
              </Button>
              <Link
                href={`/trips/${state.added.tripId}`}
                data-touch-target
                className="inline-flex min-h-[44px] items-center rounded-xl px-3 text-[14px] font-[650] text-brand-primary underline underline-offset-2"
              >
                Open the trip
              </Link>
            </div>
          </div>
        )}
        {state.kind === 'undone' && <p className="mt-2 text-[14px]">Removed from your plan.</p>}
        {state.kind === 'no_trips' && (
          <p className="text-[14px]">
            You have no trip to add it to yet.{' '}
            <Link href="/dream-ai" className="font-[650] text-brand-primary underline underline-offset-2">
              Plan a trip
            </Link>{' '}
            first.
          </p>
        )}
      </div>

      {error !== null && (
        <p role="alert" className="mt-2 text-[14px] font-[650] text-status-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
