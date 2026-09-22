import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** The traveller, business owner and staff sign-in pages. */

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(blocking.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`)).toEqual([]);
}

async function signInWith(page: Page, email: string, password: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

for (const path of ['/login', '/business/login', '/admin/login']) {
  test(`${path} has no critical or serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectAccessible(page);
  });
}

test('a traveller signs in, sees their account on Profile, and signs out', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /use this account.*demo traveller/i }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/profile');
  await expect(page.getByTestId('signed-in-as')).toContainText('Demo Traveller');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/profile');
  await expect(page.getByRole('link', { name: /traveller sign-in/i })).toBeVisible();
});

test('a business owner lands on their listings, and a staff member on the operations area', async ({ page }) => {
  await page.goto('/business/login');
  await signInWith(page, 'owner.kitchen@demo.dreamdestination.invalid', 'Owner@2026');
  await expect(page).toHaveURL('/business');
  await expect(page.getByTestId('owner-listing').filter({ hasText: 'Badaga Home Kitchen' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/business/login');

  await signInWith(page, 'admin@demo.dreamdestination.invalid', 'Admin@2026');
  await expect(page.locator('form').getByRole('alert')).toContainText(/staff sign-in page/);
  await page.getByRole('link', { name: 'Go there' }).click();
  await expect(page).toHaveURL('/admin/login');

  await signInWith(page, 'admin@demo.dreamdestination.invalid', 'Admin@2026');
  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();
});

test('a wrong password gets a message that does not say whether the account exists', async ({ page }) => {
  await page.goto('/admin/login');
  await signInWith(page, 'verifier@demo.dreamdestination.invalid', 'not-the-password');
  const wrong = await page.locator('form').getByRole('alert').textContent();

  await signInWith(page, 'nobody@demo.dreamdestination.invalid', 'not-the-password');
  await expect(page.locator('form').getByRole('alert')).toHaveText(wrong ?? '');
  await expect(page).toHaveURL('/admin/login');
});

test('the operations area sends a guest to the staff sign-in, and back afterwards', async ({ page }) => {
  await page.goto('/admin/incidents');
  await page.getByRole('link', { name: 'Staff sign-in' }).click();
  await expect(page).toHaveURL('/admin/login');

  await page.goto('/admin/login?next=/admin/incidents');
  await signInWith(page, 'verifier@demo.dreamdestination.invalid', 'Verifier@2026');
  await expect(page).toHaveURL('/admin/incidents');
});

test('a link cannot send a fresh session to another site', async ({ page }) => {
  await page.goto('/login?next=//evil.example/steal');
  await signInWith(page, 'traveller@demo.dreamdestination.invalid', 'Traveller@2026');
  await expect(page).toHaveURL('/');
});
