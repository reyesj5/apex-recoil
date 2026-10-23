import { test as base, expect, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export { expect };

export const root = path.join(__dirname, '..');
export const specs: { name: string; rpm: number; mags: { size: number }[]; x: number[] }[] = JSON.parse(
  fs.readFileSync(path.join(root, 'client', 'specs.json'), 'utf8'),
);
export const site: { name: string } = JSON.parse(fs.readFileSync(path.join(root, 'site.json'), 'utf8'));
// The second e2e server, with analytics turned on (playwright.config.ts)
export const ANALYTICS_URL = 'http://127.0.0.1:3211';

const isApp = (url: string) => /^http:\/\/127\.0\.0\.1:321\d\//.test(url);

// Every test fails on an uncaught page error, a console error or a failed request to the app, so a
// broken page cannot pass by accident. Other origins (web fonts while offline) do not count.
export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
      page.on('console', (msg) => {
        const url = msg.location().url;
        if (msg.type() === 'error' && (!url || isApp(url))) problems.push(`console error: ${msg.text()}`);
      });
      page.on('response', (res) => {
        if (res.status() >= 400 && isApp(res.url())) problems.push(`HTTP ${res.status()} ${res.url()}`);
      });
      page.on('requestfailed', (req) => {
        const error = req.failure()?.errorText;
        if (isApp(req.url()) && error !== 'net::ERR_ABORTED') problems.push(`request failed: ${req.url()} ${error}`);
      });
      await use(problems);
      expect(problems, 'page errors, console errors and failed requests').toEqual([]);
    },
    { auto: true },
  ],
});

/** The page's localStorage entries whose keys start with `prefix`. */
export function storage(page: Page, prefix: string): Promise<Record<string, string>> {
  return page.evaluate(
    (p) => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith(p))),
    prefix,
  );
}

/** Clicks the Konva stage at a fraction of its size. */
export async function clickStage(page: Page, fx: number, fy: number) {
  const box = await page.locator('#stage .konvajs-content').boundingBox();
  if (!box) throw new Error('the stage is not visible');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

/**
 * Writes the synthetic spray used by the server tests (6 shots at 600 RPM): a clip and its last
 * frame as a wall screenshot. Needs Python with the processing requirements; returns null without
 * them so local runs can skip the analysis scenarios (CI must have them).
 */
export function writeSyntheticSpray(dir: string): { clip: string; wall: string } | null {
  const clip = path.join(dir, 'spray_01.webm');
  const wall = path.join(dir, 'spray_01_wall.png');
  const script = path.join(root, 'test', 'fixtures', 'synthetic_spray.py');
  const run = spawnSync(process.env.PYTHON || 'python', [script, clip, wall], { encoding: 'utf8' });
  if (run.status !== 0) {
    if (process.env.CI) throw new Error(`synthetic spray: ${run.stderr || run.error}`);
    return null;
  }
  return { clip, wall };
}
