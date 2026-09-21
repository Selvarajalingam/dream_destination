export class TimeoutError extends Error {
  constructor(
    readonly operation: string,
    readonly ms: number,
  ) {
    super(`${operation} did not respond within ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Bounds how long a provider call may take. PRD Part II §14.2 requires
 * provider timeouts, and §14.1 sets a p95 target for non-AI APIs that excludes
 * external latency only if that latency is actually bounded.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(operation, ms)), ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
