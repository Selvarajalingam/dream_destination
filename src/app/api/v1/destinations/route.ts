import { catalogRepository } from '@/modules/catalog/repository';
import { json, route } from '@/server/handler';

/**
 * GET /api/v1/destinations
 *
 * Public discovery with radius and theme filtering, which PRD Part II §19
 * lists as an architecture acceptance criterion.
 */
export const GET = route({ auth: 'none' }, async ({ searchParams }) => {
  const themes = searchParams.get('themes')?.split(',').filter(Boolean);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const radius = searchParams.get('radiusMeters');
  const maxCostMinor = searchParams.get('maxCostMinor');
  const durationDays = searchParams.get('durationDays');

  const nearPoint =
    lat === null || lng === null ? undefined : { lat: Number(lat), lng: Number(lng) };

  const destinations = await catalogRepository.searchDestinations({
    themes,
    nearPoint,
    radiusMeters: radius === null ? undefined : Number(radius),
    maxCostMinor: maxCostMinor === null ? undefined : Number(maxCostMinor),
    durationDays: durationDays === null ? undefined : Number(durationDays),
  });

  return json({ destinations });
});
