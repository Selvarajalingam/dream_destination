import type { BookingKind, Offer } from '@/modules/bookings/domain/booking';
import { SandboxBookingProvider } from './sandbox';
import { HttpBookingProvider } from './http';

/**
 * Booking provider adapter — PRD Part I T13, backlog E13-S01.
 *
 * A sandbox provider by default, so the product can be demonstrated without a
 * contract or a key. A real provider is configured with BOOKING_BASE_URL and
 * falls back to the sandbox's labelled estimates when it times out or answers
 * badly, which is the "booking provider unavailable" degradation.
 */

export type BookingQuery = {
  kind: BookingKind;
  /** Where the traveller is going. */
  area: { lat: number; lng: number };
  areaName: string;
  checkIn: Date | null;
  nights: number;
  travellers: number;
};

export interface BookingProvider {
  readonly name: string;
  /** Offers for a query. Never throws: a failure degrades to estimates. */
  search(query: BookingQuery): Promise<Offer[]>;
}

let cached: BookingProvider | null = null;

export function getBookingProvider(): BookingProvider {
  if (cached !== null) return cached;

  const baseUrl = process.env.BOOKING_BASE_URL;
  const sandbox = new SandboxBookingProvider();

  cached = baseUrl === undefined || baseUrl.trim() === '' ? sandbox : new HttpBookingProvider(baseUrl, sandbox);
  return cached;
}

export function resetBookingProvider(): void {
  cached = null;
}

export { SandboxBookingProvider } from './sandbox';
export { HttpBookingProvider } from './http';
