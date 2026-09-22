import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';
import { businessRepository } from '@/modules/businesses/repository';
import { catalogRepository } from '@/modules/catalog/repository';
import { tripsRepository } from '@/modules/trips/repository';
import { tripsService } from '@/modules/trips/service';
import { cleanupTestUsers, seedUserWithTrip } from './helpers';

let tripId: string;
let otherTripId: string;

beforeAll(async () => {
  ({ tripId } = await seedUserWithTrip());
  ({ tripId: otherTripId } = await seedUserWithTrip());
  await tripsService.generateItinerary(tripId);
  await tripsService.generateItinerary(otherTripId);
});

afterAll(async () => {
  await cleanupTestUsers();
  await sql.end();
});

const plannedIds = async (id: string) => {
  const days = await tripsRepository.listDays(id);
  return days.flatMap((day) => day.items);
};

describe('adding a stop to a plan (E10-S04)', () => {
  it('adds a nearby business at a feasible time, and rebuilds travel and budget', async () => {
    const trip = await tripsRepository.findById(tripId);
    const before = await plannedIds(tripId);
    const budgetBefore = (await tripsService.getDetail(tripId))!.budget!.expectedTotalMinor;

    const candidates = await businessRepository.findForDestination(trip!.destinationId!, 30);
    const business = candidates.find(
      // Any priced category, so the budget has something to add.
      (row) =>
        !before.some((item) => item.localBusinessId === row.id) && !['shop', 'artisan'].includes(row.category) && row.priceBand !== null,
    )!;
    expect(business).toBeDefined();

    const { itemId, slot, detail } = await tripsService.addStop(tripId, { kind: 'business', id: business.id });

    const after = await plannedIds(tripId);
    expect(after).toHaveLength(before.length + 1);
    const added = after.find((item) => item.id === itemId)!;
    const meal = ['restaurant', 'cafe', 'farm'].includes(business.category);
    expect(added).toMatchObject({ localBusinessId: business.id, itemType: meal ? 'meal' : 'business', title: business.name });
    expect(added.startsAt).not.toBeNull();
    expect(slot.addedTravelMinutes).toBeGreaterThanOrEqual(0);

    expect(detail.trip.version).toBeGreaterThan(trip!.version);
    expect(detail.budget!.expectedTotalMinor).toBeGreaterThan(budgetBefore);

    // The day was re-timed around it: every later stop starts after the one before ends.
    const day = detail.days.find((candidate) => candidate.id === slot.dayId)!;
    for (let index = 1; index < day.items.length; index += 1) {
      const previous = day.items[index - 1];
      const end = new Date(previous.startsAt!).getTime() + previous.durationMinutes * 60_000;
      expect(new Date(day.items[index].startsAt!).getTime()).toBeGreaterThanOrEqual(end);
    }
  });

  it('adds a place not yet in the plan', async () => {
    const trip = await tripsRepository.findById(tripId);
    const before = await plannedIds(tripId);
    const places = await catalogRepository.listPlacesForDestination(trip!.destinationId!);
    const place = places.find((row) => !before.some((item) => item.placeId === row.id))!;

    const result = await tripsService.addStop(tripId, { kind: 'place', id: place.id }).catch((error: { status: number }) => error);
    // A place that cannot fit anywhere is refused with a reason, never forced in.
    if ('status' in result) {
      expect(result.status).toBe(409);
    } else {
      expect((await plannedIds(tripId)).some((item) => item.placeId === place.id)).toBe(true);
    }
  });

  it('refuses to add the same stop twice, naming the day it is on', async () => {
    const [first] = (await plannedIds(tripId)).filter((item) => item.placeId !== null);
    await expect(tripsService.addStop(tripId, { kind: 'place', id: first.placeId! })).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/already in this plan, on day \d/),
    });
  });

  it('refuses a stop that is not available', async () => {
    const [pending] = await sql<{ id: string }[]>`SELECT id FROM local_businesses WHERE slug = 'nilgiri-weavers-studio'`;
    await expect(tripsService.addStop(tripId, { kind: 'business', id: pending.id })).rejects.toMatchObject({ status: 404 });
  });
});

describe('item changes are scoped to the trip', () => {
  it('will not remove or lock an item through a different trip', async () => {
    const [item] = await plannedIds(otherTripId);

    expect(await tripsRepository.deleteItem(tripId, item.id)).toBeNull();
    expect(await tripsRepository.setItemLocked(tripId, item.id, true)).toBe(false);
    expect((await plannedIds(otherTripId)).some((candidate) => candidate.id === item.id)).toBe(true);

    expect(await tripsRepository.deleteItem(otherTripId, item.id)).not.toBeNull();
  });
});

describe('inserting mid-day', () => {
  it('moves later items down without breaking their order', async () => {
    const days = await tripsRepository.listDays(otherTripId);
    const day = days.find((candidate) => candidate.items.length >= 2)!;
    const before = day.items.map((item) => item.id);

    const itemId = await tripsRepository.insertItemAt(otherTripId, day.id, 0, {
      itemType: 'note',
      title: 'Test note',
      startsAt: null,
      durationMinutes: 10,
      sortOrder: 0,
      travelFromPrevious: { minutes: 0, meters: 0, mode: 'car' },
      priceEstimate: { expectedMinor: 0, priceState: 'manual' },
    });

    const after = (await tripsRepository.listDays(otherTripId)).find((candidate) => candidate.id === day.id)!;
    expect(after.items.map((item) => item.id)).toEqual([itemId, ...before]);
  });
});
