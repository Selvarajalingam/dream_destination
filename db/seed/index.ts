import process from 'node:process';
import postgres, { type Sql } from 'postgres';
import type { SeedSql } from './types';
import { seedAnalytics } from './analytics';
import { seedBusinesses } from './businesses';
import { seedCrowd } from './crowd';
import { seedDestinations } from './destinations';
import { seedHelpFacilities } from './help';
import { seedOperations } from './operations';
import { seedPlaces } from './places';
import { seedRules } from './rules';
import { seedSources } from './sources';
import { seedStories } from './stories';
import { seedUsers } from './users';
import { seedVerifications } from './verifications';

/**
 * Seeds the Coimbatore and Nilgiris demonstration dataset.
 *
 * Idempotent: every run clears the seeded rows and reinserts them, so the
 * simulated observation stream stays current and re-running never duplicates
 * the catalog. PRD Part II §15.3 requires seed scripts to label demonstration
 * records; every source_records row is written as 'seeded_demo'.
 */

/**
 * Order matters: children before parents. Trips are included because a seeded
 * catalog change can leave a demo trip pointing at a place that no longer
 * exists.
 */
const TABLES_TO_CLEAR = [
  'freshness_assignments',
  'analytics_events',
  'idempotency_keys',
  'offline_packs',
  'recommendation_scores',
  'budget_line_items',
  'budgets',
  'itinerary_items',
  'itinerary_days',
  'trips',
  'audit_logs',
  'incident_reports',
  'push_subscriptions',
  'sessions',
  'knowledge_chunks',
  'story_content',
  'rule_content',
  'business_verifications',
  'local_businesses',
  'verification_evidence',
  'hidden_gem_verifications',
  'crowd_overrides',
  'crowd_forecasts',
  'crowd_observations',
  'help_facilities',
  'place_sources',
  'places',
  'destinations',
  'preference_memory_items',
  'preference_profiles',
  'consent_records',
  'user_roles',
  'users',
  'source_records',
];

async function clear(tx: SeedSql): Promise<void> {
  for (const table of TABLES_TO_CLEAR) {
    await tx.unsafe(`DELETE FROM ${table}`);
  }
}

export async function seed(sql: Sql): Promise<void> {
  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as SeedSql;

    await clear(tx);

    const sourceIds = await seedSources(tx);
    const userIds = await seedUsers(tx);
    const destinationIds = await seedDestinations(tx);
    const placeIds = await seedPlaces(tx, destinationIds, sourceIds);

    await seedVerifications(tx, placeIds, userIds);
    const businessIds = await seedBusinesses(tx, userIds);
    await seedHelpFacilities(tx, sourceIds);
    await seedRules(tx, placeIds, destinationIds, sourceIds);
    await seedStories(tx, placeIds, sourceIds);
    await seedCrowd(tx, placeIds, sourceIds, userIds);
    await seedOperations(tx, placeIds, businessIds, userIds);
    await seedAnalytics(tx, placeIds, businessIds);
  });
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
  }

  if (process.env.APP_ENV === 'production') {
    throw new Error('Refusing to seed demonstration data into a production environment.');
  }

  const sql = postgres(connectionString, { onnotice: () => {}, max: 1 });

  try {
    const started = Date.now();
    await seed(sql);

    const [{ count: places }] = await sql<{ count: string }[]>`SELECT count(*) FROM places`;
    const [{ count: gems }] = await sql<{ count: string }[]>`
      SELECT count(*) FROM hidden_gem_verifications WHERE status = 'approved'
    `;
    const [{ count: businesses }] = await sql<{ count: string }[]>`SELECT count(*) FROM local_businesses`;
    const [{ count: facilities }] = await sql<{ count: string }[]>`SELECT count(*) FROM help_facilities`;
    const [{ count: rules }] = await sql<{ count: string }[]>`SELECT count(*) FROM rule_content`;
    const [{ count: forecasts }] = await sql<{ count: string }[]>`SELECT count(*) FROM crowd_forecasts`;

    console.log(
      [
        `seeded in ${Date.now() - started}ms:`,
        `${places} places`,
        `${gems} approved hidden gems`,
        `${businesses} local businesses`,
        `${facilities} help facilities`,
        `${rules} rules`,
        `${forecasts} crowd forecasts`,
        '(all labelled seeded_demo)',
      ].join(' '),
    );
  } finally {
    await sql.end();
  }
}

// Only run when invoked directly, so tests can import seed() without side effects.
const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('db/seed/index.ts');
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
