import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATES,
  STATE_EXPLANATION,
  canConfirm,
  canTransition,
  priceView,
  validateReference,
  type Offer,
} from '@/modules/bookings/domain/booking';

const now = new Date('2026-09-23T10:00:00Z');

const offer: Offer = {
  providerId: 'p1',
  providerName: 'Sandbox Valley Lodge',
  url: '/provider-sandbox?offer=p1',
  kind: 'stay',
  title: 'Ooty Valley Lodge',
  price: { amountMinor: 450_000, currency: 'INR' },
  taxesAndFees: 'included',
  cancellationInfo: 'Free until 24 hours before.',
  checkedAt: new Date('2026-09-23T09:55:00Z'),
  attributes: ['Twin room'],
  attribution: 'Sandbox provider.',
};

describe('priceView (T13: no price without currency and refresh state)', () => {
  it('shows a checked price with its currency', () => {
    expect(priceView(offer, now)).toEqual({
      showable: true,
      amountMinor: 450_000,
      currency: 'INR',
      checkedAt: offer.checkedAt,
      stale: false,
    });
  });

  it('refuses a price with no currency, no amount or no checked time', () => {
    expect(priceView({ ...offer, price: null }, now)).toMatchObject({ showable: false });
    expect(priceView({ ...offer, price: { amountMinor: 1, currency: '  ' } }, now)).toMatchObject({ showable: false });
    expect(priceView({ ...offer, checkedAt: null }, now)).toMatchObject({ showable: false, reason: expect.stringMatching(/when this price was checked/) });
  });

  it('marks a price stale once it is older than the refresh window', () => {
    const old = { ...offer, checkedAt: new Date('2026-09-23T09:40:00Z') };
    expect(priceView(old, now)).toMatchObject({ showable: true, stale: true });
  });
});

describe('booking states', () => {
  it('explains every state without claiming Dream Destination booked anything', () => {
    for (const state of BOOKING_STATES) {
      expect(STATE_EXPLANATION[state]).toBeTruthy();
    }
    expect(Object.values(STATE_EXPLANATION).join(' ')).not.toMatch(/\bwe booked|your booking is guaranteed\b/i);
  });

  it('never jumps straight to confirmed', () => {
    expect(canTransition('estimated', 'confirmed_by_provider')).toBe(false);
    expect(canTransition('handoff_initiated', 'confirmed_by_provider')).toBe(false);
    expect(canTransition('reference_added', 'confirmed_by_provider')).toBe(true);
    expect(canTransition('confirmed_by_provider', 'handoff_initiated')).toBe(false);
  });
});

describe('canConfirm (E13-S03: never confirmed without evidence)', () => {
  it('needs a reference and a stated source', () => {
    expect(canConfirm('reference_added', 'traveller_attested', true)).toBeNull();
    expect(canConfirm('reference_added', null, true)).toMatch(/where the confirmation came from/);
    expect(canConfirm('reference_added', 'provider_callback', false)).toMatch(/reference/);
    expect(canConfirm('handoff_initiated', 'provider_callback', true)).toMatch(/reference/);
    expect(canConfirm('confirmed_by_provider', 'provider_callback', true)).toMatch(/already/);
  });
});

describe('validateReference', () => {
  it('accepts a booking code and normalises it', () => {
    expect(validateReference('  sbx-4f2a  ')).toEqual({ ok: true, value: 'SBX-4F2A' });
    expect(validateReference('BOOK 123 45')).toEqual({ ok: true, value: 'BOOK 123 45' });
  });

  it('refuses anything that looks like payment or login details', () => {
    for (const bad of ['4111111111111111', '4111 1111 1111 1111', 'card no 5500005555555559', 'ref 123 cvv 456', 'otp 998812']) {
      expect(validateReference(bad).ok).toBe(false);
    }
  });

  it('refuses an empty, overlong or punctuation-laden value', () => {
    expect(validateReference('a').ok).toBe(false);
    expect(validateReference('X'.repeat(61)).ok).toBe(false);
    expect(validateReference('<script>alert(1)</script>').ok).toBe(false);
  });
});
