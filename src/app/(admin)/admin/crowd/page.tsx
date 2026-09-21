import { sql } from '@/platform/db/client';
import { crowdService } from '@/modules/crowd/service';
import { CrowdOperations } from './CrowdOperations';

/**
 * Screen A04 — Crowd Operations.
 *
 * Shows current status, source health, observations, forecast and confidence
 * for each monitored place, with a manual override that requires a reason, a
 * start, an expiry and the affected place.
 */

export const dynamic = 'force-dynamic';

export default async function CrowdOperationsPage() {
  // Places that actually carry crowd signals are the ones worth operating on.
  const places = await sql<Array<{ id: string; name: string; slug: string }>>`
    SELECT DISTINCT p.id, p.name, p.slug
    FROM places p
    WHERE EXISTS (SELECT 1 FROM crowd_forecasts f WHERE f.place_id = p.id)
       OR EXISTS (SELECT 1 FROM crowd_observations o WHERE o.place_id = p.id)
       OR EXISTS (SELECT 1 FROM crowd_overrides c WHERE c.place_id = p.id)
    ORDER BY p.name
  `;

  const rows = await Promise.all(
    places.map(async (place) => {
      const [status, health] = await Promise.all([
        crowdService.getStatus(place.id),
        crowdService.sourceHealth(place.id),
      ]);

      return {
        id: place.id,
        name: place.name,
        slug: place.slug,
        band: status.band,
        label: status.label,
        source: status.source,
        confidence: status.confidence,
        confidenceLabel: status.confidenceLabel,
        explanation: status.explanation,
        observedAt: status.observedAt?.toISOString() ?? null,
        expiresAt: status.expiresAt?.toISOString() ?? null,
        isStale: status.isStale,
        lastObservationAt: health.lastObservationAt?.toISOString() ?? null,
        observationCount24h: health.observationCount24h,
        hasForecast: health.hasForecast,
      };
    }),
  );

  return <CrowdOperations places={rows} />;
}
