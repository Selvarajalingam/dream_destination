import { haversineMeters, type LatLng } from '@/shared/geo';
import type { TravelMode } from '@/modules/trips/domain/types';
import type { MapsProvider, RouteResult } from './index';

/**
 * Straight-line routing estimate.
 *
 * Needs no provider, no key and no network, so the application and the
 * demonstration always have travel times. Results are marked isEstimate so the
 * UI can label them rather than presenting them as routed distances.
 */

/** Average speeds in km/h for the pilot geography. */
const SPEED_KMH: Record<TravelMode, number> = {
  car: 34,
  bus: 26,
  train: 30,
  bike: 28,
  walk: 4.5,
};

/**
 * Roads in the Nilgiris wind considerably, so straight-line distance
 * understates the journey. This factor brings the estimate closer to reality;
 * the well-known Coimbatore to Ooty case is 52 km direct and about 86 km by
 * road, which is a ratio of roughly 1.65.
 */
const ROAD_WINDING_FACTOR = 1.45;

export class HaversineMapsProvider implements MapsProvider {
  readonly name = 'haversine';

  async route(from: LatLng, to: LatLng, mode: TravelMode): Promise<RouteResult> {
    const straightLine = haversineMeters(from, to);
    const meters = mode === 'walk' ? straightLine * 1.2 : straightLine * ROAD_WINDING_FACTOR;
    const minutes = Math.round((meters / 1000 / SPEED_KMH[mode]) * 60);

    return {
      minutes: Math.max(0, minutes),
      meters: Math.round(meters),
      mode,
      isEstimate: true,
    };
  }
}
