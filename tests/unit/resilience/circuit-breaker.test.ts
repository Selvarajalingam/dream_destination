import { afterEach, describe, expect, it, vi } from 'vitest';
import { CircuitBreaker, CircuitBreakerOpenError } from '@/platform/resilience/circuit-breaker';
import { TimeoutError, withTimeout } from '@/platform/resilience/with-timeout';

afterEach(() => {
  vi.useRealTimers();
});

describe('CircuitBreaker', () => {
  it('passes calls through while closed', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetMs: 1_000 });
    await expect(breaker.run(async () => 'ok')).resolves.toBe('ok');
    expect(breaker.state).toBe('closed');
  });

  it('opens after the failure threshold and stops calling through', async () => {
    const call = vi.fn().mockRejectedValue(new Error('boom'));
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetMs: 10_000 });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await breaker.run(call).catch(() => undefined);
    }
    expect(breaker.state).toBe('open');

    // The fourth attempt is refused without reaching the provider at all,
    // which is the point: a failing provider stops consuming request time.
    await expect(breaker.run(call)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('resets its count when a call succeeds', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetMs: 1_000 });

    await breaker.run(async () => Promise.reject(new Error('boom'))).catch(() => undefined);
    await breaker.run(async () => 'ok');
    await breaker.run(async () => Promise.reject(new Error('boom'))).catch(() => undefined);
    await breaker.run(async () => Promise.reject(new Error('boom'))).catch(() => undefined);

    // Two failures since the success is below the threshold of three.
    expect(breaker.state).toBe('closed');
  });

  it('half-opens after the reset window and closes on success', async () => {
    vi.useFakeTimers();

    const call = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue('ok');

    const breaker = new CircuitBreaker({ failureThreshold: 1, resetMs: 1_000 });

    await breaker.run(call).catch(() => undefined);
    expect(breaker.state).toBe('open');

    vi.advanceTimersByTime(1_001);
    expect(breaker.state).toBe('half_open');

    await expect(breaker.run(call)).resolves.toBe('ok');
    expect(breaker.state).toBe('closed');
  });

  it('re-opens when the trial call fails again', async () => {
    vi.useFakeTimers();

    const call = vi.fn().mockRejectedValue(new Error('boom'));
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetMs: 1_000 });

    await breaker.run(call).catch(() => undefined);
    vi.advanceTimersByTime(1_001);
    await breaker.run(call).catch(() => undefined);

    expect(breaker.state).toBe('open');
  });

  it('reports how long until a retry is worth trying', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetMs: 5_000 });
    await breaker.run(async () => Promise.reject(new Error('boom'))).catch(() => undefined);

    const error = await breaker.run(async () => 'ok').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CircuitBreakerOpenError);
    expect((error as CircuitBreakerOpenError).retryInMs).toBeGreaterThan(0);
  });
});

describe('withTimeout', () => {
  it('resolves when the call finishes in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1_000, 'test')).resolves.toBe('ok');
  });

  it('rejects with a named timeout when the call does not', async () => {
    const never = new Promise<string>(() => {});
    await expect(withTimeout(never, 20, 'weather')).rejects.toBeInstanceOf(TimeoutError);
  });

  it('names the operation that timed out, so a log says which provider', async () => {
    const never = new Promise<string>(() => {});
    const error = await withTimeout(never, 20, 'weather').catch((caught: unknown) => caught);
    expect((error as TimeoutError).operation).toBe('weather');
  });

  it('passes the original rejection through rather than masking it', async () => {
    const failure = new Error('provider said no');
    await expect(withTimeout(Promise.reject(failure), 1_000, 'test')).rejects.toThrow(
      'provider said no',
    );
  });
});
