import { rulesRepository } from '@/modules/rules/repository';
import { assertOwnsTrip } from '@/server/authorize';
import { json, route } from '@/server/handler';

/**
 * GET /api/v1/trips/{id}/rules
 *
 * Every rule that applies anywhere on this trip, carried into the offline
 * pack with its authority, dates and stale state intact.
 */
export const GET = route({ auth: 'none' }, async ({ params, session }) => {
  await assertOwnsTrip(session, params.id);

  const rules = await rulesRepository.findForTrip(params.id);

  return json({
    rules: rules.map((rule) => ({
      id: rule.id,
      category: rule.category,
      title: rule.title,
      summary: rule.plainLanguageSummary,
      issuingAuthority: rule.issuingAuthority,
      sourceName: rule.sourceName,
      sourceUrl: rule.sourceUrl,
      verifiedAt: rule.verifiedAt.toISOString(),
      reviewDueAt: rule.reviewDueAt.toISOString(),
      isStale: rule.isStale,
    })),
  });
});
