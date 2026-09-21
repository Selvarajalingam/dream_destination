import { businessRepository } from '@/modules/businesses/repository';
import { assertOwnsTrip } from '@/server/authorize';
import { json, route } from '@/server/handler';

/**
 * GET /api/v1/trips/{id}/businesses
 *
 * Contact details for local businesses near this trip, so a traveller can
 * still reach them with no signal.
 */
export const GET = route({ auth: 'none' }, async ({ params, session }) => {
  await assertOwnsTrip(session, params.id);

  const businesses = await businessRepository.findNearTrip(params.id, 8_000, 20);

  return json({
    businesses: businesses.map((business) => ({
      id: business.id,
      slug: business.slug,
      name: business.name,
      category: business.category,
      phone: business.phone,
      lat: business.lat,
      lng: business.lng,
      sponsored: business.sponsored,
      lastOwnerUpdateAt: business.lastOwnerUpdateAt?.toISOString() ?? null,
    })),
  });
});
