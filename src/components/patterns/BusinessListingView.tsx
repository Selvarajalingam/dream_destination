import type { ReactNode } from 'react';
import { formatSourceDate } from '@/shared/time';

/**
 * A local business listing as travellers see it — PRD Part I T12, and the
 * B04 preview, which must "show exactly how travelers will see the listing".
 * Both render this one component, so the preview cannot drift from the page.
 *
 * The organic reason and any sponsored label are separate blocks, so they
 * cannot be confused. Hours carry the date the owner last confirmed them and
 * are never turned into an "open now" claim the product cannot verify.
 */

export type ListingView = {
  name: string;
  category: string | null;
  description: string | null;
  priceBand: number | null;
  ownerVerified: boolean;
  sponsored: boolean;
  hours: Record<string, [string, string] | null | undefined>;
  lastOwnerUpdateAt: Date | null;
  phone: string | null;
  addressText: string | null;
  accessibility: { stepFreeEntry?: boolean | null; accessibleToilet?: boolean | null; note?: string | null };
  paymentMethods: string[];
  services: string[];
  temporaryClosure: { from: string; until: string; note: string | null } | null;
  availabilityNote: string | null;
  photoIds: string[];
};

const PRICE_BAND_LABEL: Record<number, string> = { 1: 'Budget', 2: 'Moderate', 3: 'Higher', 4: 'Premium' };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function BusinessListingView({
  listing,
  today,
  missing = new Set(),
  actions,
  footer,
  headingLevel = 1,
}: {
  listing: ListingView;
  /** 2 when embedded in a page that has its own title, as the B04 preview is. */
  headingLevel?: 1 | 2;
  /** ISO date in India, for the closure notice. */
  today: string;
  /** Preview only: trust-critical fields still empty, marked where they would appear. */
  missing?: ReadonlySet<string>;
  actions: ReactNode;
  footer?: ReactNode;
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const Section = headingLevel === 1 ? 'h2' : 'h3';
  const closure = listing.temporaryClosure;
  const closureShown = closure !== null && closure.until >= today;
  const closedNow = closure !== null && closure.from <= today && closure.until >= today;

  return (
    <article>
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Heading className="text-[26px] lg:text-[32px]">{listing.name}</Heading>
          {listing.ownerVerified && (
            <span className="rounded-full border border-status-good/30 bg-status-good-surface px-3 py-1 text-[13px] font-[650] text-status-good-text">
              Owner verified
            </span>
          )}
        </div>
        <p className="mt-1 text-[14px] capitalize text-text-secondary">
          {listing.category === null ? missing.has('category') && <Missing field="category">No category</Missing> : listing.category.replace(/_/g, ' ')}
          {listing.priceBand !== null && ` · ${PRICE_BAND_LABEL[listing.priceBand]}`}
        </p>
      </header>

      {closureShown && (
        <p
          data-testid="temporary-closure"
          role="note"
          className="mt-4 rounded-xl border border-status-warn/40 bg-status-warn-surface p-3 text-[14px] font-[650] text-status-warn-text"
        >
          {closedNow
            ? `Temporarily closed until ${formatIsoDate(closure.until)}.`
            : `Closed from ${formatIsoDate(closure.from)} to ${formatIsoDate(closure.until)}.`}
          {closure.note !== null && <span className="block font-normal">{closure.note}</span>}
        </p>
      )}

      <p data-testid="organic-reason" className="mt-4 rounded-xl bg-surface-subtle p-3 text-[14px]">
        <span className="font-[650]">Why this is shown: </span>
        It is an active listing near this destination in the category you were browsing.
      </p>

      {listing.sponsored && (
        <p
          data-testid="sponsored-label"
          className="mt-2 rounded-xl border border-brand-saffron/40 bg-brand-saffron/10 p-3 text-[14px] font-[650]"
        >
          Sponsored — this business pays for placement. It does not affect any Dream Score or ranking of destinations.
        </p>
      )}

      {listing.photoIds.length > 0 && (
        <ul aria-label="Photos" className="mt-4 flex gap-2 overflow-x-auto">
          {listing.photoIds.map((id, index) => (
            <li key={id} className="shrink-0">
              {/* Served by an authorised route; next/image cannot optimise it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/v1/business/files/${id}`}
                alt={`${listing.name}, photo ${index + 1}`}
                className="h-40 w-56 rounded-[12px] object-cover"
                loading="lazy"
              />
            </li>
          ))}
        </ul>
      )}

      {listing.description !== null && <p className="mt-4 text-[16px] leading-relaxed">{listing.description}</p>}

      {listing.availabilityNote !== null && (
        <p data-testid="availability-note" className="mt-3 text-[14px]">
          <span className="font-[650]">From the owner: </span>
          {listing.availabilityNote}
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-[16px] border border-border-subtle p-4">
          <Section className="text-[18px] font-[650]">Opening hours</Section>
          {DAYS.every((day) => listing.hours[day] == null) && missing.has('hours') ? (
            <p className="mt-2 text-[14px]">
              <Missing field="hours">No opening hours added</Missing>
            </p>
          ) : (
            <dl className="mt-2 space-y-1 text-[14px]">
              {DAYS.map((day) => {
                const slot = listing.hours[day];
                return (
                  <div key={day} className="flex justify-between gap-3 border-t border-border-subtle pt-1">
                    <dt className="capitalize text-text-secondary">{day}</dt>
                    <dd className="font-[650]">{slot == null ? 'Closed' : `${slot[0]}–${slot[1]}`}</dd>
                  </div>
                );
              })}
            </dl>
          )}
          <p data-testid="hours-last-updated" className="mt-3 text-[14px] text-text-secondary">
            {listing.lastOwnerUpdateAt === null
              ? 'The owner has not confirmed these hours.'
              : `Confirmed by the owner on ${formatSourceDate(listing.lastOwnerUpdateAt)}.`}{' '}
            Call ahead if the timing matters.
          </p>
        </section>

        <section className="rounded-[16px] border border-border-subtle p-4">
          <Section className="text-[18px] font-[650]">Contact and access</Section>
          <dl className="mt-2 space-y-2 text-[14px]">
            {(listing.addressText !== null || missing.has('addressLine') || missing.has('location')) && (
              <Row label="Address">
                {listing.addressText ?? (missing.has('addressLine') ? <Missing field="addressLine">No address added</Missing> : null)}
                {missing.has('location') && (
                  <span className="block">
                    <Missing field="location">Map pin not placed</Missing>
                  </span>
                )}
              </Row>
            )}
            <Row label="Phone">
              {listing.phone === null ? (
                missing.has('phone') ? <Missing field="phone">No phone added</Missing> : 'Not listed'
              ) : (
                <a href={`tel:${listing.phone}`} className="text-brand-primary underline underline-offset-2">
                  {listing.phone}
                </a>
              )}
            </Row>
            <Row label="Step-free entry">
              {listing.accessibility.stepFreeEntry === true
                ? 'Yes'
                : listing.accessibility.stepFreeEntry === false
                  ? 'No'
                  : missing.has('accessibility')
                    ? <Missing field="accessibility">Not stated</Missing>
                    : 'Not confirmed'}
            </Row>
            {listing.accessibility.accessibleToilet != null && (
              <Row label="Accessible toilet">{listing.accessibility.accessibleToilet ? 'Yes' : 'No'}</Row>
            )}
            {listing.paymentMethods.length > 0 && (
              <Row label="Payment">
                <span className="capitalize">{listing.paymentMethods.map((method) => method.replace(/_/g, ' ')).join(', ')}</span>
              </Row>
            )}
            {listing.services.length > 0 && <Row label="Services">{listing.services.join(', ')}</Row>}
          </dl>
          {typeof listing.accessibility.note === 'string' && listing.accessibility.note !== '' && (
            <p className="mt-3 text-[14px] text-text-secondary">{listing.accessibility.note}</p>
          )}
        </section>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">{actions}</div>

      {footer}
    </article>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-t border-border-subtle pt-2">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-right font-[650]">{children}</dd>
    </div>
  );
}

/** Preview marker for a trust-critical gap, shown where travellers would look. */
function Missing({ field, children }: { field: string; children: ReactNode }) {
  return (
    <span
      data-testid={`missing-${field}`}
      className="rounded-md bg-status-danger-surface px-1.5 py-0.5 font-[650] text-status-danger-text"
    >
      {children}
    </span>
  );
}

function formatIsoDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
