import { describe, expect, it } from 'vitest';
import {
  BUSINESS_CHECKS,
  approvalBlockers,
  appliesPendingChange,
  canReviewBusiness,
  listingStatusAfter,
  sponsorshipBlocker,
  type BusinessCheck,
} from '@/modules/businesses/domain/review';

const all = new Set<BusinessCheck>(BUSINESS_CHECKS.map((check) => check.key));

describe('approvalBlockers', () => {
  it('names the five checks the PRD lists', () => {
    expect(BUSINESS_CHECKS.map((check) => check.key)).toEqual([
      'ownership',
      'address',
      'businessType',
      'hours',
      'contact',
    ]);
  });

  it('allows approval once every check is confirmed', () => {
    expect(approvalBlockers(all)).toEqual([]);
  });

  it('lists exactly the checks still unconfirmed', () => {
    const partial = new Set<BusinessCheck>(['address', 'hours', 'contact']);
    expect(approvalBlockers(partial)).toEqual(['ownership', 'businessType']);
  });

  it('blocks approval with nothing confirmed', () => {
    expect(approvalBlockers(new Set())).toHaveLength(5);
  });
});

describe('canReviewBusiness', () => {
  it('lets a verifier review someone else business', () => {
    expect(canReviewBusiness({ userId: 'u1', roles: ['verifier'] }, 'owner')).toBe(true);
  });

  it('refuses an owner reviewing their own business, whatever roles they hold', () => {
    expect(canReviewBusiness({ userId: 'u1', roles: ['tourism_admin', 'business_owner'] }, 'u1')).toBe(false);
  });

  it('refuses a traveller or an owner without a reviewing role', () => {
    expect(canReviewBusiness({ userId: 'u1', roles: ['traveler'] }, 'owner')).toBe(false);
    expect(canReviewBusiness({ userId: 'u1', roles: ['business_owner'] }, 'owner')).toBe(false);
  });

  it('allows review of a listing with no recorded owner', () => {
    expect(canReviewBusiness({ userId: 'u1', roles: ['verifier'] }, null)).toBe(true);
  });
});

describe('sponsorshipBlocker', () => {
  const verified = { status: 'active', ownerVerified: true, sponsored: false, requested: true };

  it('allows sponsorship for a verified, active listing that asked for it', () => {
    expect(sponsorshipBlocker(verified, 'approved')).toBeNull();
  });

  it('refuses sponsorship for a listing still awaiting verification', () => {
    expect(sponsorshipBlocker({ ...verified, status: 'pending' }, 'approved')).toMatch(/verify the listing first/i);
    expect(sponsorshipBlocker({ ...verified, ownerVerified: false }, 'approved')).toMatch(/not passed verification/i);
  });

  it('allows declining even an unverified listing', () => {
    expect(sponsorshipBlocker({ ...verified, status: 'pending', ownerVerified: false }, 'declined')).toBeNull();
  });

  it('refuses to decide without an open request', () => {
    expect(sponsorshipBlocker({ ...verified, requested: false }, 'approved')).toMatch(/no open sponsorship request/i);
  });

  it('only revokes a sponsorship that exists', () => {
    expect(sponsorshipBlocker({ ...verified, sponsored: true, requested: false }, 'revoked')).toBeNull();
    expect(sponsorshipBlocker({ ...verified, sponsored: false }, 'revoked')).toMatch(/not currently sponsored/i);
  });
});

describe('listingStatusAfter', () => {
  it('maps each decision to a listing status', () => {
    expect(listingStatusAfter('approved')).toBe('active');
    expect(listingStatusAfter('changes_requested')).toBe('pending');
    expect(listingStatusAfter('rejected')).toBe('rejected');
  });
});

describe('sensitive changes to a live listing (B06)', () => {
  it('never changes the listing status, whatever the decision', () => {
    for (const decision of ['approved', 'changes_requested', 'rejected'] as const) {
      expect(listingStatusAfter(decision, 'sensitive_change', 'active')).toBe('active');
    }
  });

  it('writes the held change only on approval', () => {
    expect(appliesPendingChange('approved', 'sensitive_change')).toBe(true);
    expect(appliesPendingChange('rejected', 'sensitive_change')).toBe(false);
    expect(appliesPendingChange('approved', 'listing')).toBe(false);
  });
});
