import { describe, expect, it } from 'vitest';
import { findSlot, indiaClock, openThroughout, type DayPlan, type NewStop, type TravelMinutes } from '@/modules/trips/domain/insertion';

/** Points on a line: one unit of longitude is ten minutes of travel. */
const at = (x: number) => ({ lat: 11, lng: x });
const travel: TravelMinutes = (from, to) => (from === null || to === null ? 15 : Math.round(Math.abs(from.lng - to.lng) * 10));

// 09:00 IST on Tuesday 6 October 2026.
const nine = new Date('2026-10-06T03:30:00Z');
const plus = (minutes: number) => new Date(nine.getTime() + minutes * 60_000);

const day = (stops: DayPlan['stops'], overrides: Partial<DayPlan> = {}): DayPlan => ({
  dayId: 'day-1',
  dayNumber: 1,
  dayStart: nine,
  isoDate: '2026-10-06',
  stops,
  ...overrides,
});

const stop = (id: string, x: number, minutes = 60, locked: Date | null = null) => ({
  id,
  point: at(x),
  startsAt: locked,
  durationMinutes: minutes,
  lockedByUser: locked !== null,
});

const newStop = (x: number, overrides: Partial<NewStop> = {}): NewStop => ({
  point: at(x),
  durationMinutes: 45,
  hours: null,
  closure: null,
  ...overrides,
});

const options = { dayMinutes: 510, travel };

describe('findSlot', () => {
  it('puts a stop that lies on the way between two stops, adding no travel', () => {
    const result = findSlot([day([stop('a', 0), stop('b', 4)])], newStop(2), options);
    expect(result).toEqual({ slot: expect.objectContaining({ index: 1, addedTravelMinutes: 0 }) });
  });

  it('prefers the day where the stop adds least travel', () => {
    const near = day([stop('a', 10), stop('b', 11)], { dayId: 'day-2', dayNumber: 2 });
    const far = day([stop('c', 0), stop('d', 1)]);
    const result = findSlot([far, near], newStop(12), options);
    expect(result).toEqual({ slot: expect.objectContaining({ dayId: 'day-2', index: 2, addedTravelMinutes: 10 }) });
  });

  it('never pushes a stop the traveller locked to a time', () => {
    // b is locked at 10:10, exactly when it would start anyway. Anything
    // inserted before it would make it late, so the stop goes after it.
    const plan = day([stop('a', 0), stop('b', 1, 60, plus(70))]);
    const result = findSlot([plan], newStop(0.5), options);
    expect(result).toEqual({ slot: expect.objectContaining({ index: 2 }) });
  });

  it('only schedules the stop while it is open for the whole visit', () => {
    // Open 14:00–15:00 on Tuesdays. After a/b the day reaches 11:10; the
    // stop cannot wait for the afternoon, so no slot opens.
    const plan = day([stop('a', 0), stop('b', 1)]);
    const lateOpening = newStop(1, { hours: { tue: ['14:00', '15:00'] } });
    expect(findSlot([plan], lateOpening, options)).toEqual({ refusal: 'closed' });

    const morning = newStop(1, { hours: { tue: ['09:00', '12:00'] } });
    const found = findSlot([plan], morning, options);
    if (!('slot' in found)) throw new Error('expected a slot');
    expect(openThroughout(morning.hours, found.slot.startsAt, morning.durationMinutes)).toBe(true);
  });

  it('refuses when there is no room left in the day', () => {
    const full = day([stop('a', 0, 240), stop('b', 0, 240)]);
    expect(findSlot([full], newStop(0), options)).toEqual({ refusal: 'no_time' });
  });

  it('lets an already long day keep its length but not grow', () => {
    const long = day([stop('a', 0, 300), stop('b', 0, 300)]);
    expect(findSlot([long], newStop(0, { durationMinutes: 1 }), options)).toEqual({ refusal: 'no_time' });
  });

  it('skips days inside an owner’s temporary closure', () => {
    const tuesday = day([stop('a', 0)]);
    const wednesday = day([stop('b', 0)], { dayId: 'day-2', dayNumber: 2, dayStart: plus(24 * 60), isoDate: '2026-10-07' });
    const result = findSlot([tuesday, wednesday], newStop(0, { closure: { from: '2026-10-06', until: '2026-10-06' } }), options);
    expect(result).toEqual({ slot: expect.objectContaining({ dayId: 'day-2' }) });
  });

  it('searches only the day the traveller chose, when they chose one', () => {
    const one = day([stop('a', 0)]);
    const two = day([stop('b', 20)], { dayId: 'day-2', dayNumber: 2 });
    const result = findSlot([one, two], newStop(0), { ...options, onlyDayId: 'day-2' });
    expect(result).toEqual({ slot: expect.objectContaining({ dayId: 'day-2' }) });
  });

  it('fits a stop into an empty day at the start of the day', () => {
    const result = findSlot([day([])], newStop(3), options);
    expect(result).toEqual({ slot: { dayId: 'day-1', dayNumber: 1, index: 0, startsAt: nine, addedTravelMinutes: 0 } });
  });
});

describe('opening hours in India', () => {
  it('reads the weekday and time in IST, whatever the server clock', () => {
    expect(indiaClock(new Date('2026-10-06T03:30:00Z'))).toEqual({ day: 'tue', minutes: 540 });
    // 23:00 UTC Monday is 04:30 Tuesday in India.
    expect(indiaClock(new Date('2026-10-05T23:00:00Z'))).toEqual({ day: 'tue', minutes: 270 });
  });

  it('treats unknown hours as not ruling a time out, and a missing day as closed', () => {
    expect(openThroughout(null, nine, 60)).toBe(true);
    expect(openThroughout({}, nine, 60)).toBe(true);
    expect(openThroughout({ mon: ['09:00', '18:00'] }, nine, 60)).toBe(false);
    expect(openThroughout({ tue: ['09:00', '09:30'] }, nine, 60)).toBe(false);
  });
});
