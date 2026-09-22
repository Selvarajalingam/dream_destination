import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The business owner flow, B01–B06, driven through a real browser as the
 * seeded owner of Badaga Home Kitchen.
 */

async function signIn(page: Page, role: 'owner' | 'traveler' | 'admin' = 'owner'): Promise<void> {
  await page.request.get('/api/v1/destinations');
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === 'dd_csrf')?.value ?? '';
  const response = await page.request.post('/api/v1/demo-session', { data: { role }, headers: { 'x-csrf-token': csrf } });
  expect(response.ok()).toBe(true);
}

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(blocking.map((v) => `${v.id}: ${v.nodes[0]?.html ?? ''}`)).toEqual([]);
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function openListing(page: Page, name: string): Promise<void> {
  await page.goto('/business');
  await page.getByTestId('owner-listing').filter({ hasText: name }).first().click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test.describe('business owner', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('lists every listing the owner has, each with its status', async ({ page }) => {
    await page.goto('/business');
    await expect(page.getByTestId('owner-listing').filter({ hasText: 'Badaga Home Kitchen' })).toHaveAttribute('data-status', 'active');
    // The other two seeded listings may already have been decided by the
    // integration suite, which shares this database; only their presence is fixed.
    for (const name of ['Ooty Lakeview Cafe', 'Kotagiri Spice Trail Homestay']) {
      await expect(page.getByTestId('owner-listing').filter({ hasText: name }).getByTestId('listing-status')).toBeVisible();
    }
    await expectAccessible(page);
  });

  test('B01 explains eligibility, verification and data use, and offers Tamil', async ({ page }) => {
    await page.goto('/business/new');
    await expect(page.getByRole('heading', { name: /who can list/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /how verification works/i })).toBeVisible();
    await expect(page.getByText(/never shown to travellers/i).first()).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'தமிழ்' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/பட்டியலிடுங்கள்/);
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/List your business/);
  });

  test('B01–B04: a new listing is saved as it is typed, previewed, and sent for review', async ({ page }) => {
    const name = `Hilltop Pickles ${Date.now().toString(36)}`;

    await page.goto('/business/new');
    await page.getByRole('textbox', { name: 'Business name' }).fill(name);
    await page.getByRole('button', { name: 'Start listing' }).click();
    await expect(page).toHaveURL(/\/business\/[0-9a-f-]+\/details$/);

    await page.getByRole('combobox', { name: 'Category' }).selectOption('shop');
    await page.getByRole('textbox', { name: 'Street address' }).fill('7 Market Road');
    await page.getByRole('textbox', { name: 'PIN code' }).fill('643101');
    await page.getByRole('textbox', { name: 'Latitude' }).fill('11.3530');
    await page.getByRole('textbox', { name: 'Longitude' }).fill('76.7960');
    await page.getByRole('textbox', { name: 'Phone travellers can call' }).fill('98430 12345');
    await page.getByRole('textbox', { name: 'Person responsible for the listing' }).fill('K. Meena');
    // Open on Mondays: a new draft starts with every day closed.
    await page.getByRole('checkbox', { name: 'Closed' }).first().uncheck();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');

    // A mistyped PIN is named; everything else stays saved.
    await page.getByRole('textbox', { name: 'PIN code' }).fill('64');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    await expect(page.getByText('A PIN code is six digits.')).toBeVisible();
    await page.getByRole('textbox', { name: 'PIN code' }).fill('643101');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    await expectAccessible(page);

    // Survives a reload: progress is saved, not held in the page.
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Street address' })).toHaveValue('7 Market Road');

    await page.getByRole('button', { name: 'Continue to evidence' }).click();
    await expect(page.getByTestId('evidence-privacy')).toBeVisible();
    await expect(page.getByTestId('accepted-files')).toContainText('5 MB');
    await expectAccessible(page);

    // A file that is not an accepted type is refused before it is sent.
    await page.getByTestId('uploader-registration').locator('input[type=file]').setInputFiles({
      name: 'licence.html',
      mimeType: 'text/html',
      buffer: Buffer.from('<script>alert(1)</script>'),
    });
    await expect(page.getByTestId('uploader-registration').getByRole('alert')).toBeVisible();

    for (const kind of ['registration', 'address_proof']) {
      await page.getByTestId(`uploader-${kind}`).locator('input[type=file]').setInputFiles({ name: `${kind}.png`, mimeType: 'image/png', buffer: PNG });
      await expect(page.getByTestId(`uploader-${kind}`).getByRole('link', { name: `${kind}.png` })).toBeVisible();
    }

    await page.getByRole('link', { name: 'Continue to preview' }).click();
    await expect(page.getByTestId('listing-preview').getByRole('heading', { name })).toBeVisible();
    await expect(page.getByTestId('critical-gap')).toHaveCount(0);
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Send for review' }).click();
    await expect(page.getByTestId('listing-status')).toHaveText(/in review/i);
  });

  test('B04 marks trust-critical gaps where a traveller would look', async ({ page }) => {
    await page.goto('/business/new');
    await page.getByRole('textbox', { name: 'Business name' }).fill(`Empty Stall ${Date.now().toString(36)}`);
    await page.getByRole('button', { name: 'Start listing' }).click();
    await expect(page).toHaveURL(/\/details$/);

    await page.goto(page.url().replace(/details$/, 'preview'));
    await expect(page.getByTestId('missing-phone')).toBeVisible();
    await expect(page.getByTestId('missing-location')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send for review' })).toBeDisabled();
  });

  test('B05 counts traveller actions without calling them sales, and takes a report response', async ({ page }) => {
    await openListing(page, 'Badaga Home Kitchen');

    await expect(page.getByTestId('activity-disclaimer')).toContainText(/not bookings or sales/);
    await expect(page.getByTestId('activity').locator('[data-metric="saves"]')).toContainText('Not measured');
    await expect(page.locator('main')).not.toContainText(/\brevenue\b/i);
    await expectAccessible(page);

    const report = page.getByTestId('owner-report').filter({ hasText: 'ragi mudde' });
    const textbox = report.getByRole('textbox', { name: 'Your response' });
    if (await textbox.count()) {
      await textbox.fill('Ragi mudde is served on weekdays only. The menu board now says so.');
      await report.getByRole('button', { name: 'Send response' }).click();
      await expect(report.getByRole('status')).toContainText(/sent to the operations team/);
    } else {
      await expect(report).toContainText('Your response');
    }
  });

  test('B06 closure applies at once and travellers see it', async ({ page }) => {
    await openListing(page, 'Badaga Home Kitchen');
    await page.getByRole('link', { name: 'Update listing' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Update your listing' })).toBeVisible();
    await expect(page).toHaveTitle(/Update listing/);
    await expectAccessible(page);

    const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
    const closure = page.getByRole('form', { name: 'Temporary closure' });
    await closure.getByLabel('First closed day').fill(today);
    await closure.getByLabel('Last closed day').fill(today);
    await closure.getByLabel(/note for travellers/i).fill('Closed for a family wedding.');
    await closure.getByRole('button', { name: 'Save closure' }).click();
    await expect(closure.getByRole('status')).toContainText(/saved/i);

    await page.goto('/businesses/badaga-home-kitchen');
    await expect(page.getByTestId('temporary-closure')).toContainText('family wedding');

    // Put it back for the rest of the suite.
    await page.goBack();
    await page.getByRole('form', { name: 'Temporary closure' }).getByRole('button', { name: 'Remove closure' }).click();
    await expect(page.getByRole('form', { name: 'Temporary closure' }).getByRole('status')).toContainText(/saved/i);
  });
});

test('another account gets a not-found page for someone else’s listing', async ({ page }) => {
  await signIn(page, 'owner');
  await page.goto('/business');
  await page.getByTestId('owner-listing').filter({ hasText: 'Badaga Home Kitchen' }).click();
  await expect(page).toHaveURL(/\/business\/[0-9a-f-]{36}$/);
  const url = page.url();

  await signIn(page, 'traveler');
  await page.goto('/');
  const response = await page.goto(url);
  expect(response?.status()).toBe(404);
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});

test('a guest is asked to sign in', async ({ page }) => {
  await page.goto('/business');
  await expect(page.getByRole('heading', { name: /sign in to manage a business/i })).toBeVisible();
});

test('evidence is readable only by its owner, and always as a download', async ({ page }) => {
  await signIn(page, 'owner');
  const csrf = async () => (await page.context().cookies()).find((cookie) => cookie.name === 'dd_csrf')?.value ?? '';

  const started = await page.request.post('/api/v1/business/listings', {
    data: { name: `Evidence Stall ${Date.now().toString(36)}`, destinationSlug: 'coonoor-valley' },
    headers: { 'x-csrf-token': await csrf(), 'idempotency-key': `e2e-${Date.now()}` },
  });
  expect(started.status()).toBe(201);
  const { id } = (await started.json()) as { id: string };

  await page.request.patch(`/api/v1/business/listings/${id}`, { data: { category: 'shop' }, headers: { 'x-csrf-token': await csrf() } });
  const uploaded = await page.request.post(`/api/v1/business/listings/${id}/files`, {
    multipart: { purpose: 'evidence', evidenceKind: 'registration', file: { name: 'gst.png', mimeType: 'image/png', buffer: PNG } },
    headers: { 'x-csrf-token': await csrf() },
  });
  expect(uploaded.status()).toBe(201);
  const { file } = (await uploaded.json()) as { file: { id: string } };

  const own = await page.request.get(`/api/v1/business/files/${file.id}`);
  expect(own.status()).toBe(200);
  expect(own.headers()['content-disposition']).toMatch(/^attachment/);
  expect(own.headers()['x-content-type-options']).toBe('nosniff');

  // A file claiming to be an image but containing markup is refused.
  const disguised = await page.request.post(`/api/v1/business/listings/${id}/files`, {
    multipart: { purpose: 'photo', file: { name: 'front.png', mimeType: 'image/png', buffer: Buffer.from('<svg onload=alert(1)>') } },
    headers: { 'x-csrf-token': await csrf() },
  });
  expect(disguised.status()).toBe(400);

  await signIn(page, 'traveler');
  expect((await page.request.get(`/api/v1/business/files/${file.id}`)).status()).toBe(404);
});
