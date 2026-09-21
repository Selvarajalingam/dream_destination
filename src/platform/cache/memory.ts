import type { Cache } from './index';

type Entry = { value: unknown; expiresAt: number };

/**
 * In-memory cache used when no Redis instance is configured.
 *
 * Single-process only, so it is suitable for local development and the
 * demonstration, not for a multi-instance deployment. Expired entries are
 * evicted lazily on read plus periodically, so a long-running process does not
 * grow without bound.
 */
export class MemoryCache implements Cache {
  private readonly store = new Map<string, Entry>();
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    // Never hold the process open just for the sweeper.
    this.sweeper.unref?.();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const current = await this.get<number>(key);
    const next = (current ?? 0) + 1;

    // Preserve the original window rather than extending it on every hit,
    // otherwise a steady stream of requests would keep the counter alive
    // forever and never let the limit reset.
    const existing = this.store.get(key);
    const expiresAt =
      existing !== undefined && existing.expiresAt > Date.now()
        ? existing.expiresAt
        : Date.now() + ttlSeconds * 1000;

    this.store.set(key, { value: next, expiresAt });
    return next;
  }

  async close(): Promise<void> {
    clearInterval(this.sweeper);
    this.store.clear();
  }
}
