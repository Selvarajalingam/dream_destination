import type { LatLng } from '@/shared/geo';
import { logger } from '@/platform/observability/logger';
import { CircuitBreaker } from '@/platform/resilience/circuit-breaker';
import { withTimeout } from '@/platform/resilience/with-timeout';
import type { TravelMode } from '@/modules/trips/domain/types';
import type { MapsProvider, RouteResult } from './index';

/**
 * OSRM routing, used when OSRM_BASE_URL is configured.
 *
 * Wrapped in a timeout and a circuit breaker per PRD Part II §14.2, and falls
 * back to the straight-line provider on any failure, so a routing outage
 * degrades to labelled estimates rather than breaking the itinerary.
 */

const OSRM_PROFILE: Record<TravelMode, string> = {
  car: 'driving',
  bus: 'driving',
  train: 'driving',
  bike: 'cycling',
  walk: 'foot',
};

type OsrmResponse = {
  code: string;
  routes?: Array<{ duration: number; distance: number }>;
};

export class OsrmMapsProvider implements MapsProvider {
  readonly name = 'osrm';

  private readonly breaker = new CircuitBreaker({ failureThreshold: 3, resetMs: 30_000 });

  constructor(
    private readonly baseUrl: string,
    private readonly fallback: MapsProvider,
  ) {}

  async route(from: LatLng, to: LatLng, mode: TravelMode): Promise<RouteResult> {
    try {
      return await this.breaker.run(async () => {
        const profile = OSRM_PROFILE[mode];
        const url =
          `${this.baseUrl.replace(/\/$/, '')}/route/v1/${profile}/` +
          `${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;

        const response = await withTimeout(fetch(url), 3_000, 'osrm');
        if (!response.ok) throw new Error(`osrm responded ${response.status}`);

        const body = (await response.json()) as OsrmResponse;
        const first = body.routes?.[0];
        if (body.code !== 'Ok' || first === undefined) throw new Error('osrm returned no route');

        return {
          minutes: Math.round(first.duration / 60),
          meters: Math.round(first.distance),
          mode,
          isEstimate: false,
        };
      });
    } catch (error) {
      logger.warn('maps.osrm.fallback', {
        reason: error instanceof Error ? error.message : 'unknown',
        breaker: this.breaker.state,
      });
      return this.fallback.route(from, to, mode);
    }
  }
}
