import { describe, expect, it } from 'vitest';
import { headline, rankUrgentItems, type UrgentItem } from '@/modules/operations/domain/urgency';

const at = (hoursAgo: number): Date => new Date(Date.UTC(2026, 8, 22, 12) - hoursAgo * 3_600_000);

const item = (over: Partial<UrgentItem>): UrgentItem => ({
  kind: 'stale_source',
  id: Math.random().toString(36).slice(2),
  title: 'x',
  detail: 'y',
  href: '/admin',
  since: at(1),
  ...over,
});

const counts = {
  openIncidents: 0,
  criticalIncidents: 0,
  expiredVerifications: 0,
  expiringVerifications: 0,
  staleSources: 0,
  activeRedOverrides: 0,
  failedFeeds: 0,
};

describe('rankUrgentItems', () => {
  it('puts a critical incident above everything else', () => {
    const ranked = rankUrgentItems([
      item({ kind: 'stale_source', since: at(500) }),
      item({ kind: 'expired_verification', since: at(100) }),
      item({ kind: 'incident', severity: 'critical', since: at(1) }),
    ]);
    expect(ranked[0].kind).toBe('incident');
    expect(ranked[0].tierLabel).toBe('Act now');
  });

  it('ranks anything that can harm someone today above anything merely out of date', () => {
    const ranked = rankUrgentItems([
      item({ kind: 'stale_source', since: at(1000) }),
      item({ kind: 'incident', severity: 'high', since: at(1) }),
      item({ kind: 'failed_feed', since: at(2) }),
    ]);
    expect(ranked.map((entry) => entry.kind)).toEqual(['incident', 'failed_feed', 'stale_source']);
  });

  it('places a low-severity incident below a stale source', () => {
    const ranked = rankUrgentItems([
      item({ kind: 'incident', severity: 'low' }),
      item({ kind: 'stale_source' }),
    ]);
    expect(ranked[0].kind).toBe('stale_source');
  });

  it('orders by longest waiting within the same tier', () => {
    const ranked = rankUrgentItems([
      item({ kind: 'stale_source', id: 'newer', since: at(2) }),
      item({ kind: 'stale_source', id: 'older', since: at(200) }),
    ]);
    expect(ranked.map((entry) => entry.id)).toEqual(['older', 'newer']);
  });

  it('labels every item with one of three tiers', () => {
    const ranked = rankUrgentItems([
      item({ kind: 'incident', severity: 'critical' }),
      item({ kind: 'red_override' }),
      item({ kind: 'stale_source' }),
    ]);
    expect(ranked.map((entry) => entry.tierLabel)).toEqual(['Act now', 'Today', 'This week']);
  });

  it('does not mutate the input', () => {
    const input = [item({ kind: 'stale_source' }), item({ kind: 'incident', severity: 'critical' })];
    const kinds = input.map((entry) => entry.kind);
    rankUrgentItems(input);
    expect(input.map((entry) => entry.kind)).toEqual(kinds);
  });

  it('handles an empty queue', () => {
    expect(rankUrgentItems([])).toEqual([]);
  });
});

describe('headline', () => {
  it('leads with critical incidents when there are any', () => {
    expect(headline({ ...counts, criticalIncidents: 1, openIncidents: 3, expiredVerifications: 2 })).toMatch(
      /^1 critical incident needs a decision now\.$/,
    );
  });

  it('agrees in number', () => {
    expect(headline({ ...counts, criticalIncidents: 2 })).toMatch(/^2 critical incidents need /);
    expect(headline({ ...counts, expiredVerifications: 1 })).toBe('1 verification has lapsed and needs re-review.');
    expect(headline({ ...counts, expiredVerifications: 3 })).toBe('3 verifications have lapsed and need re-review.');
  });

  it('falls through to lapsed verifications, then incidents, then feeds', () => {
    expect(headline({ ...counts, expiredVerifications: 2 })).toMatch(/2 verifications have lapsed/);
    expect(headline({ ...counts, openIncidents: 1 })).toMatch(/1 open incident/);
    expect(headline({ ...counts, failedFeeds: 1 })).toMatch(/1 crowd feed is not reporting/);
  });

  it('says so plainly when nothing is urgent', () => {
    expect(headline(counts)).toMatch(/nothing urgent/i);
  });
});
