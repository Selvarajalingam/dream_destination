import Link from 'next/link';
import { notFound } from 'next/navigation';
import { catalogRepository } from '@/modules/catalog/repository';
import { crowdService } from '@/modules/crowd/service';
import { verificationRepository } from '@/modules/verification/repository';
import { resolveVerificationDisplay } from '@/modules/verification/domain/gate';
import { rulesRepository } from '@/modules/rules/repository';
import { helpRepository, NATIONAL_EMERGENCY_NUMBER } from '@/modules/help/repository';
import { CrowdStatusBadge } from '@/components/patterns/CrowdStatusBadge';
import {
  DreamVerifiedBadge,
  KnownLimitations,
  SourceFreshnessLabel,
} from '@/components/patterns/trust';
import { Button, Card } from '@/components/ui/primitives';
import { formatInrRange } from '@/shared/money';
import { formatDistance } from '@/shared/geo';

/**
 * Screens T10 and T11 — Activity or Place Detail, with the verification
 * detail folded in.
 *
 * Known limitations appear before the visit action, which is the warning
 * pattern T11 requires. Every trust-sensitive claim carries its source and
 * date.
 */

export const dynamic = 'force-dynamic';

export default async function PlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const place = await catalogRepository.findPlaceBySlug(slug);
  if (place === null) notFound();

  const [crowd, verification, rules, help, sources, stories] = await Promise.all([
    crowdService.getStatus(place.id),
    verificationRepository.findForPlace(place.id),
    rulesRepository.findForPlace(place.id),
    helpRepository.findNearby({ lat: place.lat, lng: place.lng }, 30_000, ['hospital', 'police', 'pharmacy'], 3),
    catalogRepository.findSourcesForPlace(place.id),
    catalogRepository.listStoriesForPlace(place.id),
  ]);

  const display = resolveVerificationDisplay(verification, new Date());
  const hoursSource = sources.find((source) => source.fieldScope === 'hours') ?? sources[0];
  const accessibility = place.accessibility as Record<string, unknown>;

  return (
    <article>
      <nav aria-label="Breadcrumb" className="text-[14px]">
        <Link href="/explore" className="text-brand-primary underline underline-offset-2">
          Explore
        </Link>
      </nav>

      <header className="mt-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] lg:text-[32px]">{place.name}</h1>
          <DreamVerifiedBadge
            display={{
              showBadge: display.showBadge,
              status: display.status,
              verifiedAt: display.verifiedAt?.toISOString() ?? null,
              nextReviewAt: display.nextReviewAt?.toISOString() ?? null,
              knownLimitations: display.knownLimitations,
              reviewerType: display.reviewerType,
              checklistGroups: display.checklistGroups,
            }}
          />
        </div>
        <p className="mt-1 text-[14px] capitalize text-text-secondary">
          {place.category.replace(/_/g, ' ')}
          {place.isHiddenGem && ' · Hidden gem'}
        </p>
      </header>

      {place.description !== null && (
        <p className="mt-3 text-[16px] leading-relaxed">{place.description}</p>
      )}

      {/*
        T11: known limitations must appear before the visit action. This block
        deliberately sits above the itinerary button below.
      */}
      <div className="mt-5">
        <KnownLimitations limitations={display.knownLimitations} />
      </div>

      {display.status === 'expired' && (
        <p
          role="status"
          className="mt-3 rounded-xl border border-status-warn/40 bg-status-warn-surface p-3 text-[14px] font-[650] text-status-warn-text"
        >
          This place&apos;s verification has passed its review date, so the Dream Verified badge is
          not shown. The recorded limitations above still apply.
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-[18px] font-[650]">Crowd outlook</h2>
          <div className="mt-2">
            <CrowdStatusBadge status={{ ...crowd, observedAt: crowd.observedAt?.toISOString() ?? null }} />
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-[18px] font-[650]">Visiting</h2>
          <dl className="mt-2 space-y-2 text-[14px]">
            <Row label="Typical visit" value={`${place.expectedVisitMinutes ?? 60} minutes`} />
            <Row
              label="Entry"
              value={
                (place.priceLowInr ?? 0) === 0 && (place.priceHighInr ?? 0) === 0
                  ? 'No entry fee recorded'
                  : `${formatInrRange((place.priceLowInr ?? 0) * 100, (place.priceHighInr ?? 0) * 100)} per person`
              }
            />
            <Row label="Opening hours" value={describeHours(place.operatingHours)} />
            <Row
              label="Step-free entry"
              value={accessibility.stepFreeEntry === true ? 'Yes' : 'No'}
            />
          </dl>
          {hoursSource !== undefined && (
            <SourceFreshnessLabel
              className="mt-3"
              source={{
                name: hoursSource.name,
                issuingAuthority: hoursSource.issuingAuthority,
                verifiedAt: hoursSource.verifiedAt?.toISOString() ?? null,
                reviewDueAt: hoursSource.reviewDueAt?.toISOString() ?? null,
                url: hoursSource.sourceUrl,
              }}
            />
          )}
        </Card>
      </div>

      {typeof accessibility.note === 'string' && (
        <p className="mt-4 rounded-xl bg-surface-subtle p-3 text-[14px]">
          <span className="font-[650]">Access: </span>
          {accessibility.note}
        </p>
      )}

      {rules.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[21px]">Know before you visit</h2>
          <ul className="mt-3 space-y-3">
            {rules.slice(0, 3).map((rule) => (
              <li key={rule.id}>
                <Card data-testid="rule-card" className="p-4">
                  <h3 className="text-[16px] font-[650]">{rule.title}</h3>
                  <p className="mt-1 text-[14px]">{rule.plainLanguageSummary}</p>
                  <SourceFreshnessLabel
                    className="mt-2"
                    source={{
                      name: rule.sourceName,
                      issuingAuthority: rule.issuingAuthority,
                      verifiedAt: rule.verifiedAt.toISOString(),
                      reviewDueAt: rule.reviewDueAt.toISOString(),
                      url: rule.sourceUrl,
                    }}
                  />
                </Card>
              </li>
            ))}
          </ul>
          <Link
            href={`/places/${place.slug}/rules`}
            className="mt-3 inline-block text-[14px] font-[650] text-brand-primary underline underline-offset-2"
          >
            All {rules.length} rules for this place
          </Link>
        </section>
      )}

      {stories.length > 0 && (
        <section className="mt-6 rounded-[16px] bg-surface-warm p-4">
          <h2 className="text-[21px]">{stories[0].title}</h2>
          <p className="mt-2 text-[16px] leading-relaxed">{stories[0].shortText}</p>
          <Link
            href={`/places/${place.slug}/story`}
            className="mt-3 inline-block text-[14px] font-[650] text-brand-primary underline underline-offset-2"
          >
            Read the full story
          </Link>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-[21px]">Nearby help</h2>
        <ul className="mt-3 space-y-2">
          {help.map((facility) => (
            <li
              key={facility.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle p-3 text-[14px]"
            >
              <span>
                <span className="font-[650]">{facility.name}</span>
                <span className="ml-2 capitalize text-text-secondary">
                  {facility.facilityType.replace(/_/g, ' ')} · {formatDistance(facility.distanceMeters)}
                </span>
              </span>
              {facility.phone !== null && (
                <a
                  href={`tel:${facility.phone}`}
                  data-touch-target
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-3 font-[650]"
                >
                  Call
                </a>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[14px] text-text-secondary">
          Emergency number {NATIONAL_EMERGENCY_NUMBER}. Live availability is unknown; call ahead
          where you can.
        </p>
      </section>

      {/* The visit action sits after the limitations, never before them. */}
      <div className="sticky bottom-[80px] mt-6 rounded-[16px] border border-border-subtle bg-surface-base p-3 elevation-2">
        <Button className="w-full">Add to trip</Button>
      </div>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-border-subtle pt-2">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-right font-[650]">{value}</dd>
    </div>
  );
}

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_NAMES: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

/** Collapses a seven-day map into a readable line, naming any closed day. */
function describeHours(hours: Record<string, [string, string] | null>): string {
  const open = DAY_ORDER.filter((day) => hours[day] != null);
  if (open.length === 0) return 'Not recorded';

  const closed = DAY_ORDER.filter((day) => hours[day] == null);
  const [from, to] = hours[open[0]] as [string, string];

  const sameEveryDay = open.every((day) => {
    const window = hours[day];
    return window != null && window[0] === from && window[1] === to;
  });

  if (!sameEveryDay) return 'Varies by day';

  const range = `${from}–${to}`;
  if (closed.length === 0) return `${range} daily`;
  return `${range}, closed ${closed.map((day) => DAY_NAMES[day]).join(', ')}`;
}
