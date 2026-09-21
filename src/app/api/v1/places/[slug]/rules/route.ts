import { catalogRepository } from '@/modules/catalog/repository';
import { rulesRepository } from '@/modules/rules/repository';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * GET /api/v1/places/{slug}/rules
 *
 * Every rule carries its issuing authority, verified date, review date and
 * source link, plus an isStale flag. A stale rule is returned with a warning
 * rather than hidden (PRD Part I §5.7, T20).
 */
export const GET = route({ auth: 'none' }, async ({ params }) => {
  const place = await catalogRepository.findPlaceBySlug(params.slug);
  if (place === null) throw problems.notFound();

  const rules = await rulesRepository.findForPlace(place.id);

  return json({
    place: { id: place.id, slug: place.slug, name: place.name },
    rules: rules.map((rule) => ({
      id: rule.id,
      category: rule.category,
      title: rule.title,
      summary: rule.plainLanguageSummary,
      officialExcerpt: rule.officialTextExcerpt,
      source: {
        name: rule.sourceName,
        issuingAuthority: rule.issuingAuthority,
        url: rule.sourceUrl,
        type: rule.sourceType,
      },
      effectiveFrom: rule.effectiveFrom?.toISOString() ?? null,
      verifiedAt: rule.verifiedAt.toISOString(),
      reviewDueAt: rule.reviewDueAt.toISOString(),
      isStale: rule.isStale,
      appliesToThisPlace: rule.placeId === place.id,
    })),
  });
});
