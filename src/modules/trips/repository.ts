import { sql } from '@/platform/db/client';
import type { PriceState } from '@/modules/budgets/domain/types';
import type { ItineraryDay, ItineraryItem, TripStatus } from './domain/types';

/**
 * Trip persistence.
 *
 * trips.version is bumped on every mutation, so the API can detect concurrent
 * itinerary edits (PRD Part II §7.1) and the offline layer can resolve
 * conflicts by version (§11.3).
 */

export type TripRow = {
  id: string;
  ownerUserId: string;
  destinationId: string | null;
  destinationSlug: string | null;
  destinationName: string | null;
  title: string;
  status: TripStatus;
  startDate: Date | null;
  endDate: Date | null;
  originText: string | null;
  originLat: number | null;
  originLng: number | null;
  party: Record<string, unknown>;
  tripBrief: Record<string, unknown>;
  totalBudgetInr: number | null;
  activeStartedAt: Date | null;
  version: number;
  updatedAt: Date;
};

const TRIP_COLUMNS = sql`
  t.id,
  t.owner_user_id AS "ownerUserId",
  t.destination_id AS "destinationId",
  d.slug AS "destinationSlug",
  d.name AS "destinationName",
  t.title, t.status,
  t.start_date AS "startDate",
  t.end_date AS "endDate",
  t.origin_text AS "originText",
  ST_Y(t.origin_point::geometry) AS "originLat",
  ST_X(t.origin_point::geometry) AS "originLng",
  t.party,
  t.trip_brief AS "tripBrief",
  t.total_budget_inr AS "totalBudgetInr",
  t.active_started_at AS "activeStartedAt",
  t.version,
  t.updated_at AS "updatedAt"
`;

type ItemRow = {
  id: string;
  itinerary_day_id: string;
  place_id: string | null;
  local_business_id: string | null;
  item_type: ItineraryItem['itemType'];
  title: string;
  starts_at: Date | null;
  duration_minutes: number | null;
  sort_order: number;
  locked_by_user: boolean;
  travel_from_previous: ItineraryItem['travelFromPrevious'];
  price_estimate: ItineraryItem['priceEstimate'];
  booking_state: string | null;
  notes: string | null;
};

const toItem = (row: ItemRow): ItineraryItem => ({
  id: row.id,
  title: row.title,
  itemType: row.item_type,
  placeId: row.place_id,
  localBusinessId: row.local_business_id,
  startsAt: row.starts_at,
  durationMinutes: row.duration_minutes ?? 60,
  sortOrder: row.sort_order,
  lockedByUser: row.locked_by_user,
  travelFromPrevious: row.travel_from_previous ?? { minutes: 0, meters: 0, mode: 'car' },
  priceEstimate: row.price_estimate ?? { expectedMinor: 0, priceState: 'historical' },
  bookingState: row.booking_state,
  notes: row.notes,
});

export type NewItem = {
  placeId?: string | null;
  localBusinessId?: string | null;
  itemType: ItineraryItem['itemType'];
  title: string;
  startsAt: Date | null;
  durationMinutes: number;
  sortOrder: number;
  travelFromPrevious: ItineraryItem['travelFromPrevious'];
  priceEstimate: ItineraryItem['priceEstimate'];
  notes?: string | null;
};

