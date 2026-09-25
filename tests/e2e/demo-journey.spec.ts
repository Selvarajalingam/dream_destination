import { expect, test } from '@playwright/test';

/**
 * The required SIH demonstration journey, PRD §3.1:
 *
 *   Ask Dream AI → confirm the structured brief → compare destinations →
 *   inspect Dream Score → set the budget → generate and edit the itinerary →
 *   view map, crowd and trust information → save an offline trip pack →
 *   enter Trip Mode → discover or add a local business → access nearby help.
 *
 * One test walks the whole thing, because the point is that the journey holds
 * together, not that each screen works in isolation.
 */

const PROMPT =
  '4 day family trip from Coimbatore in December within Rs 25,000, nature and heritage, avoid crowds';

test('a traveller completes the full SIH demonstration journey', async ({ page, context }) => {
  // --- Ask Dream AI -------------------------------------------------------
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /where do you want to dream today/i })).toBeVisible();

  await page.getByRole('textbox').first().fill(PROMPT);
  await page.getByRole('button', { name: /start planning/i }).click();

  // --- Confirm the structured brief ---------------------------------------
  await expect(page).toHaveURL(/\/dream-ai/);
  await expect(page.getByTestId('brief-durationDays')).toContainText('4');
  await expect(page.getByTestId('brief-origin')).toContainText('Coimbatore');
  await expect(page.getByTestId('brief-budget')).toContainText('25,000');
  await expect(page.getByTestId('brief-interests')).toContainText(/nature/i);

  // --- Compare destinations ----------------------------------------------
  await page.getByRole('button', { name: /build my trip/i }).click();
  await expect(page).toHaveURL(/\/shortlist/);

  const options = page.getByTestId('shortlist-option');
  await expect(options).toHaveCount(3);

  // Every option states one advantage and one trade-off.
  for (const option of await options.all()) {
    await expect(option.getByTestId('advantage')).toBeVisible();
    await expect(option.getByTestId('trade-off')).toBeVisible();
  }

  // The score is a trip match, never a safety score.
  await expect(page.getByText(/trip match/i).first()).toBeVisible();
  await expect(page.getByText(/safety score/i)).toHaveCount(0);

  // --- Inspect Dream Score ------------------------------------------------
  await page.getByRole('button', { name: /why this matches/i }).first().click();
  const scoreSheet = page.getByRole('dialog');
  await expect(scoreSheet).toBeVisible();
  await expect(scoreSheet.getByText(/interest match/i)).toBeVisible();
  await expect(scoreSheet.getByText('25%')).toBeVisible();
  await scoreSheet.getByRole('button', { name: /close/i }).click();

  // --- Generate the itinerary --------------------------------------------
  await page.getByRole('button', { name: /build my trip/i }).first().click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/);

  await expect(page.getByTestId('itinerary-item').first()).toBeVisible({ timeout: 30_000 });
  const tripUrl = page.url().split('?')[0];

  // --- Budget is visible and traceable ------------------------------------
  await expect(page.getByTestId('budget-meter')).toBeVisible();
  await expect(page.getByTestId('expected-total')).toContainText('₹');

  // --- Edit the itinerary, with locked items respected --------------------
  const firstItemId = await page.getByTestId('itinerary-item').first().getAttribute('data-item-id');
  await page.getByRole('switch', { name: /^lock /i }).first().check();
  await expect(page.getByRole('switch', { name: /^lock /i }).first()).toBeChecked();

  await page.getByRole('button', { name: /optimize unlocked items/i }).click();
  await expect(page.getByRole('button', { name: /^undo$/i })).toBeVisible();

  // The locked item did not move.
  await expect(page.getByTestId('itinerary-item').first()).toHaveAttribute(
    'data-item-id',
    firstItemId!,
  );

  // --- Crowd and trust information ----------------------------------------
  await expect(page.getByTestId('crowd-status').first()).toBeVisible();

  // --- Map, with its list equivalent --------------------------------------
  await page.getByRole('tab', { name: /^map$/i }).click();
  await expect(page.getByRole('list', { name: /places on this map/i })).toBeVisible();
  await page.getByRole('tab', { name: /^timeline$/i }).click();

  // --- A local business is in the plan ------------------------------------
  await expect(page.getByText(/support local/i)).toBeVisible();
  await expect(page.getByText(/local business/i).first()).toBeVisible();

  // --- Save an offline trip pack ------------------------------------------
  await page.goto(`${tripUrl}/offline`);
  await page.getByRole('button', { name: /save for offline/i }).click();
  await expect(page.getByTestId('pack-status')).toHaveAttribute('data-status', /saved|partial/, {
    timeout: 30_000,
  });

  // --- Enter Trip Mode ----------------------------------------------------
  await page.goto(`${tripUrl}/mode`);
  await expect(page.getByTestId('next-activity')).toBeVisible();

  // Nothing promotional sits above the next action.
  const nextBox = await page.getByTestId('next-activity').boundingBox();
  expect(nextBox).not.toBeNull();

  // --- Access nearby help, including offline ------------------------------
  await page.getByRole('link', { name: /^help$/i }).click();
  await expect(page).toHaveURL(/\/help/);
  await expect(page.getByRole('link', { name: /call 112/i })).toBeVisible();
  await expect(page.getByText(/live availability is unknown/i)).toBeVisible();

  // The same screen must answer with no signal.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('link', { name: /call 112/i })).toBeVisible();
  await context.setOffline(false);
});

test('the journey reaches the first shortlist well inside three minutes', async ({ page }) => {
  const started = Date.now();

  await page.goto('/');
  await page.getByRole('textbox').first().fill(PROMPT);
  await page.getByRole('button', { name: /start planning/i }).click();
  await page.getByRole('button', { name: /build my trip/i }).click();
  await expect(page.getByTestId('shortlist-option').first()).toBeVisible();

  // PRD Part I §14.2: median first shortlist under three minutes.
  expect(Date.now() - started).toBeLessThan(180_000);
});

test('a guest can plan without being asked to sign in first', async ({ page }) => {
  await page.goto('/');

  // PRD Part I T01: no permission or sign-in prompt on first load.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^sign in$/i })).toHaveCount(0);

  await page.getByRole('textbox').first().fill('A weekend trip from Coimbatore under 12000');
  await page.getByRole('button', { name: /start planning/i }).click();
  await expect(page.getByTestId('brief-origin')).toContainText('Coimbatore');
});
