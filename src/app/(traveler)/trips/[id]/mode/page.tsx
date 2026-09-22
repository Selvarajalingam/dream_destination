import { notFound } from 'next/navigation';
import { tripsService } from '@/modules/trips/service';
import { catalogRepository } from '@/modules/catalog/repository';
import { getSession } from '@/server/session';
import { TripMode } from './TripMode';
import { trackPage } from '@/server/track-page';

/**
 * Screens T15–T17 — Trip Mode.
 *
 * Answers "what should I do now?" immediately. The interface is reduced: the
 * next action comes first, promotional content never sits above it, and
 * Nearby Help stays reachable throughout.
 */

export const dynamic = 'force-dynamic';

export default async function TripModePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getSession();
  const detail = await tripsService.getDetail(id);

  if (detail === null || session === null || detail.trip.ownerUserId !== session.userId) notFound();

  await trackPage('trip_mode_started', { tripId: detail.trip.id });

  const placeIds = detail.days
    .flatMap((day) => day.items)
    .map((item) => item.placeId)
    .filter((placeId): placeId is string => placeId !== null);

  const places = await catalogRepository.findPlacesByIds(placeIds);
  const placesById = new Map(places.map((place) => [place.id, place]));

  const items = detail.days
    .flatMap((day) => day.items.map((item) => ({ ...item, dayNumber: day.dayNumber })))
    .filter((item) => item.startsAt !== null)
    .sort((a, b) => (a.startsAt as Date).getTime() - (b.startsAt as Date).getTime());

  return (
    <TripMode
      tripId={detail.trip.id}
      tripTitle={detail.trip.destinationName ?? detail.trip.title}
      status={detail.trip.status}
      items={items.map((item) => {
        const place = item.placeId === null ? undefined : placesById.get(item.placeId);
        const crowd = item.placeId === null ? undefined : detail.crowdByPlaceId[item.placeId];

        return {
          id: item.id,
          title: item.title,
          dayNumber: item.dayNumber,
          startsAt: (item.startsAt as Date).toISOString(),
          durationMinutes: item.durationMinutes,
          travelMinutes: item.travelFromPrevious.minutes,
          lat: place?.lat ?? null,
          lng: place?.lng ?? null,
          crowdLabel: crowd?.label ?? null,
          crowdBand: crowd?.band ?? null,
          crowdExplanation: crowd?.explanation ?? null,
        };
      })}
      conflicts={detail.conflicts.map((conflict) => ({
        kind: conflict.kind,
        severity: conflict.severity,
        message: conflict.message,
        suggestedAction: conflict.suggestedAction,
      }))}
    />
  );
}
