import { getCache } from '@/platform/cache';
import { sql } from '@/platform/db/client';
import { getAiGateway } from '@/platform/ai';
import { getMapsProvider } from '@/platform/maps';

/**
 * GET /api/ready — readiness. Reports each dependency separately so an
 * operator can see which one is degraded rather than a single opaque flag
 * (PRD Part II §13.1, §14.2).
 *
 * A degraded optional dependency does not make the service unready: the
 * application is designed to run without Redis, without an LLM key and
 * without a routing provider.
 */
export async function GET(): Promise<Response> {
  const database = await sql`SELECT 1`.then(
    () => 'ok' as const,
    () => 'unavailable' as const,
  );

  const cache = await getCache()
    .set('readiness-probe', 1, 10)
    .then(
      () => 'ok' as const,
      () => 'degraded' as const,
    );

  const body = {
    status: database === 'ok' ? 'ready' : 'not_ready',
    database,
    cache,
    ai: getAiGateway().mode,
    maps: getMapsProvider().name,
    environment: process.env.APP_ENV ?? 'local',
    at: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    status: database === 'ok' ? 200 : 503,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
