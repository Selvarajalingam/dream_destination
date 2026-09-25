import clsx from 'clsx';
import Image from 'next/image';
import Link from 'next/link';
import { Landscape, sceneForThemes } from '@/components/landing/Landscape';
import { ICONS, Icon } from '@/components/landing/kit';
import { catalogRepository, type DestinationRow } from '@/modules/catalog/repository';
import { formatInrRange } from '@/shared/money';
import { ExploreMap } from './ExploreMap';

/**
 * Explore — the deterministic discovery path.
 *
 * This is also the fallback PRD Part II §14.2 requires when the assistant is
 * unavailable: a traveller can always reach destinations without it.
 */

export const dynamic = 'force-dynamic';

/** Photographs in public/images; destinations without one keep the illustrated scene. */
const PHOTOS: Record<string, string> = {
  'ooty-nilgiris': '/images/ooty-nilgiris.jpg',
  'coonoor-valley': '/images/coonoor-valley.jpg',
  'valparai-anamalai': '/images/valparai-anamalai.jpg',
  'coimbatore-city': '/images/coimbatore-city.jpg',
};

const PIN = 'M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z';

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string; q?: string }>;
}) {
  const { theme, q } = await searchParams;
  const query = q?.trim().toLowerCase() ?? '';

  const [found, all] = await Promise.all([
    catalogRepository.searchDestinations({
      themes: theme === undefined ? undefined : [theme],
      limit: 20,
    }),
    catalogRepository.listAllDestinations(),
  ]);

  const destinations =
    query === ''
      ? found
      : found.filter((d) =>
          [d.name, d.district ?? '', d.summary, ...d.themes].join(' ').toLowerCase().includes(query),
        );
  const themes = [...new Set(all.flatMap((d) => d.themes))].sort();

  const href = (next: { theme?: string }): string => {
    const params = new URLSearchParams();
    if (next.theme !== undefined) params.set('theme', next.theme);
    if (q !== undefined && q !== '') params.set('q', q);
    const text = params.toString();
    return text === '' ? '/explore' : `/explore?${text}`;
  };

  return (
    <div className="-mt-5">
      <section className="full-bleed relative overflow-hidden bg-[linear-gradient(180deg,#dcefff_0%,#eef8f6_100%)]">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 hidden w-[55%] [mask-image:linear-gradient(to_right,transparent,black_40%)] md:block"
        >
          <Landscape scene="hills" className="h-full w-full" />
        </div>
        <div className="page-gutter relative pb-12 pt-8 lg:pb-16">
          <h1 className="text-[30px] font-[800] leading-tight text-brand-deep lg:text-[44px]">
            Explore the pilot region
          </h1>
          <p className="mt-1 text-[16px] text-text-secondary lg:text-[18px]">
            Discover trusted destinations across Coimbatore and The Nilgiris.
          </p>
          <form action="/explore" role="search" className="mt-5 flex max-w-[680px] items-center gap-2 rounded-full bg-white p-1.5 pl-5 shadow-md">
            {theme !== undefined && <input type="hidden" name="theme" value={theme} />}
            <Icon d={ICONS.search} size={20} className="text-text-secondary" />
            <label htmlFor="explore-q" className="visually-hidden">
              Search destinations
            </label>
            <input
              id="explore-q"
              name="q"
              defaultValue={q ?? ''}
              placeholder="Search destinations, experiences or activities"
              className="min-h-[48px] min-w-0 flex-1 bg-transparent text-[16px] outline-none"
            />
            <button
              type="submit"
              aria-label="Search"
              className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white hover:bg-brand-primary-hover"
            >
              <Icon d={ICONS.search} size={20} />
            </button>
          </form>
          <p className="mt-3 text-[13px] text-text-secondary">
            Curated places and transparent budgets. All records are demonstration data.
          </p>
        </div>
      </section>

      <nav
        aria-label="Themes"
        className="relative -mt-7 flex gap-2 overflow-x-auto rounded-[20px] border border-border-subtle bg-white p-3 shadow-sm md:flex-wrap [&>*]:shrink-0"
      >
        <ThemeLink href={href({})} active={theme === undefined}>
          All
        </ThemeLink>
        {themes.map((item) => (
          <ThemeLink key={item} href={href({ theme: item })} active={theme === item}>
            {item.replace(/_/g, ' ')}
          </ThemeLink>
        ))}
      </nav>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0">
          <p className="text-[16px] font-[700]">
            {destinations.length} {destinations.length === 1 ? 'place' : 'places'} to explore
          </p>

          {destinations.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-border-subtle p-6 text-[15px] text-text-secondary">
              Nothing matches that search.{' '}
              <Link href="/explore" className="font-[650] text-brand-primary underline underline-offset-2">
                Show all destinations
              </Link>
            </p>
          ) : (
            <ul className="mt-3 grid gap-4 sm:grid-cols-2">
              {destinations.map((destination) => (
                <li key={destination.id}>
                  <DestinationTile destination={destination} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside aria-label="Where these destinations are" className="lg:sticky lg:top-4 lg:h-fit">
          <RegionMap destinations={all} highlighted={new Set(destinations.map((d) => d.id))} />
        </aside>
      </div>

      <Link
        href={href({ theme: 'quiet' })}
        className="mt-8 flex flex-wrap items-center gap-4 rounded-[20px] bg-[#e8f5ef] p-5"
      >
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-white text-brand-primary">
          <Icon d={ICONS.leaf} size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[18px] font-[750] text-brand-deep">Looking for quieter places?</span>
          <span className="block text-[14px] text-text-secondary">
            Destinations that tend to be less busy, for a relaxed trip.
          </span>
        </span>
        <span className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-brand-primary px-5 text-[14px] font-[700] text-white">
          Show quieter destinations <Icon d={ICONS.arrow} size={16} />
        </span>
      </Link>
    </div>
  );
}

function ThemeLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      data-touch-target
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'inline-flex min-h-[44px] items-center rounded-full border px-4 text-[14px] font-[650] capitalize',
        active ? 'border-brand-primary bg-brand-primary text-white' : 'border-border-subtle hover:bg-surface-subtle',
      )}
    >
      {children}
    </Link>
  );
}

