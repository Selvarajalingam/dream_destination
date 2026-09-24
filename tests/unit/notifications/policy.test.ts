import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  DEFAULT_PREFERENCES,
  decideDelivery,
  dedupeKey,
  inQuietHours,
  mayAskForPermission,
  quietHoursEnd,
  shouldRemoveSubscription,
  tripReminders,
  type Preferences,
} from '@/modules/notifications/domain/policy';

const ist = (clock: string, date = '2026-09-23'): Date => {
  const [hour, minute] = clock.split(':').map(Number);
  // IST is UTC+5:30.
  return new Date(Date.UTC(2026, 8, Number(date.slice(-2)), hour - 5, minute - 30));
};

const preferences: Preferences = DEFAULT_PREFERENCES;

describe('quiet hours', () => {
  it('reads a window that wraps midnight', () => {
    expect(inQuietHours(ist('22:00'), preferences)).toBe(true);
    expect(inQuietHours(ist('03:00'), preferences)).toBe(true);
    expect(inQuietHours(ist('07:29'), preferences)).toBe(true);
    expect(inQuietHours(ist('07:30'), preferences)).toBe(false);
    expect(inQuietHours(ist('12:00'), preferences)).toBe(false);
  });

  it('reads a window inside one day', () => {
    const daytime: Preferences = { ...preferences, quietFrom: '13:00', quietUntil: '15:00' };
    expect(inQuietHours(ist('14:00'), daytime)).toBe(true);
    expect(inQuietHours(ist('22:00'), daytime)).toBe(false);
  });

  it('treats equal times as no quiet hours at all', () => {
    const none: Preferences = { ...preferences, quietFrom: '00:00', quietUntil: '00:00' };
    expect(inQuietHours(ist('03:00'), none)).toBe(false);
  });

  it('works out when they end, across midnight', () => {
    expect(quietHoursEnd(ist('22:00'), preferences).toISOString()).toBe(ist('07:30', '2026-09-24').toISOString());
    expect(quietHoursEnd(ist('03:00'), preferences).toISOString()).toBe(ist('07:30').toISOString());
  });
});

describe('decideDelivery', () => {
  const base = { preferences, now: ist('22:00'), lastSentAt: null, dedupeWindowMinutes: 360 } as const;

  it('sends a safety alert during quiet hours', () => {
    expect(decideDelivery({ ...base, category: 'safety' })).toEqual({ action: 'send' });
  });

  it('holds everything else until quiet hours end', () => {
    const decision = decideDelivery({ ...base, category: 'trip_reminder' });
    expect(decision).toMatchObject({ action: 'hold', reason: expect.stringMatching(/quiet hours/) });
  });

  it('drops a category the traveller turned off', () => {
    const off: Preferences = { ...preferences, categories: { ...preferences.categories, safety: false } };
    expect(decideDelivery({ ...base, preferences: off, category: 'safety' })).toMatchObject({ action: 'suppress' });
  });

  it('keeps commercial suggestions off unless they are asked for', () => {
    expect(DEFAULT_PREFERENCES.categories.local_offer).toBe(false);
    expect(CATEGORIES.filter((entry) => entry.commercial).map((entry) => entry.key)).toEqual(['local_offer']);
    expect(CATEGORIES.filter((entry) => entry.urgent).map((entry) => entry.key)).toEqual(['safety']);
  });

  it('does not repeat the same trigger inside its window', () => {
    const recent = decideDelivery({ ...base, category: 'safety', lastSentAt: ist('20:00') });
    expect(recent).toMatchObject({ action: 'suppress', reason: expect.stringMatching(/already told/) });

    const old = decideDelivery({ ...base, category: 'safety', lastSentAt: ist('10:00') });
    expect(old).toEqual({ action: 'send' });
  });
});

describe('dedupeKey', () => {
  // A coarse guard on fixed windows; decideDelivery's last-sent check is the
  // precise one, so a key that falls either side of a boundary changes nothing.
  it('is the same inside a window and different across one', () => {
    const args = { tripId: 't1', trigger: 'countdown_1', windowMinutes: 60 };
    expect(dedupeKey({ ...args, at: ist('10:05') })).toBe(dedupeKey({ ...args, at: ist('10:25') }));
    expect(dedupeKey({ ...args, at: ist('10:05') })).not.toBe(dedupeKey({ ...args, at: ist('12:05') }));
    expect(dedupeKey({ ...args, at: ist('10:05') })).not.toBe(dedupeKey({ ...args, tripId: 't2', at: ist('10:05') }));
  });
});

describe('mayAskForPermission (E12-S06)', () => {
  it('never asks before a trip is saved or Trip Mode starts', () => {
    expect(mayAskForPermission({ hasSavedTrip: false, tripModeActive: false, alreadyAsked: false })).toBe(false);
    expect(mayAskForPermission({ hasSavedTrip: true, tripModeActive: false, alreadyAsked: false })).toBe(true);
    expect(mayAskForPermission({ hasSavedTrip: false, tripModeActive: true, alreadyAsked: false })).toBe(true);
    expect(mayAskForPermission({ hasSavedTrip: true, tripModeActive: true, alreadyAsked: true })).toBe(false);
  });
});

describe('shouldRemoveSubscription', () => {
  it('drops an endpoint the push service says is gone', () => {
    expect(shouldRemoveSubscription({ status: 404, failureCount: 1 })).toBe(true);
    expect(shouldRemoveSubscription({ status: 410, failureCount: 1 })).toBe(true);
  });

  it('keeps one that failed once for another reason, and drops it after repeats', () => {
    expect(shouldRemoveSubscription({ status: 500, failureCount: 1 })).toBe(false);
    expect(shouldRemoveSubscription({ status: null, failureCount: 4 })).toBe(false);
    expect(shouldRemoveSubscription({ status: 500, failureCount: 5 })).toBe(true);
  });
});

describe('tripReminders (E12-S07)', () => {
  const trip = { tripId: 't1', tripTitle: 'Nilgiris trip', offlinePackSaved: true };

  it('reminds a week out and the day before, and not in between', () => {
    const weekOut = tripReminders({ ...trip, startDate: ist('09:00', '2026-09-30'), now: ist('09:00') });
    expect(weekOut.map((reminder) => reminder.trigger)).toEqual(['countdown_7']);

    const threeDays = tripReminders({ ...trip, startDate: ist('09:00', '2026-09-26'), now: ist('09:00') });
    expect(threeDays).toEqual([]);

    const dayBefore = tripReminders({ ...trip, startDate: ist('09:00', '2026-09-24'), now: ist('09:00') });
    expect(dayBefore.map((reminder) => reminder.trigger)).toEqual(['countdown_1']);
  });

  it('asks for the offline pack near departure, only while it is missing', () => {
    const missing = tripReminders({ ...trip, offlinePackSaved: false, startDate: ist('09:00', '2026-09-24'), now: ist('09:00') });
    expect(missing.map((reminder) => reminder.trigger)).toContain('offline_pack');

    const saved = tripReminders({ ...trip, startDate: ist('09:00', '2026-09-24'), now: ist('09:00') });
    expect(saved.map((reminder) => reminder.trigger)).not.toContain('offline_pack');
  });

  it('says nothing about a trip with no dates', () => {
    expect(tripReminders({ ...trip, startDate: null, now: ist('09:00') })).toEqual([]);
  });

  it('never sends a reminder as a commercial category', () => {
    const reminders = tripReminders({ ...trip, offlinePackSaved: false, startDate: ist('09:00', '2026-09-24'), now: ist('09:00') });
    expect(reminders.every((reminder) => reminder.category === 'trip_reminder')).toBe(true);
  });
});
