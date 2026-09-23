import Link from 'next/link';
import { notFound } from 'next/navigation';
import { bookingsService } from '@/modules/bookings/service';
import {
  HANDOFF_NOTICE,
  STATE_EXPLANATION,
  STATE_LABEL,
  TAXES_LABEL,
  priceView,
  type BookingKind,
} from '@/modules/bookings/domain/booking';
import { Card } from '@/components/ui/primitives';
import { getSession } from '@/server/session';
import { isUuid } from '@/server/authorize';
import { sql } from '@/platform/db/client';
import { BookingActions, HandoffButton } from './BookingActions';

/**
 * Screen T13 — Booking Options.
 *
 * "Support comparison and provider handoff without implying that Dream
 * Destination completed the transaction." Every price carries its currency
 * and when it was checked, taxes and cancellation say what the provider did
 * and did not state, and leaving is announced before it happens.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Booking options' };

const KINDS: Array<{ key: BookingKind; label: string }> = [
  { key: 'stay', label: 'Places to stay' },
  { key: 'transport', label: 'Getting there' },
];

const formatInr = (minor: number, currency: string): string =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);

const minutesAgo = (at: Date): string => {
  const minutes = Math.max(0, Math.round((Date.now() - at.getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
};

export default async function BookingOptionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { id } = await params;
  const { kind: requested } = await searchParams;
  if (!isUuid(id)) notFound();

  // Trips are private, so this page is only rendered for their owner.
  const session = await getSession();
  const [owned] = await sql<{ id: string }[]>`
    SELECT id FROM trips WHERE id = ${id} AND owner_user_id IS NOT DISTINCT FROM ${session?.userId ?? null}
  `;
  if (owned === undefined) notFound();

  const kind: BookingKind = requested === 'transport' ? 'transport' : 'stay';
  const now = new Date();
  const options = await bookingsService.options(id, kind, now);

  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-[14px]">
        <Link href={`/trips/${id}`} className="text-brand-primary underline underline-offset-2">
          Back to the trip
        </Link>
      </nav>

      <h1 className="mt-2 text-[26px] lg:text-[32px]">Booking options</h1>
      <p className="mt-2 text-[16px] text-text-secondary">
        Dream Destination does not take bookings or payments. It compares what providers offer and hands you to them.
      </p>

      {options.isSandbox && (
        <p data-testid="sandbox-label" className="mt-3 rounded-xl bg-status-warn-surface p-3 text-[14px] font-[650] text-status-warn-text">
          These are sandbox offers for the demonstration, not real availability from any business.
        </p>
      )}

      <nav aria-label="Booking kind" className="mt-4 flex gap-2">
        {KINDS.map((entry) => (
          <Link
            key={entry.key}
            href={`/trips/${id}/bookings?kind=${entry.key}`}
            aria-current={entry.key === kind ? 'page' : undefined}
            data-touch-target
            className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-[14px] font-[650] ${
              entry.key === kind ? 'bg-brand-deep text-white' : 'border border-border-subtle'
            }`}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      <p className="mt-4 rounded-xl bg-surface-subtle p-3 text-[14px]" data-testid="handoff-notice">
        {HANDOFF_NOTICE}
      </p>

      <ul className="mt-4 space-y-3">
        {options.offers.map((offer) => {
          const view = priceView(offer, now);
          return (
            <li key={offer.providerId}>
              <Card className="p-4" data-testid="offer">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[18px] font-[650]">{offer.title}</h2>
                  {view.showable && (
                    <p className="text-[21px] font-[750]" data-testid="offer-price">
                      {formatInr(view.amountMinor, view.currency)}
                    </p>
                  )}
                </div>
                <p className="mt-1 text-[14px] text-text-secondary">{offer.providerName}</p>

                {view.showable && (
                  <p data-testid="price-state" className={`mt-2 text-[14px] ${view.stale ? 'font-[650] text-status-warn-text' : 'text-text-secondary'}`}>
                    {view.stale
                      ? `Checked ${minutesAgo(view.checkedAt)} — the provider may have changed it since.`
                      : `Price checked with the provider ${minutesAgo(view.checkedAt)}.`}
                  </p>
                )}

                <dl className="mt-3 space-y-1 text-[14px]">
                  <div className="flex flex-wrap justify-between gap-2 border-t border-border-subtle pt-1">
                    <dt className="text-text-secondary">Taxes and fees</dt>
                    <dd data-testid="taxes" className="text-right font-[650]">
                      {TAXES_LABEL[offer.taxesAndFees]}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 border-t border-border-subtle pt-1">
                    <dt className="text-text-secondary">Cancellation</dt>
                    <dd data-testid="cancellation" className="text-right font-[650]">
                      {offer.cancellationInfo ?? 'Not stated by the provider'}
                    </dd>
                  </div>
                  {offer.attributes.length > 0 && (
                    <div className="flex flex-wrap justify-between gap-2 border-t border-border-subtle pt-1">
                      <dt className="text-text-secondary">Includes</dt>
                      <dd className="text-right">{offer.attributes.join(', ')}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-3">
                  <HandoffButton tripId={id} kind={kind} providerId={offer.providerId} providerName={offer.providerName} />
                </div>

                <p className="mt-2 text-[13px] text-text-secondary">{offer.attribution}</p>
              </Card>
            </li>
          );
        })}
      </ul>

      {options.withheld.length > 0 && (
        <section className="mt-4" aria-labelledby="withheld-heading" data-testid="withheld">
          <h2 id="withheld-heading" className="text-[16px] font-[650]">
            Not shown
          </h2>
          <ul className="mt-2 space-y-1 text-[14px] text-text-secondary">
            {options.withheld.map((entry) => (
              <li key={entry.title}>
                {entry.title}: {entry.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      {options.bookings.length > 0 && (
        <section className="mt-8" aria-labelledby="yours-heading">
          <h2 id="yours-heading" className="text-[21px]">
            What you have started
          </h2>
          <ul className="mt-3 space-y-3">
            {options.bookings.map((booking) => (
              <li key={booking.id}>
                <Card className="p-4" data-testid="trip-booking" data-state={booking.state}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[16px] font-[650]">{booking.offer.title}</h3>
                    <span className="rounded-full bg-surface-subtle px-3 py-1 text-[13px] font-[650]" data-testid="booking-state">
                      {STATE_LABEL[booking.state]}
                    </span>
                  </div>
                  <p className="mt-1 text-[14px] text-text-secondary">{STATE_EXPLANATION[booking.state]}</p>
                  {booking.reference !== null && (
                    <p className="mt-2 text-[14px]">
                      <span className="font-[650]">Your reference: </span>
                      {booking.reference}
                    </p>
                  )}
                  <BookingActions tripId={id} bookingId={booking.id} state={booking.state} hasReference={booking.reference !== null} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
