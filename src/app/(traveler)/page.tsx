import Link from 'next/link';
import { catalogRepository } from '@/modules/catalog/repository';
import { businessRepository } from '@/modules/businesses/repository';
import { formatInrRange } from '@/shared/money';
import { HomeSearch } from './HomeSearch';

/**
 * Screen T01 — Welcome and Home.
 *
 * The planning entry is visible without scrolling at 360×800, a guest can
 * begin without signing in, and nothing asks for location, notifications or
 * sign-in on first load.
 */

export const dynamic = 'force-dynamic';

/** PRD Part I T01 discovery sections. */
const PILOT_CENTER = { lat: 11.0168, lng: 76.9558 };

export default async function HomePage() {
  const [withinBudget, quieter, verifiedGems, supportLocal] = await Promise.all([
    catalogRepository.searchDestinations({ maxCostMinor: 1_500_000, limit: 4 }),
    catalogRepository.searchDestinations({ themes: ['quiet'], limit: 4 }),
    verifiedHiddenGems(),
    businessRepository.findNearby(PILOT_CENTER, 60_000, { limit: 6 }),
  ]);

  return (
    <div className="section-gap">
      {/* Hero and planning entry — must be above the fold at 360×800. */}
      <section>
        <h1 className="text-[32px] leading-tight lg:text-[42px]">Where do you want to dream today?</h1>
        <p className="mt-2 text-[16px] text-text-secondary">
          Describe a trip in your own words, or pick somewhere to start.
        </p>
        <HomeSearch />
      </section>

      <Section
        title="Within your budget"
        reason="Destinations whose typical trip cost starts under ₹15,000."
      >
        {withinBudget.map((destination) => (
          <DestinationTile
            key={destination.id}
            slug={destination.slug}
            name={destination.name}
            district={destination.district}
            summary={destination.summary}
            costLow={(destination.baseCostLowInr ?? 0) * 100}
            costHigh={(destination.baseCostHighInr ?? 0) * 100}
          />
        ))}
      </Section>

      <Section title="Quieter places this weekend" reason="Destinations that tend to be less busy.">
        {quieter.map((destination) => (
          <DestinationTile
            key={destination.id}
            slug={destination.slug}
            name={destination.name}
            district={destination.district}
            summary={destination.summary}
            costLow={(destination.baseCostLowInr ?? 0) * 100}
            costHigh={(destination.baseCostHighInr ?? 0) * 100}
          />
        ))}
      </Section>

      <Section
        title="Dream Verified hidden gems"
        reason="Lesser-known places a reviewer has checked, with their limitations recorded."
      >
        {verifiedGems.map((place) => (
          <Link
            key={place.id}
            href={`/places/${place.slug}`}
            className="block min-w-[240px] flex-1 rounded-[16px] border border-border-subtle p-4 hover:bg-surface-subtle"
          >
            <p className="text-[16px] font-[650]">{place.name}</p>
            <p className="mt-1 line-clamp-2 text-[14px] text-text-secondary">{place.description}</p>
            <span className="mt-2 inline-block text-[13px] font-[650] text-status-good-text">
              Dream Verified
            </span>
          </Link>
        ))}
      </Section>

      <Section
        title="Support local"
        reason="Small businesses near the pilot region, listed with owner-confirmed details."
      >
        {supportLocal.map((business) => (
          <Link
            key={business.id}
            href={`/businesses/${business.slug}`}
            className="block min-w-[220px] flex-1 rounded-[16px] border border-border-subtle bg-surface-warm p-4 hover:brightness-[0.99]"
          >
            <p className="text-[16px] font-[650]">{business.name}</p>
            <p className="mt-1 text-[14px] capitalize text-text-secondary">
              {business.category.replace(/_/g, ' ')}
            </p>
            {business.sponsored && (
              <span
                data-testid="sponsored-label"
                className="mt-2 inline-block rounded-full bg-surface-subtle px-2 py-0.5 text-[13px] font-[650] text-text-secondary"
              >
                Sponsored
              </span>
            )}
          </Link>
        ))}
      </Section>
    </div>
  );
}

async function verifiedHiddenGems() {
  const { sql } = await import('@/platform/db/client');

  return sql<Array<{ id: string; slug: string; name: string; description: string | null }>>`
    SELECT p.id, p.slug, p.name, p.description
    FROM places p
    JOIN hidden_gem_verifications v ON v.place_id = p.id
    WHERE p.status = 'active'
      AND v.status = 'approved'
      AND (v.expires_at IS NULL OR v.expires_at > now())
    ORDER BY p.name
    LIMIT 6
  `;
}

function Section({
  title,
  reason,
  children,
}: {
  title: string;
  reason: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[21px] lg:text-[24px]">{title}</h2>
      <p className="mt-1 text-[14px] text-text-secondary">{reason}</p>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-2 md:flex-wrap md:overflow-visible">
        {children}
      </div>
    </section>
  );
}

function DestinationTile({
  slug,
  name,
  district,
  summary,
  costLow,
  costHigh,
}: {
  slug: string;
  name: string;
  district: string | null;
  summary: string;
  costLow: number;
  costHigh: number;
}) {
  return (
    <Link
      href={`/destinations/${slug}`}
      className="block min-w-[260px] flex-1 rounded-[16px] border border-border-subtle p-4 hover:bg-surface-subtle"
    >
      <p className="text-[16px] font-[650]">{name}</p>
      {district !== null && <p className="text-[14px] text-text-secondary">{district}</p>}
      <p className="mt-2 line-clamp-2 text-[14px] text-text-secondary">{summary}</p>
      <p className="mt-2 text-[14px] font-[650]">
        {formatInrRange(costLow, costHigh)}{' '}
        <span className="font-normal text-text-secondary">estimated trip cost</span>
      </p>
    </Link>
  );
}
