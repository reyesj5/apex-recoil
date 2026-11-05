import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { CHECKED_ONLY_URL, expect, patch, shownSpecs, site, storage, test } from './fixtures';

// The pages as production serves them: only the weapons checked against the current game patch (owner,
// 2026-11-04: "Hide any weapon not checked against the patches"). The other scenarios run on the preview
// (e2e/server.mjs). Today nothing is checked, so the pages say so; once a weapon is, they offer exactly
// those. These cases follow client/specs.json, and client/trainer/no-weapons.test.tsx keeps the
// empty pages tested whatever it holds.

test.use({ baseURL: CHECKED_ONLY_URL });

const checked = shownSpecs.filter((s) => s.checked_patch === patch.current).map((s) => s.name);
const pages = [
  ['/', 'en', 'No weapons to show yet'],
  ['/ru', 'ru', 'Пока нет доступного оружия'],
  ['/zh-CN', 'zh-CN', '暂无可用武器'],
  ['/patterns', 'en', 'No weapons to show yet'],
  ['/ru/patterns', 'ru', 'Пока нет доступного оружия'],
  ['/zh-CN/patterns', 'zh-CN', '暂无可用武器'],
] as const;

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.length} element(s) (${v.help}) ${v.nodes[0].target.join(' ')}`);
}

const tiles = (page: Page) => page.locator('[data-weapon]');

async function expectOffered(page: Page, heading: string) {
  if (checked.length === 0) {
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(tiles(page)).toHaveCount(0);
  } else {
    await expect(tiles(page)).toHaveCount(checked.length);
    const offered = await tiles(page).evaluateAll((all) => all.map((t) => t.getAttribute('data-weapon')));
    expect(offered.sort()).toEqual([...checked].sort());
  }
}

test('offers only the weapons checked against the current patch', async ({ page }) => {
  for (const [path, , heading] of pages) {
    await page.goto(path);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(10, 12, 15)');
    await expectOffered(page, heading);
    expect(await violations(page), `accessibility violations on ${path}`).toEqual([]);
  }
});

test('keeps the Studio within reach on the trainer, and everything still works', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(`${site.name} · Recoil trainer for Apex Legends`);
  await expect(page.getByRole('link', { name: 'Recoil Studio' })).toHaveAttribute('href', '/editor');
  await expect(page.getByRole('button', { name: /^Search weapons/ })).toHaveCount(checked.length === 0 ? 0 : 1);
  // Ctrl K opens nothing while there is nothing to search
  if (checked.length === 0) {
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Patterns' }).click();
  await expect(page).toHaveURL(/\/patterns$/);
});

test('leaves a stored weapon and its settings alone, to use when it is back', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('game::weapon', 'r301'));
  await page.goto('/');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(10, 12, 15)');
  expect(await storage(page, 'game::weapon')).toEqual({ 'game::weapon': 'r301' });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('says the same in the prerendered page, in each language', async ({ page }) => {
    for (const [path, lang, heading] of pages) {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expectOffered(page, heading);
    }
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('says the same, and fits the screen', async ({ page }) => {
    for (const path of ['/', '/patterns']) {
      await page.goto(path);
      if (checked.length === 0) {
        await expect(page.getByRole('heading', { level: 1, name: 'No weapons to show yet' })).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
      expect(await violations(page), `accessibility violations on ${path}`).toEqual([]);
    }
  });
});
