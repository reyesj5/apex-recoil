import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import { expect, site, storage, test } from './fixtures';

// The Progress page at /progress (docs/ui-migration-plan.md, Phase 2.2): the score history kept
// in this browser, summed up per day and per weapon, with the runs saved since the run log began.

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.length} element(s) (${v.help}) ${v.nodes[0].target.join(' ')}`);
}

// Today is 2026-10-23. Two setups as the history stores them, and three runs in the log.
const now = new Date('2026-10-23T15:30:00');
const history = [
  {
    v: 3,
    setup: { weapon: 'r301', mag: 2, hint: true, moving: false },
    bestAllTime: 93,
    today: 20261023,
    todayResults: [80, 91, 85],
    dayResults: [
      [20260920, 4, 70, 78],
      [20261001, 6, 76, 88],
      [20261022, 5, 82, 93],
    ],
  },
  {
    v: 3,
    setup: { weapon: 'r99', mag: 0, hint: false, moving: true },
    bestAllTime: 90,
    today: 20261023,
    todayResults: [],
    dayResults: [[20261022, 3, 72, 90]],
  },
];
const runs = [
  ['2026-10-22T21:10:00', 'r99', 0, 18, 'moving', 90],
  ['2026-10-23T15:00:00', 'r301', 2, 28, 'path', 80],
  ['2026-10-23T15:20:00', 'r301', 2, 28, 'path', 91],
].map(([at, weapon, mag, size, practice, score]) => ({
  t: new Date(at as string).getTime(),
  weapon,
  mag,
  size,
  practice,
  fire: 'auto',
  score,
}));

async function withHistory(page: Page) {
  await page.clock.setFixedTime(now);
  await page.addInitScript(
    ([stats, log]) => {
      localStorage.setItem('game::stats', stats);
      localStorage.setItem('game::runs', log);
    },
    [JSON.stringify(history), JSON.stringify(runs)],
  );
}

const tile = (page: Page, label: string) =>
  page.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) });

test('says what will appear before any run is saved', async ({ page }) => {
  await page.goto('/progress');
  await expect(page).toHaveTitle(`${site.name} · Progress`);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(10, 12, 15)');
  await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Progress' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'No saved runs yet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to the trainer' })).toHaveAttribute('href', '/');
  expect(await violations(page), 'accessibility violations').toEqual([]);
});

test('sums up the history by day and by weapon', async ({ page }) => {
  await withHistory(page);
  await page.goto('/progress');

  // The last 30 days: the R-301 on Oct 1, 22 and 23, the R-99 on Oct 22
  await expect(tile(page, 'Runs')).toContainText('17last 30 days');
  await expect(tile(page, 'Best score')).toContainText('93R-301');
  await expect(tile(page, 'Median score')).toContainText('76+8 since the first week');
  await expect(tile(page, 'Days practiced')).toContainText('3of 30');
  await expect(
    page.getByRole('img', { name: 'Best and median score per day: best 93, median 76, over 3 days of practice' }),
  ).toBeVisible();
  const weapons = page.getByRole('region', { name: 'By weapon' }).getByRole('listitem');
  await expect(weapons).toHaveText([/^R-30114 runs/, /^R-993 runs/]);
  const recent = page.getByRole('region', { name: 'Recent runs' }).getByRole('row');
  await expect(recent).toHaveCount(4);
  await expect(recent.nth(1)).toContainText(/^Today .*R-301Lv 2 · 28Follow path91$/);
  await expect(recent.nth(3)).toContainText(/^Yesterday .*R-99Base · 18Moving target90$/);
  expect(await violations(page), 'accessibility violations').toEqual([]);

  // One weapon, then all time
  await page.getByRole('combobox', { name: 'Weapon' }).click();
  await page.getByRole('option', { name: 'R-99' }).click();
  await expect(tile(page, 'Runs')).toContainText('3last 30 days');
  await expect(tile(page, 'Best score')).toContainText('90Oct 22');
  await expect(recent).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Weapon' }).click();
  await page.getByRole('option', { name: 'All weapons' }).click();
  await page.getByRole('radio', { name: 'All time' }).click();
  await expect(tile(page, 'Runs')).toContainText('21all time');
  await expect(tile(page, 'Days practiced')).toContainText('4since Sep 20');

  // The CSV holds the days shown, a row per setup and day
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`${site.name.toLowerCase()}-progress-2026-10-23.csv`);
  const csv = fs.readFileSync((await file.path())!, 'utf8').replace(/^\uFEFF/, '');
  expect(csv.split('\r\n')).toEqual([
    'Date,Weapon,Magazine,Mode,Tries,Median,Best',
    '2026-09-20,R-301,Level 2 magazine,Follow path,4,70,78',
    '2026-10-01,R-301,Level 2 magazine,Follow path,6,76,88',
    '2026-10-22,R-301,Level 2 magazine,Follow path,5,82,93',
    '2026-10-22,R-99,Base magazine,Moving target,3,72,90',
    '2026-10-23,R-301,Level 2 magazine,Follow path,3,85,91',
    '',
  ]);
});

test('lists a run saved in the trainer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mute sounds' }).click();
  // The trainer links to the Progress page from its navigation and its session panel
  await expect(page.getByRole('link', { name: 'Open progress' })).toHaveAttribute('href', '/progress');

  const box = (await page.locator('[data-slot="range-canvas"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.waitForTimeout(1600);
  await page.mouse.up();
  await expect(page.getByRole('status').filter({ hasText: 'Run complete' })).toBeVisible();
  const [run] = JSON.parse((await storage(page, 'game::runs'))['game::runs']);
  expect(run).toMatchObject({ weapon: 'r99', mag: 0, size: 18, practice: 'path', fire: 'auto' });

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Progress' }).click();
  await expect(page).toHaveURL(/\/progress$/);
  const rows = page.getByRole('region', { name: 'Recent runs' }).getByRole('row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText(new RegExp(`^Today .*R-99Base · 18Follow path${run.score}$`));
});

test('serves the Russian and Chinese pages', async ({ page }) => {
  await withHistory(page);
  await page.goto('/ru/progress');
  await expect(page).toHaveTitle(`${site.name} · Прогресс`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByRole('heading', { level: 1, name: 'Прогресс' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'По оружию' }).getByRole('listitem').first()).toContainText(
    '14 попыток',
  );
  expect(await violations(page), 'accessibility violations in Russian').toEqual([]);

  await page.goto('/zh-CN/progress');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('heading', { level: 1, name: '进度' })).toBeVisible();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows the prerendered page, leaving the history to the browser', async ({ page }) => {
    for (const [path, title, description] of [
      ['/progress', 'Progress', /^Your Apex Legends recoil practice over time/],
      ['/ru/progress', 'Прогресс', /^Ваши тренировки отдачи в Apex Legends/],
      ['/zh-CN/progress', '进度', /^你的 Apex Legends 压枪练习记录/],
    ] as const) {
      await page.goto(path);
      await expect(page).toHaveTitle(`${site.name} · ${title}`);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', description);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    }
    await page.goto('/progress');
    await expect(page.getByText('Stored in this browser only.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No saved runs yet' })).toHaveCount(0);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('fits the screen', async ({ page }) => {
    await withHistory(page);
    await page.goto('/progress');
    await expect(page.getByRole('region', { name: 'Score per day' }).getByRole('img')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    expect(await violations(page), 'accessibility violations on a phone').toEqual([]);
  });
});
