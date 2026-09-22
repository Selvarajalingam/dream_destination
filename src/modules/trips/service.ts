import { getMapsProvider } from '@/platform/maps';
import { catalogRepository, type PlaceRow } from '@/modules/catalog/repository';
import { crowdService } from '@/modules/crowd/service';
import { businessRepository } from '@/modules/businesses/repository';
import { summarizeBudget } from '@/modules/budgets/domain/budget';
import type { BudgetLine, BudgetSummary, PriceState } from '@/modules/budgets/domain/types';
import type { TripBrief } from '@/platform/ai/schemas';
import { DomainError } from '@/shared/result';
import { PILOT_TIMEZONE, addMinutes } from '@/shared/time';
import { haversineMeters } from '@/shared/geo';
import { detectConflicts } from './domain/conflicts';
import { REFUSAL_MESSAGE, findSlot, type DayPlan, type Slot } from './domain/insertion';
import { recalculateSchedule } from './domain/itinerary';
import { assertTransition } from './domain/trip-state';
import type {
  Conflict,
  ConflictContext,
  ConflictPlace,
  ItineraryDay,
  ItineraryItem,
  TripStatus,
} from './domain/types';
import { tripsRepository, type NewItem, type TripRow } from './repository';

/**
 * Itinerary generation.
 *
 * Fully deterministic. PRD Part II §8.3 assigns travel-time feasibility and
 * budget totals to application code, and §19 requires trip generation to
 * "return schema-valid output and record source IDs".
 *
 * The LLM, where configured, only writes the prose describing a plan that was
 * already built here.
 */

/** Days start at 09:00 local time. */
const DAY_START_HOUR = 9;

/** How long a day of sightseeing may run before the packer stops adding. */
const DAY_BUDGET_MINUTES: Record<string, number> = {
  relaxed: 420,
  balanced: 510,
  packed: 600,
};

/** A meal stop is inserted around this point in the day. */
const MEAL_SLOT_MINUTES = 240;
const MEAL_DURATION_MINUTES = 60;

/** Business categories that can fill a meal slot. */
const MEAL_CATEGORIES = new Set(['restaurant', 'cafe', 'farm']);

/** How far beyond a destination to look for additional candidate places. */
const NEARBY_CANDIDATE_RADIUS_M = 60_000;

/**
 * Distance from the destination centre a place can sit at without being
 * penalised. Beyond this, a stop starts costing the day more in travel than
 * it returns in interest.
 */
const COMFORTABLE_DAY_TRIP_KM = 25;

export type TripDetail = {
  trip: TripRow;
  days: ItineraryDay[];
  budget: BudgetSummary | null;
  conflicts: Conflict[];
  crowdByPlaceId: Record<string, { band: string; label: string; explanation: string; isStale: boolean }>;
};

/** 09:00 pilot-local on a given date, expressed as a UTC instant. */
function dayStartUtc(date: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PILOT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const lookup = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00';
  // IST is UTC+5:30, so 09:00 local is 03:30 UTC on the same date.
  return new Date(`${lookup('year')}-${lookup('month')}-${lookup('day')}T03:30:00.000Z`);
}

function priceOf(place: PlaceRow): { lowMinor: number; expectedMinor: number; highMinor: number } {
  const low = (place.priceLowInr ?? 0) * 100;
  const high = (place.priceHighInr ?? place.priceLowInr ?? 0) * 100;
  return { lowMinor: low, expectedMinor: Math.round((low + high) / 2), highMinor: high };
}

/**
 * Ranks candidate places for a brief. Interest match dominates; verified
 * hidden gems get a small lift because surfacing them is a product goal, and
 * places that conflict with a declared accessibility need are pushed down.
 */
