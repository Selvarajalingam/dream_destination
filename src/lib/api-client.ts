'use client';

/**
 * Browser API client.
 *
 * Reads the CSRF secret from its cookie and echoes it in a header, which is
 * the other half of the double-submit check in src/server/handler.ts. Problem
 * responses are thrown as a typed error so callers can show the detail and the
 * suggested actions rather than a generic failure.
 */

export type Problem = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  actions?: string[];
  requestId: string;
};

export class ApiProblemError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiProblemError';
  }
}

function csrfToken(): string {
  const match = /(?:^|;\s*)dd_csrf=([^;]+)/.exec(document.cookie);
  return match === null ? '' : decodeURIComponent(match[1]);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken(),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as Problem | null;
    throw new ApiProblemError(
      problem ?? {
        type: 'about:blank',
        title: 'Something went wrong',
        status: response.status,
        requestId: 'unknown',
      },
    );
  }

  return (await response.json()) as T;
}

export const api = {
  get: <T,>(path: string): Promise<T> => request<T>(path),

  post: <T,>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), headers }),

  patch: <T,>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
};

/**
 * Ensures a session cookie exists before the first state-changing request.
 * A GET creates the guest session server-side and sets both cookies.
 */
export async function ensureSession(): Promise<void> {
  if (csrfToken() !== '') return;
  await fetch('/api/v1/destinations', { method: 'GET' });
}
