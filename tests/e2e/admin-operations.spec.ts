import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The operations screens A01 and A05-A08, driven through a real browser.
 *
 * Signing in uses the demonstration endpoint, which needs the CSRF cookie a
 * first page load sets.
 */

async function signIn(page: Page, role: 'admin' | 'traveler' = 'admin'): Promise<void> {
  // Page renders only read a session; an API call is what creates one and
  // sets the CSRF cookie. page.request shares the browser context's cookies.
  await page.request.get('/api/v1/destinations');
  const cookies = await page.context().cookies();
  const csrf = cookies.find((cookie) => cookie.name === 'dd_csrf')?.value ?? '';
  const response = await page.request.post('/api/v1/demo-session', {
    data: { role },
    headers: { 'x-csrf-token': csrf },
  });
  expect(response.ok()).toBe(true);
}

const ADMIN_PAGES = ['/admin', '/admin/freshness', '/admin/incidents', '/admin/businesses', '/admin/analytics'];

test.describe('operations screens', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const path of ADMIN_PAGES) {
    test(`${path} has no critical or serious accessibility violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      expect(blocking.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`)).toEqual([]);
    });
  }

  test('A01 leads with the critical incident', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByTestId('ops-headline')).toHaveText(/critical incident needs a decision/);
    const first = page.getByTestId('urgent-item').first();
    await expect(first).toHaveAttribute('data-kind', 'incident');
    await expect(first).toHaveAttribute('data-tier', 'Act now');
  });

  test('A05 offers reminders on selection but never a bulk approval', async ({ page }) => {
    await page.goto('/admin/freshness');
    await expect(page.getByTestId('freshness-item').first()).toBeVisible();

    await page.getByRole('checkbox', { name: /select .* for a reminder/i }).first().check();
    await expect(page.getByRole('button', { name: /send reminder/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /approve|mark all|mark .* fresh/i })).toHaveCount(0);
  });

  test('A05 refuses a re-verification without a note saying what was checked', async ({ page }) => {
    await page.goto('/admin/freshness');
    await page.getByRole('button', { name: /re-verify this record/i }).first().click();
    const dialog = page.getByRole('dialog', { name: /re-verify/i });
    await dialog.getByRole('button', { name: /confirm re-verification/i }).click();
    // Scoped to the dialog: Next.js's route announcer is also role=alert.
    await expect(dialog.getByRole('alert')).toContainText(/what you checked/i);
  });

  test('A06 shows reporter privacy and offers immediate suspension on the critical report', async ({ page }) => {
    await page.goto('/admin/incidents');
    await page.getByTestId('incident-row').first().click();

    await expect(page.getByTestId('reporter-privacy')).toContainText(/identity withheld/i);
    await expect(page.getByRole('button', { name: /suspend immediately/i })).toBeVisible();
  });

  test('A06 withholds immediate suspension on a low-severity report', async ({ page }) => {
    await page.goto('/admin/incidents');
    await page.locator('[data-testid="incident-row"][data-severity="low"]').first().click();
    await expect(page.getByRole('button', { name: /suspend immediately/i })).toHaveCount(0);
    await expect(page.getByText(/immediate suspension is for high or critical reports/i)).toBeVisible();
  });

  test('A07 keeps verify disabled until every check is confirmed', async ({ page }) => {
    await page.goto('/admin/businesses');
    await page.getByTestId('listing-row').first().click();

    const verify = page.getByRole('button', { name: /verify listing/i });
    await expect(verify).toBeDisabled();

    for (const check of ['ownership', 'address', 'businessType', 'hours']) {
      await page.getByTestId(`check-${check}`).check();
    }
    await expect(verify).toBeDisabled();

    await page.getByTestId('check-contact').check();
    await expect(verify).toBeEnabled();
  });

  test('A07 blocks sponsorship for an unverified listing', async ({ page }) => {
    await page.goto('/admin/businesses');
    await page.locator('[data-testid="sponsorship-row"][data-verified="false"]').first().click();
    await expect(page.getByTestId('sponsorship-panel')).toContainText(/cannot be sponsored yet|verify the listing first/i);
    await expect(page.getByRole('button', { name: /approve sponsorship/i })).toBeDisabled();
  });

  test('A08 labels simulated data and shows the funnel and fairness', async ({ page }) => {
    await page.goto('/admin/analytics');
    await expect(page.getByTestId('demo-label')).toContainText(/not pilot results/i);
    await expect(page.getByTestId('funnel').getByRole('listitem')).toHaveCount(6);
    await expect(page.getByTestId('fairness')).toBeVisible();
  });
});

test('a traveller report reaches the triage queue', async ({ page }) => {
  await signIn(page, 'traveler');
  await page.goto('/places/avalanche-lake');

  await page.getByRole('button', { name: /report a concern/i }).last().click();
  await page.getByRole('radio', { name: /path or road is blocked/i }).check();
  // A marker unique to this run, so earlier runs' reports cannot match. Letters
  // only: redaction would strip a long digit run as a phone number.
  const marker = `tree-${Date.now().toString(36)}`.replace(/\d/g, (d) => 'abcdefghij'[Number(d)]);
  await page
    .getByRole('textbox', { name: /what did you see/i })
    .fill(`A fallen tree blocks the forest road two kilometres past the gate (${marker}).`);
  await page.getByRole('button', { name: /send report/i }).click();
  // Filtered: the page has other live regions, such as the add-to-trip outcome.
  await expect(page.getByRole('status').filter({ hasText: /report sent/i })).toBeVisible();

  await signIn(page, 'admin');
  await page.goto('/admin/incidents');
  const row = page.getByTestId('incident-row').filter({ hasText: marker });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Avalanche Lake');
});

test('a traveller cannot open the operations area', async ({ page }) => {
  await signIn(page, 'traveler');
  for (const path of ADMIN_PAGES) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: /not available/i })).toBeVisible();
  }
});
