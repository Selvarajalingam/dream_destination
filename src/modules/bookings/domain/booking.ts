/**
 * Booking handoff — PRD Part I T13, backlog E13.
 *
 * "Support comparison and provider handoff without implying that Dream
 * Destination completed the transaction."
 *
 * Two rules drive everything here. A price may not be shown without its
 * currency and how fresh it is, and nothing is called confirmed unless the
 * provider or the traveller supplied evidence of it.
 */

export type BookingKind = 'stay' | 'transport';

export type BookingState =
  /** A figure from the catalogue, not checked with any provider. */
  | 'estimated'
  /** A provider answered with this price at a known time. */
  | 'available_when_checked'
  /** The traveller left for the provider's own site. */
  | 'handoff_initiated'
  /** The traveller typed in a reference they were given. */
  | 'reference_added'
  /** The provider, or the traveller's evidence, says it is booked. */
  | 'confirmed_by_provider';

export const BOOKING_STATES: readonly BookingState[] = [
  'estimated',
  'available_when_checked',
  'handoff_initiated',
  'reference_added',
  'confirmed_by_provider',
];

export const STATE_LABEL: Record<BookingState, string> = {
  estimated: 'Estimated',
  available_when_checked: 'Available when checked',
  handoff_initiated: 'Sent to the provider',
  reference_added: 'Reference added by you',
  confirmed_by_provider: 'Confirmed by the provider',
};

export const STATE_EXPLANATION: Record<BookingState, string> = {
  estimated: 'A typical price for this kind of stay or journey. Nothing has been checked with a provider.',
  available_when_checked: 'The provider offered this price when we last checked. It can change before you book.',
  handoff_initiated: 'You opened the provider’s own site. Whether you booked there is not something we can see.',
  reference_added: 'You added a reference from the provider. We have not verified it with them.',
  confirmed_by_provider: 'The provider confirmed this booking.',
};

/** What may follow what. Nothing skips ahead to confirmed. */
const TRANSITIONS: Record<BookingState, readonly BookingState[]> = {
  estimated: ['available_when_checked', 'handoff_initiated'],
  available_when_checked: ['estimated', 'handoff_initiated'],
  handoff_initiated: ['reference_added', 'available_when_checked'],
  reference_added: ['confirmed_by_provider', 'handoff_initiated'],
  confirmed_by_provider: [],
};

export function canTransition(from: BookingState, to: BookingState): boolean {
  return TRANSITIONS[from].includes(to);
}

export type ConfirmationEvidence = 'provider_callback' | 'traveller_attested';

/**
 * E13-S03: "Dream Destination does not mark confirmation without
 * provider/user evidence state." A reference alone is not evidence.
 */
export function canConfirm(state: BookingState, evidence: ConfirmationEvidence | null, hasReference: boolean): string | null {
  if (state === 'confirmed_by_provider') return 'This booking is already marked as confirmed.';
  if (!canTransition(state, 'confirmed_by_provider')) return 'Add the reference the provider gave you first.';
  if (!hasReference) return 'Add the reference the provider gave you first.';
  if (evidence === null) return 'Say where the confirmation came from, so it is not recorded as ours.';
  return null;
}

// --- Prices ---------------------------------------------------------------

export type Money = { amountMinor: number; currency: string };

export type Offer = {
  providerId: string;
  providerName: string;
  /** The provider's own page for this offer. */
  url: string;
  kind: BookingKind;
  title: string;
  price: Money | null;
  /** Whether taxes and fees are inside the price, extra, or not stated. */
  taxesAndFees: 'included' | 'excluded' | 'unknown';
  /** Whether the provider said anything about cancellation. */
  cancellationInfo: string | null;
  /** When the provider answered. Null means the figure was not checked. */
  checkedAt: Date | null;
  attributes: string[];
  /** Attribution the provider's terms require to be shown. */
  attribution: string;
};

/** How long a checked price stays presentable before it is called stale. */
export const PRICE_FRESH_MINUTES = 15;

export type PriceView =
  | { showable: false; reason: string }
  | { showable: true; amountMinor: number; currency: string; checkedAt: Date; stale: boolean };

/**
 * T13: "A price cannot appear without currency and refresh/source state."
 * A figure missing either is refused here rather than rendered bare.
 */
export function priceView(offer: Offer, now: Date, freshMinutes = PRICE_FRESH_MINUTES): PriceView {
  if (offer.price === null) return { showable: false, reason: 'The provider did not return a price.' };
  if (offer.price.currency.trim() === '') return { showable: false, reason: 'The provider returned a price with no currency.' };
  if (offer.checkedAt === null) return { showable: false, reason: 'The provider did not say when this price was checked.' };

  return {
    showable: true,
    amountMinor: offer.price.amountMinor,
    currency: offer.price.currency,
    checkedAt: offer.checkedAt,
    stale: now.getTime() - offer.checkedAt.getTime() > freshMinutes * 60_000,
  };
}

export const TAXES_LABEL: Record<Offer['taxesAndFees'], string> = {
  included: 'Taxes and fees included',
  excluded: 'Taxes and fees extra',
  unknown: 'Taxes and fees not stated by the provider',
};

// --- Manual references (E13-S03) ------------------------------------------

/**
 * A reference is a booking code, never payment details. Anything that looks
 * like a card, an account number or a long run of digits is refused, because
 * this product has no reason to hold it and no way to protect it.
 */
export function validateReference(raw: string): { ok: true; value: string } | { ok: false; reason: string } {
  const value = raw.trim().replace(/\s+/g, ' ');

  if (value.length < 3) return { ok: false, reason: 'Enter the reference the provider gave you.' };
  if (value.length > 60) return { ok: false, reason: 'A booking reference is shorter than this. Enter only the code.' };

  const digitsOnly = value.replace(/[^0-9]/g, '');
  if (digitsOnly.length >= 12) {
    return {
      ok: false,
      reason: 'That looks like a card or account number. Enter only the booking reference, never payment details.',
    };
  }
  if (/\b(cvv|cvc|expiry|exp\s?date|card\s?no|upi|iban|otp|password)\b/i.test(value)) {
    return { ok: false, reason: 'Enter only the booking reference. Do not include payment or login details.' };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 /_-]*$/.test(value)) {
    return { ok: false, reason: 'A booking reference is letters, digits, spaces and dashes.' };
  }

  return { ok: true, value: value.toUpperCase() };
}

/** Shown before the traveller leaves for a provider. */
export const HANDOFF_NOTICE =
  'You are leaving Dream Destination for the provider’s own site. They take the booking and the payment, under their terms. Nothing is booked until you complete it there.';
