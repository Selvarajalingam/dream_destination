import { config } from 'dotenv';
import postgres from 'postgres';
import { seed } from '../../db/seed/index';

/**
 * Reseeds once before the integration suite.
 *
 * The seed contains time-relative fixtures — a rolling observation stream with
 * a 90-minute validity window, and forecasts anchored to "now" — so tests that
 * assert on freshness would otherwise pass or fail depending on how long ago
 * someone last ran the seed by hand.
 */
export async function setup(): Promise<void> {
  config({ path: '.env', quiet: true });

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env before running tests.');
  }

  const sql = postgres(connectionString, { onnotice: () => {}, max: 1 });
  try {
    await seed(sql);
  } finally {
    await sql.end();
  }
}
