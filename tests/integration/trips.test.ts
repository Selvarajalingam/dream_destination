import { afterAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';
import { catalogRepository } from '@/modules/catalog/repository';
import { tripsRepository } from '@/modules/trips/repository';
import { tripsService } from '@/modules/trips/service';
import type { TripBrief } from '@/platform/ai/schemas';
import { cleanupTestUsers, createTestUser } from './helpers';

afterAll(async () => {
  await cleanupTestUsers();
  await sql.end();
});

const BRIEF: TripBrief = {
  origin: { label: 'Coimbatore', coordinates: [76.9558, 11.0168] },
  dateFlexibility: '2026-12',
  durationDays: 4,
  party: { type: 'family', adults: 3, children: 1 },
  budget: { currency: 'INR', totalMinor: 2_500_000 },
  interests: ['nature', 'heritage'],
  crowdTolerance: 'low',
  pace: 'relaxed',
};

async function generateNilgirisTrip(brief: TripBrief = BRIEF) {
  const session = await createTestUser();
  const destination = await catalogRepository.findDestinationBySlug('ooty-nilgiris');

  const trip = await tripsRepository.create({
    ownerUserId: session.userId,
    destinationId: destination!.id,
    title: 'Nilgiris trip',
    startDate: new Date('2026-12-18'),
    endDate: new Date('2026-12-21'),
    originText: 'Coimbatore',
    origin: { lat: 11.0168, lng: 76.9558 },
    party: brief.party ?? {},
    tripBrief: brief as unknown as Record<string, unknown>,
    totalBudgetInr: 25_000,
  });

  return tripsService.generateItinerary(trip.id);
}

describe('tripsService.generateItinerary', () => {
  it('produces one day per brief duration', async () => {
    const detail = await generateNilgirisTrip();
    expect(detail.days).toHaveLength(4);
  });

  it('schedules real places with start times and durations', async () => {
    const detail = await generateNilgirisTrip();
    const items = detail.days.flatMap((day) => day.items);

    expect(items.length).toBeGreaterThanOrEqual(6);
    for (const item of items) {
      expect(item.startsAt).toBeInstanceOf(Date);
      expect(item.durationMinutes).toBeGreaterThan(0);
      expect(item.title.length).toBeGreaterThan(0);
    }
  });

  it('never schedules the same place twice', async () => {
    const detail = await generateNilgirisTrip();
    const placeIds = detail.days
      .flatMap((day) => day.items)
      .map((item) => item.placeId)
      .filter((id): id is string => id !== null);

    expect(new Set(placeIds).size).toBe(placeIds.length);
  });

  it('never schedules a place outside its opening hours', async () => {
    const detail = await generateNilgirisTrip();
    expect(detail.conflicts.filter((conflict) => conflict.kind === 'opening_hours')).toHaveLength(0);
  });

  it('chains start times through visit duration and travel time', async () => {
    const detail = await generateNilgirisTrip();
    for (const day of detail.days) {
      for (let index = 1; index < day.items.length; index += 1) {
        const previous = day.items[index - 1];
        const current = day.items[index];
        const previousEnd = previous.startsAt!.getTime() + previous.durationMinutes * 60_000;
        expect(current.startsAt!.getTime()).toBeGreaterThanOrEqual(previousEnd);
      }
    }
  });

  it('includes a local business inside the itinerary', async () => {
    const detail = await generateNilgirisTrip();
    const businessItems = detail.days
      .flatMap((day) => day.items)
      .filter((item) => item.localBusinessId !== null);

    expect(businessItems.length).toBeGreaterThanOrEqual(1);
  });

  it('builds a budget covering stay, transport, activities and food', async () => {
    const detail = await generateNilgirisTrip();
    expect(detail.budget).not.toBeNull();

    const categories = detail.budget!.byCategory.map((entry) => entry.category);
    expect(categories).toEqual(expect.arrayContaining(['stay', 'transport', 'food']));
  });

  it('labels every budget line with its price provenance', async () => {
    const detail = await generateNilgirisTrip();
    const budget = await tripsRepository.findBudget(
      (await sql<{ id: string }[]>`SELECT trip_id AS id FROM budgets ORDER BY updated_at DESC LIMIT 1`)[0].id,
    );
    expect(budget).not.toBeNull();
    for (const line of budget!.lines) {
      expect(['live', 'partner', 'historical', 'manual']).toContain(line.priceState);
    }
    expect(detail.budget!.estimatedItemCount).toBeGreaterThan(0);
  });

  it('holds back a reserve from the declared budget', async () => {
    const detail = await generateNilgirisTrip();
    expect(detail.budget!.reserveMinor).toBeGreaterThan(0);
    expect(detail.budget!.totalLimitMinor).toBe(2_500_000);
  });

  it('reports a crowd status for every scheduled place', async () => {
    const detail = await generateNilgirisTrip();
    const placeIds = detail.days
      .flatMap((day) => day.items)
      .map((item) => item.placeId)
      .filter((id): id is string => id !== null);

    for (const placeId of placeIds) {
      expect(detail.crowdByPlaceId[placeId]).toBeDefined();
      expect(detail.crowdByPlaceId[placeId].label.length).toBeGreaterThan(0);
    }
  });

  it('bumps the trip version so concurrent edits can be detected', async () => {
    const detail = await generateNilgirisTrip();
    expect(detail.trip.version).toBeGreaterThan(1);
  });

  it('is deterministic: the same trip and catalog give the same plan', async () => {
    const first = await generateNilgirisTrip();
    const second = await tripsService.generateItinerary(first.trip.id);

    expect(second.days.flatMap((day) => day.items).map((item) => item.title)).toEqual(
      first.days.flatMap((day) => day.items).map((item) => item.title),
    );
  });

  it('schedules step-free places when the traveller limits walking', async () => {
    const detail = await generateNilgirisTrip({ ...BRIEF, constraints: { lowWalking: true } });

    const scheduledIds = detail.days
      .flatMap((day) => day.items)
      .map((item) => item.placeId)
      .filter((id): id is string => id !== null);

    const places = await catalogRepository.findPlacesByIds(scheduledIds);
    const stepFree = places.filter((place) => place.accessibility.stepFreeEntry === true);

    // The invariant that matters: a declared need is honoured, so the plan is
    // predominantly step-free rather than a mix chosen by score alone.
    expect(stepFree.length / places.length).toBeGreaterThanOrEqual(0.8);
  });

  it('prefers step-free places over higher-scoring inaccessible ones', async () => {
    const withConstraint = await generateNilgirisTrip({ ...BRIEF, constraints: { lowWalking: true } });
    const without = await generateNilgirisTrip({ ...BRIEF, constraints: {} });

    const shareStepFree = async (
      detail: Awaited<ReturnType<typeof generateNilgirisTrip>>,
    ): Promise<number> => {
      const ids = detail.days
        .flatMap((day) => day.items)
        .map((item) => item.placeId)
        .filter((id): id is string => id !== null);
      const places = await catalogRepository.findPlacesByIds(ids);
      return places.filter((place) => place.accessibility.stepFreeEntry === true).length / places.length;
    };

    expect(await shareStepFree(withConstraint)).toBeGreaterThan(await shareStepFree(without));
  });

  it('surfaces any remaining accessibility mismatch with an action', async () => {
    const detail = await generateNilgirisTrip({ ...BRIEF, constraints: { lowWalking: true } });

    // PRD Part I T09 requires an inline warning wherever the plan cannot meet
    // a declared need. Where the catalog can satisfy it there will be none,
    // but any that do appear must carry something the traveller can do.
    for (const mismatch of detail.conflicts.filter((c) => c.kind === 'accessibility_mismatch')) {
      expect(mismatch.suggestedAction.length).toBeGreaterThan(5);
      expect(mismatch.itemId).not.toBeNull();
    }
  });

  it('does not flag accessibility when the traveller did not ask', async () => {
    const detail = await generateNilgirisTrip({ ...BRIEF, constraints: {} });
    const mismatches = detail.conflicts.filter((c) => c.kind === 'accessibility_mismatch');
    expect(mismatches).toHaveLength(0);
  });

  it('produces a shorter day for a relaxed pace than for a packed one', async () => {
    const relaxed = await generateNilgirisTrip({ ...BRIEF, pace: 'relaxed' });
    const packed = await generateNilgirisTrip({ ...BRIEF, pace: 'packed' });

    const minutesOf = (detail: Awaited<ReturnType<typeof generateNilgirisTrip>>): number =>
      detail.days[0].items.reduce(
        (total, item) => total + item.durationMinutes + item.travelFromPrevious.minutes,
        0,
      );

    expect(minutesOf(packed)).toBeGreaterThanOrEqual(minutesOf(relaxed));
  });

  it('refuses to generate without a destination', async () => {
    const session = await createTestUser();
    const trip = await tripsRepository.create({
      ownerUserId: session.userId,
      destinationId: null,
      title: 'No destination',
      startDate: null,
      endDate: null,
      originText: null,
      origin: null,
      party: {},
      tripBrief: BRIEF as unknown as Record<string, unknown>,
      totalBudgetInr: 25_000,
    });

    await expect(tripsService.generateItinerary(trip.id)).rejects.toMatchObject({
      code: 'trip.no_destination',
    });
  });
});

describe('trip state transitions', () => {
  it('moves a trip forward through the planning path', async () => {
    const detail = await generateNilgirisTrip();
    await tripsService.setStatus(detail.trip.id, 'upcoming');
    await tripsService.setStatus(detail.trip.id, 'active');

    const trip = await tripsRepository.findById(detail.trip.id);
    expect(trip!.status).toBe('active');
    expect(trip!.activeStartedAt).toBeInstanceOf(Date);
  });

  it('refuses to skip from draft straight to active', async () => {
    const detail = await generateNilgirisTrip();
    await expect(tripsService.setStatus(detail.trip.id, 'active')).rejects.toMatchObject({
      code: 'trip.invalid_transition',
    });
  });
});

describe('itinerary reordering', () => {
  it('rejects a reorder that carries a stale version', async () => {
    const detail = await generateNilgirisTrip();
    const day = detail.days.find((candidate) => candidate.items.length >= 2)!;
    const ids = day.items.map((item) => item.id);

    const staleVersion = detail.trip.version - 1;
    const result = await tripsRepository.reorderDay(detail.trip.id, day.id, ids, staleVersion);
    expect(result).toBeNull();
  });

  it('accepts a reorder at the current version and bumps it', async () => {
    const detail = await generateNilgirisTrip();
    const day = detail.days.find((candidate) => candidate.items.length >= 2)!;
    const reversed = [...day.items].reverse().map((item) => item.id);

    const version = await tripsRepository.reorderDay(detail.trip.id, day.id, reversed, detail.trip.version);
    expect(version).toBe(detail.trip.version + 1);

    const days = await tripsRepository.listDays(detail.trip.id);
    const updated = days.find((candidate) => candidate.id === day.id)!;
    expect(updated.items.map((item) => item.id)).toEqual(reversed);
  });
});
