import Redis from 'ioredis';
import { logger } from '@/platform/observability/logger';
import type { Cache } from './index';

/**
 * Redis-backed cache.
 *
 * A cache is not a source of truth, so every operation degrades to a miss
 * rather than failing the request. PRD Part II §14.2 requires graceful
 * degradation when a dependency is unavailable.
 */
export class RedisCache implements Cache {
  private readonly client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      lazyConnect: false,
      enableOfflineQueue: false,
    });

    this.client.on('error', (error: Error) => {
      logger.warn('cache.redis.error', { reason: error.message });
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (error) {
      logger.warn('cache.get.failed', { key, reason: describe(error) });
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      logger.warn('cache.set.failed', { key, reason: describe(error) });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.warn('cache.delete.failed', { key, reason: describe(error) });
    }
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    try {
      const count = await this.client.incr(key);
      // Only set the expiry on the first increment, so the window is fixed
      // rather than sliding with every request.
      if (count === 1) await this.client.expire(key, ttlSeconds);
      return count;
    } catch (error) {
      logger.warn('cache.increment.failed', { key, reason: describe(error) });
      // Failing open on a rate limit is the safer choice here: a cache outage
      // should not lock every traveler out of planning a trip.
      return 0;
    }
  }

  async close(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}

const describe = (error: unknown): string => (error instanceof Error ? error.message : 'unknown');
