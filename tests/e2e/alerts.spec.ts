import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** The alert centre and notification preferences (E12-S05, E12-S06). */

async function signInAsTraveller(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: /use this account.*demo traveller/i }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/');
}

test('a guest is asked to sign in, and nothing asks for notification permission', async ({ page }) => {
  await page.goto('/');
  // Nothing on a first visit may ask, so no prompt exists to find.
  await expect(page.getByTestId('push-prompt')).toHaveCount(0);

  await page.goto('/alerts');
  await expect(page.getByRole('heading', { name: /sign in to see your alerts/i })).toBeVisible();
});

test('the alert centre shows preferences, and saves them', async ({ page }) => {
  await signInAsTraveller(page);
  await page.goto('/alerts');

  await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible();
  // Without VAPID keys the page says so rather than offering a prompt that could not deliver.
  await expect(page.getByTestId('push-unconfigured')).toBeVisible();

  const preferences = page.getByTestId('notification-preferences');
  const commercial = preferences.getByRole('checkbox', { name: /local business suggestions/i });
  await expect(commercial).not.toBeChecked();
  await expect(preferences.getByRole('checkbox', { name: /safety alerts/i })).toBeChecked();

  await commercial.check();
  await expect(preferences.getByRole('status')).toHaveText('Saved.');

  await page.reload();
  await expect(page.getByRole('checkbox', { name: /local business suggestions/i })).toBeChecked();

  // Put it back, so the seeded account stays as the demonstration expects.
  await page.getByRole('checkbox', { name: /local business suggestions/i }).uncheck();
  await expect(page.getByTestId('notification-preferences').getByRole('status')).toHaveText('Saved.');

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);
});

test('a trip reminder appears in the alert centre once the trip is close', async ({ page }) => {
  await signInAsTraveller(page);

  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'dd_csrf')?.value ?? '';
  const tomorrow = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const created = await page.request.post('/api/v1/trips', {
    data: { brief: { durationDays: 2, interests: ['nature'] }, destinationSlug: 'ooty-nilgiris', startDate: tomorrow },
    headers: { 'x-csrf-token': csrf },
  });
  expect(created.ok()).toBe(true);
  const { trip } = (await created.json()) as { trip: { id: string } };

  // Opening the trip is what schedules its reminders, from the browser.
  const scheduled = page.waitForResponse((response) => response.url().includes('/reminders') && response.status() === 200);
  await page.goto(`/trips/${trip.id}`);
  await expect(page.getByRole('link', { name: 'Alerts' })).toBeVisible();
  await scheduled;

  await page.goto('/alerts');
  const reminder = page.getByTestId('alert').filter({ hasText: /travel tomorrow|offline pack/i }).first();
  await expect(reminder).toBeVisible();
  await expect(reminder).toHaveAttribute('data-category', 'trip_reminder');
});
