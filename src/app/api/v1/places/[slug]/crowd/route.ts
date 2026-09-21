import { catalogRepository } from '@/modules/catalog/repository';
import { crowdService } from '@/modules/crowd/service';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * GET /api/v1/places/{slug}/crowd
 *
 * Returns the resolved crowd status. Expired data resolves to unknown, and
 * nothing in the payload describes a reading as live (PRD Part I §12.2).
 */
export const GET = route({ auth: 'none' }, async ({ params, searchParams }) => {
  const place = await catalogRepository.findPlaceBySlug(params.slug);
  if (place === null) throw problems.notFound();

  // Development-only simulation hook, so the demo can show the degraded state
  // without shipping a production backdoor. PRD Part II §14.2.
  if (process.env.NODE_ENV !== 'production' && searchParams.get('simulate') === 'crowd-outage') {
    return json({
      band: 'unknown',
      label: 'Unknown',
      source: 'none',
      confidence: 0,
      confidenceLabel: 'Low confidence',
      observedAt: null,
      expiresAt: null,
      isStale: false,
      explanation:
        'The crowd feed for this place is not responding. Historical patterns are shown where we have them, and are labelled as such.',
    });
  }

  const at = searchParams.get('at');
  const status = await crowdService.getStatus(place.id, at === null ? new Date() : new Date(at));

  return json({
    ...status,
    observedAt: status.observedAt?.toISOString() ?? null,
    expiresAt: status.expiresAt?.toISOString() ?? null,
  });
});
