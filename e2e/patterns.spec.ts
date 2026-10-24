import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, site, specs, storage, test } from './fixtures';

// The Patterns page at /patterns (docs/ui-migration-plan.md, Phase 2.2): every weapon's pattern
// at one scale, the selected one large with Play spray, its magazines and fire modes, and the way to
// the trainer; phones get the pattern viewer. As on every new page, no accessibility violations.

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.length} element(s) (${v.help}) ${v.nodes[0].target.join(' ')}`);
}

const library = (page: Page) => page.getByRole('radiogroup', { name: 'Weapon', exact: true });
const card = (page: Page, name: string) => library(page).getByRole('radio', { name: new RegExp(`^${name} \\d`) });
const detail = (page: Page, name: string) => page.getByRole('complementary', { name: `${name} pattern` });
const rounds = (weapon: string, mag: number) => specs.find((s) => s.name === weapon)!.mags[mag].size;

test('shows every weapon and the selected one large', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Patterns' }).click();
  await expect(page).toHaveURL(/\/patterns$/);
  await expect(page).toHaveTitle(`${site.name} · Recoil patterns`);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(10, 12, 15)');
  await expect(page.getByRole('link', { name: 'Patterns' })).toHaveAttribute('aria-current', 'page');
  await expect(library(page).getByRole('radio')).toHaveCount(specs.length);
  await expect(card(page, 'R-99')).toHaveAttribute('aria-checked', 'true');
  await expect(
    detail(page, 'R-99').getByRole('img', { name: `R-99 recoil pattern, ${rounds('r99', 0)} rounds` }),
  ).toBeVisible();
  expect(await violations(page), 'accessibility violations').toEqual([]);

  // Picking a pattern picks the weapon, as in the trainer
  await card(page, 'R-301').click();
  await expect(card(page, 'R-301')).toHaveAttribute('aria-checked', 'true');
  await expect(detail(page, 'R-301')).toBeVisible();
  expect(await storage(page, 'game::weapon')).toEqual({ 'game::weapon': 'r301' });

  // Every pattern shares one frame, so their start points line up and short bursts stay small
  const frames = await library(page)
    .locator('svg')
    .evaluateAll((svgs) => [...new Set(svgs.map((svg) => svg.getAttribute('viewBox')))]);
  expect(frames).toHaveLength(1);

  // The classes filter the library
  await page.getByRole('radiogroup', { name: 'Weapon class' }).getByRole('radio', { name: /^SMG/ }).click();
  expect(
    await library(page)
      .getByRole('radio')
      .evaluateAll((cards) => cards.map((c) => c.dataset.weapon)),
  ).toEqual(['alternator', 'prowler', 'r99', 'volt', 'car']);
});

test('switches magazines and fire modes, and plays the spray', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-24T12:00:00Z') });
  await page.goto('/patterns');
  await card(page, 'Prowler').click();
  const prowler = detail(page, 'Prowler');
  await prowler.getByRole('radiogroup', { name: 'Fire mode' }).getByRole('radio', { name: 'Burst' }).click();
  await prowler
    .getByRole('radiogroup', { name: 'Magazine' })
    .getByRole('radio', { name: `Level 2 magazine, ${rounds('prowler', 2)} rounds` })
    .click();
  expect(await storage(page, 'game::')).toMatchObject({
    'game::weapon': 'prowler',
    'game::fire-mode': 'burst',
    'game::mag': '2',
  });
  const pattern = prowler.getByRole('img', { name: `Prowler recoil pattern, ${rounds('prowler', 2)} rounds` });
  await expect(pattern).toBeVisible();

  // Play spray: the rounds appear as they fire, then the whole pattern stays (the start ring and a dot
  // per round)
  const all = rounds('prowler', 2) + 1;
  await expect(pattern.locator('circle')).toHaveCount(all);
  await page.clock.pauseAt(new Date('2026-10-24T12:01:00Z'));
  await prowler.getByRole('button', { name: 'Play spray' }).click();
  await page.clock.runFor(200);
  const playing = await pattern.locator('circle').count();
  expect(playing).toBeGreaterThan(1);
  expect(playing).toBeLessThan(all);
  await page.clock.runFor(10_000);
  await expect(pattern.locator('circle')).toHaveCount(all);
});

test('goes to the trainer with the weapon picked', async ({ page }) => {
  await page.goto('/patterns');
  await card(page, 'Flatline').click();
  await detail(page, 'Flatline').getByRole('link', { name: 'Practice with this weapon' }).click();
  await expect(page).toHaveURL(/:3210\/$/);
  await expect(
    page.getByRole('radiogroup', { name: 'Weapon', exact: true }).getByRole('radio', { name: /^Flatline \d/ }),
  ).toHaveAttribute('aria-checked', 'true');
});

test('serves the Russian and Chinese pages', async ({ page }) => {
  await page.goto('/ru/patterns');
  await expect(page).toHaveTitle(`${site.name} · Паттерны отдачи`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByRole('link', { name: 'Паттерны' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('complementary', { name: 'Паттерн: R-99' })).toBeVisible();
  expect(await violations(page), 'accessibility violations in Russian').toEqual([]);

  await page.goto('/zh-CN/patterns');
  await expect(page).toHaveTitle(`${site.name} · 后坐力弹道`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('link', { name: '弹道图' })).toHaveAttribute('aria-current', 'page');

  // The language select keeps the page
  await page.getByRole('combobox', { name: '语言' }).click();
  await page.getByRole('option', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/patterns$/);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows the prerendered page in each language', async ({ page }) => {
    for (const [path, title, description] of [
      ['/patterns', 'Recoil patterns', /^The recoil pattern of every Apex Legends weapon/],
      ['/ru/patterns', 'Паттерны отдачи', /^Паттерн отдачи каждого оружия Apex Legends/],
      ['/zh-CN/patterns', '后坐力弹道', /^Apex Legends 每把武器/],
    ] as const) {
      await page.goto(path);
      await expect(page).toHaveTitle(`${site.name} · ${title}`);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', description);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    }
    await page.goto('/patterns');
    await expect(library(page).getByRole('radio')).toHaveCount(specs.length);
    await expect(detail(page, 'R-99').getByRole('img', { name: /^R-99 recoil pattern/ })).toBeVisible();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('shows the pattern viewer', async ({ page }) => {
    await page.goto('/patterns');
    await expect(page.getByRole('heading', { level: 1, name: 'Recoil patterns for every weapon' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'R-99 pattern' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    expect(await violations(page), 'accessibility violations on a phone').toEqual([]);

    // The language select keeps the page
    await page.getByRole('combobox', { name: 'Language' }).click();
    await page.getByRole('option', { name: 'Русский' }).click();
    await expect(page).toHaveURL(/\/ru\/patterns$/);
  });
});
