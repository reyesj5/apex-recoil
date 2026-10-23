import type { Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { clickStage, expect, site, specs, storage, test, writeSyntheticSpray } from './fixtures';

// The Recoil Editor (/editor). Phase 3 of docs/ui-migration-plan.md rebuilds it; these scenarios
// must keep passing. Each test edits a different weapon, so they do not depend on each other.

const shotCount = async (page: Page) => Number((await page.locator('#spec-shot-info').innerText()).replace(/\D+/g, ''));

async function setRange(page: Page, selector: string, value: number) {
  await page.locator(selector).evaluate((input: HTMLInputElement, v) => {
    input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, String(value));
}

/** A small wall screenshot with six decals, drawn in the page (no Python needed). */
async function drawnWall(page: Page) {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#464646';
    g.fillRect(0, 0, 640, 360);
    g.fillStyle = '#ebebeb';
    g.fillRect(80, 40, 480, 280);
    g.fillStyle = '#191919';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc(320 + 12 * i, 280 - 28 * i, 5, 0, 2 * Math.PI);
      g.fill();
    }
    return canvas.toDataURL('image/png');
  });
  return { name: 'drawn_wall.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') };
}

/** The Konva stage's background image (the loaded screenshot), if any. */
const backgroundImage = (page: Page) =>
  page.evaluate(() => {
    const konva = (
      window as unknown as { Konva: { stages: { find: (s: string) => { opacity(): number; visible(): boolean }[] }[] } }
    ).Konva;
    const image = konva.stages[0].find('Image')[0];
    return image ? { opacity: image.opacity(), visible: image.visible() } : null;
  });

test('loads every weapon spec', async ({ page }) => {
  await page.goto('/editor');
  await expect(page).toHaveTitle(`${site.name} Studio`);
  await expect(page.locator('#weapon-select option')).toHaveCount(specs.length);

  await page.locator('#weapon-select').selectOption('flatline');
  const flatline = specs.find((s) => s.name === 'flatline')!;
  await expect(page.locator('#spec-shot-info')).toHaveText(`Shots: ${flatline.x.length}`);
  await expect(page.locator('#weapon-rpm')).toHaveValue(String(flatline.rpm));
  await expect(page.locator('#canvas-status-shots')).toHaveText(`${flatline.x.length} shots`);
});

test('edits points on the stage with undo and redo', async ({ page }) => {
  await page.goto('/editor');
  await page.locator('#weapon-select').selectOption('alternator');
  const before = await shotCount(page);

  for (const [fx, fy] of [
    [0.3, 0.2],
    [0.33, 0.24],
    [0.36, 0.28],
  ]) {
    await clickStage(page, fx, fy);
  }
  await expect(page.locator('#spec-shot-info')).toHaveText(`Shots: ${before + 3}`);
  await page.locator('#undo-stage-btn').click();
  await expect(page.locator('#spec-shot-info')).toHaveText(`Shots: ${before + 2}`);
  await page.locator('#redo-stage-btn').click();
  await expect(page.locator('#spec-shot-info')).toHaveText(`Shots: ${before + 3}`);
  await page.keyboard.press('Control+z');
  await expect(page.locator('#spec-shot-info')).toHaveText(`Shots: ${before + 2}`);
});

test('saves an edited spec and records a version', async ({ page, request }) => {
  const history = async () => (await (await request.get('/api/specs/history/volt')).json()).history as unknown[];
  await page.goto('/editor');
  await page.locator('#weapon-select').selectOption('volt');
  const versions = (await history()).length;
  const rpm = Number(await page.locator('#weapon-rpm').inputValue()) + 1;

  await page.locator('#weapon-rpm').fill(String(rpm));
  const saved = page.waitForResponse((res) => res.url().endsWith('/api/specs') && res.request().method() === 'POST');
  await page.locator('#save-weapon-btn').click();
  const body = await (await saved).json();
  expect(body).toMatchObject({ success: true, unchanged: false });
  await expect(page.locator('#save-status-msg')).toContainText('Saved VOLT to specs.json');

  expect(await history()).toHaveLength(versions + 1);
  const current = (await (await request.get('/api/specs')).json()) as { name: string; rpm: number }[];
  expect(current.find((s) => s.name === 'volt')!.rpm).toBe(rpm);
});

