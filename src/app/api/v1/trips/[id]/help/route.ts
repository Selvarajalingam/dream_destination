import { helpRepository, NATIONAL_EMERGENCY_NUMBER } from '@/modules/help/repository';
import { assertOwnsTrip } from '@/server/authorize';
import { json, route } from '@/server/handler';

/**
 * GET /api/v1/trips/{id}/help
 *
 * Every help facility near anywhere this trip goes, so Nearby Help answers
 * with no signal. Availability is explicitly unknown (PRD Part I T18).
 */
export const GET = route({ auth: 'none' }, async ({ params, session }) => {
  await assertOwnsTrip(session, params.id);

  const facilities = await helpRepository.findForTrip(params.id);

  return json({
    emergencyNumber: NATIONAL_EMERGENCY_NUMBER,
    availabilityNote: 'Live availability is unknown. These are the numbers we hold on record.',
    facilities: facilities.map((facility) => ({
      id: facility.id,
      name: facility.name,
      type: facility.facilityType,
      phone: facility.phone,
      lat: facility.lat,
      lng: facility.lng,
      verifiedAt: facility.verifiedAt?.toISOString() ?? null,
      issuingAuthority: facility.issuingAuthority,
      isStale: facility.isStale,
    })),
  });
});
