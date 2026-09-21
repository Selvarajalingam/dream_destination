import { catalogRepository } from '@/modules/catalog/repository';
import { NATIONAL_EMERGENCY_NUMBER, helpRepository } from '@/modules/help/repository';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * GET /api/v1/places/{slug}/help
 *
 * Nearby Help for one place. The payload states plainly that availability is
 * not confirmed, because the directory is periodic rather than real time
 * (PRD Part I T18).
 */
export const GET = route({ auth: 'none' }, async ({ params, searchParams }) => {
  const place = await catalogRepository.findPlaceBySlug(params.slug);
  if (place === null) throw problems.notFound();

  const radius = Number(searchParams.get('radiusMeters') ?? 25_000);
  const facilities = await helpRepository.findNearby({ lat: place.lat, lng: place.lng }, radius);

  return json({
    emergencyNumber: NATIONAL_EMERGENCY_NUMBER,
    availabilityNote: 'Live availability is unknown. Call ahead where you can.',
    facilities: facilities.map((facility) => ({
      id: facility.id,
      name: facility.name,
      type: facility.facilityType,
      phone: facility.phone,
      lat: facility.lat,
      lng: facility.lng,
      distanceMeters: Math.round(facility.distanceMeters),
      verifiedAt: facility.verifiedAt?.toISOString() ?? null,
      issuingAuthority: facility.issuingAuthority,
      isStale: facility.isStale,
    })),
  });
});
