import { addMinutes } from '@/shared/time';
import type { OpeningHours } from './types';

/**
 * Adding one stop to an existing plan — PRD backlog E10-S04 and the T10
 * "Add to trip" action.
 *
 * E10-S04: "User can add a business at a feasible time. Travel time and
 * budget update. User can undo."
 *
 * A slot is feasible when the stop is open for its whole visit, no stop the
 * traveller locked to a time is pushed later, and the day does not run past
 * its end. Among feasible slots, the one adding the least travel wins, so the
 * plan bends as little as possible. Pure: travel and the clock are inputs.
 */

export type PlannedStop = {
  id: string;
  /** Null when the stop has no known location, such as a free-text note. */
  point: { lat: number; lng: number } | null;
  startsAt: Date | null;
  durationMinutes: number;
  lockedByUser: boolean;
};

export type DayPlan = {
  dayId: string;
  dayNumber: number;
  /** 09:00 in India on that day. */
  dayStart: Date;
  /** ISO date in India, for closures. */
  isoDate: string;
  stops: PlannedStop[];
};

export type NewStop = {
  point: { lat: number; lng: number };
  durationMinutes: number;
  /** Null or empty means hours are not known, which does not rule a slot out. */
  hours: OpeningHours | null;
  /** An owner's temporary closure, inclusive ISO dates. */
  closure: { from: string; until: string } | null;
};

export type Slot = {
  dayId: string;
  dayNumber: number;
  /** Position among that day's stops. */
  index: number;
  startsAt: Date;
  /** Travel the insertion adds to the day, in minutes. */
  addedTravelMinutes: number;
};

export type SlotRefusal = 'closed' | 'no_time';

export type TravelMinutes = (from: { lat: number; lng: number } | null, to: { lat: number; lng: number } | null) => number;

const IST_OFFSET_MINUTES = 330;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Day of week and minutes past midnight in India. India has no daylight saving. */
export function indiaClock(at: Date): { day: (typeof WEEKDAYS)[number]; minutes: number } {
  const shifted = new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000);
  return { day: WEEKDAYS[shifted.getUTCDay()], minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

const toMinutes = (clock: string): number => {
  const [hour, minute] = clock.split(':').map(Number);
  return hour * 60 + minute;
};

/** Open for the whole visit. Unknown hours are not treated as closed. */
export function openThroughout(hours: OpeningHours | null, startsAt: Date, durationMinutes: number): boolean {
  if (hours === null || Object.values(hours).every((slot) => slot == null)) return true;
  const { day, minutes } = indiaClock(startsAt);
  const slot = hours[day];
  if (slot == null) return false;
  return minutes >= toMinutes(slot[0]) && minutes + durationMinutes <= toMinutes(slot[1]);
}

type Simulation = { ok: true; startsAt: Date; travel: number; end: Date } | { ok: false; why: SlotRefusal };

/** Schedules the day with the new stop at `index`, as recalculateSchedule would. */
function simulate(day: DayPlan, stop: NewStop, index: number, travel: TravelMinutes): Simulation {
  const sequence: Array<PlannedStop | 'new'> = [...day.stops];
  sequence.splice(index, 0, 'new');

  let cursor = day.dayStart;
  let previous: { lat: number; lng: number } | null | undefined;
  let travelTotal = 0;
  let newStart: Date | null = null;

  for (const entry of sequence) {
    const point = entry === 'new' ? stop.point : entry.point;
    const leg = previous === undefined ? 0 : travel(previous, point);
    travelTotal += leg;
    const arrival = addMinutes(cursor, leg);

    if (entry === 'new') {
      if (!openThroughout(stop.hours, arrival, stop.durationMinutes)) return { ok: false, why: 'closed' };
      newStart = arrival;
      cursor = addMinutes(arrival, stop.durationMinutes);
    } else if (entry.lockedByUser && entry.startsAt !== null) {
      // A stop locked to a time is never pushed later to make room.
      if (arrival.getTime() > entry.startsAt.getTime()) return { ok: false, why: 'no_time' };
      cursor = addMinutes(entry.startsAt, entry.durationMinutes);
    } else {
      cursor = addMinutes(arrival, entry.durationMinutes);
    }
    previous = point;
  }

  return { ok: true, startsAt: newStart!, travel: travelTotal, end: cursor };
}

function dayTravel(day: DayPlan, travel: TravelMinutes): number {
  let total = 0;
  for (let index = 1; index < day.stops.length; index += 1) {
    total += travel(day.stops[index - 1].point, day.stops[index].point);
  }
  return total;
}

function dayEnd(day: DayPlan, travel: TravelMinutes): Date {
  let cursor = day.dayStart;
  let previous: PlannedStop | null = null;
  for (const stop of day.stops) {
    const arrival = addMinutes(cursor, previous === null ? 0 : travel(previous.point, stop.point));
    const start = stop.lockedByUser && stop.startsAt !== null ? stop.startsAt : arrival;
    cursor = addMinutes(start, stop.durationMinutes);
    previous = stop;
  }
  return cursor;
}

/**
 * The best feasible slot across the given days, or why there is none.
 * `onlyDayId` restricts the search to one day the traveller chose.
 */
export function findSlot(
  days: readonly DayPlan[],
  stop: NewStop,
  options: { dayMinutes: number; travel: TravelMinutes; onlyDayId?: string },
): { slot: Slot } | { refusal: SlotRefusal } {
  let best: Slot | null = null;
  let sawOpenSlot = false;

  for (const day of days) {
    if (options.onlyDayId !== undefined && day.dayId !== options.onlyDayId) continue;
    if (stop.closure !== null && day.isoDate >= stop.closure.from && day.isoDate <= stop.closure.until) continue;

    const baseline = dayTravel(day, options.travel);
    // A day already running long may keep its length, but not grow past it.
    const limit = Math.max(addMinutes(day.dayStart, options.dayMinutes).getTime(), dayEnd(day, options.travel).getTime());

    for (let index = 0; index <= day.stops.length; index += 1) {
      const result = simulate(day, stop, index, options.travel);
      if (!result.ok) {
        if (result.why === 'no_time') sawOpenSlot = true;
        continue;
      }
      sawOpenSlot = true;
      if (result.end.getTime() > limit) continue;

      const candidate: Slot = {
        dayId: day.dayId,
        dayNumber: day.dayNumber,
        index,
        startsAt: result.startsAt,
        addedTravelMinutes: result.travel - baseline,
      };
      if (best === null || candidate.addedTravelMinutes < best.addedTravelMinutes) best = candidate;
    }
  }

  if (best !== null) return { slot: best };
  return { refusal: sawOpenSlot ? 'no_time' : 'closed' };
}

export const REFUSAL_MESSAGE: Record<SlotRefusal, string> = {
  closed: 'It is not open at any time your plan could reach it. Check its hours, or add it to a different trip.',
  no_time:
    'No day in this trip has room for it without running past the end of the day or moving a stop you locked. Remove a stop or unlock one, then try again.',
};
