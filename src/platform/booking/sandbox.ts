import type { Offer } from '@/modules/bookings/domain/booking';
import type { BookingProvider, BookingQuery } from './index';

/**
 * A sandbox booking provider.
 *
 * It invents nothing about real hotels or operators: every offer is named as
 * a sandbox one, priced from the same band arithmetic the budget uses, and
 * handed off to a page inside this application that says plainly that no
 * booking exists. Swapping in a real provider is a change of one adapter.
 *
 * Deterministic, so a demonstration shows the same options twice.
 */

const STAYS = [
  { suffix: 'Heritage Rooms', band: 3, attributes: ['Twin rooms', 'Breakfast included', 'Parking'] },
  { suffix: 'Valley Lodge', band: 2, attributes: ['Family room', 'Hot water', 'Step-free entrance'] },
  { suffix: 'Estate Cottages', band: 4, attributes: ['Two bedrooms', 'Kitchen', 'Garden'] },
  { suffix: 'Traveller Inn', band: 1, attributes: ['Double room', 'Shared balcony'] },
];

const TRANSPORT = [
  { suffix: 'Coach Service', band: 1, attributes: ['Seat in a shared coach', 'One bag'] },
  { suffix: 'Cab Company', band: 3, attributes: ['Whole car', 'Driver included', 'Four seats'] },
  { suffix: 'Rail Connection', band: 2, attributes: ['Reserved seat', 'Station transfer not included'] },
];

/** Deterministic pseudo-random in [0, 1) from a string. */
function jitter(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return ((hash >>> 0) % 1_000) / 1_000;
}

export class SandboxBookingProvider implements BookingProvider {
  readonly name = 'sandbox';

  async search(query: BookingQuery): Promise<Offer[]> {
    const catalogue = query.kind === 'stay' ? STAYS : TRANSPORT;
    const checkedAt = new Date();

    return catalogue.map((entry, index) => {
      const seed = `${query.kind}:${query.areaName}:${entry.suffix}:${query.nights}:${query.travellers}`;
      const base = query.kind === 'stay' ? entry.band * 90_000 * Math.max(1, query.nights) : entry.band * 60_000;
      const scaled = base * (query.kind === 'stay' ? Math.ceil(query.travellers / 2) : query.travellers);
      const amountMinor = Math.round((scaled * (0.85 + jitter(seed) * 0.3)) / 1_000) * 1_000;

      return {
        providerId: `sandbox-${query.kind}-${index}`,
        providerName: `Sandbox ${entry.suffix}`,
        url: `/provider-sandbox?offer=sandbox-${query.kind}-${index}`,
        kind: query.kind,
        title: `${query.areaName} ${entry.suffix}`,
        price: { amountMinor, currency: 'INR' },
        // Alternating on purpose, so the screen has to state all three cases.
        taxesAndFees: index % 3 === 0 ? 'included' : index % 3 === 1 ? 'excluded' : 'unknown',
        cancellationInfo:
          index % 2 === 0 ? 'Free cancellation until 24 hours before arrival, per the sandbox terms.' : null,
        checkedAt,
        attributes: entry.attributes,
        attribution: 'Sandbox provider. Prices are demonstration data, not offers from any real business.',
      } satisfies Offer;
    });
  }
}
