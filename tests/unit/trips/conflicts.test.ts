import { describe, expect, it } from 'vitest';
import { detectConflicts } from '@/modules/trips/domain/conflicts';
import type { ConflictContext, ItineraryDay, ItineraryItem } from '@/modules/trips/domain/types';

const item = (id: string, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id,
  title: `Place ${id}`,
  itemType: 'place',
  placeId: `p-${id}`,
  localBusinessId: null,
  startsAt: new Date('2026-12-20T04:00:00Z'), // 09:30 IST
  durationMinutes: 60,
  sortOrder: 0,
  lockedByUser: false,
  travelFromPrevious: { minutes: 15, meters: 6_000, mode: 'car' },
  priceEstimate: { expectedMinor: 20_000, priceState: 'historical' },
  bookingState: null,
  notes: null,
  ...over,
});

const day = (items: ItineraryItem[]): ItineraryDay => ({
  id: 'd1',
  dayNumber: 1,
  date: new Date('2026-12-20T00:00:00Z'),
  title: 'Day 1',
  items: items.map((entry, index) => ({ ...entry, sortOrder: index })),
});

const baseContext = (over: Partial<ConflictContext> = {}): ConflictContext => ({
  placesById: {
    'p-a': {
      id: 'p-a',
      name: 'Place a',
      // 09:00-17:00 IST every day.
      openingHours: { mon: ['09:00', '17:00'], tue: ['09:00', '17:00'], wed: ['09:00', '17:00'],
        thu: ['09:00', '17:00'], fri: ['09:00', '17:00'], sat: ['09:00', '17:00'], sun: ['09:00', '17:00'] },
      accessibility: { stepFreeEntry: true, lowWalking: true },
      closureNote: null,
    },
  },
  crowdByPlaceId: {},
  constraints: {},
  budget: { expectedTotalMinor: 100_000, totalLimitMinor: 2_500_000, spendableMinor: 2_250_000 },
  ...over,
});

describe('detectConflicts', () => {
  it('returns an empty array for a feasible day', () => {
    expect(detectConflicts(day([item('a')]), baseContext())).toEqual([]);
  });

  it('flags an item scheduled outside its opening hours', () => {
    // 20:00 UTC is 01:30 IST the next day, well outside 09:00-17:00.
    const conflicts = detectConflicts(
      day([item('a', { startsAt: new Date('2026-12-20T20:00:00Z') })]),
      baseContext(),
    );
    expect(conflicts.map((c) => c.kind)).toContain('opening_hours');
  });

  it('flags total travel time exceeding half the usable day', () => {
    const conflicts = detectConflicts(
      day([item('a'), item('a2', { travelFromPrevious: { minutes: 400, meters: 200_000, mode: 'car' } })]),
      baseContext(),
    );
    expect(conflicts.map((c) => c.kind)).toContain('excessive_travel');
  });

  it('flags a visit scheduled during a heavy crowd window', () => {
    const conflicts = detectConflicts(
      day([item('a')]),
      baseContext({
        crowdByPlaceId: {
          'p-a': { band: 'heavy', label: 'Heavy crowd', explanation: 'Festival procession' },
        },
      }),
    );
    expect(conflicts.map((c) => c.kind)).toContain('crowd_peak');
  });

  it('does not flag a comfortable or unknown crowd band', () => {
    for (const band of ['comfortable', 'moderate', 'unknown'] as const) {
      const conflicts = detectConflicts(
        day([item('a')]),
        baseContext({ crowdByPlaceId: { 'p-a': { band, label: 'x', explanation: 'y' } } }),
      );
      expect(conflicts.map((c) => c.kind)).not.toContain('crowd_peak');
    }
  });

  it('flags a budget overrun against the spendable limit', () => {
    const conflicts = detectConflicts(
      day([item('a')]),
      baseContext({ budget: { expectedTotalMinor: 3_000_000, totalLimitMinor: 2_500_000, spendableMinor: 2_250_000 } }),
    );
    expect(conflicts.map((c) => c.kind)).toContain('budget_overrun');
  });

  it('flags an accessibility mismatch when the traveler needs step-free access', () => {
    const context = baseContext({ constraints: { lowWalking: true } });
    context.placesById['p-a'].accessibility = { stepFreeEntry: false, lowWalking: false };
    const conflicts = detectConflicts(day([item('a')]), context);
    expect(conflicts.map((c) => c.kind)).toContain('accessibility_mismatch');
  });

  it('flags a known closure or weather risk', () => {
    const context = baseContext();
    context.placesById['p-a'].closureNote = 'Closed during heavy monsoon rainfall';
    const conflicts = detectConflicts(day([item('a')]), context);
    expect(conflicts.map((c) => c.kind)).toContain('weather_closure');
  });

  it('gives every conflict a user-facing message, an item and a suggested action', () => {
    const conflicts = detectConflicts(
      day([item('a', { startsAt: new Date('2026-12-20T20:00:00Z') })]),
      baseContext(),
    );
    expect(conflicts.length).toBeGreaterThan(0);
    for (const conflict of conflicts) {
      expect(conflict.message.length).toBeGreaterThan(10);
      expect(conflict.suggestedAction).toBeTruthy();
      expect(conflict.severity).toMatch(/^(info|warning|blocking)$/);
    }
  });

  it('blocks a stop the tourism authority has suspended', () => {
    const context = baseContext();
    context.placesById['p-a'].suspended = true;
    const conflicts = detectConflicts(day([item('a')]), context);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: 'weather_closure', severity: 'blocking', itemId: 'a' });
    expect(conflicts[0].message).toMatch(/closed to visitors/);
  });

  it('reports only the suspension for a suspended stop, not its hours or crowds as well', () => {
    const context = baseContext({
      crowdByPlaceId: { 'p-a': { band: 'heavy', label: 'Heavy crowd', explanation: 'x' } },
    });
    context.placesById['p-a'].suspended = true;
    const conflicts = detectConflicts(
      day([item('a', { startsAt: new Date('2026-12-20T20:00:00Z') })]),
      context,
    );
    expect(conflicts.map((conflict) => conflict.kind)).toEqual(['weather_closure']);
  });

  it('does not flag opening hours for an item with no place', () => {
    const conflicts = detectConflicts(
      day([item('x', { placeId: null, startsAt: new Date('2026-12-20T20:00:00Z') })]),
      baseContext(),
    );
    expect(conflicts.map((c) => c.kind)).not.toContain('opening_hours');
  });
});
