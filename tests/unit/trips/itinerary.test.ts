import { describe, expect, it } from 'vitest';
import { recalculateSchedule, reorderItems, optimizeUnlocked } from '@/modules/trips/domain/itinerary';
import type { ItineraryItem } from '@/modules/trips/domain/types';

const item = (id: string, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id,
  title: id,
  itemType: 'place',
  placeId: `p-${id}`,
  localBusinessId: null,
  startsAt: null,
  durationMinutes: 60,
  sortOrder: 0,
  lockedByUser: false,
  travelFromPrevious: { minutes: 0, meters: 0, mode: 'car' },
  priceEstimate: { expectedMinor: 0, priceState: 'historical' },
  bookingState: null,
  notes: null,
  ...over,
});

describe('reorderItems', () => {
  it('moves an unlocked item and renumbers sort order contiguously', () => {
    const result = reorderItems([item('a'), item('b'), item('c')], 0, 2);
    expect(result.map((i) => i.id)).toEqual(['b', 'c', 'a']);
    expect(result.map((i) => i.sortOrder)).toEqual([0, 1, 2]);
  });

  it('refuses to move a locked item', () => {
    const items = [item('a', { lockedByUser: true }), item('b'), item('c')];
    expect(reorderItems(items, 0, 2).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a locked item at its original index when others move around it', () => {
    const items = [item('a'), item('b', { lockedByUser: true }), item('c')];
    const result = reorderItems(items, 2, 0);
    expect(result[1].id).toBe('b');
  });

  it('ignores an out-of-range index', () => {
    const items = [item('a'), item('b')];
    expect(reorderItems(items, 5, 0).map((i) => i.id)).toEqual(['a', 'b']);
    expect(reorderItems(items, 0, -1).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the array it was given', () => {
    const items = [item('a'), item('b'), item('c')];
    reorderItems(items, 0, 2);
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('recalculateSchedule', () => {
  it('chains start times through duration plus travel time', () => {
    const dayStart = new Date('2026-12-20T03:30:00Z'); // 09:00 IST
    const result = recalculateSchedule(
      [item('a', { durationMinutes: 90 }), item('b', { durationMinutes: 60 })],
      dayStart,
      () => ({ minutes: 30, meters: 12_000, mode: 'car' }),
    );
    expect(result[0].startsAt?.toISOString()).toBe('2026-12-20T03:30:00.000Z');
    expect(result[1].startsAt?.toISOString()).toBe('2026-12-20T05:30:00.000Z');
    expect(result[1].travelFromPrevious.minutes).toBe(30);
  });

  it('gives the first item no travel leg', () => {
    const result = recalculateSchedule([item('a')], new Date('2026-12-20T03:30:00Z'), () => ({
      minutes: 45,
      meters: 20_000,
      mode: 'car',
    }));
    expect(result[0].travelFromPrevious.minutes).toBe(0);
  });

  it('does not move an item the user locked to a specific time', () => {
    const dayStart = new Date('2026-12-20T03:30:00Z');
    const pinned = new Date('2026-12-20T08:00:00Z');
    const result = recalculateSchedule(
      [item('a', { durationMinutes: 60 }), item('b', { lockedByUser: true, startsAt: pinned })],
      dayStart,
      () => ({ minutes: 20, meters: 8_000, mode: 'car' }),
    );
    expect(result[1].startsAt?.toISOString()).toBe(pinned.toISOString());
  });

  it('resumes chaining after a pinned item from that item end', () => {
    const dayStart = new Date('2026-12-20T03:30:00Z');
    const pinned = new Date('2026-12-20T08:00:00Z');
    const result = recalculateSchedule(
      [
        item('a', { durationMinutes: 60 }),
        item('b', { lockedByUser: true, startsAt: pinned, durationMinutes: 60 }),
        item('c', { durationMinutes: 30 }),
      ],
      dayStart,
      () => ({ minutes: 20, meters: 8_000, mode: 'car' }),
    );
    expect(result[2].startsAt?.toISOString()).toBe('2026-12-20T09:20:00.000Z');
  });

  it('handles an empty day', () => {
    expect(recalculateSchedule([], new Date(), () => ({ minutes: 0, meters: 0, mode: 'car' }))).toEqual([]);
  });
});

describe('optimizeUnlocked', () => {
  it('never changes the position of a locked item', () => {
    const items = [
      item('a', { lockedByUser: true }),
      item('b', { placeId: 'p-far' }),
      item('c', { placeId: 'p-near' }),
    ];
    const result = optimizeUnlocked(items, (from, to) => (from === 'p-a' && to === 'p-near' ? 10 : 90));
    expect(result[0].id).toBe('a');
    expect(result[0].lockedByUser).toBe(true);
  });

  it('orders unlocked items to reduce total travel', () => {
    const items = [item('start'), item('far'), item('near')];
    const distance = (from: string, to: string): number => {
      const table: Record<string, number> = {
        'p-start|p-near': 10,
        'p-start|p-far': 100,
        'p-near|p-far': 20,
        'p-far|p-near': 20,
      };
      return table[`${from}|${to}`] ?? 100;
    };
    const result = optimizeUnlocked(items, distance);
    expect(result.map((i) => i.id)).toEqual(['start', 'near', 'far']);
  });

  it('returns a stable result for an already optimal day', () => {
    const items = [item('a'), item('b')];
    const once = optimizeUnlocked(items, () => 10);
    const twice = optimizeUnlocked(once, () => 10);
    expect(twice.map((i) => i.id)).toEqual(once.map((i) => i.id));
  });
});
