import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { ANALYTICS_URL, expect, site, test } from './fixtures';

// The privacy policy, the FAQ and the changelog as pages of the app (docs/ui-migration-plan.md,
// Phase 2.7): the documents of docs/ converted at build time, in English, prerendered, with the top
// bar, the legal footer and the consent banner. No accessibility violations.

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.length} element(s) (${v.help}) ${v.nodes[0].target.join(' ')}`);
}

const pages = [
  ['/privacy', 'Privacy policy', /^What data Spraydown processes and why/],
  ['/faq', 'Frequently asked questions', /^Answers about mouse sensitivity/],
  ['/changelog', 'Changelog', /^What changed in Spraydown/],
] as const;

test('shows the privacy policy, the FAQ and the changelog', async ({ page }) => {
  for (const [path, title, description] of pages) {
    await page.goto(path);
    await expect(page).toHaveTitle(`${site.name} · ${title}`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', description);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(10, 12, 15)');
    // In English only: the navigation, but no language select
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveCount(3);
    await expect(page.getByRole('combobox', { name: 'Language' })).toHaveCount(0);
    expect(await violations(page), `accessibility violations on ${path}`).toEqual([]);
  }

  // A section can be linked to, and a link to a developer document keeps only its text
  await page.goto('/faq#controller-support');
  await expect(page.getByRole('heading', { level: 2, name: 'Controller support' })).toBeInViewport();
  await expect(page.getByRole('link', { name: 'capture guide' })).toHaveCount(0);
  await expect(page.getByRole('table')).toContainText('Steam controller');
});

test('links its own pages in place and asks for consent', async ({ page }) => {
  await page.route(/^https:\/\/(www\.googletagmanager\.com|[\w.-]*google-analytics\.com)\//, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: '' }),
  );
  await page.goto(`${ANALYTICS_URL}/changelog`);
  await expect(page.getByRole('dialog', { name: 'Analytics cookies' })).toBeVisible();
  // site.json points to the app's own privacy page, which opens in the same tab
  const privacy = page.getByRole('navigation', { name: 'Legal and help' }).getByRole('link', { name: 'Privacy' });
  await expect(privacy).toHaveAttribute('href', '/privacy');
  await expect(privacy).not.toHaveAttribute('target');
});

test('answers an unknown address with the 404 page', async ({ page, problems }) => {
  const response = await page.goto('/no-such-page');
  expect(response?.status()).toBe(404);
  // The failed request this test expects, and the console error Chrome logs for it
  for (const expected of [/^HTTP 404 .*\/no-such-page$/, /^console error: Failed to load resource: .* 404 /]) {
    const i = problems.findIndex((problem) => expected.test(problem));
    if (i >= 0) problems.splice(i, 1);
  }
  await expect(page).toHaveTitle(`${site.name} · Page not found`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to the trainer' })).toHaveAttribute('href', '/');
  expect(await violations(page), 'accessibility violations on the 404 page').toEqual([]);
});

test('answers a request the server fails with the error page', async ({ page, problems }) => {
  // An address that can't be decoded fails in the router, with status 400
  const response = await page.goto('/%E0%A4%A');
  expect(response?.status()).toBe(400);
  for (const expected of [/^HTTP 400 /, /^console error: Failed to load resource: .* 400 /]) {
    const i = problems.findIndex((problem) => expected.test(problem));
    if (i >= 0) problems.splice(i, 1);
  }
  await expect(page).toHaveTitle(`${site.name} · Something went wrong`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to the trainer' })).toHaveAttribute('href', '/');
  expect(await violations(page), 'accessibility violations on the error page').toEqual([]);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows the prerendered documents', async ({ page }) => {
    for (const [path, title] of pages) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    }
    await expect(page.getByRole('heading', { level: 2, name: 'Before Spraydown' })).toBeVisible();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('fits the screen, with wide tables scrolling in their own box', async ({ page }) => {
    await page.goto('/faq');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    const table = page.getByRole('table');
    expect(await table.evaluate((t) => t.scrollWidth > t.clientWidth)).toBe(true);
    await expect(table).toHaveAttribute('tabindex', '0');
    expect(await violations(page), 'accessibility violations on a phone').toEqual([]);
  });
});
