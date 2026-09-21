import type { TransactionSql } from 'postgres';

/**
 * Seed modules always run inside the orchestrator transaction, never against
 * the pool directly, so a partial seed can never be committed.
 */
export type SeedSql = TransactionSql<Record<string, never>>;
