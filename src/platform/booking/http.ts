import { logger } from '@/platform/observability/logger';
import { CircuitBreaker } from '@/platform/resilience/circuit-breaker';
import { withTimeout } from '@/platform/resilience/with-timeout';
import type { Offer } from '@/modules/bookings/domain/booking';
import type { BookingProvider, BookingQuery } from './index';

/**
 * A real booking provider over HTTP, used when BOOKING_BASE_URL is set
 * (E13-S01).
 *
 * Wrapped in a timeout and a circuit breaker, and falls back to the sandbox's
 * labelled estimates on any failure. Fields the provider leaves out are
 * carried through as "not stated" rather than guessed, so the screen can say
 * so; an offer with no price or no checked time is dropped, because it could
 * not be shown honestly anyway.
 */

type ProviderOffer = {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  title?: unknown;
  priceMinor?: unknown;
  currency?: unknown;
  taxesIncluded?: unknown;
  cancellation?: unknown;
  checkedAt?: unknown;
  attributes?: unknown;
  attribution?: unknown;
};

const asString = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

export class HttpBookingProvider implements BookingProvider {
  readonly name = 'http';

  private readonly breaker = new CircuitBreaker({ failureThreshold: 3, resetMs: 30_000 });

  constructor(
    private readonly baseUrl: string,
    private readonly fallback: BookingProvider,
  ) {}

  async search(query: BookingQuery): Promise<Offer[]> {
    try {
      const offers = await this.breaker.run(async () => {
        const url = new URL(`${this.baseUrl.replace(/\/$/, '')}/offers`);
        url.searchParams.set('kind', query.kind);
        url.searchParams.set('lat', String(query.area.lat));
        url.searchParams.set('lng', String(query.area.lng));
        url.searchParams.set('nights', String(query.nights));
        url.searchParams.set('travellers', String(query.travellers));
        if (query.checkIn !== null) url.searchParams.set('checkIn', query.checkIn.toISOString().slice(0, 10));

        const response = await withTimeout(fetch(url, { headers: { accept: 'application/json' } }), 3_000, 'booking');
        if (!response.ok) throw new Error(`booking provider responded ${response.status}`);

        const body = (await response.json()) as { offers?: unknown };
        if (!Array.isArray(body.offers)) throw new Error('booking provider returned no offers array');

        return body.offers
          .map((raw) => this.normalize(raw as ProviderOffer, query))
          .filter((offer): offer is Offer => offer !== null);
      });

      // An empty answer is a real answer, but there is nothing to compare.
      if (offers.length === 0) throw new Error('booking provider returned no usable offers');
      return offers;
    } catch (error) {
      logger.warn('booking.http.fallback', {
        reason: error instanceof Error ? error.message : 'unknown',
        breaker: this.breaker.state,
      });
      return this.fallback.search(query);
    }
  }

  private normalize(raw: ProviderOffer, query: BookingQuery): Offer | null {
    const providerId = asString(raw.id);
    const url = asString(raw.url);
    const title = asString(raw.title);
    const currency = asString(raw.currency);
    const checkedAt = asString(raw.checkedAt);
    const price = typeof raw.priceMinor === 'number' && Number.isFinite(raw.priceMinor) ? Math.round(raw.priceMinor) : null;

    // Without these a row could not be shown with its price state, so it is
    // dropped rather than rendered as a bare number.
    if (providerId === null || url === null || title === null || price === null || currency === null) return null;
    const checked = checkedAt === null ? null : new Date(checkedAt);
    if (checked === null || Number.isNaN(checked.getTime())) return null;

    return {
      providerId,
      providerName: asString(raw.name) ?? new URL(this.baseUrl).hostname,
      url,
      kind: query.kind,
      title,
      price: { amountMinor: price, currency },
      taxesAndFees: raw.taxesIncluded === true ? 'included' : raw.taxesIncluded === false ? 'excluded' : 'unknown',
      cancellationInfo: asString(raw.cancellation),
      checkedAt: checked,
      attributes: Array.isArray(raw.attributes)
        ? raw.attributes.filter((item): item is string => typeof item === 'string').slice(0, 8)
        : [],
      attribution: asString(raw.attribution) ?? `Offer supplied by ${asString(raw.name) ?? this.baseUrl}.`,
    };
  }
}
