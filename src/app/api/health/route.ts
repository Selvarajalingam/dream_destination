/**
 * GET /api/health — liveness. Answers "is this process up", nothing more, so
 * it stays cheap and never depends on the database (PRD Part II §14.2).
 */
export function GET(): Response {
  return new Response(JSON.stringify({ status: 'ok', at: new Date().toISOString() }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
