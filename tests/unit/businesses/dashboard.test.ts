import { describe, expect, it } from 'vitest';
import { ACTIVITY_METRICS, ownerRequirements, summariseActivity } from '@/modules/businesses/domain/dashboard';

const now = new Date('2026-09-22T06:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const daysAhead = (days: number) => new Date(now.getTime() + days * 86_400_000);

const live = {
  status: 'active',
  verificationStatus: 'approved',
  verificationKind: 'listing',
  decisionReason: null,
  lastOwnerUpdateAt: daysAgo(5),
  approvedUntil: daysAhead(120),
  hadApproval: true,
  reportsAwaitingResponse: 0,
  missingFields: [],
  hasPendingChange: false,
  now,
};

describe('summariseActivity (B05)', () => {
  it('reports saves as not measured rather than as zero', () => {
    const summary = summariseActivity([]);
    const saves = summary.metrics.find((metric) => metric.key === 'saves');
    expect(saves?.count).toBeNull();
    expect(summary.metrics.find((metric) => metric.key === 'contacts')?.count).toBe(0);
  });

  it('adds demo and recorded counts, and says when demo data is included', () => {
    const summary = summariseActivity([
      { eventName: 'business_contact', isDemo: true, count: 4 },
      { eventName: 'business_contact', isDemo: false, count: 1 },
    ]);
    expect(summary.metrics.find((metric) => metric.key === 'contacts')?.count).toBe(5);
    expect(summary.includesDemo).toBe(true);
    expect(summariseActivity([{ eventName: 'business_contact', isDemo: false, count: 1 }]).includesDemo).toBe(false);
  });

  it('never calls a traveller action a sale, booking or customer', () => {
    const text = ACTIVITY_METRICS.map((metric) => `${metric.label} ${metric.help}`).join(' ');
    expect(text).not.toMatch(/\b(sale|sales|revenue|customer|booked)\b/i);
  });
});

describe('ownerRequirements (B05)', () => {
  it('asks for nothing on a fresh, verified, live listing', () => {
    expect(ownerRequirements(live)).toEqual([]);
  });

  it('asks the owner to confirm details as the ninety-day confirmation approaches', () => {
    const due = ownerRequirements({ ...live, lastOwnerUpdateAt: daysAgo(70) });
    expect(due.map((item) => item.kind)).toEqual(['confirm_details']);

    const overdue = ownerRequirements({ ...live, lastOwnerUpdateAt: daysAgo(100) });
    expect(overdue[0].message).toMatch(/may be out of date/);
  });

  it('warns before verification lapses, and says so once it has', () => {
    expect(ownerRequirements({ ...live, approvedUntil: daysAhead(10) }).map((item) => item.kind)).toEqual(['verification_expiring']);
    expect(ownerRequirements({ ...live, approvedUntil: null }).map((item) => item.kind)).toEqual(['verification_lapsed']);
  });

  it('puts the reviewer’s request for changes first, with the reason', () => {
    const items = ownerRequirements({
      ...live,
      status: 'pending',
      verificationStatus: 'changes_requested',
      decisionReason: 'The lease is in a different name.',
      approvedUntil: null,
      hadApproval: false,
    });
    expect(items[0]).toMatchObject({ kind: 'changes_requested', level: 'required' });
    expect(items[0].message).toMatch(/different name/);
  });

  it('does not treat a declined change request as a request for listing changes', () => {
    const items = ownerRequirements({ ...live, verificationStatus: 'changes_requested', verificationKind: 'sensitive_change' });
    expect(items.map((item) => item.kind)).not.toContain('changes_requested');
  });

  it('counts traveller reports still waiting for a response', () => {
    const items = ownerRequirements({ ...live, reportsAwaitingResponse: 2 });
    expect(items[0].message).toMatch(/2 traveller reports .* are waiting/);
  });

  it('shows only the decision on a rejected or suspended listing', () => {
    expect(ownerRequirements({ ...live, status: 'rejected', decisionReason: 'Not in a pilot area.' })).toEqual([
      expect.objectContaining({ kind: 'rejected', message: expect.stringMatching(/Not in a pilot area/) }),
    ]);
    expect(ownerRequirements({ ...live, status: 'suspended', reportsAwaitingResponse: 1 }).map((item) => item.kind)).toEqual([
      'suspended',
    ]);
  });
});
