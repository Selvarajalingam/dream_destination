import Link from 'next/link';
import { catalogRepository } from '@/modules/catalog/repository';
import { businessRepository } from '@/modules/businesses/repository';
import { formatInrRange } from '@/shared/money';
import { Landscape, sceneForIndex, sceneForThemes } from '@/components/landing/Landscape';
import {
  Band,
  BusinessTile,
  DestinationCard,
  GemCard,
  ICONS,
  Icon,
  Rail,
  WideCard,
} from '@/components/landing/kit';
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

  const cost = (destination: (typeof withinBudget)[number]): string =>
    formatInrRange((destination.baseCostLowInr ?? 0) * 100, (destination.baseCostHighInr ?? 0) * 100);

  return (
    <div className="-mb-5 -mt-5">
      {/* Hero and planning entry — must be above the fold at 360×800. */}
      <section className="full-bleed relative overflow-hidden bg-[linear-gradient(135deg,#e4f2fb_0%,#f2faf7_55%,#fff6e8_100%)]">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 hidden w-[62%] [mask-image:linear-gradient(to_right,transparent,black_38%)] md:block"
        >
          <Landscape scene="hills" className="h-full w-full" />
        </div>
        <div className="page-gutter relative py-10 lg:py-16">
          <div className="md:w-[72%] lg:w-[52%]">
            <p className="text-[13px] font-[700] uppercase tracking-[0.14em] text-text-secondary">
              Plan smarter. Travel deeper.
            </p>
            <h1 className="mt-2 text-[36px] leading-[1.08] text-brand-deep lg:text-[60px]">
              Where do you want to{' '}
              <span className="block font-display font-[600] italic text-brand-primary">dream today?</span>
            </h1>
            <p className="mt-3 text-[16px] text-text-secondary lg:text-[18px]">
              Describe a trip in your own words, or pick somewhere to start.
            </p>
            <HomeSearch />
          </div>
        </div>
      </section>

      <Band
        id="within-budget"
        tone="base"
        icon={ICONS.wallet}
        title="Within your budget"
        reason="Destinations whose typical trip cost starts under ₹15,000."
      >
        <Rail columns="sm:grid-cols-2 lg:grid-cols-4">
          {withinBudget.map((destination) => (
            <DestinationCard
              key={destination.id}
              href={`/destinations/${destination.slug}`}
              name={destination.name}
              district={destination.district}
              summary={destination.summary}
              cost={cost(destination)}
              themes={destination.themes}
              scene={sceneForThemes(destination.themes)}
            />
          ))}
        </Rail>
      </Band>

      <Band
        id="quieter"
        tone="mint"
        icon={ICONS.leaf}
        title="Quieter places this weekend"
        reason="Destinations that tend to be less busy."
      >
        <Rail columns="sm:grid-cols-1 lg:grid-cols-2 [&>*]:max-w-[420px] sm:[&>*]:max-w-none">
          {quieter.map((destination) => (
            <WideCard
              key={destination.id}
              href={`/destinations/${destination.slug}`}
              name={destination.name}
              district={destination.district}
              summary={destination.summary}
              cost={cost(destination)}
              themes={destination.themes}
              scene={sceneForThemes(destination.themes, 'forest')}
            />
          ))}
        </Rail>
      </Band>

      <Band
        id="verified-gems"
        tone="sky"
        icon={ICONS.gem}
        title="Dream Verified hidden gems"
        reason="Lesser-known places a reviewer has checked, with their limitations recorded."
      >
        <Rail columns="sm:grid-cols-2 lg:grid-cols-3">
          {verifiedGems.map((place, index) => (
            <GemCard
              key={place.id}
              href={`/places/${place.slug}`}
              name={place.name}
              description={place.description}
              scene={sceneForIndex(index)}
            />
          ))}
        </Rail>
      </Band>

      <Band
        id="support-local"
        tone="warm"
        icon={ICONS.store}
        title="Support local"
        reason="Small businesses near the pilot region, listed with owner-confirmed details."
      >
        <Rail columns="sm:grid-cols-2 lg:grid-cols-3">
          {supportLocal.map((business) => (
            <BusinessTile
              key={business.id}
              href={`/businesses/${business.slug}`}
              name={business.name}
              category={business.category}
              sponsored={business.sponsored}
            />
          ))}
        </Rail>
      </Band>

      <Link
        href="/dream-ai"
        data-touch-target
        className="fixed bottom-[84px] right-4 z-30 inline-flex items-center gap-2 rounded-full bg-brand-primary px-4 text-[14px] font-[700] text-white shadow-lg hover:bg-brand-primary-hover md:bottom-6 md:right-6"
      >
        <Icon d={ICONS.chat} size={18} />
        <span className="sr-only sm:not-sr-only">Ask Dream AI</span>
      </Link>
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
