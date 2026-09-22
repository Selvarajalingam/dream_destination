import { PILOT_TIMEZONE } from '@/shared/time';
import type { Conflict, ConflictContext, ItineraryDay, ItineraryItem, OpeningHours } from './types';

/**
 * Inline itinerary warnings — PRD Part I T09 lists exactly six:
 * opening-hour conflict, excessive travel time, crowd peak, budget overrun,
 * weather/closure risk, and accessibility mismatch.
 *
 * Each conflict carries a plain-language message and something the traveler
 * can do about it, because a warning with no action is not useful.
 */

/** A day of sightseeing is treated as roughly 10 usable hours. */
const USABLE_DAY_MINUTES = 600;

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Local wall-clock minutes-since-midnight for a UTC instant, in pilot time. */
function localMinutes(date: Date): { dayKey: (typeof DAY_KEYS)[number]; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: PILOT_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const lookup = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = lookup('weekday').toLowerCase().slice(0, 3) as (typeof DAY_KEYS)[number];
  const hour = Number(lookup('hour'));
  const minute = Number(lookup('minute'));

  return { dayKey: weekday, minutes: hour * 60 + minute };
}

function parseClock(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function isWithinOpeningHours(hours: OpeningHours, at: Date, durationMinutes: number): boolean {
  const { dayKey, minutes } = localMinutes(at);
  const window = hours[dayKey];
  if (window === undefined || window === null) return false;

  const [open, close] = window.map(parseClock);
  return minutes >= open && minutes + durationMinutes <= close;
}

function openingHoursLabel(hours: OpeningHours, at: Date): string | null {
  const { dayKey } = localMinutes(at);
  const window = hours[dayKey];
  if (window === undefined || window === null) return null;
  return `${window[0]}–${window[1]}`;
}

export function detectConflicts(day: ItineraryDay, context: ConflictContext): Conflict[] {
  const conflicts: Conflict[] = [];

  for (const item of day.items) {
    conflicts.push(...conflictsForItem(item, context));
  }

  // Travel is a property of the whole day, not of one item.
  const travelMinutes = day.items.reduce((total, item) => total + item.travelFromPrevious.minutes, 0);
  if (travelMinutes > USABLE_DAY_MINUTES / 2) {
    conflicts.push({
      kind: 'excessive_travel',
      severity: 'warning',
      message: `This day spends about ${Math.round(travelMinutes / 60)} hours travelling between places.`,
      suggestedAction: 'Move one stop to another day, or group places that are closer together.',
      itemId: null,
    });
  }

  if (context.budget.expectedTotalMinor > context.budget.spendableMinor) {
    // spendableMinor is the budget less the reserve, so this fires before the
    // budget itself is breached. The wording says which of the two it is, so
    // the warning matches what the budget meter shows.
    const overBudget = context.budget.expectedTotalMinor > context.budget.totalLimitMinor;

    conflicts.push({
      kind: 'budget_overrun',
      severity: overBudget ? 'blocking' : 'warning',
      message: overBudget
        ? 'The planned spend for this trip is above the budget you set.'
        : 'This plan uses part of the reserve you set aside.',
      suggestedAction: 'Open the budget planner to lower a category, or adjust the reserve.',
      itemId: null,
    });
  }

  return conflicts;
}

function conflictsForItem(item: ItineraryItem, context: ConflictContext): Conflict[] {
  const conflicts: Conflict[] = [];

  if (item.placeId === null) return conflicts;
  const place = context.placesById[item.placeId];
  if (place === undefined) return conflicts;

  // A suspension overrides every other consideration about this stop. Hours,
  // crowds and access are irrelevant for a place nobody should visit, so this
  // is the only conflict reported for it.
  if (place.suspended === true) {
    return [
      {
        kind: 'weather_closure',
        severity: 'blocking',
        message: `${place.name} has been closed to visitors by the tourism authority pending a review.`,
        suggestedAction: 'Remove this stop, or replace it with another place nearby.',
        itemId: item.id,
      },
    ];
  }

  if (item.startsAt !== null && !isWithinOpeningHours(place.openingHours, item.startsAt, item.durationMinutes)) {
    const label = openingHoursLabel(place.openingHours, item.startsAt);
    conflicts.push({
      kind: 'opening_hours',
      severity: 'blocking',
      message:
        label === null
          ? `${place.name} is closed on this day.`
          : `${place.name} is open ${label}, and this visit falls outside that.`,
      suggestedAction: 'Move this visit to an open time, or swap it for another place.',
      itemId: item.id,
    });
  }

  const crowd = context.crowdByPlaceId[item.placeId];
  if (crowd !== undefined && crowd.band === 'heavy') {
    conflicts.push({
      kind: 'crowd_peak',
      severity: 'warning',
      message: `${place.name} is expected to be busy at this time. ${crowd.explanation}`,
      suggestedAction: 'Show a quieter time for this place.',
      itemId: item.id,
    });
  }

  if (place.closureNote !== null) {
    conflicts.push({
      kind: 'weather_closure',
      severity: 'warning',
      message: `${place.name}: ${place.closureNote}`,
      suggestedAction: 'Check the official source before travelling, and keep an alternative in mind.',
      itemId: item.id,
    });
  }

  if (context.constraints.lowWalking === true && place.accessibility.stepFreeEntry !== true) {
    conflicts.push({
      kind: 'accessibility_mismatch',
      severity: 'warning',
      message: `${place.name} does not have step-free entry, and your trip is set to limit walking.`,
      suggestedAction: 'View access details, or replace this stop with a step-free alternative.',
      itemId: item.id,
    });
  }

  return conflicts;
}