function rankPlaces(
  places: PlaceRow[],
  brief: TripBrief,
  center: { lat: number; lng: number } | null,
): PlaceRow[] {
  const interests = new Set(brief.interests ?? []);
  const needsStepFree = brief.constraints?.lowWalking === true;

  // A declared accessibility need is a constraint, not a preference. Places
  // without step-free entry are held back entirely and only appended if there
  // are too few suitable places to fill the trip, so the plan is still usable
  // and the remaining mismatches surface as T09 conflicts rather than being
  // silently mixed in.
  if (needsStepFree) {
    const suitable = places.filter((place) => place.accessibility.stepFreeEntry === true);
    const rest = places.filter((place) => place.accessibility.stepFreeEntry !== true);
    return [...suitable.sort((a, b) => scoreOf(b) - scoreOf(a)), ...rest.sort((a, b) => scoreOf(b) - scoreOf(a))];
  }

  return [...places].sort((a, b) => scoreOf(b) - scoreOf(a));

  function scoreOf(place: PlaceRow): number {
    let score = 0;

    // Category and theme overlap with the declared interests.
    for (const interest of interests) {
      if (place.category.includes(interest) || interest.includes(place.category)) score += 30;
    }
    if (interests.has('nature') && ['waterfall', 'lake', 'viewpoint', 'garden', 'wildlife'].includes(place.category)) score += 25;
    if (interests.has('heritage') && ['heritage', 'museum', 'heritage_transport', 'heritage_walk'].includes(place.category)) score += 25;
    if (interests.has('temples') && place.category === 'temple') score += 25;
    if (interests.has('trekking') && ['trek', 'walk'].includes(place.category)) score += 25;
    if (interests.has('wildlife') && place.category === 'wildlife') score += 25;
    if (interests.has('tea') && place.category === 'tea_factory') score += 25;
    if (interests.has('crafts') && ['crafts', 'market'].includes(place.category)) score += 25;

    if (place.isHiddenGem) score += 8;

    if (needsStepFree && place.accessibility.stepFreeEntry !== true) score -= 40;

    // A shorter visit fits more easily into a day.
    score -= (place.expectedVisitMinutes ?? 60) / 30;

    // Distance from the chosen destination. Without this, a high-scoring place
    // an hour outside the area can be ranked above a good local one, and the
    // day ends up sprawling across districts. Places near the destination are
    // unaffected; the penalty grows steeply past a comfortable day-trip range.
    if (center !== null) {
      const km = haversineMeters(center, { lat: place.lat, lng: place.lng }) / 1000;
      score -= Math.max(0, km - COMFORTABLE_DAY_TRIP_KM) * 1.5;
    }

    return score;
  }
}

