import { tripsService } from '@/modules/trips/service';
import { catalogRepository } from '@/modules/catalog/repository';
import { assertOwnsTrip } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * GET /api/v1/trips/{id}/offline-summary
 *
 * The itinerary as a traveller needs it with no signal: times, addresses and
 * coordinates, booking references and costs.
 *
 * Crowd is deliberately excluded. PRD Part II §19 requires that offline packs
 * never label cached crowd or weather as live, and the simplest way to honour
 * that is not to put it in the pack at all.
 */
export const GET = route({ auth: 'none' }, async ({ params, session }) => {
  await assertOwnsTrip(session, params.id);

  const detail = await tripsService.getDetail(params.id);
  if (detail === null) throw problems.notFound();

  const placeIds = detail.days
    .flatMap((day) => day.items)
    .map((item) => item.placeId)
    .filter((placeId): placeId is string => placeId !== null);

  const places = await catalogRepository.findPlacesByIds(placeIds);
  const placesById = new Map(places.map((place) => [place.id, place]));

  return json({
    generatedAt: new Date().toISOString(),
    crowdAvailability: 'Crowd and weather information needs a connection and is not included here.',
    trip: {
      id: detail.trip.id,
      title: detail.trip.title,
      destination: detail.trip.destinationName,
      status: detail.trip.status,
      version: detail.trip.version,
      startDate: detail.trip.startDate?.toISOString() ?? null,
      endDate: detail.trip.endDate?.toISOString() ?? null,
    },
    days: detail.days.map((day) => ({
      dayNumber: day.dayNumber,
      date: day.date?.toISOString() ?? null,
      items: day.items.map((item) => {
        const place = item.placeId === null ? undefined : placesById.get(item.placeId);

        return {
          id: item.id,
          title: item.title,
          startsAt: item.startsAt?.toISOString() ?? null,
          durationMinutes: item.durationMinutes,
          itemType: item.itemType,
          bookingState: item.bookingState,
          notes: item.notes,
          expectedMinor: item.priceEstimate.expectedMinor,
          travelMinutes: item.travelFromPrevious.minutes,
          // Coordinates matter offline: they are what a map app can accept
          // when the network cannot resolve a name.
          location: place === undefined ? null : { lat: place.lat, lng: place.lng },
          address: place?.address ?? null,
          openingHours: place?.operatingHours ?? null,
        };
      }),
    })),
    budget:
      detail.budget === null
        ? null
        : {
            totalLimitMinor: detail.budget.totalLimitMinor,
            expectedTotalMinor: detail.budget.expectedTotalMinor,
            state: detail.budget.state,
          },
  });
});
