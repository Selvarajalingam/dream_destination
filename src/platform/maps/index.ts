import type { LatLng } from '@/shared/geo';
import type { TravelMode } from '@/modules/trips/domain/types';
import { HaversineMapsProvider } from './haversine';
import { OsrmMapsProvider } from './osrm';

/**
 * Map and routing adapter — PRD Part II §3.3 keeps the provider replaceable,
 * and §20 leaves the production provider undecided.
 *
 * The haversine provider is the default because it needs no key and works
 * offline, so the demonstration always runs. OSRM is used when configured and
 * falls back to haversine on failure, which is the "map routing unavailable"
 * degradation in §14.2.
 */

export type RouteResult = {
  minutes: number;
  meters: number;
  mode: TravelMode;
  /** True when the figure is a straight-line estimate rather than a route. */
  isEstimate: boolean;
};

export interface MapsProvider {
  readonly name: string;
  route(from: LatLng, to: LatLng, mode: TravelMode): Promise<RouteResult>;
}

let cached: MapsProvider | null = null;

export function getMapsProvider(): MapsProvider {
  if (cached !== null) return cached;

  const baseUrl = process.env.OSRM_BASE_URL;
  const fallback = new HaversineMapsProvider();

  cached =
    baseUrl === undefined || baseUrl.trim() === ''
      ? fallback
      : new OsrmMapsProvider(baseUrl, fallback);

  return cached;
}

export function resetMapsProvider(): void {
  cached = null;
}

export { HaversineMapsProvider } from './haversine';
export { OsrmMapsProvider } from './osrm';
