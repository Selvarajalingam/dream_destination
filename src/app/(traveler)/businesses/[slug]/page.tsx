import Link from 'next/link';
import { notFound } from 'next/navigation';
import { businessRepository } from '@/modules/businesses/repository';
import { Button, Card } from '@/components/ui/primitives';
import { ReportConcern } from '@/components/patterns/ReportConcern';
import { formatSourceDate } from '@/shared/time';

/**
 * Screen T12 — Local Business Detail.
 *
 * The organic reason for showing a listing and any sponsored label are
 * visually and structurally separate, so they cannot be confused. Hours are
 * shown with the date the owner last confirmed them and are never rendered as
 * an "open now" claim, because the product has no way to verify that.
 */

export const dynamic = 'force-dynamic';

const PRICE_BAND_LABEL: Record<number, string> = {
  1: 'Budget',
  2: 'Moderate',
  3: 'Higher',
  4: 'Premium',
};

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const business = await businessRepository.findBySlug(slug);
  if (business === null) notFound();

  const hours = business.operatingHours as Record<string, [string, string] | null>;

  return (
    <article>
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[26px] lg:text-[32px]">{business.name}</h1>
          {business.ownerVerified && (
            <span className="rounded-full border border-status-good/30 bg-status-good-surface px-3 py-1 text-[13px] font-[650] text-status-good-text">
              Owner verified
            </span>
          )}
        </div>
        <p className="mt-1 text-[14px] capitalize text-text-secondary">
          {business.category.replace(/_/g, ' ')}
          {business.priceBand !== null && ` · ${PRICE_BAND_LABEL[business.priceBand]}`}
        </p>
      </header>

      {/*
        The organic reason and the sponsored label are separate blocks with
        different treatments, per T12's acceptance criteria.
      */}
      <p data-testid="organic-reason" className="mt-4 rounded-xl bg-surface-subtle p-3 text-[14px]">
        <span className="font-[650]">Why this is shown: </span>
        It is an active listing near this destination in the category you were browsing.
      </p>

      {business.sponsored && (
        <p
          data-testid="sponsored-label"
          className="mt-2 rounded-xl border border-brand-saffron/40 bg-brand-saffron/10 p-3 text-[14px] font-[650]"
        >
          Sponsored — this business pays for placement. It does not affect any Dream Score or
          ranking of destinations.
        </p>
      )}

      {business.description !== null && (
        <p className="mt-4 text-[16px] leading-relaxed">{business.description}</p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-[18px] font-[650]">Opening hours</h2>
          <dl className="mt-2 space-y-1 text-[14px]">
            {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((day) => (
              <div key={day} className="flex justify-between gap-3 border-t border-border-subtle pt-1">
                <dt className="capitalize text-text-secondary">{day}</dt>
                <dd className="font-[650]">
                  {hours[day] == null ? 'Closed' : `${hours[day]![0]}–${hours[day]![1]}`}
                </dd>
              </div>
            ))}
          </dl>

          {/*
            No "open now" claim: the product cannot verify that. It shows when
            the owner last confirmed these hours instead.
          */}
          <p data-testid="hours-last-updated" className="mt-3 text-[14px] text-text-secondary">
            {business.lastOwnerUpdateAt === null
              ? 'The owner has not confirmed these hours.'
              : `Confirmed by the owner on ${formatSourceDate(business.lastOwnerUpdateAt)}.`}{' '}
            Call ahead if the timing matters.
          </p>
        </Card>

        <Card className="p-4">
          <h2 className="text-[18px] font-[650]">Contact and access</h2>
          <dl className="mt-2 space-y-2 text-[14px]">
            {business.phone !== null && (
              <div className="flex justify-between gap-3 border-t border-border-subtle pt-2">
                <dt className="text-text-secondary">Phone</dt>
                <dd className="font-[650]">
                  <a href={`tel:${business.phone}`} className="text-brand-primary underline underline-offset-2">
                    {business.phone}
                  </a>
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-border-subtle pt-2">
              <dt className="text-text-secondary">Step-free entry</dt>
              <dd className="font-[650]">
                {(business.accessibility as Record<string, unknown>).stepFreeEntry === true
                  ? 'Yes'
                  : 'Not confirmed'}
              </dd>
            </div>
            {business.paymentMethods !== null && business.paymentMethods.length > 0 && (
              <div className="flex justify-between gap-3 border-t border-border-subtle pt-2">
                <dt className="text-text-secondary">Payment</dt>
                <dd className="text-right font-[650] capitalize">
                  {business.paymentMethods.map((method) => method.replace(/_/g, ' ')).join(', ')}
                </dd>
              </div>
            )}
          </dl>

          {typeof (business.accessibility as Record<string, unknown>).note === 'string' && (
            <p className="mt-3 text-[14px] text-text-secondary">
              {(business.accessibility as Record<string, string>).note}
            </p>
          )}
        </Card>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button>Add to itinerary</Button>
        {business.phone !== null && (
          <a
            href={`tel:${business.phone}`}
            data-touch-target
            className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-4 text-[14px] font-[650]"
          >
            Call
          </a>
        )}
        <a
          href={`https://www.openstreetmap.org/?mlat=${business.lat}&mlon=${business.lng}#map=16/${business.lat}/${business.lng}`}
          target="_blank"
          rel="noreferrer noopener"
          data-touch-target
          className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-4 text-[14px] font-[650]"
        >
          Open in maps
        </a>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className="text-[14px] text-text-secondary">
          Details are provided by the business owner and checked at onboarding. Something wrong?
        </p>
        <ReportConcern entityType="business" slug={business.slug} name={business.name} label="Report an issue" />
      </div>
    </article>
  );
}
