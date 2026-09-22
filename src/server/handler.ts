import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { ZodType } from 'zod';
import { getCache } from '@/platform/cache';
import { logger } from '@/platform/observability/logger';
import type { UserRole } from '@/modules/verification/domain/types';
import { DomainError } from '@/shared/result';
import { hasRole } from './authorize';
import { ProblemError, problemResponse, problems } from './problem';
import { CSRF_COOKIE, CSRF_HEADER, getOrCreateSession, getSession, safeEquals, type Session } from './session';

/**
 * Route wrapper.
 *
 * Composes the cross-cutting concerns PRD Part II §3.1 assigns to the API
 * boundary: request validation, authentication, rate limiting and idempotency,
 * plus the CSRF defence from §12.2 and the problem format from §7.5.
 */

export type HandlerContext<TBody> = {
  request: NextRequest;
  session: Session;
  body: TBody;
  params: Record<string, string>;
  requestId: string;
  searchParams: URLSearchParams;
};

export type RouteConfig<TBody> = {
  /** 'none' still creates a guest session, since T01 allows guest planning. */
  auth?: 'none' | 'session' | 'role';
  roles?: UserRole[];
  body?: ZodType<TBody>;
  rateLimit?: { key: string; perMinute: number };
  /** Honours an Idempotency-Key header. PRD Part II §7.1. */
  idempotent?: boolean;
};

type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function route<TBody = undefined>(
  config: RouteConfig<TBody>,
  handler: (context: HandlerContext<TBody>) => Promise<Response>,
): RouteHandler {
  return async (request, context) => {
    const requestId = request.headers.get('x-request-id') ?? randomUUID();
    const started = Date.now();

    try {
      const session =
        config.auth === 'none' || config.auth === undefined
          ? await getOrCreateSession(request.headers.get('user-agent'))
          : await requireSession();

      if (!SAFE_METHODS.has(request.method)) {
        assertCsrf(request, session);
      }

      if (config.auth === 'role') {
        const roles = config.roles ?? [];
        if (!hasRole(session, ...roles)) throw problems.forbidden();
      }

      if (config.rateLimit !== undefined) {
        await enforceRateLimit(config.rateLimit, session);
      }

      const idempotencyKey = config.idempotent === true ? request.headers.get('idempotency-key') : null;
      if (idempotencyKey !== null) {
        const replayed = await replayIdempotent(idempotencyKey, session);
        if (replayed !== null) return replayed;
      }

      const body = await parseBody(request, config.body);
      const params = await context.params;
      const searchParams = new URL(request.url).searchParams;

      const response = await handler({ request, session, body, params, requestId, searchParams });

      if (idempotencyKey !== null && response.ok) {
        await storeIdempotent(idempotencyKey, session, response.clone());
      }

      response.headers.set('x-request-id', requestId);

      logger.info('api.request', {
        method: request.method,
        path: new URL(request.url).pathname,
        status: response.status,
        durationMs: Date.now() - started,
        requestId,
      });

      return response;
    } catch (error) {
      return handleError(error, request, requestId, started);
    }
  };
}

async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (session === null || session.isGuest) throw problems.unauthenticated();
  return session;
}

/**
 * Double-submit CSRF check: the secret lives in a readable cookie and must be
 * echoed in a header. A cross-site page can cause the cookie to be sent but
 * cannot read it to set the header.
 */
function assertCsrf(request: NextRequest, session: Session): void {
  const header = request.headers.get(CSRF_HEADER);
  const cookie = request.cookies.get(CSRF_COOKIE)?.value;

  if (header === null || cookie === undefined) throw problems.csrf();
  if (!safeEquals(header, cookie)) throw problems.csrf();
  if (!safeEquals(cookie, session.csrfSecret)) throw problems.csrf();
}

async function enforceRateLimit(
  limit: { key: string; perMinute: number },
  session: Session,
): Promise<void> {
  const cache = getCache();
  const window = Math.floor(Date.now() / 60_000);
  const key = `ratelimit:${limit.key}:${session.id}:${window}`;

  const count = await cache.increment(key, 90);
  if (count > limit.perMinute) {
    const secondsLeft = 60 - Math.floor((Date.now() % 60_000) / 1000);
    throw problems.rateLimited(secondsLeft);
  }
}

async function parseBody<TBody>(request: NextRequest, schema: ZodType<TBody> | undefined): Promise<TBody> {
  if (schema === undefined) return undefined as TBody;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw problems.validation('The request body was not valid JSON.');
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // A problem with the body as a whole has an empty path; name it rather
    // than rendering ": Invalid input" with nothing before the colon.
    const path = issue === undefined || issue.path.length === 0 ? 'body' : issue.path.join('.');
    throw problems.validation(`${path}: ${issue?.message ?? 'is not valid'}`);
  }

  return parsed.data;
}

type StoredResponse = { status: number; body: string };

async function replayIdempotent(key: string, session: Session): Promise<Response | null> {
  const stored = await getCache().get<StoredResponse>(idempotencyCacheKey(key, session));
  if (stored === null) return null;

  return new Response(stored.body, {
    status: stored.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'idempotent-replay': 'true' },
  });
}

async function storeIdempotent(key: string, session: Session, response: Response): Promise<void> {
  const body = await response.text();
  await getCache().set<StoredResponse>(
    idempotencyCacheKey(key, session),
    { status: response.status, body },
    24 * 60 * 60,
  );
}

const idempotencyCacheKey = (key: string, session: Session): string =>
  `idempotency:${session.id}:${key}`;

function handleError(error: unknown, request: NextRequest, requestId: string, started: number): Response {
  const path = new URL(request.url).pathname;
  const durationMs = Date.now() - started;

  if (error instanceof ProblemError) {
    logger.warn('api.problem', { path, status: error.status, type: error.type, requestId, durationMs });
    return error.toResponse(requestId);
  }

  if (error instanceof DomainError) {
    logger.warn('api.domain_error', { path, code: error.code, requestId, durationMs });
    return problemResponse({
      type: `https://dreamdestination.in/problems/${error.code.replace(/\./g, '-')}`,
      title: 'This change is not allowed',
      status: error.status,
      detail: error.message,
      actions: error.actions,
      requestId,
    });
  }

  logger.error('api.unhandled', {
    path,
    requestId,
    durationMs,
    reason: error instanceof Error ? error.message : 'unknown',
  });

  return problems.internal().toResponse(requestId);
}

/** Convenience JSON response with the caching posture most reads want. */
export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...init.headers,
    },
  });
}
