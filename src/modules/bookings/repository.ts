import { sql } from '@/platform/db/client';
import type { BookingKind, BookingState, ConfirmationEvidence, Offer } from './domain/booking';

/** What the traveller has pursued for one trip. Scoped to the trip everywhere. */

export type TripBooking = {
  id: string;
  tripId: string;
  kind: BookingKind;
  state: BookingState;
  providerId: string;
  providerName: string;
  offer: Offer;
  handoffAt: Date | null;
  reference: string | null;
  referenceAddedAt: Date | null;
  confirmationEvidence: ConfirmationEvidence | null;
  confirmedAt: Date | null;
};

type Row = Omit<TripBooking, 'offer'> & { offer: Record<string, unknown> };

const COLUMNS = sql`
  id, trip_id AS "tripId", kind, state, provider_id AS "providerId", provider_name AS "providerName",
  offer_snapshot AS offer, handoff_at AS "handoffAt", reference, reference_added_at AS "referenceAddedAt",
  confirmation_evidence AS "confirmationEvidence", confirmed_at AS "confirmedAt"
`;

/** The stored snapshot, with its date revived. */
function hydrate(row: Row): TripBooking {
  const offer = row.offer as unknown as Offer;
  return {
    ...row,
    offer: { ...offer, checkedAt: offer.checkedAt === null ? null : new Date(offer.checkedAt as unknown as string) },
  };
}

export const bookingsRepository = {
  async listForTrip(tripId: string): Promise<TripBooking[]> {
    const rows = await sql<Row[]>`
      SELECT ${COLUMNS} FROM trip_bookings WHERE trip_id = ${tripId} ORDER BY created_at
    `;
    return rows.map(hydrate);
  },

  async find(tripId: string, bookingId: string): Promise<TripBooking | null> {
    const [row] = await sql<Row[]>`
      SELECT ${COLUMNS} FROM trip_bookings WHERE id = ${bookingId} AND trip_id = ${tripId}
    `;
    return row === undefined ? null : hydrate(row);
  },

  /** One row per provider offer a traveller opens; opening it again reuses it. */
  async recordHandoff(input: { tripId: string; offer: Offer }): Promise<TripBooking> {
    const [row] = await sql<Row[]>`
      INSERT INTO trip_bookings (trip_id, kind, state, provider_id, provider_name, offer_snapshot, handoff_at)
      VALUES (
        ${input.tripId}, ${input.offer.kind}, 'handoff_initiated',
        ${input.offer.providerId}, ${input.offer.providerName},
        ${sql.json(input.offer as never)}, now()
      )
      RETURNING ${COLUMNS}
    `;
    return hydrate(row);
  },

  async addReference(tripId: string, bookingId: string, reference: string): Promise<TripBooking | null> {
    const [row] = await sql<Row[]>`
      UPDATE trip_bookings
      SET reference = ${reference}, reference_added_at = now(), state = 'reference_added', updated_at = now()
      WHERE id = ${bookingId} AND trip_id = ${tripId}
      RETURNING ${COLUMNS}
    `;
    return row === undefined ? null : hydrate(row);
  },

  async markConfirmed(tripId: string, bookingId: string, evidence: ConfirmationEvidence): Promise<TripBooking | null> {
    const [row] = await sql<Row[]>`
      UPDATE trip_bookings
      SET state = 'confirmed_by_provider', confirmation_evidence = ${evidence}, confirmed_at = now(), updated_at = now()
      WHERE id = ${bookingId} AND trip_id = ${tripId}
      RETURNING ${COLUMNS}
    `;
    return row === undefined ? null : hydrate(row);
  },

  async remove(tripId: string, bookingId: string): Promise<boolean> {
    const rows = await sql`DELETE FROM trip_bookings WHERE id = ${bookingId} AND trip_id = ${tripId} RETURNING id`;
    return rows.length === 1;
  },
};
