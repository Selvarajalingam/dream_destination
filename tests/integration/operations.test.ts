import { afterAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';
import { operationsService } from '@/modules/operations/service';

afterAll(async () => {
  await sql.end();
});

describe('operationsService.overview (A01)', () => {
  it('surfaces the seeded critical incident as the most urgent item', async () => {
    const overview = await operationsService.overview();

    expect(overview.items[0].kind).toBe('incident');
    expect(overview.items[0].severity).toBe('critical');
    expect(overview.items[0].tierLabel).toBe('Act now');
    expect(overview.headline).toMatch(/critical incident/i);
  });

  it('counts every open incident', async () => {
    const overview = await operationsService.overview();
    expect(overview.counts.openIncidents).toBe(4);
    expect(overview.counts.criticalIncidents).toBe(1);
  });

  it('lists the lapsed verification the seed leaves behind', async () => {
    const overview = await operationsService.overview();
    expect(overview.counts.expiredVerifications).toBeGreaterThanOrEqual(1);
    expect(overview.items.some((item) => item.kind === 'expired_verification')).toBe(true);
  });

  it('lists stale sources and the seeded heavy-crowd advisory', async () => {
    const overview = await operationsService.overview();
    expect(overview.counts.staleSources).toBeGreaterThanOrEqual(1);
    expect(overview.counts.activeRedOverrides).toBeGreaterThanOrEqual(1);
  });

  it('reports no silent feeds straight after seeding, and one once a feed goes quiet', async () => {
    const fresh = await operationsService.overview();
    expect(fresh.counts.failedFeeds).toBe(0);

    // Age one sensor feed past the silence threshold.
    const [place] = await sql<{ place_id: string }[]>`
      SELECT place_id FROM crowd_observations WHERE metadata->>'sourceKind' = 'sensor' LIMIT 1
    `;
    await sql`
      UPDATE crowd_observations SET observed_at = observed_at - interval '4 hours'
      WHERE place_id = ${place.place_id}
    `;

    const aged = await operationsService.overview();
    expect(aged.counts.failedFeeds).toBe(1);
    expect(aged.items.some((item) => item.kind === 'failed_feed')).toBe(true);

    await sql`
      UPDATE crowd_observations SET observed_at = observed_at + interval '4 hours'
      WHERE place_id = ${place.place_id}
    `;
  });

  it('never ranks a lower tier above a higher one', async () => {
    const overview = await operationsService.overview();
    const tiers = overview.items.map((item) => item.tier);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
  });

  it('links every item somewhere an operator can act on it', async () => {
    const overview = await operationsService.overview();
    for (const item of overview.items) {
      expect(item.href).toMatch(/^\/admin/);
    }
  });
});
