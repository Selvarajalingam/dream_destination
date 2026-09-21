import postgres, { type Sql } from 'postgres';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
}

/**
 * Shared connection pool. PRD Part II §14.2 calls for database connection
 * pooling; postgres.js manages the pool internally.
 */
export const sql: Sql = postgres(connectionString, {
  max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  idle_timeout: 20,
  connect_timeout: 10,
  transform: { undefined: null },
  onnotice: () => {},
});

export function withTransaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  return sql.begin(fn as never) as Promise<T>;
}

/** Longitude/latitude pair for a PostGIS geography point column. */
export function point(lng: number, lat: number) {
  return sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
}