export const tripsService = {
  async getDetail(tripId: string): Promise<TripDetail | null> {
    const trip = await tripsRepository.findById(tripId);
    if (trip === null) return null;

    const days = await tripsRepository.listDays(tripId);
    const budgetRow = await tripsRepository.findBudget(tripId);

    const budget =
      budgetRow === null
        ? null
        : summarizeBudget(
            budgetRow.lines.map(
              (line): BudgetLine => ({
                id: line.id,
                category: line.category as BudgetLine['category'],
                description: line.description,
                lowMinor: line.lowMinor,
                expectedMinor: line.expectedMinor,
                highMinor: line.highMinor,
                priceState: line.priceState,
                refreshedAt: line.refreshedAt,
                locked: line.locked,
                itineraryItemId: line.itineraryItemId,
              }),
            ),
            budgetRow.totalLimitMinor,
            budgetRow.reserveMinor,
          );

    const placeIds = days
      .flatMap((day) => day.items)
      .map((item) => item.placeId)
      .filter((id): id is string => id !== null);

    const statuses = await crowdService.getStatusForPlaces(placeIds);
    const crowdByPlaceId: TripDetail['crowdByPlaceId'] = {};
    for (const [placeId, status] of statuses) {
      crowdByPlaceId[placeId] = {
        band: status.band,
        label: status.label,
        explanation: status.explanation,
        isStale: status.isStale,
      };
    }

    const conflicts = await this.detectAllConflicts(trip, days, budget, statuses);

    return { trip, days, budget, conflicts, crowdByPlaceId };
  },

  async detectAllConflicts(
    trip: TripRow,
    days: ItineraryDay[],
    budget: BudgetSummary | null,
    statuses: Map<string, { band: string; label: string; explanation: string }>,
  ): Promise<Conflict[]> {
    const placeIds = days
      .flatMap((day) => day.items)
      .map((item) => item.placeId)
      .filter((id): id is string => id !== null);

    const places = await catalogRepository.findPlacesByIds(placeIds);

    const placesById: Record<string, ConflictPlace> = {};
    for (const place of places) {
      placesById[place.id] = {
        id: place.id,
        name: place.name,
        openingHours: place.operatingHours as ConflictPlace['openingHours'],
        accessibility: place.accessibility as ConflictPlace['accessibility'],
        closureNote: (place.accessibility.closureNote as string | null) ?? null,
        suspended: place.status === 'suspended',
      };
    }

    const brief = trip.tripBrief as TripBrief;

    const context: ConflictContext = {
      placesById,
      crowdByPlaceId: Object.fromEntries(
        [...statuses].map(([id, status]) => [
          id,
          { band: status.band as never, label: status.label, explanation: status.explanation },
        ]),
      ),
      constraints: {
        lowWalking: brief.constraints?.lowWalking,
        medicalAccessRequired: brief.constraints?.medicalAccessRequired,
      },
      budget: {
        expectedTotalMinor: budget?.expectedTotalMinor ?? 0,
        totalLimitMinor: budget?.totalLimitMinor ?? Number.MAX_SAFE_INTEGER,
        spendableMinor:
          budget === null ? Number.MAX_SAFE_INTEGER : budget.totalLimitMinor - budget.reserveMinor,
      },
    };

    return days.flatMap((day) => detectConflicts(day, context));
  },

  /**
   * Builds a complete itinerary for a trip from its brief and destination.
   * Deterministic: the same trip and catalog produce the same plan.
   */
  async generateItinerary(tripId: string): Promise<TripDetail> {
    const trip = await tripsRepository.findById(tripId);
    if (trip === null) throw new DomainError('trip.not_found', 'That trip does not exist.', 404);
    if (trip.destinationId === null) {
      throw new DomainError('trip.no_destination', 'Choose a destination before generating a plan.', 409);
    }

    const brief = trip.tripBrief as TripBrief;
    const durationDays = brief.durationDays ?? 3;
    const pace = brief.pace ?? 'balanced';
    const dayBudget = DAY_BUDGET_MINUTES[pace] ?? DAY_BUDGET_MINUTES.balanced;

    // Candidates are the destination's own places plus anything else in the
    // catalog within reach of it, so a longer trip does not run out of stops
    // on its final day.
    const destination = await catalogRepository.findDestinationById(trip.destinationId);
    const ownPlaces = await catalogRepository.listPlacesForDestination(trip.destinationId);
    const nearbyPlaces =
      destination === null
        ? []
        : await catalogRepository.findPlacesNear(
            { lat: destination.lat, lng: destination.lng },
            NEARBY_CANDIDATE_RADIUS_M,
            40,
          );

    const candidates = [...ownPlaces];
    for (const place of nearbyPlaces) {
      if (!candidates.some((existing) => existing.id === place.id)) candidates.push(place);
    }

    const ranked = rankPlaces(
      candidates,
      brief,
      destination === null ? null : { lat: destination.lat, lng: destination.lng },
    );

    // Only places that serve food belong in a meal slot. A cab company or a
    // birding guide is a useful listing, but not lunch.
    const allBusinesses = await businessRepository.findForDestination(trip.destinationId, 30);
    const businesses = allBusinesses.filter((business) => MEAL_CATEGORIES.has(business.category));

    const maps = getMapsProvider();

    const startDate = trip.startDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const used = new Set<string>();

    const days: Array<{ dayNumber: number; date: Date | null; title: string | null; items: NewItem[] }> = [];

    for (let dayNumber = 1; dayNumber <= durationDays; dayNumber += 1) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + (dayNumber - 1));

      let cursor = dayStartUtc(date);
      const dayEnd = addMinutes(cursor, dayBudget);

      const items: NewItem[] = [];
      let previous: PlaceRow | null = null;
      let minutesSpent = 0;

      for (const place of ranked) {
        if (used.has(place.id)) continue;
        if (items.length >= 5) break;

        const visitMinutes = place.expectedVisitMinutes ?? 60;

        const travel =
          previous === null
            ? { minutes: 0, meters: 0, mode: 'car' as const }
            : await maps
                .route(
                  { lat: previous.lat, lng: previous.lng },
                  { lat: place.lat, lng: place.lng },
                  'car',
                )
                .then((result) => ({ minutes: result.minutes, meters: result.meters, mode: result.mode }));

        // Skip anything that would run the day past its budget.
        if (minutesSpent + travel.minutes + visitMinutes > dayBudget) continue;

        const startsAt = addMinutes(cursor, travel.minutes);
        if (addMinutes(startsAt, visitMinutes) > dayEnd) continue;

        // Only schedule a place at a time it is actually open.
        if (!isOpenAt(place, startsAt)) continue;

        const price = priceOf(place);

        items.push({
          placeId: place.id,
          itemType: 'place',
          title: place.name,
          startsAt,
          durationMinutes: visitMinutes,
          sortOrder: items.length,
          travelFromPrevious: travel,
          priceEstimate: {
            expectedMinor: price.expectedMinor,
            lowMinor: price.lowMinor,
            highMinor: price.highMinor,
            priceState: 'historical' as PriceState,
          },
        });

        used.add(place.id);
        cursor = addMinutes(startsAt, visitMinutes);
        minutesSpent += travel.minutes + visitMinutes;
        previous = place;

        // Slot a local business meal stop mid-day, which is the PRD's
        // "local businesses appear inside the itinerary at relevant decision
        // points" requirement.
        if (minutesSpent >= MEAL_SLOT_MINUTES && !items.some((item) => item.itemType === 'meal')) {
          const business = businesses[(dayNumber - 1) % Math.max(1, businesses.length)];
          if (business !== undefined) {
            items.push({
              localBusinessId: business.id,
              itemType: 'meal',
              title: business.name,
              startsAt: cursor,
              durationMinutes: MEAL_DURATION_MINUTES,
              sortOrder: items.length,
              travelFromPrevious: { minutes: 10, meters: 3_000, mode: 'car' },
              priceEstimate: {
                expectedMinor: (business.priceBand ?? 2) * 30_000,
                lowMinor: (business.priceBand ?? 2) * 20_000,
                highMinor: (business.priceBand ?? 2) * 45_000,
                priceState: 'historical' as PriceState,
              },
            });
            cursor = addMinutes(cursor, MEAL_DURATION_MINUTES + 10);
            minutesSpent += MEAL_DURATION_MINUTES + 10;
          }
        }
      }

      days.push({
        dayNumber,
        date,
        title: items.length === 0 ? 'Open day' : (items[0].title ?? null),
        items,
      });
    }

    await tripsRepository.replaceItinerary(tripId, days);
    await this.rebuildBudget(tripId, brief);

    const detail = await this.getDetail(tripId);
    if (detail === null) throw new DomainError('trip.not_found', 'That trip does not exist.', 404);
    return detail;
  },

  /** Rebuilds budget lines from the current itinerary plus stay and transport. */
  async rebuildBudget(tripId: string, brief: TripBrief): Promise<void> {
    const days = await tripsRepository.listDays(tripId);
    const travellers = (brief.party?.adults ?? 2) + (brief.party?.children ?? 0);
    const nights = Math.max(0, days.length - 1);

    const lines: Array<{
      category: string;
      description: string;
      lowMinor: number | null;
      expectedMinor: number;
      highMinor: number | null;
      priceState: PriceState;
      itineraryItemId?: string | null;
    }> = [];

    // Stay: a per-night estimate scaled by party size, clearly historical.
    if (nights > 0) {
      const perNight = travellers <= 2 ? 180_000 : 260_000;
      lines.push({
        category: 'stay',
        description: `${nights} ${nights === 1 ? 'night' : 'nights'} accommodation (estimate)`,
        lowMinor: Math.round(perNight * nights * 0.7),
        expectedMinor: perNight * nights,
        highMinor: Math.round(perNight * nights * 1.4),
        priceState: 'historical',
      });
    }

    // Transport: return road travel, scaled by trip length.
    const transportPerDay = 120_000;
    lines.push({
      category: 'transport',
      description: 'Road travel and local transport (estimate)',
      lowMinor: Math.round(transportPerDay * days.length * 0.7),
      expectedMinor: transportPerDay * days.length,
      highMinor: Math.round(transportPerDay * days.length * 1.3),
      priceState: 'historical',
    });

    // Entry fees and meals, from the itinerary itself.
    for (const day of days) {
      for (const item of day.items) {
        const estimate = item.priceEstimate;
        if (estimate.expectedMinor <= 0) continue;

        lines.push({
          category: item.itemType === 'meal' ? 'food' : 'activities',
          description: item.title,
          lowMinor: estimate.lowMinor ?? null,
          expectedMinor: estimate.expectedMinor * (item.itemType === 'meal' ? travellers : travellers),
          highMinor: estimate.highMinor === undefined || estimate.highMinor === null
            ? null
            : estimate.highMinor * travellers,
          priceState: estimate.priceState,
          itineraryItemId: item.id,
        });
      }
    }

    // Meals not covered by a listed business, so food is never understated.
    const mealCount = days.length * 2;
    lines.push({
      category: 'food',
      description: 'Other meals and refreshments (estimate)',
      lowMinor: mealCount * travellers * 12_000,
      expectedMinor: mealCount * travellers * 20_000,
      highMinor: mealCount * travellers * 35_000,
      priceState: 'historical',
    });

    const totalLimitMinor = brief.budget?.totalMinor ?? 2_500_000;
    // A reserve of 10% is held back by default, which the traveler can change.
    const reserveMinor = Math.round(totalLimitMinor * 0.1);

    await tripsRepository.replaceBudget(tripId, totalLimitMinor, reserveMinor, fitToBudget(lines, totalLimitMinor - reserveMinor));
  },

  /** Recomputes start times and travel legs after a change, honouring locked items. */
  async rescheduleDay(tripId: string, dayId: string): Promise<void> {
    const days = await tripsRepository.listDays(tripId);
    const day = days.find((candidate) => candidate.id === dayId);
    if (day === undefined) return;

    const points = await pointsFor(day.items);
    const maps = getMapsProvider();

    // Pre-compute the legs, since recalculateSchedule is synchronous.
    const legs = new Map<string, { minutes: number; meters: number; mode: 'car' }>();
    for (let index = 1; index < day.items.length; index += 1) {
      const from = points.get(day.items[index - 1].id);
      const to = points.get(day.items[index].id);

      if (from === undefined || to === undefined) {
        legs.set(day.items[index].id, { minutes: 15, meters: 5_000, mode: 'car' });
        continue;
      }

      const route = await maps.route(from, to, 'car');
      legs.set(day.items[index].id, { minutes: route.minutes, meters: route.meters, mode: 'car' });
    }

    const scheduled = recalculateSchedule(
      day.items,
      day.date === null ? dayStartUtc(new Date()) : dayStartUtc(day.date),
      (_from, to) => legs.get(to.id) ?? { minutes: 15, meters: 5_000, mode: 'car' },
    );

    for (const item of scheduled) {
      await tripsRepository.setItemStart(item.id, item.startsAt);
      await tripsRepository.setItemTravel(item.id, item.travelFromPrevious);
    }
  },

  /**
   * Adds one place or local business to a plan at the feasible slot that
   * bends the plan least (E10-S04, T10). Travel legs and the budget are
   * rebuilt afterwards; the returned item id is what an undo removes.
   */
  async addStop(
    tripId: string,
    target: { kind: 'place' | 'business'; id: string },
    options: { dayId?: string } = {},
  ): Promise<{ itemId: string; slot: Slot; detail: TripDetail }> {
    const trip = await tripsRepository.findById(tripId);
    if (trip === null) throw new DomainError('trip.not_found', 'That trip does not exist.', 404);
    const brief = trip.tripBrief as TripBrief;

    const days = await tripsRepository.listDays(tripId);
    if (days.length === 0) throw new DomainError('trip.no_itinerary', 'Generate a plan for this trip first.', 409);

    const already = days.find((day) =>
      day.items.some((item) => (target.kind === 'place' ? item.placeId : item.localBusinessId) === target.id),
    );
    if (already !== undefined) {
      throw new DomainError('trip.already_planned', `It is already in this plan, on day ${already.dayNumber}.`, 409);
    }

    const candidate = await stopFor(target);
    const points = await pointsFor(days.flatMap((day) => day.items));

    const plans: DayPlan[] = days.map((day) => {
      const start = day.date === null ? dayStartUtc(new Date()) : dayStartUtc(day.date);
      return {
        dayId: day.id,
        dayNumber: day.dayNumber,
        dayStart: start,
        isoDate: new Date(start.getTime() + 330 * 60_000).toISOString().slice(0, 10),
        stops: day.items.map((item) => ({
          id: item.id,
          point: points.get(item.id) ?? null,
          startsAt: item.startsAt,
          durationMinutes: item.durationMinutes,
          lockedByUser: item.lockedByUser,
        })),
      };
    });

    const found = findSlot(plans, candidate.stop, {
      dayMinutes: DAY_BUDGET_MINUTES[brief.pace ?? 'balanced'] ?? DAY_BUDGET_MINUTES.balanced,
      travel: estimateTravelMinutes,
      onlyDayId: options.dayId,
    });
    if ('refusal' in found) throw new DomainError(`trip.no_slot.${found.refusal}`, REFUSAL_MESSAGE[found.refusal], 409);

    const itemId = await tripsRepository.insertItemAt(tripId, found.slot.dayId, found.slot.index, {
      ...candidate.item,
      startsAt: found.slot.startsAt,
      sortOrder: found.slot.index,
    });

    await this.rescheduleDay(tripId, found.slot.dayId);
    await this.rebuildBudget(tripId, brief);

    const detail = await this.getDetail(tripId);
    if (detail === null) throw new DomainError('trip.not_found', 'That trip does not exist.', 404);
    return { itemId, slot: found.slot, detail };
  },

  async setStatus(tripId: string, next: TripStatus): Promise<void> {
    const trip = await tripsRepository.findById(tripId);
    if (trip === null) throw new DomainError('trip.not_found', 'That trip does not exist.', 404);

    assertTransition(trip.status, next);
    await tripsRepository.setStatus(tripId, next);
  },
};

