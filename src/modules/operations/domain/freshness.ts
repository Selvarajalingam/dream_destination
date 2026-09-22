/**
 * Content freshness — PRD Part I A05 and backlog E11-S07.
 *
 * "Group stale or expiring rules, emergency facilities, operating hours, and
 * business records. Support assignment and bulk reminder, not bulk approval."
 *
 * The no-bulk-approval rule is the important one. A record only becomes fresh
 * again when someone re-checks it against its source, one record at a time,
 * with a note saying what they checked. A button that marks forty records
 * fresh at once would turn the freshness label into decoration.
 */

export type FreshnessEntity = 'rule' | 'help_facility' | 'place' | 'business';

export type FreshnessState = 'stale' | 'expiring' | 'fresh';

/** Records due for review inside this window are shown as expiring. */
export const EXPIRING_WINDOW_DAYS = 30;

/**
 * Owner-declared business details have no issuing authority to set a review
 * date, so they are due for confirmation this long after the owner last
 * confirmed them.
 *
 * It must be comfortably longer than EXPIRING_WINDOW_DAYS. At 30 days, equal
 * to the warning window, every business was "expiring" from the moment it was
 * confirmed and the list carried no signal at all.
 */
export const BUSINESS_CONFIRMATION_DAYS = 90;

/** Maximum number of records one bulk reminder may cover. */
export const MAX_BULK_REMINDER = 50;

const DAY_MS = 86_400_000;

export function classifyFreshness(reviewDueAt: Date | null, now: Date): FreshnessState {
  // No review date means nobody committed to checking it again, which is
  // itself a reason to look. It is treated as stale rather than as fresh.
  if (reviewDueAt === null) return 'stale';
  if (reviewDueAt.getTime() <= now.getTime()) return 'stale';
  if (reviewDueAt.getTime() <= now.getTime() + EXPIRING_WINDOW_DAYS * DAY_MS) return 'expiring';
  return 'fresh';
}

/** Review date for a business, derived from the owner's last confirmation. */
export function businessReviewDue(lastOwnerUpdateAt: Date | null): Date | null {
  return lastOwnerUpdateAt === null
    ? null
    : new Date(lastOwnerUpdateAt.getTime() + BUSINESS_CONFIRMATION_DAYS * DAY_MS);
}

/** Whole days past (positive) or until (negative) the review date. */
export function daysOverdue(reviewDueAt: Date | null, now: Date): number | null {
  if (reviewDueAt === null) return null;
  return Math.floor((now.getTime() - reviewDueAt.getTime()) / DAY_MS);
}

/**
 * Validates a bulk reminder request. Returns an error message, or null when
 * the request is acceptable.
 */
export function validateBulkReminder(ids: readonly string[]): string | null {
  if (ids.length === 0) return 'Choose at least one record to remind about.';
  if (ids.length > MAX_BULK_REMINDER) {
    return `A reminder can cover at most ${MAX_BULK_REMINDER} records at once.`;
  }
  if (new Set(ids).size !== ids.length) return 'The same record appears more than once.';
  return null;
}

/**
 * A re-verification must say what was checked. Without a note, "re-verified"
 * means only that someone clicked a button.
 */
export const MIN_REVERIFY_NOTE = 15;

export function validateReverification(note: string): string | null {
  if (note.trim().length < MIN_REVERIFY_NOTE) {
    return 'Say what you checked and against which source, so the next reviewer can rely on it.';
  }
  return null;
}
