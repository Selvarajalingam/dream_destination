import Link from 'next/link';
import { notFound } from 'next/navigation';
import { catalogRepository } from '@/modules/catalog/repository';
import { crowdService } from '@/modules/crowd/service';
import { businessRepository } from '@/modules/businesses/repository';
import { verificationRepository } from '@/modules/verification/repository';
import { resolveVerificationDisplay } from '@/modules/verification/domain/gate';
import { rulesRepository } from '@/modules/rules/repository';
import { helpRepository } from '@/modules/help/repository';
import { CrowdStatusBadge } from '@/components/patterns/CrowdStatusBadge';
import { SourceFreshnessLabel } from '@/components/patterns/trust';
import { Card } from '@/components/ui/primitives';
import { formatInrRange } from '@/shared/money';
import { formatDistance } from '@/shared/geo';

/**
 * Screen T06 — Destination Detail.
 *
 * Follows the PRD's section order exactly, and the sticky "Build my trip"
 * action sits in flow at the end rather than overlaying content.
 */

export const dynamic = 'force-dynamic';

export default async function DestinationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const destination = await catalogRepository.findDestinationBySlug(slug);
  if (destination === null) notFound();

  const places = await catalogRepository.listPlacesForDestination(destination.id);

  const [crowdStatuses, verifications, businesses, rules, help] = await Promise.all([
    crowdService.getStatusForPlaces(places.filter((place) => !place.isHiddenGem).slice(0, 5).map((place) => place.id)),
    verificationRepository.findForPlaces(places.filter((place) => place.isHiddenGem).map((place) => place.id)),
    businessRepository.findForDestination(destination.id, 6),
    rulesRepository.findForDestination(destination.id),
    helpRepository.findNearestByType({ lat: destination.lat, lng: destination.lng }, 60_000),
  ]);

  const topExperiences = places.filter((place) => !place.isHiddenGem).slice(0, 6);

  const verifiedGems = places
    .filter((place) => place.isHiddenGem)
    .map((place) => ({
      place,
      display: resolveVerificationDisplay(verifications.get(place.id) ?? null, new Date()),
    }))
    .filter((entry) => entry.display.showBadge);

  const nearestHospital = help.find((facility) => facility.facilityType === 'hospital');

  return (
    <article>
      {/* 1. Image, name, location, save */}
      <header>
        <h1 className="text-[26px] lg:text-[32px]">{destination.name}</h1>
        <p className="mt-1 text-[14px] text-text-secondary">
          {destination.district}, Tamil Nadu
        </p>
        <p className="mt-3 text-[16px] leading-relaxed">{destination.summary}</p>
      </header>

      {/* 3. Estimated trip budget */}
      <Card className="mt-5 p-4">
        <h2 className="text-[18px] font-[650]">Estimated trip budget</h2>
        <p className="mt-1 text-[21px] font-[700]">
          {formatInrRange((destination.baseCostLowInr ?? 0) * 100, (destination.baseCostHighInr ?? 0) * 100)}
        </p>
        <p className="mt-1 text-[14px] text-text-secondary">
          Typical two-person, two-night range. Estimated from historical prices, not a quote.
        </p>
        <p className="mt-2 text-[14px] text-text-secondary">
          Suggested stay: {destination.minimumDays ?? 2}–{destination.maximumDays ?? 4} days.
        </p>
      </Card>

      {/* 4. Crowd outlook */}
      <section className="mt-6">
        <h2 className="text-[21px]">Crowd outlook</h2>
        <ul className="mt-3 space-y-2">
          {topExperiences.slice(0, 4).map((place) => {
            const status = crowdStatuses.get(place.id);
            if (status === undefined) return null;

            return (
              <li key={place.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/places/${place.slug}`}
                  className="text-[14px] font-[650] underline-offset-2 hover:underline"
                >
                  {place.name}
                </Link>
                <CrowdStatusBadge
                  compact
                  status={{ ...status, observedAt: status.observedAt?.toISOString() ?? null }}
                />
              </li>
            );
          })}
        </ul>
      </section>

      {/* 5. Top experiences */}
      <section className="mt-6">
        <h2 className="text-[21px]">Top experiences</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {topExperiences.map((place) => (
            <li key={place.id}>
              <Link
                href={`/places/${place.slug}`}
                className="block rounded-[16px] border border-border-subtle p-4 hover:bg-surface-subtle"
              >
                <p className="text-[16px] font-[650]">{place.name}</p>
                <p className="mt-1 text-[14px] capitalize text-text-secondary">
                  {place.category.replace(/_/g, ' ')} · {place.expectedVisitMinutes ?? 60} min
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* 6. Dream Verified hidden gems */}
      {verifiedGems.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[21px]">Dream Verified hidden gems</h2>
          <p className="mt-1 text-[14px] text-text-secondary">
            Lesser-known places a reviewer has checked. Each records what was checked and what its
            limitations are.
          </p>
          <ul className="mt-3 space-y-3">
            {verifiedGems.map(({ place, display }) => (
              <li key={place.id}>
                <Link
                  href={`/places/${place.slug}`}
                  className="block rounded-[16px] border border-border-subtle p-4 hover:bg-surface-subtle"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[16px] font-[650]">{place.name}</p>
                    <span className="rounded-full border border-status-good/30 bg-status-good/10 px-2 py-0.5 text-[13px] font-[650] text-status-good">
                      Dream Verified
                    </span>
                  </div>
                  {display.knownLimitations.length > 0 && (
                    <p className="mt-2 text-[14px] text-status-warn">
                      {display.knownLimitations[0]}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 7. Support local */}
      {businesses.length > 0 && (
        <section className="mt-6 rounded-[16px] bg-surface-warm p-4">
          <h2 className="text-[21px]">Support local</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {businesses.map((business) => (
              <li key={business.id}>
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
                      className="mt-1 inline-block text-[13px] font-[650] text-text-secondary"
                    >
                      Sponsored
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 8. Nearby Help summary */}
      <section className="mt-6">
        <h2 className="text-[21px]">Nearby help</h2>
        <p className="mt-1 text-[14px] text-text-secondary">
          {nearestHospital === undefined
            ? 'No hospital is recorded within 60 km in the pilot directory.'
            : `Nearest recorded hospital: ${nearestHospital.name}, about ${formatDistance(nearestHospital.distanceMeters)} from the centre.`}
        </p>
        <Link
          href="/help"
          className="mt-2 inline-block text-[14px] font-[650] text-brand-primary underline underline-offset-2"
        >
          Open Nearby Help
        </Link>
      </section>

      {/* 9. Know Before You Visit */}
      {rules.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[21px]">Know before you visit</h2>
          <ul className="mt-3 space-y-3">
            {rules.slice(0, 4).map((rule) => (
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
        </section>
      )}

      {/* Sticky action, in flow so it never covers content. */}
      <div className="sticky bottom-[80px] mt-6 rounded-[16px] border border-border-subtle bg-surface-base p-3 elevation-2">
        <Link
          href={`/dream-ai?q=${encodeURIComponent(`A trip to ${destination.name}`)}`}
          data-touch-target
          className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-brand-primary text-[16px] font-[700] text-white"
        >
          Build my trip
        </Link>
        <p className="mt-2 text-center text-[13px] text-text-secondary">
          {destination.minimumDays ?? 2}–{destination.maximumDays ?? 4} days ·{' '}
          {formatInrRange((destination.baseCostLowInr ?? 0) * 100, (destination.baseCostHighInr ?? 0) * 100)}
        </p>
      </div>
    </article>
  );
}