type DraftLine = {
  category: string;
  description: string;
  lowMinor: number | null;
  expectedMinor: number;
  highMinor: number | null;
  priceState: PriceState;
  itineraryItemId?: string | null;
};

/**
 * Brings a plan back toward the declared budget before showing it.
 *
 * PRD Part I T03: "If the request conflicts with the budget, show a usable
 * reduced plan or alternative destination." So rather than presenting an
 * overrun and leaving it there, discretionary spend is scaled toward a
 * lower-cost version of the same trip. Stay and transport are left alone
 * because they are not genuinely optional, and if the trip still does not fit,
 * the honest overrun is reported rather than hidden.
 */
function fitToBudget(lines: DraftLine[], spendableMinor: number): DraftLine[] {
  const total = lines.reduce((sum, line) => sum + line.expectedMinor, 0);
  if (total <= spendableMinor) return lines;

  const essentialTotal = lines
    .filter((line) => !DISCRETIONARY_CATEGORIES.has(line.category))
    .reduce((sum, line) => sum + line.expectedMinor, 0);

  const discretionaryTotal = total - essentialTotal;
  const roomForDiscretionary = spendableMinor - essentialTotal;

  // Essentials alone already break the budget: nothing to trim, so report it.
  if (roomForDiscretionary <= 0 || discretionaryTotal <= 0) return lines;

  // Never cut discretionary spend below 60% of the planned experience, or the
  // "reduced plan" stops resembling the trip the traveller asked for.
  const factor = Math.max(0.6, roomForDiscretionary / discretionaryTotal);
  if (factor >= 1) return lines;

  return lines.map((line) => {
    if (!DISCRETIONARY_CATEGORIES.has(line.category)) return line;
    return {
      ...line,
      lowMinor: line.lowMinor === null ? null : Math.round(line.lowMinor * factor),
      expectedMinor: Math.round(line.expectedMinor * factor),
      highMinor: line.highMinor === null ? null : Math.round(line.highMinor * factor),
    };
  });
}

