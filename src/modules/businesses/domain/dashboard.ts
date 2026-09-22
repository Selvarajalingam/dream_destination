import { BUSINESS_CONFIRMATION_DAYS, EXPIRING_WINDOW_DAYS } from '@/modules/operations/domain/freshness';

/**
 * Owner dashboard — PRD Part I B05, backlog E10-S06.
 *
 * "Show listing status, required updates, impressions, saves, direction
 * requests, contact actions, and itinerary additions. Avoid claiming
 * confirmed sales unless conversion data is available."
 *
 * There is no conversion data, so nothing here is called a sale, a booking or
 * a customer. The figures are traveller actions on this product and are
 * labelled as that.
 */

const DAY_MS = 86_400_000;

export const ACTIVITY_WINDOW_DAYS = 30;

export type ActivityKey = 'impressions' | 'detailViews' | 'saves' | 'directions' | 'contacts' | 'itineraryAdds';

/**
 * Each metric and the event it counts. Saves has no event: a traveller
 * cannot yet save a business on its own, so it is reported as not measured
 * rather than as zero.
 */
export const ACTIVITY_METRICS: ReadonlyArray<{ key: ActivityKey; label: string; event: string | null; help: string }> = [
  { key: 'impressions', label: 'Times shown', event: 'business_impression', help: 'Your listing appeared in a list a traveller was browsing.' },
  { key: 'detailViews', label: 'Listing opened', event: 'business_detail_viewed', help: 'A traveller opened your listing.' },
  { key: 'saves', label: 'Saves', event: null, help: 'Travellers cannot save a business on its own yet, so this is not measured.' },
  { key: 'directions', label: 'Directions requested', event: 'business_directions', help: 'A traveller opened a map to your location.' },
  { key: 'contacts', label: 'Contact taps', event: 'business_contact', help: 'A traveller tapped to call you. Whether the call connected is not known.' },
  { key: 'itineraryAdds', label: 'Added to a trip plan', event: 'business_itinerary_add', help: 'A traveller added you to an itinerary. It is a plan, not a booking.' },
];

export type ActivitySummary = {
  metrics: Array<{ key: ActivityKey; label: string; help: string; count: number | null }>;
  /** True when any figure includes simulated demonstration activity. */
  includesDemo: boolean;
};

export function summariseActivity(rows: ReadonlyArray<{ eventName: string; isDemo: boolean; count: number }>): ActivitySummary {
  const totals = new Map<string, number>();
  let includesDemo = false;
  for (const row of rows) {
    totals.set(row.eventName, (totals.get(row.eventName) ?? 0) + row.count);
    if (row.isDemo && row.count > 0) includesDemo = true;
  }

  return {
    metrics: ACTIVITY_METRICS.map((metric) => ({
      key: metric.key,
      label: metric.label,
      help: metric.help,
      count: metric.event === null ? null : totals.get(metric.event) ?? 0,
    })),
    includesDemo,
  };
}

export type Requirement = {
  kind:
    | 'changes_requested'
    | 'rejected'
    | 'suspended'
    | 'confirm_details'
    | 'verification_expiring'
    | 'verification_lapsed'
    | 'report_awaiting_response'
    | 'missing_field'
    | 'change_in_review';
  message: string;
  /** Required items stop the listing being trusted; advice improves it. */
  level: 'required' | 'advice' | 'info';
};

/**
 * What the owner needs to do, most pressing first. Pure: the caller supplies
 * the facts and the clock.
 */
export function ownerRequirements(input: {
  status: string;
  verificationStatus: string | null;
  verificationKind: string | null;
  decisionReason: string | null;
  lastOwnerUpdateAt: Date | null;
  approvedUntil: Date | null;
  hadApproval: boolean;
  reportsAwaitingResponse: number;
  missingFields: readonly string[];
  hasPendingChange: boolean;
  now: Date;
}): Requirement[] {
  const out: Requirement[] = [];
  const { now } = input;

  if (input.status === 'rejected') {
    out.push({ kind: 'rejected', level: 'info', message: `This listing was not approved. ${input.decisionReason ?? ''}`.trim() });
    return out;
  }
  if (input.status === 'suspended') {
    out.push({
      kind: 'suspended',
      level: 'info',
      message: 'This listing is hidden from travellers while a report is investigated. The operations team will contact you.',
    });
    return out;
  }

  if (input.verificationStatus === 'changes_requested' && input.verificationKind !== 'sensitive_change') {
    out.push({
      kind: 'changes_requested',
      level: 'required',
      message: `The reviewer asked for changes: ${input.decisionReason ?? 'see the note from the reviewer.'} Update the details and send it again.`,
    });
  }

  if (input.reportsAwaitingResponse > 0) {
    const n = input.reportsAwaitingResponse;
    out.push({
      kind: 'report_awaiting_response',
      level: 'required',
      message: `${n} traveller report${n === 1 ? '' : 's'} about your listing ${n === 1 ? 'is' : 'are'} waiting for your response.`,
    });
  }

  if (input.status === 'active') {
    if (input.approvedUntil === null && input.hadApproval) {
      out.push({ kind: 'verification_lapsed', level: 'required', message: 'Your verification has lapsed. The owner-verified label is no longer shown.' });
    } else if (input.approvedUntil !== null && input.approvedUntil.getTime() - now.getTime() <= EXPIRING_WINDOW_DAYS * DAY_MS) {
      const days = Math.max(0, Math.ceil((input.approvedUntil.getTime() - now.getTime()) / DAY_MS));
      out.push({
        kind: 'verification_expiring',
        level: 'required',
        message: `Your verification lapses in ${days} day${days === 1 ? '' : 's'}. The operations team will contact you to renew it.`,
      });
    }

    const due = input.lastOwnerUpdateAt === null ? null : input.lastOwnerUpdateAt.getTime() + BUSINESS_CONFIRMATION_DAYS * DAY_MS;
    if (due === null || due - now.getTime() <= EXPIRING_WINDOW_DAYS * DAY_MS) {
      out.push({
        kind: 'confirm_details',
        level: 'required',
        message:
          due === null || due <= now.getTime()
            ? 'Travellers are told your details may be out of date. Confirm your hours and contact are still right.'
            : 'Confirm your hours and contact are still right, so travellers keep seeing them as current.',
      });
    }
  }

  if (input.hasPendingChange) {
    out.push({ kind: 'change_in_review', level: 'info', message: 'A change to your name, address, pin or owner is waiting for review. Travellers see the current details until then.' });
  }

  for (const field of input.missingFields) {
    out.push({ kind: 'missing_field', level: 'advice', message: field });
  }

  return out;
}
