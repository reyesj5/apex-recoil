import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, site, specs, storage, test, writeSyntheticSpray } from './fixtures';

// The Studio at /editor, the Recoil Editor rebuilt (docs/ui-migration-plan.md, Phase 3): the Recoil
// Editor's scenarios, asserting on the same data (shot counts, API requests, stored settings), the
// saves that changed what they shouldn't have, and, as on every new page, no accessibility
// violations at all. Each test edits a different weapon.

type SpecJson = {
  name: string;
  rpm: number;
  x: number[];
  y: number[];
  time_points: number[];
  mags: { size: number; audio: string }[];
};

async function violations(page: Page) {
  // Overlays fade in, and mid-fade their colors fail contrast
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.length} element(s) (${v.help}) ${v.nodes[0].target.join(' ')}`);
}

const topBar = (page: Page) => page.getByRole('banner');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });
const statusBar = (page: Page) => page.getByRole('contentinfo');
const canvas = (page: Page) => page.getByTestId('studio-canvas');

/** The selected weapon's shot count, from the status bar */
async function shotCount(page: Page) {
  const text = await statusBar(page).innerText();
  return Number(/(\d+) shots/.exec(text)?.[1]);
}

async function open(page: Page, weapon?: string) {
  await page.goto('/editor');
  await expect(statusBar(page)).toContainText(/\d+ shots/);
  if (weapon) await pickWeapon(page, weapon);
}

/** A weapon name, matched as written in a regular expression (C.A.R.) */
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The weapon picker, showing `name` */
const weaponButton = (page: Page, name: string) =>
  topBar(page).getByRole('button', { name: new RegExp(`^Weapon: ${literal(name)} .*Change weapon`) });

async function pickWeapon(page: Page, name: string) {
  await topBar(page)
    .getByRole('button', { name: /Change weapon/ })
    .click();
  await page.getByRole('option', { name: new RegExp(`^${literal(name)} `) }).click();
  await expect(weaponButton(page, name)).toBeVisible();
}

async function clickCanvas(page: Page, fx: number, fy: number) {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('the canvas is not visible');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

/** Konva shapes on the stage with this name */
const shapes = (page: Page, name: string) =>
  page.evaluate(
    (n) =>
      (window as unknown as { Konva: { stages: { find: (s: string) => unknown[] }[] } }).Konva.stages[0].find(`.${n}`)
        .length,
    name,
  );

/** The screenshot on the stage, if any */
const backgroundImage = (page: Page) =>
  page.evaluate(() => {
    const konva = (
      window as unknown as {
        Konva: { stages: { findOne: (s: string) => { opacity(): number; isVisible(): boolean } | undefined }[] };
      }
    ).Konva;
    const image = konva.stages[0].findOne('.background');
    return image ? { opacity: image.opacity(), visible: image.isVisible() } : null;
  });

/** A small wall screenshot with six decals, drawn in the page (no Python needed) */
async function drawnWall(page: Page) {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 360;
    const g = c.getContext('2d')!;
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
    return c.toDataURL('image/png');
  });
  return { name: 'drawn_wall.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') };
}

/** Moves a slider to `value` with its arrow keys */
async function slide(page: Page, name: string, value: number) {
  const slider = page.getByRole('slider', { name });
  const now = Number(await slider.getAttribute('aria-valuenow'));
  await slider.focus();
  for (let i = 0; i < Math.abs(value - now); i++) await page.keyboard.press(value > now ? 'ArrowRight' : 'ArrowLeft');
  await expect(slider).toHaveAttribute('aria-valuenow', String(value));
}

const currentSpecs = async (page: Page) => (await (await page.request.get('/api/specs')).json()) as SpecJson[];

test('loads every weapon spec', async ({ page }) => {
  await open(page);
  await expect(page).toHaveTitle(`${site.name} Studio`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await topBar(page)
    .getByRole('button', { name: /Change weapon/ })
    .click();
  await expect(page.getByRole('option').filter({ hasNotText: 'New weapon' })).toHaveCount(specs.length);
  await page.keyboard.press('Escape');

  await pickWeapon(page, 'Flatline');
  const flatline = specs.find((s) => s.name === 'flatline')!;
  await expect(statusBar(page)).toContainText(`Flatline · ${flatline.x.length} shots`);
  await expect(inspector(page).getByLabel('Fire rate')).toHaveValue(String(flatline.rpm));
  expect(await shapes(page, 'shot')).toBe(flatline.x.length);
});

test('edits shots on the canvas with undo and redo', async ({ page }) => {
  await open(page, 'Alternator');
  const before = await shotCount(page);
  await page.keyboard.press('c');
  await expect(page.getByRole('button', { name: 'Correct shots: add or remove holes' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const [fx, fy] of [
    [0.3, 0.2],
    [0.33, 0.24],
    [0.36, 0.28],
  ]) {
    await clickCanvas(page, fx, fy);
  }
  await expect(statusBar(page)).toContainText(`${before + 3} shots`);
  await expect(topBar(page).getByRole('status')).toHaveText('Unsaved changes');
  await topBar(page).getByRole('button', { name: 'Undo' }).click();
  await expect(statusBar(page)).toContainText(`${before + 2} shots`);
  await topBar(page).getByRole('button', { name: 'Redo' }).click();
  await expect(statusBar(page)).toContainText(`${before + 3} shots`);
  await page.keyboard.press('Control+z');
  await expect(statusBar(page)).toContainText(`${before + 2} shots`);

  // Right-click removes a shot
  const shot = await page.evaluate(() => {
    const konva = (
      window as unknown as {
        Konva: {
          stages: {
            find: (s: string) => { getClientRect(): { x: number; y: number; width: number; height: number } }[];
          }[];
        };
      }
    ).Konva;
    const r = konva.stages[0].find('.shot')[5].getClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.click(box.x + shot.x, box.y + shot.y, { button: 'right' });
  await expect(statusBar(page)).toContainText(`${before + 1} shots`);
});

test('saves an edited spec and records a version', async ({ page, request }) => {
  const history = async () => (await (await request.get('/api/specs/history/volt')).json()).history as unknown[];
  await open(page, 'Volt');
  const versions = (await history()).length;
  const rpm = Number(await inspector(page).getByLabel('Fire rate').inputValue()) + 1;

  await inspector(page).getByLabel('Fire rate').fill(String(rpm));
  const saved = page.waitForResponse((res) => res.url().endsWith('/api/specs') && res.request().method() === 'POST');
  await topBar(page)
    .getByRole('button', { name: /Save spec/ })
    .click();
  expect(await (await saved).json()).toMatchObject({ success: true, unchanged: false });
  await expect(page.getByText('Spec saved')).toBeVisible();
  await expect(topBar(page).getByRole('status')).toHaveCount(0);

  expect(await history()).toHaveLength(versions + 1);
  const volt = (await currentSpecs(page)).find((s) => s.name === 'volt')!;
  expect(volt.rpm).toBe(rpm);
  // The sounds stay; the Recoil Editor renamed them volt_20, volt_22... on every save
  expect(volt.mags).toEqual(specs.find((s) => s.name === 'volt')!.mags);
});

test('saves only what was edited', async ({ page }) => {
  // The Devotion's spin-up times and a single magazine are what the Recoil Editor's save rewrote
  await open(page, 'Devotion');
  const before = (await currentSpecs(page)).find((s) => s.name === 'devotion_tc')!;
  const base = inspector(page).getByLabel('Base magazine size');
  await base.fill(String(before.mags[0].size + 1));
  await base.press('Enter');
  let saved = page.waitForResponse((res) => res.url().endsWith('/api/specs') && res.request().method() === 'POST');
  await page.keyboard.press('Control+s');
  expect((await (await saved).json()).success).toBe(true);
  const devotion = (await currentSpecs(page)).find((s) => s.name === 'devotion_tc')!;
  expect(devotion.mags).toEqual([{ ...before.mags[0], size: before.mags[0].size + 1 }, ...before.mags.slice(1)]);
  expect(devotion.time_points).toEqual(before.time_points);
  expect([devotion.x, devotion.y]).toEqual([before.x, before.y]);

  await pickWeapon(page, 'Peacekeeper');
  await inspector(page).getByLabel('Fire rate').fill('52');
  saved = page.waitForResponse((res) => res.url().endsWith('/api/specs') && res.request().method() === 'POST');
  await page.keyboard.press('Control+s');
  expect((await (await saved).json()).success).toBe(true);
  const peacekeeper = (await currentSpecs(page)).find((s) => s.name === 'peacekeeper')!;
  expect(peacekeeper.mags).toEqual([{ size: 5, audio: 'shotgun_shot' }]);
});

test('asks before saving a changed pattern', async ({ page }) => {
  await open(page, 'Spitfire');
  const before = await shotCount(page);
  await page.keyboard.press('c');
  await clickCanvas(page, 0.3, 0.2);
  await expect(statusBar(page)).toContainText(`${before + 1} shots`);

  const checkpoint = page.getByRole('dialog', { name: 'Check before saving' });
  await page.keyboard.press('Control+s');
  await expect(checkpoint).toBeVisible();
  await expect(checkpoint.getByTestId('checkpoint-saved-shots')).toHaveText(String(before));
  await expect(checkpoint.getByTestId('checkpoint-candidate-shots')).toHaveText(String(before + 1));
  expect(await violations(page)).toEqual([]);
  await checkpoint.getByRole('button', { name: 'Cancel' }).click();
  await expect(checkpoint).toBeHidden();

  await topBar(page)
    .getByRole('button', { name: /Save spec/ })
    .click();
  await expect(checkpoint).toBeVisible();
  const saved = page.waitForResponse((res) => res.url().endsWith('/api/specs') && res.request().method() === 'POST');
  await checkpoint.getByRole('button', { name: 'Save spec' }).click();
  expect((await (await saved).json()).success).toBe(true);
  await expect(checkpoint).toBeHidden();
  expect((await currentSpecs(page)).find((s) => s.name === 'spitfire')!.x).toHaveLength(before + 1);
});

test('opens and closes the keyboard shortcuts', async ({ page }) => {
  await open(page);
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await topBar(page).getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(dialog).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).toBeHidden();
  await page.keyboard.press('?');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('remembers the layout', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: 'Screenshots' }).click();
  await page.keyboard.press('m');
  await page.keyboard.press('e');
  await expect(page.getByRole('complementary', { name: 'Capture' })).toBeHidden();
  await expect(inspector(page)).toBeHidden();
  expect(await storage(page, 'editor_')).toMatchObject({
    editor_sidebar_collapsed: 'true',
    editor_tools_collapsed: 'true',
    editor_recording_method: 'offline',
  });

  await page.reload();
  await expect(statusBar(page)).toContainText(/\d+ shots/);
  await expect(page.getByRole('complementary', { name: 'Capture' })).toBeHidden();
  await expect(inspector(page)).toBeHidden();
  await page.keyboard.press('m');
  await page.keyboard.press('e');
  await expect(page.getByRole('complementary', { name: 'Capture' })).toBeVisible();
  await expect(inspector(page)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Screenshots' })).toHaveAttribute('aria-selected', 'true');
});

test('calibrates the scale and adjusts the layers', async ({ page }) => {
  await open(page, 'C.A.R.');

  // The visual scale lasts until it is reset
  await slide(page, 'Visual scale', 95);
  await expect(statusBar(page)).toContainText('scale 95%');
  expect(await storage(page, 'editor:scale_factor')).toEqual({ 'editor:scale_factor': '0.95' });
  await page.reload();
  await expect(page.getByRole('slider', { name: 'Visual scale' })).toHaveAttribute('aria-valuenow', '95');
  await inspector(page).getByRole('button', { name: 'Reset the visual scale to 100%' }).click();
  await expect(statusBar(page)).toContainText('scale 100%');
  expect(await storage(page, 'editor:scale_factor')).toEqual({});

  // A screenshot on the canvas, with its opacity and visibility
  await page.getByRole('tab', { name: 'Screenshots' }).click();
  await page.getByLabel('Choose wall screenshots').setInputFiles(await drawnWall(page));
  await expect(page.getByText('Added 1 screenshot.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Analyze 1 screenshot' })).toBeEnabled();
  await expect.poll(() => backgroundImage(page)).toMatchObject({ visible: true });
  await slide(page, 'Wall image opacity', 40);
  expect((await backgroundImage(page))!.opacity).toBeCloseTo(0.4);
  await inspector(page).getByRole('checkbox', { name: 'Wall image' }).uncheck();
  expect((await backgroundImage(page))!.visible).toBe(false);

  // The pattern over it
  await slide(page, 'Pattern overlay opacity', 50);
  await inspector(page).getByRole('checkbox', { name: 'Pattern overlay' }).uncheck();
  await inspector(page).getByRole('checkbox', { name: 'Pattern overlay' }).check();
  expect(await shapes(page, 'shot')).toBe(await shotCount(page));

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Analyze screenshots' })).toBeDisabled();
});

// The Manual tab finds the decals in the image's own pixels, on standard and high-density screens
for (const deviceScaleFactor of [1, 2]) {
  test.describe(`at device pixel ratio ${deviceScaleFactor}`, () => {
    test.use({ deviceScaleFactor });

    test('finds the decals in a wall image with the manual tools', async ({ page }) => {
      await open(page, 'L-STAR');
      await page.getByRole('tab', { name: 'Manual' }).click();
      for (const [label, value] of [
        ['Threshold', '50'],
        ['Size from', '10'],
        ['Size to', '200'],
      ]) {
        await page.getByLabel(label, { exact: true }).fill(value);
      }
      await expect(page.getByRole('switch', { name: 'Find targets' })).toBeChecked();

      // Loading an image starts the pattern over, so the decals become the whole pattern
      await page.getByLabel('Choose a wall image').setInputFiles(await drawnWall(page));
      await expect(page.getByText('6 targets found.', { exact: false })).toBeVisible();
      await expect.poll(() => shapes(page, 'auto-target')).toBe(6);
      await page.getByRole('button', { name: 'Add the targets as shots' }).click();
      await expect(statusBar(page)).toContainText('6 shots');
      await expect.poll(() => shapes(page, 'auto-target')).toBe(0);
      expect(await violations(page)).toEqual([]);
    });
  });
}

test('has no accessibility violations', async ({ page }) => {
  await open(page);
  expect(await violations(page)).toEqual([]);
  await topBar(page)
    .getByRole('button', { name: /Change weapon/ })
    .click();
  await expect(page.getByRole('option').first()).toBeVisible();
  expect(await violations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  for (const section of ['Screenshot library', 'Saved sessions', 'Import discovery JSON']) {
    await page.getByRole('navigation', { name: 'Studio sections' }).getByRole('button', { name: section }).click();
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
    expect(await violations(page), section).toEqual([]);
  }
  await page.getByRole('navigation', { name: 'Studio sections' }).getByRole('button', { name: 'Capture' }).click();
  await page.keyboard.press('o');
  await expect(page.getByRole('region', { name: 'Saved spec against the candidate' })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test.describe('discovery with the Python pipeline', () => {
  test.describe.configure({ mode: 'serial' });
  let spray: { clip: string; wall: string } | null = null;
  let dir = '';

  test.beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spraydown-e2e-studio-'));
    spray = writeSyntheticSpray(dir);
  });
  test.afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  test.beforeEach(() => test.skip(!spray, 'needs Python with the processing requirements (CI has them)'));

  const choose = async (page: Page, label: string, option: string) => {
    await page.getByRole('dialog').getByRole('combobox', { name: label }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };

  test('analyzes a recorded clip and saves the session', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await page
      .getByRole('navigation', { name: 'Studio sections' })
      .getByRole('button', { name: 'Saved sessions' })
      .click();
    await page.getByLabel('Import clips and their wall screenshots').setInputFiles(spray!.clip);
    await expect(page.getByText('Imported 1 clip into the Live tab.')).toBeVisible();
    await page.getByRole('button', { name: 'Go to Capture' }).click();
    await expect(page.getByRole('tab', { name: 'Live' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Spray #1 (spray_01.webm)')).toBeVisible();
    // Every progress the analysis shows, to check it reported progress on the way
    await page.evaluate(() => {
      const seen: string[] = ((window as unknown as { progress: string[] }).progress = []);
      new MutationObserver(() => {
        const bar = document.querySelector('[aria-label="Analysis progress"]');
        if (bar) seen.push(bar.parentElement?.textContent ?? '');
      }).observe(document.body, { childList: true, characterData: true, subtree: true });
    });

    await page.getByRole('button', { name: 'Analyze the sprays' }).click();
    const confirm = page.getByRole('dialog', { name: 'Analyze the sprays' });
    await expect(confirm).toBeVisible();
    await choose(page, 'Weapon', 'R-301');
    await expect(confirm.getByLabel('Keep the files in the captures')).toBeChecked();
    expect(await violations(page)).toEqual([]);
    const accepted = page.waitForResponse('**/api/discovery/process-session');
    await confirm.getByRole('button', { name: 'Analyze' }).click();
    await expect(confirm).toBeHidden();
    expect((await accepted).status()).toBe(202);

    const result = page.getByRole('status').filter({ hasText: 'Analysis complete' });
    await expect(result).toBeVisible({ timeout: 90_000 });
    await expect(result).toContainText('6 found');
    await expect(result).toContainText('Kept in the captures');
    const progress = await page.evaluate(() => (window as unknown as { progress: string[] }).progress);
    expect(progress.some((p) => /\d+%/.test(p))).toBe(true);
    await expect(weaponButton(page, 'R-301')).toBeVisible();

    // The session's frame and the comparison
    await expect.poll(() => backgroundImage(page)).toMatchObject({ visible: true });
    await result.getByRole('button', { name: 'Compare' }).click();
    await expect(page.getByRole('region', { name: 'Saved spec against the candidate' })).toBeVisible();
    await page.getByRole('button', { name: 'Close the comparison' }).click();
    await expect(page.getByRole('region', { name: 'Saved spec against the candidate' })).toBeHidden();
  });

  test('loads the saved session', async ({ page }) => {
    await open(page);
    await page
      .getByRole('navigation', { name: 'Studio sections' })
      .getByRole('button', { name: 'Saved sessions' })
      .click();
    await page.getByRole('button', { name: 'Refresh' }).click();
    await page
      .getByRole('button', { name: /^Load the R-301 session/ })
      .first()
      .click();
    await expect(page.getByText(/Loaded 1 spray of R-301 into the Live tab/)).toBeVisible();
    await expect(weaponButton(page, 'R-301')).toBeVisible();
    await page.getByRole('button', { name: 'Go to Capture' }).click();
    await expect(page.getByText(/^Spray #1 \(/)).toBeVisible();
  });

  test('analyzes a wall screenshot and keeps it in the library', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, 'R-301');
    await page.getByRole('tab', { name: 'Screenshots' }).click();
    await page.getByLabel('Choose wall screenshots').setInputFiles(spray!.wall);
    await page.getByRole('button', { name: 'Analyze 1 screenshot' }).click();
    const confirm = page.getByRole('dialog', { name: 'Analyze the screenshots' });
    // Screenshots are not kept unless asked; the library needs this one
    await expect(confirm.getByLabel('Keep the files in the captures')).not.toBeChecked();
    await confirm.getByLabel('Keep the files in the captures').check();
    const accepted = page.waitForResponse('**/api/discovery/process-static-image');
    await confirm.getByRole('button', { name: 'Analyze' }).click();
    expect((await accepted).status()).toBe(202);

    // The decals in this small synthetic wall are below what the static pipeline detects, as in the
    // server tests: the run completes, and pytest covers the detection itself
    const result = page.getByRole('status').filter({ hasText: 'Analysis complete' });
    await expect(result).toBeVisible({ timeout: 90_000 });
    await expect(result).toContainText('1 analyzed');
    await expect(result).toContainText('Kept in the captures');

    // The saved screenshot comes back from the library
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh the library' }).click();
    await page.getByRole('combobox', { name: 'Saved screenshot' }).click();
    await page
      .getByRole('option', { name: /spray_01_wall/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Added 1 screenshot.')).toBeVisible();
    await expect.poll(() => backgroundImage(page)).toMatchObject({ visible: true });
  });
});