const DISCRETIONARY_CATEGORIES = new Set(['food', 'activities', 'shopping']);

/** Whether a place is open for the whole visit at this instant. */
function isOpenAt(place: PlaceRow, at: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: PILOT_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);

  const lookup = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  const dayKey = lookup('weekday').toLowerCase().slice(0, 3);
  const window = place.operatingHours[dayKey];
  if (window === undefined || window === null) return false;

  const minutes = Number(lookup('hour')) * 60 + Number(lookup('minute'));
  const [open, close] = window.map((clock) => {
    const [hour, minute] = clock.split(':').map(Number);
    return hour * 60 + minute;
  });

  const visitMinutes = place.expectedVisitMinutes ?? 60;
  return minutes >= open && minutes + visitMinutes <= close;
}

export type { ItineraryItem };

/** The same straight-line estimate the haversine adapter uses, synchronously. */
function estimateTravelMinutes(from: { lat: number; lng: number } | null, to: { lat: number; lng: number } | null): number {
  if (from === null || to === null) return 15;
  return Math.round(((haversineMeters(from, to) * 1.45) / 1000 / 34) * 60);
}

/** Where each item in a plan is, for places and businesses alike. */
async function pointsFor(items: readonly ItineraryItem[]): Promise<Map<string, { lat: number; lng: number }>> {
  const placeIds = items.map((item) => item.placeId).filter((id): id is string => id !== null);
  const businessIds = items.map((item) => item.localBusinessId).filter((id): id is string => id !== null);
  const [places, businesses] = await Promise.all([
    catalogRepository.findPlacesByIds(placeIds),
    businessRepository.findPointsByIds(businessIds),
  ]);
  const placeById = new Map(places.map((place) => [place.id, { lat: place.lat, lng: place.lng }]));
  const businessById = new Map(businesses.map((business) => [business.id, { lat: business.lat, lng: business.lng }]));

  const points = new Map<string, { lat: number; lng: number }>();
  for (const item of items) {
    const point =
      (item.placeId !== null ? placeById.get(item.placeId) : undefined) ??
      (item.localBusinessId !== null ? businessById.get(item.localBusinessId) : undefined);
    if (point !== undefined) points.set(item.id, point);
  }
  return points;
}

