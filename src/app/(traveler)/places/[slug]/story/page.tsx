import Link from 'next/link';
import { notFound } from 'next/navigation';
import { catalogRepository } from '@/modules/catalog/repository';
import { Card } from '@/components/ui/primitives';
import { EmptyState } from '@/components/states/states';

/**
 * Screen T19 — Destination Story.
 *
 * A legend is labelled as a legend rather than presented as fact, which is
 * what the PRD requires. The audio control is reserved and disabled: it is
 * future-ready but explicitly not part of P0.
 */

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  fact: 'What is documented',
  community_story: 'From the community',
  legend: 'Local legend',
  guide: 'What to notice',
};

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const place = await catalogRepository.findPlaceBySlug(slug);
  if (place === null) notFound();

  const stories = await catalogRepository.listStoriesForPlace(place.id);

  return (
    <article>
      <nav aria-label="Breadcrumb" className="text-[14px]">
        <Link href={`/places/${place.slug}`} className="text-brand-primary underline underline-offset-2">
          {place.name}
        </Link>
      </nav>

      <h1 className="mt-2 text-[26px] lg:text-[32px]">The story of {place.name}</h1>

      <button
        type="button"
        disabled
        aria-label="Listen to this story (not available yet)"
        className="mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-4 text-[14px] font-[650] text-text-secondary opacity-60"
      >
        Listen — coming later
      </button>

      {stories.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="No story yet"
            reason="We have not yet collected a sourced story for this place."
          />
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {stories.map((story) => (
            <Card key={story.id} className="p-5">
              <p className="text-[13px] font-[650] uppercase tracking-wide text-text-secondary">
                {TYPE_LABEL[story.contentType] ?? story.contentType}
              </p>
              <h2 className="mt-1 text-[21px]">{story.title}</h2>

              {story.contentType === 'legend' && (
                <p className="mt-2 rounded-xl bg-surface-subtle p-3 text-[14px]">
                  This is a story told locally. It is recorded here as a legend, not as history.
                </p>
              )}

              <p className="mt-3 text-[16px] leading-relaxed">{story.shortText}</p>

              {story.longText !== null && (
                <details className="mt-3">
                  <summary className="min-h-[44px] cursor-pointer text-[14px] font-[650] text-brand-primary">
                    Read the detailed story
                  </summary>
                  <p className="mt-2 text-[16px] leading-relaxed">{story.longText}</p>
                </details>
              )}
            </Card>
          ))}
        </div>
      )}
    </article>
  );
}
