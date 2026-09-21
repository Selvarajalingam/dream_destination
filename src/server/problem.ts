/**
 * RFC 7807-style problem responses — PRD Part II §7.5.
 *
 * Every error states what failed and, where useful, what the caller can do
 * about it, matching the global error-state rule in PRD Part I §9.3.
 */

const BASE = 'https://dreamdestination.in/problems';

export type ProblemInit = {
  type: string;
  title: string;
  status: number;
  detail?: string;
  actions?: string[];
  requestId?: string;
};

export class ProblemError extends Error {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly actions?: string[];

  constructor(init: ProblemInit) {
    super(init.detail ?? init.title);
    this.name = 'ProblemError';
    this.type = init.type;
    this.title = init.title;
    this.status = init.status;
    this.detail = init.detail;
    this.actions = init.actions;
  }

  toResponse(requestId: string): Response {
    return problemResponse({ ...this, requestId });
  }
}

export function problemResponse(init: ProblemInit): Response {
  const body = {
    type: init.type,
    title: init.title,
    status: init.status,
    ...(init.detail === undefined ? {} : { detail: init.detail }),
    ...(init.actions === undefined ? {} : { actions: init.actions }),
    requestId: init.requestId ?? 'unknown',
  };

  return new Response(JSON.stringify(body), {
    status: init.status,
    headers: {
      'content-type': 'application/problem+json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

// --- The problems this application raises --------------------------------

export const problems = {
  notFound: (detail = 'The requested item does not exist, or you do not have access to it.') =>
    new ProblemError({ type: `${BASE}/not-found`, title: 'Not found', status: 404, detail }),

  unauthenticated: () =>
    new ProblemError({
      type: `${BASE}/unauthenticated`,
      title: 'Sign in required',
      status: 401,
      detail: 'This action needs you to be signed in.',
      actions: ['sign_in'],
    }),

  forbidden: (detail = 'This action is not available to your account.') =>
    new ProblemError({ type: `${BASE}/forbidden`, title: 'Not available', status: 403, detail }),

  csrf: () =>
    new ProblemError({
      type: `${BASE}/csrf`,
      title: 'Request could not be verified',
      status: 403,
      detail: 'The request was missing a valid verification token. Reload the page and try again.',
      actions: ['reload'],
    }),

  validation: (detail: string) =>
    new ProblemError({
      type: `${BASE}/validation`,
      title: 'Some details need correcting',
      status: 400,
      detail,
    }),

  conflict: (detail: string, actions: string[] = ['reload']) =>
    new ProblemError({ type: `${BASE}/conflict`, title: 'This item changed', status: 409, detail, actions }),

  versionConflict: () =>
    new ProblemError({
      type: `${BASE}/version-conflict`,
      title: 'This trip changed somewhere else',
      status: 409,
      detail: 'Your copy of this trip is out of date. Reload to see the current version, or overwrite it.',
      actions: ['reload', 'overwrite'],
    }),

  stalePrice: (detail: string) =>
    new ProblemError({
      type: `${BASE}/stale-price`,
      title: 'Price refresh required',
      status: 409,
      detail,
      actions: ['refresh_prices', 'continue_with_estimates'],
    }),

  rateLimited: (retryAfterSeconds: number) =>
    new ProblemError({
      type: `${BASE}/rate-limited`,
      title: 'Too many requests',
      status: 429,
      detail: `Please wait about ${retryAfterSeconds} seconds and try again.`,
      actions: ['retry_later'],
    }),

  providerUnavailable: (provider: string) =>
    new ProblemError({
      type: `${BASE}/provider-unavailable`,
      title: 'A service is temporarily unavailable',
      status: 503,
      detail: `The ${provider} service did not respond. Your plan has been kept and nothing was lost.`,
      actions: ['retry', 'continue_without'],
    }),

  internal: () =>
    new ProblemError({
      type: `${BASE}/internal`,
      title: 'Something went wrong',
      status: 500,
      detail: 'The request could not be completed. Your entered details have been kept.',
      actions: ['retry'],
    }),
};
