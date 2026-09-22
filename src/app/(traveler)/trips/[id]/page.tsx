import { notFound } from 'next/navigation';
import { tripsService } from '@/modules/trips/service';
import { catalogRepository } from '@/modules/catalog/repository';
import { businessRepository } from '@/modules/businesses/repository';
import { getSession } from '@/server/session';
import { TripWorkspace } from './TripWorkspace';
import { trackPage } from '@/server/track-page';

/**
 * Screen T09 — Itinerary and Map.
 *
 * One working surface for time, route, cost and place decisions. The server
 * loads the trip; the client component owns the edit interactions so the
 * budget and conflicts can update without a round trip through the page.
 */

export const dynamic = 'force-dynamic';

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ generate?: string }>;
}) {
  const { id } = await params;
  const { generate } = await searchParams;

  const session = await getSession();
  const detail = await tripsService.getDetail(id);

  // Object-level authorization: a trip that is not yours is reported as not
  // found, exactly as the API does, so the page cannot confirm it exists.
  if (detail === null || session === null || detail.trip.ownerUserId !== session.userId) {
    notFound();
  }

  // Each heavy-crowd warning offers a quieter alternative (PRD E14-S04).
  const crowdedPlaceIds = new Set(
    detail.days
      .flatMap((day) => day.items)
      .filter((item) => item.placeId !== null && detail.crowdByPlaceId[item.placeId]?.band === 'heavy')
      .map((item) => item.placeId as string),
  );
  await Promise.all(
    [...crowdedPlaceIds].map((placeId) =>
      trackPage('crowd_alternative_offered', { tripId: detail.trip.id, placeId }),
    ),
  );

  const placeIds = detail.days
    .flatMap((day) => day.items)
    .map((item) => item.placeId)
    .filter((placeId): placeId is string => placeId !== null);

  const places = await catalogRepository.findPlacesByIds(placeIds);

  const nearbyBusinesses =
    detail.trip.destinationId === null
      ? []
      : await businessRepository.findForDestination(detail.trip.destinationId, 8);

  return (
    <TripWorkspace
      initial={{
        trip: {
          id: detail.trip.id,
          title: detail.trip.title,
          status: detail.trip.status,
          version: detail.trip.version,
          destinationName: detail.trip.destinationName,
          startDate: detail.trip.startDate?.toISOString() ?? null,
        },
        days: detail.days.map((day) => ({
          id: day.id,
          dayNumber: day.dayNumber,
          date: day.date?.toISOString() ?? null,
          items: day.items.map((item) => ({
            id: item.id,
            title: item.title,
            itemType: item.itemType,
            placeId: item.placeId,
            localBusinessId: item.localBusinessId,
            startsAt: item.startsAt?.toISOString() ?? null,
            durationMinutes: item.durationMinutes,
            lockedByUser: item.lockedByUser,
            travelMinutes: item.travelFromPrevious.minutes,
            travelMeters: item.travelFromPrevious.meters,
            expectedMinor: item.priceEstimate.expectedMinor,
            priceState: item.priceEstimate.priceState,
          })),
        })),
        budget: detail.budget,
        conflicts: detail.conflicts,
        crowdByPlaceId: detail.crowdByPlaceId,
        places: places.map((place) => ({
          id: place.id,
          slug: place.slug,
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          category: place.category,
        })),
        businesses: nearbyBusinesses.map((business) => ({
          id: business.id,
          slug: business.slug,
          name: business.name,
          category: business.category,
          sponsored: business.sponsored,
          priceBand: business.priceBand,
        })),
      }}
      autoGenerate={generate === '1'}
    />
  );
}
