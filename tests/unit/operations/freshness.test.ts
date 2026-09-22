import { describe, expect, it } from 'vitest';
import {
  BUSINESS_CONFIRMATION_DAYS,
  MAX_BULK_REMINDER,
  businessReviewDue,
  classifyFreshness,
  daysOverdue,
  validateBulkReminder,
  validateReverification,
} from '@/modules/operations/domain/freshness';

const now = new Date('2026-09-22T12:00:00Z');
const days = (n: number): Date => new Date(now.getTime() + n * 86_400_000);

describe('classifyFreshness', () => {
  it('is stale once the review date has passed', () => {
    expect(classifyFreshness(days(-1), now)).toBe('stale');
  });

  it('is stale exactly at the review date, not a moment later', () => {
    expect(classifyFreshness(now, now)).toBe('stale');
  });

  it('is expiring inside the thirty-day window', () => {
    expect(classifyFreshness(days(10), now)).toBe('expiring');
    expect(classifyFreshness(days(30), now)).toBe('expiring');
  });

  it('is fresh beyond the window', () => {
    expect(classifyFreshness(days(31), now)).toBe('fresh');
  });

  it('treats a record with no review date as stale rather than fresh', () => {
    expect(classifyFreshness(null, now)).toBe('stale');
  });
});

describe('businessReviewDue', () => {
  it('falls due a fixed period after the owner last confirmed', () => {
    const confirmed = days(-10);
    expect(businessReviewDue(confirmed)?.getTime()).toBe(
      confirmed.getTime() + BUSINESS_CONFIRMATION_DAYS * 86_400_000,
    );
  });

  it('has no due date when the owner never confirmed, which reads as stale', () => {
    expect(businessReviewDue(null)).toBeNull();
    expect(classifyFreshness(businessReviewDue(null), now)).toBe('stale');
  });
});

describe('daysOverdue', () => {
  it('counts days past the review date as positive and days until it as negative', () => {
    expect(daysOverdue(days(-18), now)).toBe(18);
    expect(daysOverdue(days(5), now)).toBe(-5);
    expect(daysOverdue(null, now)).toBeNull();
  });
});

describe('validateBulkReminder', () => {
  it('accepts a normal selection', () => {
    expect(validateBulkReminder(['a', 'b'])).toBeNull();
  });

  it('refuses an empty selection', () => {
    expect(validateBulkReminder([])).toMatch(/at least one/i);
  });

  it('caps the size of one reminder', () => {
    const tooMany = Array.from({ length: MAX_BULK_REMINDER + 1 }, (_, index) => String(index));
    expect(validateBulkReminder(tooMany)).toMatch(/at most/i);
  });

  it('refuses duplicates', () => {
    expect(validateBulkReminder(['a', 'a'])).toMatch(/more than once/i);
  });
});

describe('validateReverification', () => {
  it('requires a note that says what was checked', () => {
    expect(validateReverification('ok')).not.toBeNull();
    expect(validateReverification('   ')).not.toBeNull();
  });

  it('accepts a substantive note', () => {
    expect(validateReverification('Called the range office; hours unchanged for the season.')).toBeNull();
  });
});