test('asks before saving a changed pattern', async ({ page, request }) => {
  await page.goto('/editor');
  await page.locator('#weapon-select').selectOption('spitfire');
  const before = await shotCount(page);
  await clickStage(page, 0.3, 0.2);
  await expect(page.locator('#spec-shot-info')).toHaveText(`Shots: ${before + 1}`);

  const checkpoint = page.locator('#spec-checkpoint-modal');
  await page.locator('#save-weapon-btn').click();
  await expect(checkpoint).toBeVisible();
  await expect(page.locator('#cp-saved-shots')).toContainText(String(before));
  await expect(page.locator('#cp-cand-shots')).toContainText(String(before + 1));
  await page.locator('#cancel-checkpoint-btn').click();
  await expect(checkpoint).toBeHidden();

  await page.locator('#save-weapon-btn').click();
  await expect(checkpoint).toBeVisible();
  const saved = page.waitForResponse((res) => res.url().endsWith('/api/specs') && res.request().method() === 'POST');
  await page.locator('#confirm-checkpoint-save-btn').click();
  expect((await (await saved).json()).success).toBe(true);
  await expect(checkpoint).toBeHidden();
  const current = (await (await request.get('/api/specs')).json()) as { name: string; x: number[] }[];
  expect(current.find((s) => s.name === 'spitfire')!.x).toHaveLength(before + 1);
});

test('opens and closes the keyboard shortcuts', async ({ page }) => {
  await page.goto('/editor');
  const dialog = page.locator('#shortcuts-modal');
  await page.locator('#shortcuts-help-btn').click();
  await expect(dialog).toBeVisible();
  await page.locator('#close-shortcuts-modal-btn').click();
  await expect(dialog).toBeHidden();
  await page.locator('#shortcuts-help-btn').click();
  await page.locator('#close-shortcuts-modal-footer-btn').click();
  await expect(dialog).toBeHidden();
});

test('remembers the layout', async ({ page }) => {
  await page.goto('/editor');
  // The recording tabs are in the sidebar, so pick one before collapsing it
  await page.locator('#tab-offline').click();
  await page.locator('#toggle-sidebar-btn').click();
  await page.locator('#toggle-tools-panel-btn').click();
  expect(await storage(page, 'editor_')).toMatchObject({
    editor_sidebar_collapsed: 'true',
    editor_tools_collapsed: 'true',
    editor_recording_method: 'offline',
  });

  await page.reload();
  await expect(page.locator('#tools')).toHaveClass(/\bcollapsed\b/);
  await expect(page.locator('#editor-tools-sidebar')).toHaveClass(/\bcollapsed\b/);
  await expect(page.locator('#method-panel-offline')).toBeVisible();
  await expect(page.locator('#method-panel-live')).toBeHidden();

  await page.locator('#toggle-sidebar-btn').click();
  await page.locator('#toggle-tools-panel-btn').click();
  await expect(page.locator('#tools')).not.toHaveClass(/\bcollapsed\b/);
  await expect(page.locator('#editor-tools-sidebar')).not.toHaveClass(/\bcollapsed\b/);
});

