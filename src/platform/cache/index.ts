import { MemoryCache } from './memory';
import { RedisCache } from './redis';

/**
 * Cache, rate-limit and idempotency store.
 *
 * Redis when REDIS_URL is configured (PRD Part II §4.1), and an in-memory
 * adapter otherwise, so the application still runs on a machine with only a
 * database. The interface is identical, so nothing downstream knows which is
 * in use.
 */

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Increments a counter and returns the new value, setting a TTL on first use. */
  increment(key: string, ttlSeconds: number): Promise<number>;
  close(): Promise<void>;
}

let cached: Cache | null = null;

export function getCache(): Cache {
  if (cached !== null) return cached;

  const url = process.env.REDIS_URL;
  cached = url === undefined || url.trim() === '' ? new MemoryCache() : new RedisCache(url);
  return cached;
}

export { MemoryCache } from './memory';
export { RedisCache } from './redis';
