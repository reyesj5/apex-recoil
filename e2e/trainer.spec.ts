import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ANALYTICS_URL, expect, root, site, specs, storage, test } from './fixtures';

// The trainer at /, /ru and /zh-CN (docs/ui-migration-plan.md, Phase 2): the previous trainer's
// scenarios, asserting on the same data (stored settings and scores); the runs recorded from the
// previous trainer replayed through the range; and, as on every new page, no accessibility
// violations at all.

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.length} element(s) (${v.help}) ${v.nodes[0].target.join(' ')}`);
}

const weaponGrid = (page: Page) => page.getByRole('radiogroup', { name: 'Weapon', exact: true });
const weapon = (page: Page, name: string) => weaponGrid(page).getByRole('radio', { name: new RegExp(`^${name} \\d`) });
const fireModes = (page: Page) => page.getByRole('radiogroup', { name: 'Fire mode' });
const magazines = (page: Page) => page.getByRole('radiogroup', { name: 'Magazine' });
const range = (page: Page) => page.getByRole('region', { name: 'Practice range' });

const google = /^https:\/\/(www\.googletagmanager\.com|[\w.-]*google-analytics\.com)\//;
const consentBanner = (page: Page) => page.getByRole('dialog', { name: 'Analytics cookies' });
/** The stored consent choice: 'granted', 'denied' or undefined */
const consent = async (page: Page) =>
  (JSON.parse((await storage(page, 'consent:analytics'))['consent:analytics'] ?? '{}') as { choice?: string }).choice;

test('lists every weapon and selects one', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(`${site.name} · Recoil trainer for Apex Legends`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  // The stylesheet reached the page (a missing one would be served the trainer's HTML)
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(10, 12, 15)');
  await expect(weaponGrid(page).getByRole('radio')).toHaveCount(specs.length);
  await expect(weapon(page, 'R-99')).toHaveAttribute('aria-checked', 'true');
  const session = page.getByRole('complementary', { name: 'Session' });
  await expect(session.getByText('Your first run today shows up here.')).toBeVisible();

  await weapon(page, 'R-301').click();
  await expect(weapon(page, 'R-301')).toHaveAttribute('aria-checked', 'true');
  await expect(weapon(page, 'R-99')).toHaveAttribute('aria-checked', 'false');
  expect(await storage(page, 'game::weapon')).toEqual({ 'game::weapon': 'r301' });
  expect(await violations(page), 'accessibility violations').toEqual([]);
});

test('filters weapons by search and class', async ({ page }) => {
  await page.goto('/');
  const shown = weaponGrid(page).getByRole('radio');
  await page.getByRole('searchbox', { name: 'Filter weapons' }).fill('r9');
  await expect(shown).toHaveCount(1);
  await expect(shown).toHaveAttribute('data-weapon', 'r99');
  await page.getByRole('searchbox', { name: 'Filter weapons' }).fill('');
  await expect(shown).toHaveCount(specs.length);

  const classes = page.getByRole('radiogroup', { name: 'Weapon class' });
  await classes.getByRole('radio', { name: /^SMG/ }).click();
  await expect(classes.getByRole('radio', { name: /^SMG/ })).toHaveAttribute('aria-checked', 'true');
  expect(await shown.evaluateAll((tiles) => tiles.map((t) => t.getAttribute('data-weapon')))).toEqual([
    'alternator',
    'prowler',
    'r99',
    'volt',
    'car',
  ]);
  await classes.getByRole('radio', { name: /^All/ }).click();
  await expect(shown).toHaveCount(specs.length);
});

test('switches fire modes, magazines and attachments', async ({ page }) => {
  await page.goto('/');

  // The Prowler fires bursts or full auto and keeps the R-99's auto; B toggles between them
  await weapon(page, 'Prowler').click();
  await expect(fireModes(page).getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
  await expect(fireModes(page).getByRole('radio', { name: 'Single' })).toHaveCount(0);
  await fireModes(page).getByRole('radio', { name: 'Burst' }).click();
  await expect(fireModes(page).getByRole('radio', { name: 'Burst' })).toHaveAttribute('aria-checked', 'true');
  expect(await storage(page, 'game::fire-mode')).toEqual({ 'game::fire-mode': 'burst' });
  await page.locator('body').press('b');
  await expect(fireModes(page).getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');

  // The Hemlok has no full auto, so it falls back to its bursts
  await weapon(page, 'Hemlok').click();
  await expect(fireModes(page).getByRole('radio', { name: 'Burst' })).toHaveAttribute('aria-checked', 'true');
  await expect(fireModes(page).getByRole('radio', { name: 'Auto' })).toHaveCount(0);

  // Magazines show the R-301's capacities; the corrupted stock takes 4 rounds off each
  const r301 = specs.find((s) => s.name === 'r301')!;
  await weapon(page, 'R-301').click();
  await expect(magazines(page).getByRole('radio')).toHaveCount(r301.mags.length);
  const level2 = magazines(page).getByRole('radio', { name: /^Level 2 magazine/ });
  await level2.click();
  await expect(level2).toHaveAttribute('aria-checked', 'true');
  await expect(level2).toHaveAccessibleName(`Level 2 magazine, ${r301.mags[2].size} rounds`);
  await page.getByRole('switch', { name: 'Corrupted stock' }).click();
  await expect(page.getByRole('switch', { name: 'Corrupted stock' })).toHaveAttribute('aria-checked', 'true');
  await expect(level2).toHaveAccessibleName(`Level 2 magazine, ${r301.mags[2].size - 4} rounds`);

  // Only the Rampage takes a thermite grenade
  await expect(page.getByRole('switch', { name: 'Thermite grenade' })).toHaveCount(0);
  await weapon(page, 'Rampage').click();
  await page.getByRole('switch', { name: 'Thermite grenade' }).click();
  await expect(page.getByRole('switch', { name: 'Thermite grenade' })).toHaveAttribute('aria-checked', 'true');
  expect(await storage(page, 'game::mods')).toEqual({ 'game::mods': 'revved_up' });
});

test('keeps the settings across a reload', async ({ page }) => {
  await page.goto('/');
  await weapon(page, 'R-301').click();
  await magazines(page)
    .getByRole('radio', { name: /^Level 3 magazine/ })
    .click();
  await fireModes(page).getByRole('radio', { name: 'Single' }).click();
  await page.getByRole('radio', { name: 'Moving target' }).click();
  await page.getByRole('radio', { name: 'Lines' }).click();
  await page.getByRole('button', { name: 'Mute sounds' }).click();
  // Invert Y and what the recoil moves, in the settings
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('switch', { name: 'Invert Y' }).click();
  await settings.getByRole('radio', { name: 'The target' }).click();
  await page.keyboard.press('Escape');

  const saved = await storage(page, 'game::');
  expect(saved).toMatchObject({
    'game::weapon': 'r301',
    'game::mag': '3',
    'game::fire-mode': 'single',
    'game::invert-y': 'true',
    'game::moving-target': 'true',
    'game::stationary-target': 'false',
    'game::trace-mode': '2',
    'game::mute': 'true',
  });

  await page.reload();
  expect(await storage(page, 'game::')).toEqual(saved);
  await expect(weapon(page, 'R-301')).toHaveAttribute('aria-checked', 'true');
  await expect(magazines(page).getByRole('radio', { name: /^Level 3 magazine/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(fireModes(page).getByRole('radio', { name: 'Single' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'Moving target' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: 'Lines' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'Mute sounds' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^Sensitivity 5\.0\s*ADS 1\.0×\s*Invert Y on$/ })).toBeVisible();
});

test('scores a full spray and keeps the result', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mute sounds' }).click();

  // Hold the trigger through a whole R-99 magazine (18 rounds at 1080 RPM, about a second)
  const box = (await page.locator('[data-slot="range-canvas"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.waitForTimeout(1600);
  await page.mouse.up();

  const result = page.getByRole('status').filter({ hasText: 'Run complete' });
  await expect(result).toBeVisible();
  await expect(result).toContainText('Your first run today');
  await expect(result).toContainText('R-99 · Base magazine (18) · Follow path');
  const stats = JSON.parse((await storage(page, 'game::stats'))['game::stats']);
  expect(stats).toEqual([expect.objectContaining({ setup: { weapon: 'r99', mag: 0, hint: true, moving: false } })]);
  const points = stats[0].todayResults[0];
  const session = page.getByRole('complementary', { name: 'Session' });
  await expect(
    session.getByRole('img', { name: `Scores of today’s runs, from ${points} to ${points}, best ${points}` }),
  ).toBeVisible();
  expect(await violations(page), 'accessibility violations after a run').toEqual([]);

  // Replay shows the run again; Next run goes back to the pattern
  await result.getByRole('button', { name: 'Replay' }).click();
  await result.getByRole('button', { name: 'Next run' }).click();
  await expect(result).toBeHidden();
  await expect(range(page).getByRole('img', { name: 'R-99 recoil pattern' })).toBeVisible();

  await page.reload();
  await expect(session.getByRole('img', { name: /^Scores of today’s runs/ })).toBeVisible();
});

test('meets WCAG 2.1 A and AA with every overlay open', async ({ page }) => {
  await page.goto('/');
  await expect(weaponGrid(page).getByRole('radio')).toHaveCount(specs.length);
  const cases = [
    { open: () => page.getByRole('button', { name: 'Settings' }).click(), role: 'dialog', name: 'Settings' },
    { open: () => page.getByRole('button', { name: 'Help' }).click(), role: 'dialog', name: 'How to practice' },
    {
      open: () => page.getByRole('button', { name: /^Search weapons/ }).click(),
      role: 'dialog',
      name: 'Search weapons',
    },
    { open: () => page.getByRole('button', { name: /^Sensitivity/ }).click(), role: 'dialog', name: 'Mouse settings' },
  ] as const;
  for (const { open, role, name } of cases) {
    await open();
    const overlay = page.getByRole(role, { name });
    await expect(overlay).toBeVisible();
    // Colors are checked once the overlay has faded in
    await overlay.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    expect(await violations(page), `accessibility violations with "${name}" open`).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();
  }
  // Ctrl K opens the weapon search, and picking a weapon selects it
  await page.locator('body').press('Control+k');
  await page.getByRole('combobox', { name: 'Search weapons' }).fill('flatl');
  await page.keyboard.press('Enter');
  await expect(weapon(page, 'Flatline')).toHaveAttribute('aria-checked', 'true');
});

test('serves the Russian and Chinese pages', async ({ page }) => {
  await page.goto('/ru');
  await expect(page).toHaveTitle(`${site.name} · Тренажёр отдачи для Apex Legends`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByRole('radiogroup', { name: 'Оружие', exact: true }).getByRole('radio')).toHaveCount(
    specs.length,
  );
  await expect(page.getByRole('complementary', { name: 'Сессия' })).toContainText('Попытки');
  expect(await violations(page), 'accessibility violations in Russian').toEqual([]);

  await page.goto('/zh-CN');
  await expect(page).toHaveTitle(`${site.name} · Apex Legends 压枪训练`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('radiogroup', { name: '武器', exact: true }).getByRole('radio')).toHaveCount(
    specs.length,
  );
  await expect(page.getByRole('complementary', { name: '本次练习' })).toContainText('尝试次数');

  // The language select goes to the same page in another language
  await page.getByRole('combobox', { name: '语言' }).click();
  await page.getByRole('option', { name: 'English' }).click();
  await expect(page).toHaveURL(/:3210\/$/);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('shows the pattern viewer instead of the range', async ({ page }) => {
    for (const path of ['/', '/ru', '/zh-CN']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('[data-slot="range-canvas"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    }
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Recoil patterns for every weapon' })).toBeVisible();
    const weapons = page.getByRole('radiogroup', { name: 'Weapon' });
    await weapons.getByRole('radio', { name: 'R-301' }).click();
    await expect(page.getByRole('region', { name: 'R-301 pattern' })).toBeVisible();
    await page.getByRole('button', { name: 'Play spray' }).click();
    expect(await violations(page), 'accessibility violations on a phone').toEqual([]);
  });

  test('asks for consent in a bottom sheet', async ({ page }) => {
    await page.route(google, (route) => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto(`${ANALYTICS_URL}/`);
    const banner = consentBanner(page);
    await expect(banner).toBeVisible();
    for (const name of ['Reject', 'Accept']) {
      expect((await banner.getByRole('button', { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await violations(page), 'accessibility violations with the consent sheet').toEqual([]);
    await banner.getByRole('button', { name: 'Accept' }).click();
    await expect(banner).toBeHidden();
    expect(await consent(page)).toBe('granted');
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows the prerendered page in each language', async ({ page }) => {
    for (const [path, lang, title, description, grid] of [
      [
        '/',
        'en',
        'Recoil trainer for Apex Legends',
        /^Practice the spray pattern of every Apex Legends weapon/,
        'Weapon',
      ],
      ['/ru', 'ru', 'Тренажёр отдачи для Apex Legends', /^Отрабатывайте отдачу каждого оружия Apex Legends/, 'Оружие'],
      ['/zh-CN', 'zh-CN', 'Apex Legends 压枪训练', /^在浏览器中练习 Apex Legends/, '武器'],
    ] as const) {
      await page.goto(path);
      await expect(page).toHaveTitle(`${site.name} · ${title}`);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', description);
      // The pages are live: search engines may index them
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      await expect(page.getByRole('radiogroup', { name: grid, exact: true }).getByRole('radio')).toHaveCount(
        specs.length,
      );
    }
    await page.goto('/');
    await expect(weapon(page, 'R-99')).toHaveAttribute('aria-checked', 'true');
    await expect(range(page)).toContainText('Click and hold anywhere in the range to spray');
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Progress' }),
    ).toHaveAttribute('href', '/progress');
  });
});

test('stays off without a measurement ID', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (req) => requests.push(req.url()));
  await page.goto('/');
  await expect(weaponGrid(page).getByRole('radio')).toHaveCount(specs.length);
  expect(requests.filter((url) => google.test(url))).toEqual([]);
  await expect(consentBanner(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Cookie settings' })).toHaveCount(0);
});

test('loads the Google tag only after consent', async ({ page }) => {
  // Nothing reaches Google: the tag requests are answered here and only counted
  const tagRequests: string[] = [];
  await page.route(google, (route) => {
    tagRequests.push(route.request().url());
    return route.fulfill({ contentType: 'text/javascript', body: '' });
  });
  const banner = consentBanner(page);

  // Reject: the banner goes away for good and no tag loads
  await page.goto(`${ANALYTICS_URL}/`);
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy');
  expect(await violations(page), 'accessibility violations with the consent banner').toEqual([]);
  await banner.getByRole('button', { name: 'Reject' }).click();
  await expect(banner).toBeHidden();
  expect(await consent(page)).toBe('denied');
  await page.reload();
  await expect(weaponGrid(page).getByRole('radio')).toHaveCount(specs.length);
  await expect(banner).toBeHidden();

  // Cookie settings asks again; accepting loads the tag with the configured measurement ID
  await page.getByRole('link', { name: 'Cookie settings' }).click();
  await expect(banner).toBeVisible();
  expect(tagRequests).toEqual([]);
  await banner.getByRole('button', { name: 'Accept' }).click();
  await expect(banner).toBeHidden();
  expect(await consent(page)).toBe('granted');
  await expect.poll(() => tagRequests).toContain('https://www.googletagmanager.com/gtag/js?id=G-E2ETEST000');

  // The Progress page keeps the choice (its own page load requests the tag again), and an address
  // ending in #cookies opens the settings there
  await page.goto(`${ANALYTICS_URL}/progress#cookies`);
  await expect(banner).toBeVisible();
  await expect.poll(() => tagRequests.length).toBe(2);
  await banner.getByRole('button', { name: 'Reject' }).click();
  await expect(banner).toBeHidden();
  expect(await consent(page)).toBe('denied');
});

