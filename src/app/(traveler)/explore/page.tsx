import Link from 'next/link';
import { catalogRepository } from '@/modules/catalog/repository';
import { formatInrRange } from '@/shared/money';

/**
 * Explore — the deterministic discovery path.
 *
 * This is also the fallback PRD Part II §14.2 requires when the assistant is
 * unavailable: a traveller can always reach destinations without it.
 */

export const dynamic = 'force-dynamic';

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string }>;
}) {
  const { theme } = await searchParams;

  const destinations = await catalogRepository.searchDestinations({
    themes: theme === undefined ? undefined : [theme],
    limit: 20,
  });

  const themes = [...new Set((await catalogRepository.listAllDestinations()).flatMap((d) => d.themes))].sort();

  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">Explore the pilot region</h1>
      <p className="mt-1 text-[16px] text-text-secondary">
        Coimbatore district and The Nilgiris, Tamil Nadu. All records are demonstration data.
      </p>

      <nav aria-label="Themes" className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/explore"
          data-touch-target
          className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-[14px] font-[650] ${
            theme === undefined ? 'border-brand-primary bg-brand-primary text-white' : 'border-border-subtle'
          }`}
        >
          All
        </Link>
        {themes.map((item) => (
          <Link
            key={item}
            href={`/explore?theme=${item}`}
            data-touch-target
            className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-[14px] font-[650] capitalize ${
              theme === item ? 'border-brand-primary bg-brand-primary text-white' : 'border-border-subtle'
            }`}
          >
            {item.replace(/_/g, ' ')}
          </Link>
        ))}
      </nav>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {destinations.map((destination) => (
          <li key={destination.id}>
            <Link
              href={`/destinations/${destination.slug}`}
              className="block h-full rounded-[16px] border border-border-subtle p-4 hover:bg-surface-subtle"
            >
              <p className="text-[18px] font-[650]">{destination.name}</p>
              <p className="text-[14px] text-text-secondary">{destination.district}</p>
              <p className="mt-2 text-[14px] text-text-secondary">{destination.summary}</p>
              <p className="mt-2 text-[14px] font-[650]">
                {formatInrRange(
                  (destination.baseCostLowInr ?? 0) * 100,
                  (destination.baseCostHighInr ?? 0) * 100,
                )}{' '}
                <span className="font-normal text-text-secondary">estimated</span>
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