function DestinationTile({ destination }: { destination: DestinationRow }) {
  const photo = PHOTOS[destination.slug];
  const quiet = destination.themes.includes('quiet');

  return (
    <Link
      href={`/destinations/${destination.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-[20px] border border-border-subtle bg-white shadow-sm transition-shadow hover:shadow-lg"
    >
      <div className="relative h-36 overflow-hidden">
        {photo === undefined ? (
          <Landscape
            scene={sceneForThemes(destination.themes)}
            className="h-full w-full transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <Image
            src={photo}
            alt=""
            fill
            sizes="(min-width:1024px) 30vw, (min-width:640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {destination.district !== null && (
              <p className="flex items-center gap-1 text-[13px] text-text-secondary">
                <Icon d={PIN} size={14} className="text-brand-primary" />
                {destination.district}
              </p>
            )}
            <p className="text-[18px] font-[750] leading-snug text-brand-deep">{destination.name}</p>
          </div>
          {quiet && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#e0f3ea] px-2.5 py-1 text-[12px] font-[700] text-status-good-text">
              <Icon d={ICONS.users} size={14} />
              Tends to be quiet
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-[14px] text-text-secondary">{destination.summary}</p>
        <p className="mt-2 text-[16px] font-[750]">
          {formatInrRange((destination.baseCostLowInr ?? 0) * 100, (destination.baseCostHighInr ?? 0) * 100)}{' '}
          <span className="text-[13px] font-normal text-text-secondary">estimated</span>
        </p>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-3">
          <div className="flex flex-wrap gap-1.5">
            {destination.themes.slice(0, 2).map((item) => (
              <span
                key={item}
                className="rounded-full bg-[#e3f4f1] px-2.5 py-1 text-[12px] font-[650] capitalize text-brand-primary-hover"
              >
                {item.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
          <span className="inline-flex items-center gap-1 text-[13px] font-[700] text-brand-primary">
            View destination <Icon d={ICONS.arrow} size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function RegionMap({ destinations, highlighted }: { destinations: DestinationRow[]; highlighted: Set<string> }) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-border-subtle bg-white shadow-sm">
      <p className="flex items-center gap-2 px-4 py-3 text-[14px] font-[700] text-brand-deep">
        <Icon d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14" size={18} />
        Where they are
      </p>
      <ExploreMap
        points={destinations.map((d) => ({
          id: d.id,
          slug: d.slug,
          name: d.name,
          lat: d.lat,
          lng: d.lng,
          active: highlighted.has(d.id),
        }))}
      />
      <p className="px-4 py-3 text-[12px] text-text-secondary">
        Tap a pin to open the destination. Grey pins are outside the current filter.
      </p>
    </div>
  );
}
