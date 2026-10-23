import { ANALYTICS_URL, expect, site, specs, storage, test } from './fixtures';

// The trainer pages (/, /ru, /zh-CN), driven like a player would. Phase 2 of
// docs/ui-migration-plan.md rebuilds them; these scenarios must keep passing.

const tile = (name: string) => `#weapon-select [data-weapon="${name}"]`;

test('lists every weapon and selects one', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(`${site.name} · Recoil trainer for Apex Legends`);
  await expect(page.locator('#weapon-select > .btn')).toHaveCount(specs.length);
  await expect(page.locator(tile('r99'))).toHaveClass(/\bselected\b/);
  await expect(page.locator('#score-stats')).toHaveText("Today's tries -, median -, best -\nAll time best -", {
    useInnerText: true,
  });

  await page.locator(tile('r301')).click();
  await expect(page.locator(tile('r301'))).toHaveClass(/\bselected\b/);
  await expect(page.locator(tile('r99'))).not.toHaveClass(/\bselected\b/);
});

test('filters weapons by search and category', async ({ page }) => {
  await page.goto('/');
  const shown = page.locator('#weapon-select > .btn:visible');
  const names = () => shown.evaluateAll((tiles) => tiles.map((t) => t.getAttribute('data-weapon')));

  await page.locator('#weapon-search-input').fill('r9');
  await expect(shown).toHaveCount(1);
  expect(await names()).toEqual(['r99']);
  await page.locator('#weapon-search-input').fill('');
  await expect(shown).toHaveCount(specs.length);

  await page.locator('.cat-pill[data-category="smg"]').click();
  const smgs = await page.locator('#weapon-select > .btn[data-category="smg"]').count();
  expect(smgs).toBeGreaterThan(0);
  await expect(shown).toHaveCount(smgs);
  await expect(page.locator('.cat-pill[data-category="smg"]')).toHaveClass(/\bactive\b/);
  await page.locator('.cat-pill[data-category="all"]').click();
  await expect(shown).toHaveCount(specs.length);
});

test('switches fire modes, magazines and attachments', async ({ page }) => {
  await page.goto('/');
  const modes = page.locator('#fire-mode-select');

  // The Prowler fires bursts or full auto and keeps the R-99's auto; B toggles between them
  await page.locator(tile('prowler')).click();
  await expect(modes.locator('.fire-mode-auto')).toHaveClass(/\bselected\b/);
  await expect(modes.locator('.fire-mode-single')).toBeHidden();
  await modes.locator('.fire-mode-burst').click();
  await expect(modes.locator('.fire-mode-burst')).toHaveClass(/\bselected\b/);
  expect(await storage(page, 'game::fire-mode')).toEqual({ 'game::fire-mode': 'burst' });
  await page.keyboard.press('b');
  await expect(modes.locator('.fire-mode-auto')).toHaveClass(/\bselected\b/);

  // The Hemlok has no full auto, so it falls back to its bursts
  await page.locator(tile('hemlok')).click();
  await expect(modes.locator('.fire-mode-burst')).toHaveClass(/\bselected\b/);
  await expect(modes.locator('.fire-mode-auto')).toBeHidden();

  // Magazines show the R-301's capacities; the corrupted stock takes 4 rounds off each
  const r301 = specs.find((s) => s.name === 'r301')!;
  await page.locator(tile('r301')).click();
  await expect(page.locator('#mag-select > [class^="mag-"]:not(.mag-drop):visible')).toHaveCount(r301.mags.length);
  await page.locator('#mag-select .mag-2').click();
  await expect(page.locator('#mag-select .mag-2')).toHaveClass(/\bselected\b/);
  await expect(page.locator('#mag-select .mag-2 .mag-cap')).toHaveText(String(r301.mags[2].size));
  await page.locator('#mag-select .mod-corrupted_stock').click();
  await expect(page.locator('#mag-select .mod-corrupted_stock')).toHaveClass(/\bselected\b/);
  await expect(page.locator('#mag-select .mag-2 .mag-cap')).toHaveText(String(r301.mags[2].size - 4));

  // Only the Rampage takes a thermite grenade
  await expect(page.locator('.mod-revved_up')).toBeHidden();
  await page.locator(tile('rampage')).click();
  await page.locator('.mod-revved_up').click();
  await expect(page.locator('.mod-revved_up')).toHaveClass(/\bselected\b/);
  expect(await storage(page, 'game::mods')).toEqual({ 'game::mods': 'revved_up' });
});

test('keeps the settings across a reload', async ({ page }) => {
  await page.goto('/');
  await page.locator(tile('r301')).click();
  await page.locator('#mag-select .mag-3').click();
  await page.locator('#fire-mode-select .fire-mode-single').click();
  await page.locator('#invert-y-btn').click();
  await page.locator('#mode-moving').click();
  await page.locator('#recoil-target').click();
  await page.locator('#trace-2').click();
  await page.locator('#unmuted').click();

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
  await expect(page.locator(tile('r301'))).toHaveClass(/\bselected\b/);
  await expect(page.locator('#mag-select .mag-3')).toHaveClass(/\bselected\b/);
  await expect(page.locator('#fire-mode-select .fire-mode-single')).toHaveClass(/\bselected\b/);
  await expect(page.locator('#invert-y-btn')).toHaveClass(/\bselected\b/);
  await expect(page.locator('#muted')).toBeVisible();
  await expect(page.locator('#unmuted')).toBeHidden();
});