export const tripsRepository = {
  async findById(tripId: string): Promise<TripRow | null> {
    const [row] = await sql<TripRow[]>`
      SELECT ${TRIP_COLUMNS} FROM trips t
      LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = ${tripId}
      LIMIT 1
    `;
    return row ?? null;
  },

  async listForUser(userId: string): Promise<TripRow[]> {
    return sql<TripRow[]>`
      SELECT ${TRIP_COLUMNS} FROM trips t
      LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.owner_user_id = ${userId}
      ORDER BY
        CASE t.status WHEN 'active' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
        t.start_date NULLS LAST,
        t.updated_at DESC
    `;
  },

  async create(input: {
    ownerUserId: string;
    destinationId: string | null;
    title: string;
    startDate: Date | null;
    endDate: Date | null;
    originText: string | null;
    origin: { lat: number; lng: number } | null;
    party: Record<string, unknown>;
    tripBrief: Record<string, unknown>;
    totalBudgetInr: number | null;
  }): Promise<TripRow> {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO trips (
        owner_user_id, destination_id, title, status, start_date, end_date,
        origin_text, origin_point, party, trip_brief, total_budget_inr
      ) VALUES (
        ${input.ownerUserId}, ${input.destinationId}, ${input.title}, 'draft',
        ${input.startDate}, ${input.endDate}, ${input.originText},
        ${
          input.origin === null
            ? null
            : sql`ST_SetSRID(ST_MakePoint(${input.origin.lng}, ${input.origin.lat}), 4326)::geography`
        },
        ${sql.json(input.party as never)}, ${sql.json(input.tripBrief as never)}, ${input.totalBudgetInr}
      )
      RETURNING id
    `;

    const trip = await this.findById(row.id);
    if (trip === null) throw new Error('trip disappeared immediately after insert');
    return trip;
  },

  async listDays(tripId: string): Promise<ItineraryDay[]> {
    const dayRows = await sql<Array<{ id: string; day_number: number; date: Date | null; title: string | null }>>`
      SELECT id, day_number, date, title FROM itinerary_days
      WHERE trip_id = ${tripId}
      ORDER BY day_number
    `;

    if (dayRows.length === 0) return [];

    const itemRows = await sql<ItemRow[]>`
      SELECT id, itinerary_day_id, place_id, local_business_id, item_type, title,
             starts_at, duration_minutes, sort_order, locked_by_user,
             travel_from_previous, price_estimate, booking_state, notes
      FROM itinerary_items
      WHERE itinerary_day_id = ANY(${sql.array(dayRows.map((day) => day.id))}::uuid[])
      ORDER BY sort_order
    `;

    return dayRows.map((day) => ({
      id: day.id,
      dayNumber: day.day_number,
      date: day.date,
      title: day.title,
      items: itemRows.filter((item) => item.itinerary_day_id === day.id).map(toItem),
    }));
  },

  /** Replaces the whole itinerary in one transaction and bumps the version. */
  async replaceItinerary(
    tripId: string,
    days: Array<{ dayNumber: number; date: Date | null; title: string | null; items: NewItem[] }>,
  ): Promise<number> {
    return sql.begin(async (tx) => {
      await tx`DELETE FROM itinerary_days WHERE trip_id = ${tripId}`;

      for (const day of days) {
        const [dayRow] = await tx<{ id: string }[]>`
          INSERT INTO itinerary_days (trip_id, day_number, date, title)
          VALUES (${tripId}, ${day.dayNumber}, ${day.date}, ${day.title})
          RETURNING id
        `;

        for (const item of day.items) {
          await tx`
            INSERT INTO itinerary_items (
              itinerary_day_id, place_id, local_business_id, item_type, title,
              starts_at, duration_minutes, sort_order, travel_from_previous,
              price_estimate, notes
            ) VALUES (
              ${dayRow.id}, ${item.placeId ?? null}, ${item.localBusinessId ?? null},
              ${item.itemType}, ${item.title}, ${item.startsAt}, ${item.durationMinutes},
              ${item.sortOrder}, ${tx.json(item.travelFromPrevious)},
              ${tx.json(item.priceEstimate)}, ${item.notes ?? null}
            )
          `;
        }
      }

      const [row] = await tx<{ version: number }[]>`
        UPDATE trips SET version = version + 1, updated_at = now()
        WHERE id = ${tripId}
        RETURNING version
      `;
      return row.version;
    }) as Promise<number>;
  },

  /** Reorders one day's items, rejecting a stale version. */
  async reorderDay(
    tripId: string,
    dayId: string,
    orderedItemIds: string[],
    expectedVersion: number,
  ): Promise<number | null> {
    return sql.begin(async (tx) => {
      const [current] = await tx<{ version: number }[]>`
        SELECT version FROM trips WHERE id = ${tripId} FOR UPDATE
      `;
      if (current === undefined || current.version !== expectedVersion) return null;

      // sort_order is uniquely constrained per day, so shift out of the way
      // first rather than trying to permute in place.
      await tx`
        UPDATE itinerary_items SET sort_order = sort_order + 1000
        WHERE itinerary_day_id = ${dayId}
      `;

      for (const [index, itemId] of orderedItemIds.entries()) {
        await tx`
          UPDATE itinerary_items SET sort_order = ${index}, updated_at = now()
          WHERE id = ${itemId} AND itinerary_day_id = ${dayId}
        `;
      }

      const [row] = await tx<{ version: number }[]>`
        UPDATE trips SET version = version + 1, updated_at = now()
        WHERE id = ${tripId}
        RETURNING version
      `;
      return row.version;
    }) as Promise<number | null>;
  },

  /**
   * Scoped to the trip: owning one trip must not let a caller lock an item in
   * another by guessing its id. Returns false when the item is not in it.
   */
  async setItemLocked(tripId: string, itemId: string, locked: boolean): Promise<boolean> {
    const rows = await sql`
      UPDATE itinerary_items i SET locked_by_user = ${locked}, updated_at = now()
      FROM itinerary_days d
      WHERE i.id = ${itemId} AND d.id = i.itinerary_day_id AND d.trip_id = ${tripId}
      RETURNING i.id
    `;
    return rows.length === 1;
  },

  async setItemStart(itemId: string, startsAt: Date | null): Promise<void> {
    await sql`
      UPDATE itinerary_items SET starts_at = ${startsAt}, updated_at = now()
      WHERE id = ${itemId}
    `;
  },

  async setItemTravel(itemId: string, leg: { minutes: number; meters: number; mode: string }): Promise<void> {
    await sql`
      UPDATE itinerary_items SET travel_from_previous = ${sql.json(leg)}, updated_at = now()
      WHERE id = ${itemId}
    `;
  },

  /** Scoped to the trip, as setItemLocked. Returns the item's day, or null. */
  async deleteItem(tripId: string, itemId: string): Promise<string | null> {
    const [row] = await sql<{ dayId: string }[]>`
      DELETE FROM itinerary_items i
      USING itinerary_days d
      WHERE i.id = ${itemId} AND d.id = i.itinerary_day_id AND d.trip_id = ${tripId}
      RETURNING i.itinerary_day_id AS "dayId"
    `;
    return row?.dayId ?? null;
  },

  /** Inserts at a position in the day, moving later items down one. */
  async insertItemAt(tripId: string, dayId: string, index: number, item: NewItem): Promise<string> {
    return sql.begin(async (tx) => {
      const [day] = await tx<{ id: string }[]>`SELECT id FROM itinerary_days WHERE id = ${dayId} AND trip_id = ${tripId}`;
      if (day === undefined) throw new Error('That day is not part of this trip.');

      // Two steps, because (day, sort_order) is unique and checked row by row:
      // shifting in place would collide with the next item mid-statement.
      await tx`
        UPDATE itinerary_items SET sort_order = -(sort_order + 1)
        WHERE itinerary_day_id = ${dayId} AND sort_order >= ${index}
      `;
      await tx`
        UPDATE itinerary_items SET sort_order = -sort_order
        WHERE itinerary_day_id = ${dayId} AND sort_order < 0
      `;
      const [row] = await tx<{ id: string }[]>`
        INSERT INTO itinerary_items (
          itinerary_day_id, place_id, local_business_id, item_type, title,
          starts_at, duration_minutes, sort_order, travel_from_previous, price_estimate, notes
        ) VALUES (
          ${dayId}, ${item.placeId ?? null}, ${item.localBusinessId ?? null},
          ${item.itemType}, ${item.title}, ${item.startsAt}, ${item.durationMinutes},
          ${index}, ${tx.json(item.travelFromPrevious)}, ${tx.json(item.priceEstimate)}, ${item.notes ?? null}
        )
        RETURNING id
      `;
      await tx`UPDATE trips SET version = version + 1, updated_at = now() WHERE id = ${tripId}`;
      return row.id;
    }) as Promise<string>;
  },

  async appendItem(dayId: string, item: NewItem): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO itinerary_items (
        itinerary_day_id, place_id, local_business_id, item_type, title,
        starts_at, duration_minutes, sort_order, travel_from_previous, price_estimate, notes
      )
      SELECT ${dayId}, ${item.placeId ?? null}, ${item.localBusinessId ?? null},
             ${item.itemType}, ${item.title}, ${item.startsAt}, ${item.durationMinutes},
             COALESCE(MAX(sort_order) + 1, 0),
             ${sql.json(item.travelFromPrevious)}, ${sql.json(item.priceEstimate)}, ${item.notes ?? null}
      FROM itinerary_items WHERE itinerary_day_id = ${dayId}
      RETURNING id
    `;
    return row.id;
  },

  async bumpVersion(tripId: string): Promise<number> {
    const [row] = await sql<{ version: number }[]>`
      UPDATE trips SET version = version + 1, updated_at = now()
      WHERE id = ${tripId}
      RETURNING version
    `;
    return row.version;
  },

  async setStatus(tripId: string, status: TripStatus): Promise<void> {
    await sql`
      UPDATE trips
      SET status = ${status},
          active_started_at = ${status === 'active' ? sql`now()` : sql`active_started_at`},
          version = version + 1,
          updated_at = now()
      WHERE id = ${tripId}
    `;
  },

  async setDestination(tripId: string, destinationId: string): Promise<void> {
    await sql`
      UPDATE trips SET destination_id = ${destinationId}, version = version + 1, updated_at = now()
      WHERE id = ${tripId}
    `;
  },

  // --- Budget ------------------------------------------------------------

  async replaceBudget(
    tripId: string,
    totalLimitMinor: number,
    reserveMinor: number,
    lines: Array<{
      category: string;
      description: string;
      lowMinor: number | null;
      expectedMinor: number;
      highMinor: number | null;
      priceState: PriceState;
      itineraryItemId?: string | null;
    }>,
  ): Promise<void> {
    await sql.begin(async (tx) => {
      await tx`DELETE FROM budgets WHERE trip_id = ${tripId}`;

      const expectedTotal = lines.reduce((total, line) => total + line.expectedMinor, 0);
      const highTotal = lines.reduce((total, line) => total + (line.highMinor ?? line.expectedMinor), 0);

      const [budget] = await tx<{ id: string }[]>`
        INSERT INTO budgets (
          trip_id, currency, total_limit_minor, reserve_minor,
          expected_total_minor, high_total_minor
        ) VALUES (
          ${tripId}, 'INR', ${totalLimitMinor}, ${reserveMinor}, ${expectedTotal}, ${highTotal}
        )
        RETURNING id
      `;

      for (const line of lines) {
        await tx`
          INSERT INTO budget_line_items (
            budget_id, itinerary_item_id, category, description,
            low_minor, expected_minor, high_minor, price_state, refreshed_at
          ) VALUES (
            ${budget.id}, ${line.itineraryItemId ?? null}, ${line.category}, ${line.description},
            ${line.lowMinor}, ${line.expectedMinor}, ${line.highMinor}, ${line.priceState}, now()
          )
        `;
      }
    });
  },

  async findBudget(tripId: string): Promise<{
    totalLimitMinor: number;
    reserveMinor: number;
    lines: Array<{
      id: string;
      category: string;
      description: string;
      lowMinor: number | null;
      expectedMinor: number;
      highMinor: number | null;
      priceState: PriceState;
      refreshedAt: Date | null;
      locked: boolean;
      itineraryItemId: string | null;
    }>;
  } | null> {
    const [budget] = await sql<Array<{ id: string; total_limit_minor: string; reserve_minor: string }>>`
      SELECT id, total_limit_minor, reserve_minor FROM budgets WHERE trip_id = ${tripId}
    `;
    if (budget === undefined) return null;

    const lines = await sql<
      Array<{
        id: string;
        category: string;
        description: string;
        low_minor: string | null;
        expected_minor: string;
        high_minor: string | null;
        price_state: PriceState;
        refreshed_at: Date | null;
        locked: boolean;
        itinerary_item_id: string | null;
      }>
    >`
      SELECT id, category, description, low_minor, expected_minor, high_minor,
             price_state, refreshed_at, locked, itinerary_item_id
      FROM budget_line_items
      WHERE budget_id = ${budget.id}
      ORDER BY category, description
    `;

    return {
      totalLimitMinor: Number(budget.total_limit_minor),
      reserveMinor: Number(budget.reserve_minor),
      lines: lines.map((line) => ({
        id: line.id,
        category: line.category,
        description: line.description,
        lowMinor: line.low_minor === null ? null : Number(line.low_minor),
        expectedMinor: Number(line.expected_minor),
        highMinor: line.high_minor === null ? null : Number(line.high_minor),
        priceState: line.price_state,
        refreshedAt: line.refreshed_at,
        locked: line.locked,
        itineraryItemId: line.itinerary_item_id,
      })),
    };
  },

  async updateBudgetLimit(tripId: string, totalLimitMinor: number, reserveMinor: number): Promise<void> {
    await sql`
      UPDATE budgets SET total_limit_minor = ${totalLimitMinor}, reserve_minor = ${reserveMinor}, updated_at = now()
      WHERE trip_id = ${tripId}
    `;
    await sql`UPDATE trips SET total_budget_inr = ${Math.round(totalLimitMinor / 100)} WHERE id = ${tripId}`;
  },

  async setLineLocked(lineId: string, locked: boolean): Promise<void> {
    await sql`UPDATE budget_line_items SET locked = ${locked} WHERE id = ${lineId}`;
  },

  async updateLineAmounts(
    lineId: string,
    amounts: { lowMinor: number | null; expectedMinor: number; highMinor: number | null },
  ): Promise<void> {
    await sql`
      UPDATE budget_line_items
      SET low_minor = ${amounts.lowMinor},
          expected_minor = ${amounts.expectedMinor},
          high_minor = ${amounts.highMinor},
          price_state = 'manual',
          refreshed_at = now()
      WHERE id = ${lineId}
    `;
  },
};
