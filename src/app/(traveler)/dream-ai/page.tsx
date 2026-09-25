import Link from 'next/link';
import { Landscape, sceneForThemes } from '@/components/landing/Landscape';
import { ICONS, Icon } from '@/components/landing/kit';
import { catalogRepository } from '@/modules/catalog/repository';
import { Conversation } from './Conversation';

/**
 * Screen T03 — Dream AI Conversation.
 *
 * The ?q= parameter carries the sentence typed on Home, so the text is
 * preserved rather than retyped.
 */

export const dynamic = 'force-dynamic';

export default async function DreamAiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const popular = await catalogRepository.searchDestinations({ limit: 3 });

  return (
    <div>
      <div className="relative overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,#e4f2fb_0%,#f2faf7_60%,#fff6e8_100%)] px-5 py-6 lg:px-8">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 hidden w-1/2 [mask-image:linear-gradient(to_right,transparent,black_45%)] md:block"
        >
          <Landscape scene="hills" className="h-full w-full" />
        </div>
        <div className="relative">
          <h1 className="text-[28px] font-[800] text-brand-deep lg:text-[40px]">
            Plan with Dream AI <span className="text-brand-saffron">✦</span>
          </h1>
          <p className="mt-1 max-w-[520px] text-[16px] text-text-secondary lg:text-[18px]">
            Tell me what kind of trip you want. I&apos;ll turn it into a clear, editable plan.
          </p>
        </div>
      </div>

      <Conversation initialMessage={q ?? null}>
        {popular.length > 0 && (
          <section aria-labelledby="popular" className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <h2 id="popular" className="border-l-4 border-brand-saffron pl-3 text-[20px] font-[750]">
                Popular destinations
              </h2>
              <Link href="/explore" className="text-[14px] font-[650] text-brand-primary">
                See more destinations →
              </Link>
            </div>
            <ul className="mt-3 grid gap-4 sm:grid-cols-3">
              {popular.map((destination) => (
                <li key={destination.id}>
                  <Link
                    href={`/destinations/${destination.slug}`}
                    className="group relative block h-40 overflow-hidden rounded-[18px]"
                  >
                    <Landscape
                      scene={sceneForThemes(destination.themes)}
                      className="h-full w-full transition-transform duration-500 group-hover:scale-105"
                    />
                    <span className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0f2a40] to-transparent" />
                    <span className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2 text-white">
                      <span>
                        <span className="block text-[16px] font-[750] leading-tight">{destination.name}</span>
                        <span className="block text-[12px]">{destination.district}</span>
                      </span>
                      <Icon d={ICONS.arrow} size={18} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Conversation>
    </div>
  );
}
