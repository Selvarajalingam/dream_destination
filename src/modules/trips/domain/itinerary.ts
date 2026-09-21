import { addMinutes } from '@/shared/time';
import type { ItineraryItem, TravelLookup } from './types';

/**
 * Itinerary mechanics — PRD Part I T09:
 *
 *   "Reordering recalculates travel time and budget."
 *   "AI optimization never changes locked items."
 *
 * Everything here is pure: same input, same output, no I/O.
 */

function renumber(items: ItineraryItem[]): ItineraryItem[] {
  return items.map((item, index) => ({ ...item, sortOrder: index }));
}

/**
 * Move one item within a day. A locked item cannot be moved, and locked items
 * hold their index while the rest shuffle around them.
 */
export function reorderItems(
  items: readonly ItineraryItem[],
  fromIndex: number,
  toIndex: number,
): ItineraryItem[] {
  if (fromIndex < 0 || fromIndex >= items.length) return renumber([...items]);
  if (toIndex < 0 || toIndex >= items.length) return renumber([...items]);
  if (fromIndex === toIndex) return renumber([...items]);
  if (items[fromIndex].lockedByUser) return renumber([...items]);

  // Pull out the locked items with their positions, reorder what remains, then
  // put the locked ones back where they were.
  const pinned = new Map<number, ItineraryItem>();
  items.forEach((item, index) => {
    if (item.lockedByUser) pinned.set(index, item);
  });

  const movable = items.filter((item) => !item.lockedByUser);
  const movingItem = items[fromIndex];
  const movableFrom = movable.indexOf(movingItem);

  // Translate the target index in the full list to an index among movables.
  const movableTo = Math.min(
    movable.length - 1,
    Math.max(0, countMovableBefore(items, toIndex) - (toIndex > fromIndex ? 1 : 0)),
  );

  const reordered = [...movable];
  reordered.splice(movableFrom, 1);
  reordered.splice(movableTo, 0, movingItem);

  const result: ItineraryItem[] = [];
  let cursor = 0;
  for (let index = 0; index < items.length; index += 1) {
    const locked = pinned.get(index);
    if (locked !== undefined) {
      result.push(locked);
    } else {
      result.push(reordered[cursor]);
      cursor += 1;
    }
  }

  return renumber(result);
}

function countMovableBefore(items: readonly ItineraryItem[], index: number): number {
  let count = 0;
  for (let i = 0; i <= index && i < items.length; i += 1) {
    if (!items[i].lockedByUser) count += 1;
  }
  return count;
}

/**
 * Rebuild start times down a day: each item begins once the previous one ends
 * plus the travel between them. An item the user locked to a specific time
 * keeps that time, and the chain resumes from its end.
 */
export function recalculateSchedule(
  items: readonly ItineraryItem[],
  dayStart: Date,
  travel: TravelLookup,
): ItineraryItem[] {
  const result: ItineraryItem[] = [];
  let cursor = dayStart;
  let previous: ItineraryItem | null = null;

  for (const item of items) {
    const leg = previous === null ? { minutes: 0, meters: 0, mode: item.travelFromPrevious.mode } : travel(previous, item);

    const pinned = item.lockedByUser && item.startsAt !== null;
    const startsAt = pinned ? (item.startsAt as Date) : addMinutes(cursor, leg.minutes);

    const scheduled: ItineraryItem = { ...item, startsAt, travelFromPrevious: leg };
    result.push(scheduled);

    cursor = addMinutes(startsAt, item.durationMinutes);
    previous = scheduled;
  }

  return renumber(result);
}

/**
 * "Optimize unlocked items" (T09). Locked items keep their exact position;
 * the rest are ordered greedily by nearest next stop, which is enough for a
 * day of five or six places and stays deterministic.
 */
export function optimizeUnlocked(
  items: readonly ItineraryItem[],
  distanceMinutes: (fromPlaceId: string, toPlaceId: string) => number,
): ItineraryItem[] {
  const lockedIndices = new Map<number, ItineraryItem>();
  items.forEach((item, index) => {
    if (item.lockedByUser) lockedIndices.set(index, item);
  });

  const movable = items.filter((item) => !item.lockedByUser);
  if (movable.length <= 2) return renumber([...items]);

  // Anchor on the first movable item so the day still starts where it did.
  const ordered: ItineraryItem[] = [movable[0]];
  const remaining = movable.slice(1);

  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1];
    let bestIndex = 0;
    let bestCost = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const from = current.placeId ?? current.id;
      const to = remaining[index].placeId ?? remaining[index].id;
      const cost = distanceMinutes(from, to);
      if (cost < bestCost) {
        bestCost = cost;
        bestIndex = index;
      }
    }

    ordered.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }

  const result: ItineraryItem[] = [];
  let cursor = 0;
  for (let index = 0; index < items.length; index += 1) {
    const locked = lockedIndices.get(index);
    if (locked !== undefined) {
      result.push(locked);
    } else {
      result.push(ordered[cursor]);
      cursor += 1;
    }
  }

  return renumber(result);
}
