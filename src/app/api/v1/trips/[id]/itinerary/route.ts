import { z } from 'zod';
import { tripsRepository } from '@/modules/trips/repository';
import { tripsService } from '@/modules/trips/service';
import { optimizeUnlocked, reorderItems } from '@/modules/trips/domain/itinerary';
import { haversineMeters } from '@/shared/geo';
import { catalogRepository } from '@/modules/catalog/repository';
import { assertOwnsTrip } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * PATCH /api/v1/trips/{id}/itinerary
 *
 * Reorder, lock, unlock, delete or optimize. Every mutation carries the trip
 * version and is rejected with a 409 if it is stale, which is the concurrent
 * edit control from PRD Part II §7.1.
 *
 * Optimization never moves a locked item (PRD Part I T09).
 */

const BodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('reorder'),
    version: z.number().int(),
    dayId: z.string().uuid(),
    fromIndex: z.number().int().min(0),
    toIndex: z.number().int().min(0),
  }),
  z.object({
    action: z.literal('optimize'),
    version: z.number().int(),
    dayId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('lock'),
    version: z.number().int(),
    itemId: z.string().uuid(),
    locked: z.boolean(),
  }),
  z.object({
    action: z.literal('remove'),
    version: z.number().int(),
    itemId: z.string().uuid(),
  }),
]);

export const PATCH = route({ auth: 'none', body: BodySchema }, async ({ params, session, body }) => {
  await assertOwnsTrip(session, params.id);

  const trip = await tripsRepository.findById(params.id);
  if (trip === null) throw problems.notFound();
  if (trip.version !== body.version) throw problems.versionConflict();

  switch (body.action) {
    case 'lock': {
      await tripsRepository.setItemLocked(body.itemId, body.locked);
      await tripsRepository.bumpVersion(params.id);
      break;
    }

    case 'remove': {
      await tripsRepository.deleteItem(body.itemId);
      await tripsRepository.bumpVersion(params.id);
      // Removing a stop changes the budget, so rebuild it rather than letting
      // the totals drift from the plan.
      await tripsService.rebuildBudget(params.id, trip.tripBrief as never);
      break;
    }

    case 'reorder': {
      const days = await tripsRepository.listDays(params.id);
      const day = days.find((candidate) => candidate.id === body.dayId);
      if (day === undefined) throw problems.notFound();

      const reordered = reorderItems(day.items, body.fromIndex, body.toIndex);
      const version = await tripsRepository.reorderDay(
        params.id,
        body.dayId,
        reordered.map((item) => item.id),
        body.version,
      );
      if (version === null) throw problems.versionConflict();

      await tripsService.rescheduleDay(params.id, body.dayId);
      break;
    }

    case 'optimize': {
      const days = await tripsRepository.listDays(params.id);
      const day = days.find((candidate) => candidate.id === body.dayId);
      if (day === undefined) throw problems.notFound();

      const places = await catalogRepository.findPlacesByIds(
        day.items.map((item) => item.placeId).filter((id): id is string => id !== null),
      );
      const byId = new Map(places.map((place) => [place.id, place]));

      const optimized = optimizeUnlocked(day.items, (fromId, toId) => {
        const from = byId.get(fromId);
        const to = byId.get(toId);
        if (from === undefined || to === undefined) return 30;
        return haversineMeters({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }) / 1000;
      });

      const version = await tripsRepository.reorderDay(
        params.id,
        body.dayId,
        optimized.map((item) => item.id),
        body.version,
      );
      if (version === null) throw problems.versionConflict();

      await tripsService.rescheduleDay(params.id, body.dayId);
      break;
    }
  }

  const detail = await tripsService.getDetail(params.id);
  if (detail === null) throw problems.notFound();

  return json({
    trip: detail.trip,
    days: detail.days,
    budget: detail.budget,
    conflicts: detail.conflicts,
    crowdByPlaceId: detail.crowdByPlaceId,
  });
});
