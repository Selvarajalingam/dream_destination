import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Adding a local business or place to an existing plan — PRD backlog
 * E10-S04 — as a guest who has planned one trip.
 */

async function planTrip(page: Page): Promise<{ tripId: string; csrf: string }> {
  await page.request.get('/api/v1/destinations');
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'dd_csrf')?.value ?? '';

  const created = await page.request.post('/api/v1/trips', {
    data: { brief: { durationDays: 2, interests: ['nature'] }, destinationSlug: 'ooty-nilgiris' },
    headers: { 'x-csrf-token': csrf },
  });
  expect(created.ok()).toBe(true);
  const { trip } = (await created.json()) as { trip: { id: string } };

  const generated = await page.request.post(`/api/v1/trips/${trip.id}/generate-itinerary`, {
    headers: { 'x-csrf-token': csrf, 'idempotency-key': `e2e-${trip.id}` },
  });
  expect(generated.ok()).toBe(true);
  return { tripId: trip.id, csrf };
}

/** A priced business near the trip that the generated plan does not already include. */
async function businessNotInPlan(page: Page, tripId: string): Promise<{ slug: string; name: string }> {
  const detail = (await (await page.request.get(`/api/v1/trips/${tripId}`)).json()) as {
    days: Array<{ items: Array<{ localBusinessId: string | null }> }>;
  };
  const planned = new Set(detail.days.flatMap((day) => day.items.map((item) => item.localBusinessId)));
  const { businesses } = (await (await page.request.get(`/api/v1/trips/${tripId}/businesses`)).json()) as {
    businesses: Array<{ id: string; slug: string; name: string; category: string }>;
  };
  const choice = businesses.find((business) => !planned.has(business.id) && !['shop', 'artisan'].includes(business.category));
  expect(choice, 'a nearby business outside the plan').toBeDefined();
  return choice!;
}

test('a business is added at a feasible time, can be undone, and is not added twice', async ({ page }) => {
  const { tripId } = await planTrip(page);
  const business = await businessNotInPlan(page, tripId);

  await page.goto(`/businesses/${business.slug}`);
  await page.getByRole('button', { name: 'Add to itinerary' }).click();

  const added = page.getByTestId('added-to-trip');
  await expect(added).toContainText(/Added to day \d/);
  await expect(added).toContainText(/plan now comes to ₹/);
  await expect(page.getByRole('link', { name: 'Open the trip' })).toHaveAttribute('href', `/trips/${tripId}`);

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Removed from your plan.')).toBeVisible();

  const afterUndo = (await (await page.request.get(`/api/v1/trips/${tripId}`)).json()) as {
    days: Array<{ items: Array<{ title: string }> }>;
  };
  expect(afterUndo.days.flatMap((day) => day.items).some((item) => item.title === business.name)).toBe(false);

  // Add it again, then a second attempt names the day it is already on.
  await page.getByRole('button', { name: 'Add to itinerary' }).click();
  await expect(page.getByTestId('added-to-trip')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Add to itinerary' }).click();
  await expect(page.getByTestId('add-to-trip').getByRole('alert')).toContainText(/already in this plan, on day \d/);
});

test('with no trip yet, the traveller is pointed to planning one', async ({ page }) => {
  await page.goto('/businesses/badaga-home-kitchen');
  await page.getByRole('button', { name: 'Add to itinerary' }).click();
  await expect(page.getByRole('link', { name: 'Plan a trip' })).toBeVisible();
});
