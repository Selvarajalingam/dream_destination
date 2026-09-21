import Link from 'next/link';
import { notFound } from 'next/navigation';
import { catalogRepository } from '@/modules/catalog/repository';
import { rulesRepository } from '@/modules/rules/repository';
import { SourceFreshnessLabel } from '@/components/patterns/trust';
import { Card } from '@/components/ui/primitives';
import { EmptyState } from '@/components/states/states';

/**
 * Screen T20 — Know Before You Visit.
 *
 * Every rule card carries a plain-language summary, the issuing authority, the
 * applicable place or area, the effective date, the last verified date, a
 * source link and a stale state where the review date has passed.
 */

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<string, string> = {
  photography: 'Photography',
  drone: 'Drones',
  forest: 'Forest and trekking',
  permit: 'Permits',
  dress_etiquette: 'Dress and etiquette',
  waste: 'Waste and environment',
  operating: 'Operating restrictions',
  wildlife: 'Wildlife',
};

export default async function PlaceRulesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const place = await catalogRepository.findPlaceBySlug(slug);
  if (place === null) notFound();

  const rules = await rulesRepository.findForPlace(place.id);

  const byCategory = new Map<string, typeof rules>();
  for (const rule of rules) {
    byCategory.set(rule.category, [...(byCategory.get(rule.category) ?? []), rule]);
  }

  return (
    <article>
      <nav aria-label="Breadcrumb" className="text-[14px]">
        <Link href={`/places/${place.slug}`} className="text-brand-primary underline underline-offset-2">
          {place.name}
        </Link>
      </nav>

      <h1 className="mt-2 text-[26px] lg:text-[32px]">Know before you visit</h1>
      <p className="mt-1 text-[16px] text-text-secondary">
        Rules that apply at {place.name} and across the surrounding area. Each one names the
        authority that issued it and when we last checked it.
      </p>

      {rules.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="No rules recorded yet"
            reason="We have not yet collected sourced rules for this place. That does not mean none apply, so check locally before you visit."
          />
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {[...byCategory.entries()].map(([category, entries]) => (
            <section key={category}>
              <h2 className="text-[21px]">{CATEGORY_LABELS[category] ?? category}</h2>
              <ul className="mt-3 space-y-3">
                {entries.map((rule) => (
                  <li key={rule.id}>
                    <Card
                      data-testid="rule-card"
                      className={rule.isStale ? 'border-status-warn/40 p-4' : 'p-4'}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="text-[16px] font-[650]">{rule.title}</h3>
                        <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[13px] text-text-secondary">
                          {rule.placeId === place.id ? 'This place' : 'Whole area'}
                        </span>
                      </div>

                      <p className="mt-2 text-[16px] leading-relaxed">{rule.plainLanguageSummary}</p>

                      {rule.officialTextExcerpt !== null && (
                        <blockquote className="mt-3 border-l-2 border-border-subtle pl-3 text-[14px] italic text-text-secondary">
                          {rule.officialTextExcerpt}
                        </blockquote>
                      )}

                      <SourceFreshnessLabel
                        className="mt-3"
                        source={{
                          name: rule.sourceName,
                          issuingAuthority: rule.issuingAuthority,
                          verifiedAt: rule.verifiedAt.toISOString(),
                          reviewDueAt: rule.reviewDueAt.toISOString(),
                          url: rule.sourceUrl,
                        }}
                      />

                      {rule.isStale && (
                        <p
                          role="status"
                          className="mt-2 text-[14px] font-[650] text-status-warn"
                        >
                          This rule is past its review date. It is still shown because it may well
                          still apply, but confirm it with the issuing authority before you rely on
                          it.
                        </p>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
