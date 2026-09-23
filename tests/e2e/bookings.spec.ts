import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Screen T13 — booking options, handoff and manual references. */

async function planTrip(page: Page): Promise<string> {
  await page.request.get('/api/v1/destinations');
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'dd_csrf')?.value ?? '';

  const created = await page.request.post('/api/v1/trips', {
    data: { brief: { durationDays: 3, interests: ['nature'] }, destinationSlug: 'ooty-nilgiris' },
    headers: { 'x-csrf-token': csrf },
  });
  expect(created.ok()).toBe(true);
  const { trip } = (await created.json()) as { trip: { id: string } };

  await page.request.post(`/api/v1/trips/${trip.id}/generate-itinerary`, {
    headers: { 'x-csrf-token': csrf, 'idempotency-key': `e2e-book-${trip.id}` },
  });
  return trip.id;
}

test('offers carry a price state, taxes and cancellation, and say before you leave', async ({ page, context }) => {
  const tripId = await planTrip(page);
  await page.goto(`/trips/${tripId}/bookings`);

  await expect(page.getByTestId('sandbox-label')).toBeVisible();
  await expect(page.getByTestId('handoff-notice')).toContainText(/leaving Dream Destination/i);

  const offer = page.getByTestId('offer').first();
  await expect(offer.getByTestId('offer-price')).toContainText('₹');
  await expect(offer.getByTestId('price-state')).toContainText(/checked with the provider/i);
  await expect(offer.getByTestId('taxes')).toContainText(/Taxes and fees/);
  await expect(offer.getByTestId('cancellation')).not.toBeEmpty();
  await expectAccessible(page);

  // Leaving is announced, and can be declined.
  await offer.getByRole('button', { name: /^Open / }).click();
  await expect(page.getByTestId('leaving-notice')).toBeVisible();
  await page.getByRole('button', { name: 'Stay here' }).click();
  await expect(page.getByTestId('leaving-notice')).toHaveCount(0);

  await offer.getByRole('button', { name: /^Open / }).click();
  const [providerTab] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: /^Continue to / }).click(),
  ]);
  await providerTab.waitForLoadState();
  await expect(providerTab.getByRole('heading', { name: 'Sandbox provider' })).toBeVisible();
  const reference = await providerTab.getByTestId('sandbox-reference').textContent();
  await providerTab.close();

  const booking = page.getByTestId('trip-booking').first();
  await expect(booking.getByTestId('booking-state')).toHaveText('Sent to the provider');
  await expect(booking).toContainText(/Whether you booked there is not something we can see/);

  // A card number is refused; the provider's reference is kept as the traveller's own.
  await booking.getByRole('textbox', { name: /provider’s reference/i }).fill('4111 1111 1111 1111');
  await booking.getByRole('button', { name: 'Save reference' }).click();
  await expect(booking.getByRole('alert')).toContainText(/never payment details/i);

  await booking.getByRole('textbox', { name: /provider’s reference/i }).fill(reference ?? 'SBX-0001');
  await booking.getByRole('button', { name: 'Save reference' }).click();
  await expect(page.getByTestId('booking-state').first()).toHaveText('Reference added by you');

  await page.getByRole('radio', { name: /I received the provider’s confirmation/ }).check();
  await page.getByRole('button', { name: 'Mark as confirmed' }).click();
  await expect(page.getByTestId('booking-state').first()).toHaveText('Confirmed by the provider');
  await expect(page.getByTestId('trip-booking').first()).toContainText('The provider confirmed this booking.');
});

test('a trip’s booking options are not readable by another session', async ({ page, browser }) => {
  const tripId = await planTrip(page);
  const other = await browser.newContext();
  const otherPage = await other.newPage();

  const response = await otherPage.goto(`/trips/${tripId}/bookings`);
  expect(response?.status()).toBe(404);
  await other.close();
});

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(blocking.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`)).toEqual([]);
}
