/**
 * Circuit breaker — PRD Part II §14.2 requires provider timeouts and circuit
 * breakers, with bulkheads for AI and booking traffic.
 *
 * Closed: calls pass through. Open: calls are refused immediately, so a failing
 * provider cannot keep consuming request time. Half-open: one trial call is
 * allowed, and its result decides whether to close or re-open.
 */

export type BreakerState = 'closed' | 'open' | 'half_open';

export type BreakerOptions = {
  /** Consecutive failures before the circuit opens. */
  failureThreshold: number;
  /** How long to stay open before allowing a trial call. */
  resetMs: number;
};

export class CircuitBreakerOpenError extends Error {
  constructor(readonly retryInMs: number) {
    super(`Circuit is open. Retry in about ${Math.ceil(retryInMs / 1000)}s.`);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private trialInFlight = false;

  constructor(private readonly options: BreakerOptions) {}

  get state(): BreakerState {
    if (this.openedAt === null) return 'closed';
    return Date.now() - this.openedAt >= this.options.resetMs ? 'half_open' : 'open';
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.state;

    if (state === 'open') {
      throw new CircuitBreakerOpenError(this.options.resetMs - (Date.now() - (this.openedAt ?? 0)));
    }

    // In half-open, let exactly one call through to test the provider.
    if (state === 'half_open') {
      if (this.trialInFlight) {
        throw new CircuitBreakerOpenError(this.options.resetMs);
      }
      this.trialInFlight = true;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    } finally {
      this.trialInFlight = false;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  private onFailure(): void {
    this.failures += 1;
    if (this.failures >= this.options.failureThreshold) {
      this.openedAt = Date.now();
    }
  }

  /** Test seam. */
  reset(): void {
    this.failures = 0;
    this.openedAt = null;
    this.trialInFlight = false;
  }
}