test('calibrates the scale and adjusts the overlays', async ({ page }) => {
  await page.goto('/editor');
  await page.locator('#weapon-select').selectOption('car');

  // Scale calibration persists until it is reset
  await setRange(page, '#scale-adjust-slider', 95);
  await expect(page.locator('#scale-adjust-val')).toHaveText('95%');
  await expect(page.locator('#canvas-status-scale')).toHaveText('95% Scale');
  expect(await storage(page, 'editor:scale_factor')).toEqual({ 'editor:scale_factor': '0.95' });
  await page.reload();
  await expect(page.locator('#scale-adjust-val')).toHaveText('95%');
  await page.locator('#scale-reset-btn').click();
  await expect(page.locator('#scale-adjust-val')).toHaveText('100%');
  expect(await storage(page, 'editor:scale_factor')).toEqual({});

  // A screenshot on the stage (Konva filters the wall image) with its opacity and visibility
  await page.locator('#tab-offline').click();
  await page.locator('#wall-screenshot-file-input').setInputFiles(await drawnWall(page));
  await expect(page.locator('#wall-file-status')).toContainText('Added 1 screenshot(s) to batch');
  await expect(page.locator('#analyze-wall-file-btn')).toBeEnabled();
  await expect.poll(() => backgroundImage(page)).toMatchObject({ visible: true });
  await setRange(page, '#bg-opacity-slider', 40);
  await expect(page.locator('#bg-opacity-val')).toHaveText('40%');
  expect((await backgroundImage(page))!.opacity).toBeCloseTo(0.4);
  await page.locator('#toggle-bg-img').uncheck();
  expect((await backgroundImage(page))!.visible).toBe(false);

  // The recoil pattern on top of it
  await setRange(page, '#pattern-opacity-slider', 50);
  await expect(page.locator('#pattern-opacity-val')).toHaveText('50%');
  await page.locator('#toggle-pattern').uncheck();
  await page.locator('#toggle-pattern').check();

  await page.locator('#clear-batch-screenshots-btn').click();
  await expect(page.locator('#analyze-wall-file-btn')).toBeDisabled();
});

// The legacy tools run a Konva filter over the wall image; Konva 10 changed how filters get their
// pixels (pixel ratio, cache size), so this runs on standard and high-density screens
for (const deviceScaleFactor of [1, 2]) {
  test.describe(`at device pixel ratio ${deviceScaleFactor}`, () => {
    test.use({ deviceScaleFactor });

    test('finds the decals in a wall image with the legacy tools', async ({ page }) => {
      await page.goto('/editor');
      await page.locator('#weapon-select').selectOption('lstar');
      await page.locator('#tab-legacy').click();
      for (const [id, value] of [
        ['threshold', '50'],
        ['target-from', '10'],
        ['target-to', '200'],
      ]) {
        await page.locator(`#${id}`).fill(value);
        await page.locator(`#${id}`).press('Tab');
      }
      await expect(page.locator('#auto-targets')).toBeChecked();

      // Loading an image clears the points, so the decals become the whole pattern
      await page.locator('#file-selector').setInputFiles(await drawnWall(page));
      const autoPoints = () =>
        page.evaluate(() => {
          type Circle = { stroke(): string; radius(): number; visible(): boolean };
          const konva = (window as unknown as { Konva: { stages: { find: (s: string) => Circle[] }[] } }).Konva;
          return konva.stages[0].find('Circle').filter((c) => c.stroke() === '#00e5ff' && c.radius() === 10).length;
        });
      await expect.poll(autoPoints).toBe(6);
      await page.locator('#accept-auto').click();
      await expect(page.locator('#spec-shot-info')).toHaveText('Shots: 6');
    });
  });
}