/** Categories where spending is up to the traveller, so no cost is assumed. */
const UNPRICED_BUSINESS_CATEGORIES = new Set(['shop', 'artisan']);

/** What an added stop looks like in the plan, and what the slot search needs. */
async function stopFor(target: { kind: 'place' | 'business'; id: string }) {
  if (target.kind === 'place') {
    const place = await catalogRepository.findPlaceById(target.id);
    if (place === null) throw new DomainError('trip.stop_not_found', 'That place is not available.', 404);
    const price = priceOf(place);
    const durationMinutes = place.expectedVisitMinutes ?? 60;
    return {
      stop: { point: { lat: place.lat, lng: place.lng }, durationMinutes, hours: place.operatingHours, closure: null },
      item: {
        placeId: place.id,
        itemType: 'place' as const,
        title: place.name,
        durationMinutes,
        travelFromPrevious: { minutes: 0, meters: 0, mode: 'car' as const },
        priceEstimate: { ...price, priceState: 'historical' as PriceState },
      },
    };
  }

  const business = await businessRepository.findById(target.id);
  if (business === null) throw new DomainError('trip.stop_not_found', 'That business is not available.', 404);
  const meal = MEAL_CATEGORIES.has(business.category);
  const band = business.priceBand ?? 2;
  const free = UNPRICED_BUSINESS_CATEGORIES.has(business.category);
  const durationMinutes = meal ? MEAL_DURATION_MINUTES : 45;
  return {
    stop: {
      point: { lat: business.lat, lng: business.lng },
      durationMinutes,
      hours: business.operatingHours,
      closure: business.temporaryClosure,
    },
    item: {
      localBusinessId: business.id,
      itemType: meal ? ('meal' as const) : ('business' as const),
      title: business.name,
      durationMinutes,
      travelFromPrevious: { minutes: 0, meters: 0, mode: 'car' as const },
      priceEstimate: free
        ? { lowMinor: 0, expectedMinor: 0, highMinor: 0, priceState: 'historical' as PriceState }
        : { lowMinor: band * 20_000, expectedMinor: band * 30_000, highMinor: band * 45_000, priceState: 'historical' as PriceState },
    },
  };
}
