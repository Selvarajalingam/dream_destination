import { describe, expect, it } from 'vitest';
import { canDecide, resolveVerificationDisplay } from '@/modules/verification/domain/gate';
import type { Verification } from '@/modules/verification/domain/types';

const now = new Date('2026-12-20T10:00:00Z');

const approved: Verification = {
  id: 'v1',
  placeId: 'p1',
  status: 'approved',
  reviewedAt: new Date('2026-09-12T00:00:00Z'),
  expiresAt: new Date('2027-03-12T00:00:00Z'),
  knownLimitations: ['Mobile coverage becomes unreliable during the final 2 km.'],
  reviewerType: 'district_tourism_office',
  checklist: {
    access_and_road: { value: 'Tar road to within 2 km, then gravel track.', checked: true },
    mobile_network: { value: 'No reliable coverage past the gate.', checked: true },
  },
  ownerUserId: null,
  decisionReason: 'Field check completed.',
};

describe('resolveVerificationDisplay', () => {
  it('shows the badge only for an approved, unexpired verification', () => {
    expect(resolveVerificationDisplay(approved, now).showBadge).toBe(true);
  });

  it('hides the badge when the verification has expired', () => {
    const expired = { ...approved, expiresAt: new Date('2026-10-01T00:00:00Z') };
    const display = resolveVerificationDisplay(expired, now);
    expect(display.showBadge).toBe(false);
    expect(display.status).toBe('expired');
  });

  it('treats an approved verification with no expiry as current', () => {
    expect(resolveVerificationDisplay({ ...approved, expiresAt: null }, now).showBadge).toBe(true);
  });

  it('hides the badge for every non-approved status', () => {
    const statuses = [
      'draft',
      'evidence_pending',
      'under_review',
      'changes_requested',
      'rejected',
      'expired',
      'suspended',
      'suppressed',
    ] as const;
    for (const status of statuses) {
      expect(resolveVerificationDisplay({ ...approved, status }, now).showBadge).toBe(false);
    }
  });

  it('hides the badge when there is no verification at all', () => {
    const display = resolveVerificationDisplay(null, now);
    expect(display.showBadge).toBe(false);
    expect(display.status).toBe('none');
    expect(display.knownLimitations).toEqual([]);
  });

  it('always surfaces known limitations, even when the badge shows', () => {
    expect(resolveVerificationDisplay(approved, now).knownLimitations).toHaveLength(1);
  });

  it('surfaces known limitations even when the verification has expired', () => {
    const expired = { ...approved, expiresAt: new Date('2026-10-01T00:00:00Z') };
    expect(resolveVerificationDisplay(expired, now).knownLimitations).toHaveLength(1);
  });

  it('reports the review date, next review and reviewer type for the detail sheet', () => {
    const display = resolveVerificationDisplay(approved, now);
    expect(display.verifiedAt?.toISOString()).toBe('2026-09-12T00:00:00.000Z');
    expect(display.nextReviewAt?.toISOString()).toBe('2027-03-12T00:00:00.000Z');
    expect(display.reviewerType).toBe('district_tourism_office');
  });

  it('exposes the checklist as ordered groups for the T11 screen', () => {
    const display = resolveVerificationDisplay(approved, now);
    expect(display.checklistGroups.length).toBeGreaterThan(0);
    expect(display.checklistGroups[0]).toHaveProperty('label');
    expect(display.checklistGroups[0]).toHaveProperty('value');
  });
});

describe('canDecide', () => {
  it('allows a verifier to decide', () => {
    expect(canDecide({ userId: 'u1', roles: ['verifier'] }, approved)).toBe(true);
  });

  it('allows a tourism admin to decide', () => {
    expect(canDecide({ userId: 'u1', roles: ['tourism_admin'] }, approved)).toBe(true);
  });

  it('forbids a business owner from approving their own submission', () => {
    const own = { ...approved, ownerUserId: 'u2' };
    expect(canDecide({ userId: 'u2', roles: ['business_owner', 'verifier'] }, own)).toBe(false);
  });

  it('allows a verifier to decide on someone else submission', () => {
    const other = { ...approved, ownerUserId: 'u9' };
    expect(canDecide({ userId: 'u2', roles: ['verifier'] }, other)).toBe(true);
  });

  it('forbids a traveler from deciding', () => {
    expect(canDecide({ userId: 'u3', roles: ['traveler'] }, approved)).toBe(false);
  });

  it('forbids an analyst from deciding', () => {
    expect(canDecide({ userId: 'u4', roles: ['analyst'] }, approved)).toBe(false);
  });
});