test.describe('discovery with the Python pipeline', () => {
  test.describe.configure({ mode: 'serial' });
  let spray: { clip: string; wall: string } | null = null;
  let dir = '';

  test.beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spraydown-e2e-spray-'));
    spray = writeSyntheticSpray(dir);
  });
  test.afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  test.beforeEach(() => test.skip(!spray, 'needs Python with the processing requirements (CI has them)'));

  test('analyzes a recorded clip and saves the session', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/editor');
    // Every status the analysis shows, to check it reported progress on the way
    await page.evaluate(() => {
      const box = document.getElementById('session-process-status')!;
      const seen: string[] = ((window as unknown as { statuses: string[] }).statuses = []);
      new MutationObserver(() => seen.push(box.innerText)).observe(box, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });

    await page.locator('#import-clips-input').setInputFiles(spray!.clip);
    await expect(page.locator('#session-process-status')).toContainText('Imported 1 video clip(s)!');
    await page.locator('#process-session-btn').click();
    const confirm = page.locator('#analysis-confirm-modal');
    await expect(confirm).toBeVisible();
    await page.locator('#modal-weapon-select').selectOption('r301');
    await expect(page.locator('#modal-save-capture')).toBeChecked();
    const accepted = page.waitForResponse('**/api/discovery/process-session');
    await page.locator('#proceed-analysis-btn').click();
    await expect(confirm).toBeHidden();
    expect((await accepted).status()).toBe(202);

    const status = page.locator('#session-process-status');
    await expect(status).toContainText('Analysis Complete!', { timeout: 90_000 });
    await expect(status).toContainText('Detected Shots: 6 shots');
    await expect(status).toContainText('Saved to Captures: Yes');
    const statuses = await page.evaluate(() => (window as unknown as { statuses: string[] }).statuses);
    expect(statuses.some((s) => /^\[\d+%\]/.test(s))).toBe(true);

    // The result views and the discrepancy overlay
    expect(await page.locator('#stage-preview-select option').count()).toBeGreaterThan(1);
    await page.locator('#compare-stage-btn').click();
    await expect(page.locator('#discrepancy-hud')).toBeVisible();
    await page.locator('#compare-stage-btn').click();
    await expect(page.locator('#discrepancy-hud')).toBeHidden();
  });

  test('loads the saved session', async ({ page }) => {
    await page.goto('/editor');
    await page.locator('#refresh-past-sessions-btn').click();
    const option = page.locator('#past-session-select option', { hasText: 'R301' }).first();
    await expect(option).toBeAttached();
    await page.locator('#past-session-select').selectOption((await option.getAttribute('value'))!);
    await page.locator('#load-past-session-btn').click();
    const status = page.locator('#session-process-status');
    await expect(status).toContainText('Session Loaded!');
    await expect(status).toContainText('Loaded 1 spray(s)');
    await expect(page.locator('#weapon-select')).toHaveValue('r301');
  });

  test('analyzes a wall screenshot and keeps it in the library', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/editor');
    await page.locator('#weapon-select').selectOption('r301');
    await page.locator('#tab-offline').click();
    await page.locator('#wall-screenshot-file-input').setInputFiles(spray!.wall);
    await page.locator('#analyze-wall-file-btn').click();
    await expect(page.locator('#analysis-confirm-modal')).toBeVisible();
    // Screenshots are not saved unless asked; the library needs this one
    await expect(page.locator('#modal-save-capture')).not.toBeChecked();
    await page.locator('#modal-save-capture').check();
    const accepted = page.waitForResponse('**/api/discovery/process-static-image');
    await page.locator('#proceed-analysis-btn').click();
    expect((await accepted).status()).toBe(202);

    // The decals in this small synthetic wall are below what the static pipeline detects, like in
    // the server tests: the run completes, and pytest covers the detection itself
    const status = page.locator('#wall-file-status');
    await expect(status).toContainText('Batch Screenshot Analysis Complete!', { timeout: 90_000 });
    await expect(status).toContainText('Screenshots Analyzed: 1');
    await expect(status).toContainText('Storage: Saved to captures library');

    // The saved screenshot comes back from the library onto the stage
    await page.locator('#clear-batch-screenshots-btn').click();
    await page.locator('#refresh-saved-screenshots-btn').click();
    const option = page.locator('#saved-screenshot-select option', { hasText: 'spray_01_wall' }).first();
    await expect(option).toBeAttached();
    await page.locator('#saved-screenshot-select').selectOption((await option.getAttribute('value'))!);
    await page.locator('#load-saved-screenshot-btn').click();
    await expect(status).toContainText('to batch.');
    await expect.poll(() => backgroundImage(page)).toMatchObject({ visible: true });
  });
});
