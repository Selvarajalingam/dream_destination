import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';
import { bookingsRepository } from '@/modules/bookings/repository';
import { bookingsService } from '@/modules/bookings/service';
import { tripsService } from '@/modules/trips/service';
import { cleanupTestUsers, seedUserWithTrip } from './helpers';

let tripId: string;
let otherTripId: string;
let userId: string;

beforeAll(async () => {
  ({ tripId, userId } = await seedUserWithTrip());
  ({ tripId: otherTripId } = await seedUserWithTrip());
  await tripsService.generateItinerary(tripId);
});

afterAll(async () => {
  await cleanupTestUsers();
  await sql.end();
});

const firstOffer = async () => {
  const options = await bookingsService.options(tripId, 'stay');
  return options.offers[0];
};

describe('booking options (T13)', () => {
  it('offers stays and transport for the trip, each showable with a price state', async () => {
    const stays = await bookingsService.options(tripId, 'stay');
    const transport = await bookingsService.options(tripId, 'transport');

    expect(stays.isSandbox).toBe(true);
    expect(stays.offers.length).toBeGreaterThan(1);
    expect(stays.withheld).toEqual([]);
    for (const offer of stays.offers) {
      expect(offer.price?.currency).toBe('INR');
      expect(offer.checkedAt).not.toBeNull();
    }
    expect(transport.offers.every((offer) => offer.kind === 'transport')).toBe(true);
  });
});

describe('handoff and what follows', () => {
  it('records leaving for a provider without calling it a booking', async () => {
    const offer = await firstOffer();
    const booking = await bookingsService.recordHandoff(tripId, offer, userId);

    expect(booking).toMatchObject({ state: 'handoff_initiated', providerId: offer.providerId, reference: null });
    expect(booking.handoffAt).not.toBeNull();

    const [audit] = await sql<{ action: string }[]>`
      SELECT action FROM audit_logs WHERE entity_id = ${tripId} ORDER BY created_at DESC LIMIT 1
    `;
    expect(audit.action).toBe('booking.handoff_initiated');

    // Opening the same offer again does not pile up rows.
    const again = await bookingsService.recordHandoff(tripId, offer, userId);
    expect(again.id).toBe(booking.id);
  });

  it('accepts a reference, and refuses anything that looks like payment details', async () => {
    const [booking] = await bookingsRepository.listForTrip(tripId);

    await expect(bookingsService.addReference(tripId, booking.id, '4111 1111 1111 1111', userId)).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/never payment details/),
    });

    const updated = await bookingsService.addReference(tripId, booking.id, 'sbx-77aa', userId);
    expect(updated).toMatchObject({ state: 'reference_added', reference: 'SBX-77AA' });

    const [row] = await sql<{ reference: string }[]>`SELECT reference FROM trip_bookings WHERE id = ${booking.id}`;
    expect(row.reference).toBe('SBX-77AA');
  });

  it('marks confirmed only with a reference and a stated source', async () => {
    const [booking] = await bookingsRepository.listForTrip(tripId);

    const confirmed = await bookingsService.markConfirmed(tripId, booking.id, 'traveller_attested', userId);
    expect(confirmed).toMatchObject({ state: 'confirmed_by_provider', confirmationEvidence: 'traveller_attested' });
    expect(confirmed.confirmedAt).not.toBeNull();

    // Confirmed is terminal: it cannot be confirmed twice.
    await expect(bookingsService.markConfirmed(tripId, booking.id, 'provider_callback', userId)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('refuses to confirm a booking that has no reference', async () => {
    const offers = await bookingsService.options(tripId, 'transport');
    const booking = await bookingsService.recordHandoff(tripId, offers.offers[0], userId);

    await expect(bookingsService.markConfirmed(tripId, booking.id, 'provider_callback', userId)).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/reference/),
    });
  });

  it('keeps the database from holding a confirmation with no evidence', async () => {
    const [booking] = await bookingsRepository.listForTrip(tripId);
    await expect(
      sql`UPDATE trip_bookings SET state = 'confirmed_by_provider', confirmed_at = now(), confirmation_evidence = NULL WHERE id = ${booking.id}`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('will not touch a booking through a different trip', async () => {
    const [booking] = await bookingsRepository.listForTrip(tripId);

    expect(await bookingsRepository.find(otherTripId, booking.id)).toBeNull();
    await expect(bookingsService.addReference(otherTripId, booking.id, 'SBX-0001', userId)).rejects.toMatchObject({ status: 404 });
    await expect(bookingsService.forget(otherTripId, booking.id, userId)).rejects.toMatchObject({ status: 404 });

    await bookingsService.forget(tripId, booking.id, userId);
    expect(await bookingsRepository.find(tripId, booking.id)).toBeNull();
  });
});
