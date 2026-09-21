import Link from 'next/link';
import { tripsRepository } from '@/modules/trips/repository';
import { getSession } from '@/server/session';
import { Card } from '@/components/ui/primitives';
import { EmptyState } from '@/components/states/states';
import { formatInr } from '@/shared/money';
import { formatSourceDate } from '@/shared/time';

/**
 * Screen T14 — Trips Library.
 *
 * Sectioned by state, with a readiness hint and the next useful action on
 * each card. The empty state offers one action rather than decoration.
 */

export const dynamic = 'force-dynamic';

const SECTIONS = [
  { key: 'active', title: 'Active trip' },
  { key: 'upcoming', title: 'Upcoming trips' },
  { key: 'draft', title: 'Drafts' },
  { key: 'completed', title: 'Past trips' },
] as const;

export default async function TripsPage() {
  const session = await getSession();

  const trips = session?.userId == null ? [] : await tripsRepository.listForUser(session.userId);

  if (trips.length === 0) {
    return (
      <div>
        <h1 className="text-[26px] lg:text-[32px]">Your trips</h1>
        <div className="mt-5">
          <EmptyState
            title="No trips yet"
            reason="Trips you plan are saved here, so you can pick them up later and carry them offline."
            action={
              <Link
                href="/dream-ai"
                data-touch-target
                className="inline-flex min-h-[44px] items-center rounded-xl bg-brand-primary px-5 text-[16px] font-[650] text-white"
              >
                Plan your first trip
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">Your trips</h1>

      <div className="mt-5 space-y-6">
        {SECTIONS.map((section) => {
          const entries = trips.filter((trip) => trip.status === section.key);
          if (entries.length === 0) return null;

          return (
            <section key={section.key}>
              <h2 className="text-[21px]">{section.title}</h2>
              <ul className="mt-3 space-y-3">
                {entries.map((trip) => (
                  <li key={trip.id}>
                    <Card className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/trips/${trip.id}`}
                            className="text-[18px] font-[650] underline-offset-2 hover:underline"
                          >
                            {trip.destinationName ?? trip.title}
                          </Link>
                          <p className="mt-1 text-[14px] text-text-secondary">
                            {trip.startDate === null
                              ? 'No dates set'
                              : `${formatSourceDate(trip.startDate)}${
                                  trip.endDate === null ? '' : ` – ${formatSourceDate(trip.endDate)}`
                                }`}
                          </p>
                          {trip.totalBudgetInr !== null && (
                            <p className="text-[14px] text-text-secondary">
                              Budget {formatInr(trip.totalBudgetInr * 100)}
                            </p>
                          )}
                        </div>

                        <span className="rounded-full bg-surface-subtle px-3 py-1 text-[13px] font-[650] capitalize text-text-secondary">
                          {trip.status}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={`/trips/${trip.id}`}
                          data-touch-target
                          className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-4 text-[14px] font-[650]"
                        >
                          Open plan
                        </Link>
                        <Link
                          href={`/trips/${trip.id}/offline`}
                          data-touch-target
                          className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-4 text-[14px] font-[650]"
                        >
                          Offline pack
                        </Link>
                        {trip.status === 'active' && (
                          <Link
                            href={`/trips/${trip.id}/mode`}
                            data-touch-target
                            className="inline-flex min-h-[44px] items-center rounded-xl bg-brand-primary px-4 text-[14px] font-[650] text-white"
                          >
                            Trip Mode
                          </Link>
                        )}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
