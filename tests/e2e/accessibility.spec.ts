import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Accessibility sweep — PRD Part I §11 requires WCAG 2.2 AA, visible keyboard
 * focus, semantic landmarks, 200% text zoom without loss of content, and
 * 44×44 CSS pixel touch targets.
 *
 * Failures here are fixed in the source, never by loosening the assertion.
 */

const PAGES = [
  '/',
  '/explore',
  '/dream-ai',
  '/destinations/ooty-nilgiris',
  '/places/sandynalla-viewpoint',
  '/places/mukurthi-trail/rules',
  '/places/ooty-botanical-garden/story',
  '/businesses/nilgiri-tea-collective',
  '/help',
  '/trips',
  '/profile',
];

for (const path of PAGES) {
  test(`${path} has no critical or serious accessibility violations`, async ({ page }) => {
    await page.goto(path);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );

    expect(
      blocking.map((violation) => `${violation.id}: ${violation.nodes[0]?.html ?? ''}`),
    ).toEqual([]);
  });

  test(`${path} survives 200% text zoom without horizontal scrolling`, async ({ page }) => {
    await page.goto(path);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    // One pixel of slack for sub-pixel rounding; anything more is a real
    // horizontal scroll, which §11 forbids.
    expect(overflow, `${path} scrolls horizontally at 200% text`).toBeLessThanOrEqual(1);
  });
}

test('every interactive target on Home is at least 44 by 44 CSS pixels', async ({ page }) => {
  await page.goto('/');

  const small = await page.evaluate(() => {
    const targets = [...document.querySelectorAll('button, a[data-touch-target], [role="button"]')];

    return targets
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        // Ignore anything not actually rendered.
        if (rect.width === 0 && rect.height === 0) return false;
        return rect.width < 44 || rect.height < 44;
      })
      .map((element) => `${element.tagName}: ${element.textContent?.trim().slice(0, 30)}`);
  });

  expect(small).toEqual([]);
});

test('the planning entry is above the fold at 360 by 800', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');

  // PRD Part I T01 acceptance criterion, stated at exactly this size.
  await expect(page.getByRole('textbox').first()).toBeInViewport();
  await expect(page.getByRole('button', { name: /start planning/i })).toBeInViewport();
});

test('keyboard focus is visible and the skip link works', async ({ page }) => {
  await page.goto('/');

  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toBeVisible();

  // The first stop should be the skip link, per §11's landmark requirements.
  await expect(focused).toHaveText(/skip to content/i);
});

test('every page exposes a main landmark and one level-one heading', async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);

    await expect(page.locator('main'), `${path} has a main landmark`).toHaveCount(1);
    await expect(page.locator('h1'), `${path} has exactly one h1`).toHaveCount(1);
  }
});

test('crowd status never relies on colour alone', async ({ page }) => {
  await page.goto('/places/ooty-botanical-garden');

  const badge = page.getByTestId('crowd-status').first();
  await expect(badge).toBeVisible();

  // A text label and an icon with an accessible name, beside the colour.
  await expect(badge.getByTestId('crowd-label')).not.toBeEmpty();
  await expect(badge.getByRole('img')).toBeVisible();
});
