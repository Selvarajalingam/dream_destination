/**
 * Forward-only versioned migration runner. PRD Part II §15.3.
 *
 * Usage:
 *   tsx db/migrate.ts            apply pending migrations
 *   tsx db/migrate.ts --reset    drop and recreate the public schema first
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import postgres from 'postgres';

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
  }

  const sql = postgres(connectionString, { onnotice: () => {}, max: 1 });

  try {
    if (process.argv.includes('--reset')) {
      console.log('resetting public schema');
      await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    }

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const appliedRows = await sql<{ filename: string }[]>`
      SELECT filename FROM schema_migrations
    `;
    const applied = new Set(appliedRows.map((row) => row.filename));

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const body = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
      });
      console.log(`applied ${file}`);
      count += 1;
    }

    console.log(count === 0 ? 'no pending migrations' : `${count} migration(s) applied`);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
