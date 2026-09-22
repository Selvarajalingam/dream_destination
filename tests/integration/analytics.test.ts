import { afterAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';
import { analyticsService } from '@/modules/analytics/service';

afterAll(async () => {
  await sql`DELETE FROM analytics_events WHERE is_demo = false`;
  await sql.end();
});

const business = async (): Promise<{ id: string; category: string }> => {
  const [row] = await sql<{ id: string; category: string }[]>`
    SELECT id, category FROM local_businesses WHERE slug = 'badaga-home-kitchen'
  `;
  return row;
};

describe('analytics capture', () => {
  it('stores a valid event against its entity, with no user attached', async () => {
    const target = await business();
    await analyticsService.track(
      'business_contact',
      { businessId: target.id, category: target.category as never },
      { sessionId: null },
    );

    const [row] = await sql<{ entity_type: string; entity_id: string; user_id: string | null; schema_version: string; is_demo: boolean }[]>`
      SELECT entity_type, entity_id, user_id, schema_version, is_demo
      FROM analytics_events
      WHERE is_demo = false AND event_name = 'business_contact'
      ORDER BY occurred_at DESC LIMIT 1
    `;
    expect(row).toMatchObject({ entity_type: 'business', entity_id: target.id, user_id: null, schema_version: '1', is_demo: false });
  });

  it('refuses an event carrying data the catalogue does not allow', async () => {
    const before = await sql<{ count: string }[]>`SELECT count(*) FROM analytics_events WHERE is_demo = false`;

    const stored = await analyticsService.trackUnchecked(
      'brief_started',
      { mode: 'llm', message: 'Travelling with my mother who uses a wheelchair' },
      { sessionId: null },
    );

    const after = await sql<{ count: string }[]>`SELECT count(*) FROM analytics_events WHERE is_demo = false`;
    expect(stored).toBe(false);
    expect(after[0].count).toBe(before[0].count);
  });
});

describe('impact dashboard (A08)', () => {
  it('reads the simulated funnel as a monotonic fall-off', async () => {
    const dashboard = await analyticsService.dashboard(true);
    const counts = dashboard.funnel.map((stage) => stage.count);

    expect(counts[0]).toBe(320);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    expect(dashboard.qualifiedTrips).toBe(counts[3]);
  });

  it('keeps simulated and recorded events apart', async () => {
    const demo = await analyticsService.dashboard(true);
    const recorded = await analyticsService.dashboard(false);

    expect(demo.totalEvents).toBeGreaterThan(1000);
    // Only what the capture test above wrote.
    expect(recorded.totalEvents).toBeLessThan(5);
    expect(recorded.funnel[0].count).toBe(0);
  });

  it('reports off-peak shifts as accepted over offered', async () => {
    const { offPeak } = await analyticsService.dashboard(true);
    expect(offPeak.offered).toBeGreaterThan(0);
    expect(offPeak.accepted).toBeLessThanOrEqual(offPeak.offered);
    expect(offPeak.acceptanceRate).toBeCloseTo(offPeak.accepted / offPeak.offered, 2);
  });

  it('computes fairness across every active business, not only those with actions', async () => {
    const { business: local } = await analyticsService.dashboard(true);
    const [{ count }] = await sql<{ count: string }[]>`SELECT count(*) FROM local_businesses WHERE status = 'active'`;

    expect(local.fairness.eligible).toBe(Number(count));
    expect(local.fairness.reached).toBeLessThanOrEqual(local.fairness.eligible);
    expect(local.fairness.gini).toBeGreaterThan(0);
  });

  it('breaks business activity down by category', async () => {
    const { business: local } = await analyticsService.dashboard(true);
    expect(local.byCategory.length).toBeGreaterThanOrEqual(5);
    expect(local.byCategory.every((row) => row.impressions >= row.actions)).toBe(true);
  });
});
