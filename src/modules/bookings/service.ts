import { getBookingProvider, type BookingQuery } from '@/platform/booking';
import { catalogRepository } from '@/modules/catalog/repository';
import { tripsRepository } from '@/modules/trips/repository';
import { recordAudit } from '@/server/authorize';
import { DomainError } from '@/shared/result';
import {
  canConfirm,
  priceView,
  validateReference,
  type BookingKind,
  type ConfirmationEvidence,
  type Offer,
} from './domain/booking';
import { bookingsRepository, type TripBooking } from './repository';

/**
 * Booking handoff — PRD Part I T13.
 *
 * The product compares offers and hands the traveller to the provider. It
 * never claims to have booked anything, and never records a confirmation
 * without saying where that confirmation came from.
 */

const refuse = (message: string, status = 409): DomainError => new DomainError('booking.refused', message, status);

export type BookingOptions = {
  kind: BookingKind;
  providerName: string;
  /** True when these are the sandbox's estimates rather than a live provider. */
  isSandbox: boolean;
  offers: Offer[];
  /** Offers the provider returned that could not be shown, and why. */
  withheld: Array<{ title: string; reason: string }>;
  bookings: TripBooking[];
};

export const bookingsService = {
  /** Offers for a trip, plus whatever the traveller has already pursued. */
  async options(tripId: string, kind: BookingKind, now = new Date()): Promise<BookingOptions> {
    const trip = await tripsRepository.findById(tripId);
    if (trip === null) throw new DomainError('trip.not_found', 'That trip does not exist.', 404);

    const days = await tripsRepository.listDays(tripId);
    const destination = trip.destinationId === null ? null : await catalogRepository.findDestinationById(trip.destinationId);
    const brief = trip.tripBrief as { party?: { adults?: number; children?: number } };

    const query: BookingQuery = {
      kind,
      area: destination === null ? { lat: 11.41, lng: 76.7 } : { lat: destination.lat, lng: destination.lng },
      areaName: destination?.name ?? trip.title,
      checkIn: trip.startDate,
      nights: Math.max(1, days.length - 1),
      travellers: (brief.party?.adults ?? 2) + (brief.party?.children ?? 0),
    };

    const provider = getBookingProvider();
    const returned = await provider.search(query);

    // T13: a price without a currency and a checked time cannot be shown, so
    // it is held back with the reason rather than rendered bare.
    const offers: Offer[] = [];
    const withheld: BookingOptions['withheld'] = [];
    for (const offer of returned) {
      const view = priceView(offer, now);
      if (view.showable) offers.push(offer);
      else withheld.push({ title: offer.title, reason: view.reason });
    }

    return {
      kind,
      providerName: provider.name,
      isSandbox: provider.name === 'sandbox',
      offers,
      withheld,
      bookings: (await bookingsRepository.listForTrip(tripId)).filter((booking) => booking.kind === kind),
    };
  },

  /**
   * Records that the traveller is leaving for the provider. It records an
   * intention to look, never a booking.
   */
  async recordHandoff(tripId: string, offer: Offer, actorUserId: string | null, requestId?: string): Promise<TripBooking> {
    if (!priceView(offer, new Date()).showable) {
      throw refuse('That offer cannot be shown with a price and a checked time, so it cannot be opened from here.', 400);
    }

    const existing = (await bookingsRepository.listForTrip(tripId)).find(
      (booking) => booking.providerId === offer.providerId && booking.state !== 'confirmed_by_provider',
    );
    if (existing !== undefined) return existing;

    const booking = await bookingsRepository.recordHandoff({ tripId, offer });

    await recordAudit({
      actorUserId,
      action: 'booking.handoff_initiated',
      entityType: 'trip',
      entityId: tripId,
      afterState: { bookingId: booking.id, provider: offer.providerName, providerId: offer.providerId },
      requestId,
    });

    return booking;
  },

  /** E13-S03: the traveller types in the reference the provider gave them. */
  async addReference(tripId: string, bookingId: string, raw: string, actorUserId: string | null, requestId?: string): Promise<TripBooking> {
    const booking = await bookingsRepository.find(tripId, bookingId);
    if (booking === null) throw new DomainError('booking.not_found', 'That booking is not on this trip.', 404);

    const checked = validateReference(raw);
    if (!checked.ok) throw refuse(checked.reason, 400);

    const updated = await bookingsRepository.addReference(tripId, bookingId, checked.value);
    if (updated === null) throw new DomainError('booking.not_found', 'That booking is not on this trip.', 404);

    await recordAudit({
      actorUserId,
      action: 'booking.reference_added',
      entityType: 'trip',
      entityId: tripId,
      // The reference itself is the traveller's; the audit records only that one was added.
      afterState: { bookingId, provider: booking.providerName },
      requestId,
    });

    return updated;
  },

  async markConfirmed(
    tripId: string,
    bookingId: string,
    evidence: ConfirmationEvidence,
    actorUserId: string | null,
    requestId?: string,
  ): Promise<TripBooking> {
    const booking = await bookingsRepository.find(tripId, bookingId);
    if (booking === null) throw new DomainError('booking.not_found', 'That booking is not on this trip.', 404);

    const blocker = canConfirm(booking.state, evidence, booking.reference !== null);
    if (blocker !== null) throw refuse(blocker);

    const updated = await bookingsRepository.markConfirmed(tripId, bookingId, evidence);
    if (updated === null) throw new DomainError('booking.not_found', 'That booking is not on this trip.', 404);

    await recordAudit({
      actorUserId,
      action: 'booking.marked_confirmed',
      entityType: 'trip',
      entityId: tripId,
      afterState: { bookingId, evidence },
      requestId,
    });

    return updated;
  },

  async forget(tripId: string, bookingId: string, actorUserId: string | null, requestId?: string): Promise<void> {
    if (!(await bookingsRepository.remove(tripId, bookingId))) {
      throw new DomainError('booking.not_found', 'That booking is not on this trip.', 404);
    }
    await recordAudit({
      actorUserId,
      action: 'booking.removed',
      entityType: 'trip',
      entityId: tripId,
      beforeState: { bookingId },
      requestId,
    });
  },
};
