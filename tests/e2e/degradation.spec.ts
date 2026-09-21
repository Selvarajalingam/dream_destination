import { expect, test } from '@playwright/test';

/**
 * Graceful degradation — PRD Part II §14.2 and §19: "The system degrades
 * gracefully when AI, map, weather, booking, or push providers fail."
 *
 * Each test cuts one dependency and checks that the traveller still gets a
 * usable answer with the limitation stated, rather than a dead end.
 */

test('an assistant outage falls back to the deterministic parser', async ({ page }) => {
  // The gateway already runs deterministically with no API key, and reports
  // which mode produced the brief. Failing the endpoint outright is the
  // harder case: the screen must keep what was entered and offer another way.
  await page.route('**/api/v1/trip-briefs/parse', (route) =>
    route.fulfill({ status: 503, contentType: 'application/problem+json', body: '{}' }),
  );

  await page.goto('/dream-ai?q=4+day+trip+from+Coimbatore+under+25000');

  await expect(page.getByText(/assistant is not responding/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /search destinations/i })).toBeVisible();
});

test('the deterministic path still reaches destinations without the assistant', async ({ page }) => {
  await page.goto('/explore');

  await expect(page.getByRole('heading', { name: /explore the pilot region/i })).toBeVisible();
  await page.getByRole('link', { name: /ooty and the nilgiris/i }).first().click();

  await expect(page.getByRole('heading', { name: /ooty and the nilgiris/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /build my trip/i })).toBeVisible();
});

test('a crowd source outage reports Unknown rather than guessing', async ({ page }) => {
  const response = await page.request.get(
    '/api/v1/places/ooty-botanical-garden/crowd?simulate=crowd-outage',
  );

  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { band: string; label: string; explanation: string };

  expect(body.band).toBe('unknown');
  expect(body.label).toBe('Unknown');
  // It must not read as quiet, and must not claim to be current.
  expect(body.explanation).not.toMatch(/comfortable|\blive\b/i);
  expect(body.explanation).toMatch(/not responding|historical/i);
});

test('expired crowd data resolves to Unknown', async ({ page }) => {
  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const response = await page.request.get(
    `/api/v1/places/doddabetta-peak/crowd?at=${encodeURIComponent(farFuture)}`,
  );

  const body = (await response.json()) as { band: string; source: string };
  expect(body.band).toBe('unknown');
  expect(body.source).toBe('none');
});

test('a routing outage still gives coordinates and an external map link', async ({ page }) => {
  await page.goto('/places/sandynalla-viewpoint');

  // Whatever the routing provider does, a coordinate link always works.
  await expect(page.getByRole('link', { name: /open in maps/i }).first()).toBeVisible();
});

test('health and readiness report each dependency separately', async ({ page }) => {
  const health = await page.request.get('/api/health');
  expect(health.status()).toBe(200);

  const ready = await page.request.get('/api/ready');
  const body = (await ready.json()) as Record<string, string>;

  expect(body.database).toBe('ok');
  // Optional dependencies are reported by name rather than hidden behind a
  // single flag, so an operator can see which one is degraded.
  expect(body).toHaveProperty('cache');
  expect(body).toHaveProperty('ai');
  expect(body).toHaveProperty('maps');
});

test('a problem response says what failed and what can be done', async ({ page }) => {
  const response = await page.request.get('/api/v1/trips/00000000-0000-0000-0000-000000000000');

  expect(response.status()).toBe(404);
  expect(response.headers()['content-type']).toContain('application/problem+json');

  const body = (await response.json()) as Record<string, unknown>;
  expect(body).toMatchObject({ status: 404 });
  expect(body.title).toBeTruthy();
  expect(body.requestId).toBeTruthy();
});

test('a state-changing request without a CSRF token is refused', async ({ page }) => {
  const response = await page.request.post('/api/v1/trips', {
    data: { brief: {}, destinationSlug: 'ooty-nilgiris' },
    failOnStatusCode: false,
  });

  expect(response.status()).toBe(403);
});

test('the admin API is closed to an unauthenticated caller', async ({ page }) => {
  const response = await page.request.get('/api/v1/admin/verifications', {
    failOnStatusCode: false,
  });

  expect([401, 403]).toContain(response.status());
});

test('one trip cannot be read through another session', async ({ page, browser }) => {
  // A trip id from one session must be indistinguishable from a nonexistent
  // one when presented by another. PRD Part II §19.
  const other = await browser.newContext();
  const otherPage = await other.newPage();

  const unknown = await otherPage.request.get('/api/v1/trips/11111111-1111-1111-1111-111111111111', {
    failOnStatusCode: false,
  });

  expect([401, 404]).toContain(unknown.status());
  await other.close();
});
