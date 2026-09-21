import { afterAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';

afterAll(async () => {
  await sql.end();
});

const countOf = async (query: Promise<{ count: string }[]>): Promise<number> =>
  Number((await query)[0].count);

describe('seed data', () => {
  it('meets the PRD demonstration-data volumes', async () => {
    // PRD Part II §17: 25-50 attractions.
    const places = await countOf(sql`SELECT count(*) FROM places WHERE status = 'active'`);
    expect(places).toBeGreaterThanOrEqual(25);
    expect(places).toBeLessThanOrEqual(50);

    // 10-20 approved hidden gems.
    const gems = await countOf(
      sql`SELECT count(*) FROM hidden_gem_verifications WHERE status = 'approved'`,
    );
    expect(gems).toBeGreaterThanOrEqual(10);
    expect(gems).toBeLessThanOrEqual(20);

    // 30-50 local businesses.
    const businesses = await countOf(sql`SELECT count(*) FROM local_businesses WHERE status = 'active'`);
    expect(businesses).toBeGreaterThanOrEqual(30);
    expect(businesses).toBeLessThanOrEqual(50);

    // 10-20 help facilities.
    const facilities = await countOf(sql`SELECT count(*) FROM help_facilities WHERE status = 'active'`);
    expect(facilities).toBeGreaterThanOrEqual(10);
    expect(facilities).toBeLessThanOrEqual(20);

    // At least 15 sourced rules.
    const rules = await countOf(sql`SELECT count(*) FROM rule_content WHERE status = 'active'`);
    expect(rules).toBeGreaterThanOrEqual(15);
  });

  it('labels every seeded source as seeded_demo', async () => {
    const other = await countOf(sql`SELECT count(*) FROM source_records WHERE source_type <> 'seeded_demo'`);
    expect(other).toBe(0);
  });

  it('gives every rule a source with an issuing authority and dates', async () => {
    const orphaned = await countOf(sql`
      SELECT count(*) FROM rule_content r
      JOIN source_records s ON s.id = r.source_id
      WHERE s.issuing_authority IS NULL OR s.verified_at IS NULL
    `);
    expect(orphaned).toBe(0);
  });

  it('includes stale rules so the freshness warning has real material', async () => {
    const stale = await countOf(sql`SELECT count(*) FROM rule_content WHERE review_due_at < now()`);
    expect(stale).toBeGreaterThanOrEqual(1);
  });

  it('ties every place to a source for its hours, price and access', async () => {
    const unsourced = await countOf(sql`
      SELECT count(*) FROM places p
      WHERE NOT EXISTS (SELECT 1 FROM place_sources ps WHERE ps.place_id = p.id)
    `);
    expect(unsourced).toBe(0);
  });

  it('includes an active manual crowd override with a reason', async () => {
    const rows = await sql<{ reason: string }[]>`
      SELECT reason FROM crowd_overrides WHERE expires_at > now() AND starts_at <= now()
    `;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].reason.length).toBeGreaterThan(10);
  });

  it('records an audit row for the seeded crowd override', async () => {
    const audits = await countOf(sql`SELECT count(*) FROM audit_logs WHERE action = 'crowd_override.created'`);
    expect(audits).toBeGreaterThanOrEqual(1);
  });

  it('includes a simulated observation stream that has not expired', async () => {
    const fresh = await countOf(sql`SELECT count(*) FROM crowd_observations WHERE expires_at > now()`);
    expect(fresh).toBeGreaterThanOrEqual(10);
  });

  it('includes historical forecasts for the coming days', async () => {
    const forecasts = await countOf(sql`SELECT count(*) FROM crowd_forecasts WHERE starts_at > now()`);
    expect(forecasts).toBeGreaterThanOrEqual(100);
  });

  it('leaves one verification under review and one expired for the admin screens', async () => {
    const underReview = await countOf(
      sql`SELECT count(*) FROM hidden_gem_verifications WHERE status = 'under_review'`,
    );
    expect(underReview).toBeGreaterThanOrEqual(1);

    const expired = await countOf(sql`
      SELECT count(*) FROM hidden_gem_verifications
      WHERE status = 'approved' AND expires_at < now()
    `);
    expect(expired).toBeGreaterThanOrEqual(1);
  });

  it('gives every approved verification all nine T11 checklist groups and limitations', async () => {
    const rows = await sql<{ checklist: Record<string, unknown>; known_limitations: string[] }[]>`
      SELECT checklist, known_limitations FROM hidden_gem_verifications WHERE status = 'approved'
    `;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row.checklist)).toHaveLength(9);
      expect(row.known_limitations.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('includes sponsored and non-sponsored businesses so the label can be demonstrated', async () => {
    const sponsored = await countOf(sql`SELECT count(*) FROM local_businesses WHERE sponsored`);
    expect(sponsored).toBeGreaterThanOrEqual(1);

    const organic = await countOf(sql`SELECT count(*) FROM local_businesses WHERE NOT sponsored`);
    expect(organic).toBeGreaterThanOrEqual(20);
  });

  it('spreads places across all four pilot destinations', async () => {
    const rows = await sql<{ slug: string; count: string }[]>`
      SELECT d.slug, count(p.id) FROM destinations d
      LEFT JOIN places p ON p.destination_id = d.id AND p.status = 'active'
      GROUP BY d.slug
    `;
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(Number(row.count)).toBeGreaterThanOrEqual(5);
    }
  });

  it('is idempotent', async () => {
    const { seed } = await import('../../db/seed/index');
    const before = await countOf(sql`SELECT count(*) FROM places`);
    await seed(sql);
    const after = await countOf(sql`SELECT count(*) FROM places`);
    expect(after).toBe(before);
  });
});
