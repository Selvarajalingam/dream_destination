import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpBookingProvider } from '@/platform/booking/http';
import { SandboxBookingProvider } from '@/platform/booking/sandbox';
import { priceView } from '@/modules/bookings/domain/booking';
import type { BookingQuery } from '@/platform/booking';

const query: BookingQuery = {
  kind: 'stay',
  area: { lat: 11.41, lng: 76.7 },
  areaName: 'Ooty',
  checkIn: new Date('2026-12-18T00:00:00Z'),
  nights: 3,
  travellers: 4,
};

const sandbox = new SandboxBookingProvider();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sandbox provider', () => {
  it('returns offers that can all be shown, each with a currency and a checked time', async () => {
    const offers = await sandbox.search(query);
    expect(offers.length).toBeGreaterThan(1);
    for (const offer of offers) {
      expect(priceView(offer, new Date()).showable).toBe(true);
      expect(offer.attribution).toMatch(/[Ss]andbox/);
    }
  });

  it('prices the same query the same way twice', async () => {
    const [first, second] = await Promise.all([sandbox.search(query), sandbox.search(query)]);
    expect(first.map((offer) => offer.price?.amountMinor)).toEqual(second.map((offer) => offer.price?.amountMinor));
  });

  it('states taxes as included, excluded or not stated, never silently', async () => {
    const offers = await sandbox.search(query);
    expect(new Set(offers.map((offer) => offer.taxesAndFees)).size).toBeGreaterThan(1);
  });
});

describe('http provider (E13-S01)', () => {
  it('normalises a provider answer, dropping rows that could not be shown honestly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          offers: [
            {
              id: 'h1',
              name: 'Provider',
              url: 'https://provider.example/h1',
              title: 'Hotel One',
              priceMinor: 500_000,
              currency: 'INR',
              taxesIncluded: true,
              cancellation: 'Free until Monday',
              checkedAt: '2026-09-23T09:00:00.000Z',
              attributes: ['Twin', 42],
            },
            { id: 'h2', url: 'https://provider.example/h2', title: 'No price', currency: 'INR', checkedAt: '2026-09-23T09:00:00.000Z' },
            { id: 'h3', url: 'https://provider.example/h3', title: 'No checked time', priceMinor: 1, currency: 'INR' },
          ],
        }),
      ),
    );

    const offers = await new HttpBookingProvider('https://provider.example', sandbox).search(query);

    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      providerId: 'h1',
      providerName: 'Provider',
      taxesAndFees: 'included',
      cancellationInfo: 'Free until Monday',
      attributes: ['Twin'],
    });
  });

  it('says taxes are not stated when the provider does not say', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          offers: [
            { id: 'h1', url: 'https://p.example/1', title: 'Room', priceMinor: 1_000, currency: 'INR', checkedAt: new Date().toISOString() },
          ],
        }),
      ),
    );

    const [offer] = await new HttpBookingProvider('https://p.example', sandbox).search(query);
    expect(offer.taxesAndFees).toBe('unknown');
    expect(offer.cancellationInfo).toBeNull();
  });

  it('falls back to sandbox estimates when the provider fails or answers badly', async () => {
    const cases = [
      vi.fn(async () => {
        throw new Error('network down');
      }),
      vi.fn(async () => new Response('nope', { status: 503 })),
      vi.fn(async () => Response.json({ offers: [] })),
      vi.fn(async () => Response.json({ unexpected: true })),
    ];

    for (const stub of cases) {
      vi.stubGlobal('fetch', stub);
      const offers = await new HttpBookingProvider('https://p.example', sandbox).search(query);
      expect(offers.length).toBeGreaterThan(0);
      expect(offers[0].attribution).toMatch(/[Ss]andbox/);
    }
  });

  it('stops calling a provider that keeps failing, and still returns offers', async () => {
    const stub = vi.fn(async () => {
      throw new Error('down');
    });
    vi.stubGlobal('fetch', stub);

    const provider = new HttpBookingProvider('https://p.example', sandbox);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      expect((await provider.search(query)).length).toBeGreaterThan(0);
    }
    // The circuit opens after three failures, so the provider is spared the rest.
    expect(stub.mock.calls.length).toBeLessThan(6);
  });
});