// The runs recorded from the previous trainer (client/engine/recorded-runs.fixture.json, made with
// scripts/record-runs.mjs) replayed through the new range: the same mouse events at the same times,
// under the same paused clock, give the same rounds, times and scores, bit for bit (same browser)

interface RecordedRun {
  name: string;
  settings: Record<string, string>;
  events: (['frame', number] | ['move' | 'down' | 'up', number, number, number])[];
  result: { score: number; shots: number; finishedAt: number; hitTimes: number[]; hitScores: number[] };
  stored: number | null;
}

const recorded: { runs: RecordedRun[] } = JSON.parse(
  fs.readFileSync(path.join(root, 'client', 'engine', 'recorded-runs.fixture.json'), 'utf8'),
);

test.describe('replays the runs recorded from the previous trainer', () => {
  for (const run of recorded.runs) {
    test(run.name, async ({ page }) => {
      await page.clock.install({ time: new Date('2026-10-23T12:00:00Z') });
      await page.addInitScript((settings) => {
        for (const [key, value] of Object.entries(settings)) localStorage.setItem(key, value);
      }, run.settings);
      await page.goto('/');
      const canvas = page.locator('[data-slot="range-canvas"]');
      await canvas.locator('canvas').first().waitFor();
      // As when recording: real time stops, then the press comes 532 ms into the paused minute, at
      // the point of the range where it came on the previous page (the scores' last bits depend on
      // where a spray is, not only on how the mouse moves)
      await page.clock.pauseAt(new Date('2026-10-23T12:01:00Z'));
      await page.clock.runFor(500);
      const box = (await canvas.boundingBox())!;
      const first = run.events.find((e) => e[0] === 'down') as ['down', number, number, number];
      await page.mouse.move(box.x + first[2], box.y + first[3]);
      await page.clock.runFor(32);
      const t0 = await page.evaluate(() => Date.now());

      let now = 0;
      for (const e of run.events) {
        if (e[1] > now) {
          await page.clock.runFor(e[1] - now);
          now = e[1];
        }
        if (e[0] === 'move') await page.mouse.move(box.x + e[2], box.y + e[3]);
        else if (e[0] === 'down') await page.mouse.down();
        else if (e[0] === 'up') await page.mouse.up();
      }
      await page.clock.runFor(3000);

      const last = await page.evaluate(
        () => (window as unknown as { __spraydownLastRun?: RecordedRun['result'] }).__spraydownLastRun,
      );
      expect(last, 'the run finished').toBeDefined();
      expect(last!.shots).toBe(run.result.shots);
      expect(last!.hitTimes.map((t) => t - t0)).toEqual(run.result.hitTimes);
      expect(last!.hitScores).toEqual(run.result.hitScores);
      expect(last!.score).toBe(run.result.score);
      expect(last!.finishedAt - t0).toBe(run.result.finishedAt);
      const stats = JSON.parse((await storage(page, 'game::stats'))['game::stats'] ?? '[]');
      expect(stats[0]?.todayResults.at(-1) ?? null).toBe(run.stored);
    });
  }
});