test('scores a full spray, keeps the result and charts it', async ({ page }) => {
  await page.goto('/');
  await page.locator('#unmuted').click();
  await page.locator('#show-instructions-btn').click();
  await expect(page.locator('#instructions')).toBeVisible();
  await page.locator('#dismiss-instructions').click();
  await expect(page.locator('#instructions')).toBeHidden();

  // Hold the trigger through a whole R-99 magazine (18 rounds at 1080 RPM, about a second)
  const box = (await page.locator('#stage .konvajs-content').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.waitForTimeout(1600);
  await page.mouse.up();

  await expect(page.locator('#score-stats')).toHaveText(/^Today's tries 1, median \d+, best \d+\nAll time best \d+$/, {
    useInnerText: true,
  });
  const stats = JSON.parse((await storage(page, 'game::stats'))['game::stats']);
  expect(stats).toHaveLength(1);

  await page.locator('#stats-graph-btn').click();
  await expect(page.locator('#detailed-stats')).toBeVisible();
  await expect(page.locator('#plotly_area .main-svg').first()).toBeVisible();
  await page.locator('#hide-stats').click();
  await expect(page.locator('#detailed-stats')).toBeHidden();

  await page.reload();
  await expect(page.locator('#score-stats')).toHaveText(/^Today's tries 1, /);
});

test('serves the Russian and Chinese pages', async ({ page }) => {
  await page.goto('/ru');
  await expect(page).toHaveTitle(`${site.name} · тренажёр отдачи для Apex Legends`);
  await expect(page.locator('#weapon-select > .btn')).toHaveCount(specs.length);
  await expect(page.locator('#score-stats')).toContainText('Сегодня: - попытки');

  await page.goto('/zh-CN');
  await expect(page).toHaveTitle(`${site.name} · Apex Legends 压枪训练`);
  await expect(page.locator('#weapon-select > .btn')).toHaveCount(specs.length);
  await expect(page.locator('#score-stats')).toContainText('今天尝试: - 次');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('shows the desktop notice instead of the game', async ({ page }) => {
    for (const path of ['/', '/ru', '/zh-CN']) {
      await page.goto(path);
      await expect(page.locator('#mobile-info')).toBeVisible();
      await expect(page.locator('#weapon-select')).toBeHidden();
    }
  });
});

test.describe('analytics', () => {
  const google = /^https:\/\/(www\.googletagmanager\.com|[\w.-]*google-analytics\.com)\//;

  test('stays off without a measurement ID', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (req) => requests.push(req.url()));
    await page.goto('/');
    await expect(page.locator('#weapon-select > .btn')).toHaveCount(specs.length);
    expect(requests.filter((url) => google.test(url) || url.includes('/tarteaucitron'))).toEqual([]);
    await expect(page.locator('#tarteaucitronRoot')).toHaveCount(0);
  });

  test('loads the Google tag only after consent', async ({ page }) => {
    // Nothing reaches Google: the tag requests are answered here and only counted
    const tagRequests: string[] = [];
    await page.route(google, (route) => {
      tagRequests.push(route.request().url());
      return route.fulfill({ contentType: 'text/javascript', body: '' });
    });
    const banner = page.locator('#tarteaucitronAlertBig');
    // tarteaucitron wires the banner buttons 500 ms after showing it, so click until the banner
    // reacts; a click that worked can take a moment to hide it, so never click a hidden banner
    const answer = (button: string) =>
      expect(async () => {
        if (await banner.isVisible()) await page.locator(button).click({ timeout: 1000 });
        await expect(banner).toBeHidden({ timeout: 1000 });
      }).toPass({ timeout: 10_000 });
    const consent = async () => (await page.context().cookies()).find((c) => c.name === 'tarteaucitron')?.value;

    // Deny: the banner goes away for good and no tag loads
    await page.goto(`${ANALYTICS_URL}/`);
    await expect(banner).toBeVisible();
    await answer('#tarteaucitronAllDenied2');
    expect(await consent()).toBe('!gtag=false');
    await page.reload();
    await expect(page.locator('#weapon-select > .btn')).toHaveCount(specs.length);
    await expect(banner).toBeHidden();
    expect(tagRequests).toEqual([]);

    // Accept, starting over: the tag loads with the configured measurement ID
    await page.context().clearCookies();
    await page.reload();
    await expect(banner).toBeVisible();
    expect(tagRequests).toEqual([]);
    await answer('#tarteaucitronPersonalize2');
    expect(await consent()).toBe('!gtag=true');
    await expect.poll(() => tagRequests).toContain('https://www.googletagmanager.com/gtag/js?id=G-E2ETEST000');
  });
});
