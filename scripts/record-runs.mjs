// Records runs of the current trainer (views/index.pug and client/game.ts) for the engine's parity
// test (client/engine/run.test.ts). Under Playwright's fake clock, paused so that time only moves when
// the script advances it, scripted sprays are fired in Chrome while an init script logs, in order,
// every mouse event (in stage coordinates) and every animation frame the page sees. The page's own
// result per run comes from its window.__spraydownLastRun hook. Runs until Phase 2.8 removes the page.
//   pnpm build && PORT=3220 node e2e/server.mjs      (in another terminal)
//   node scripts/record-runs.mjs http://127.0.0.1:3220 client/engine/recorded-runs.fixture.json
/* global window, document -- the functions handed to the page run there */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [base = 'http://127.0.0.1:3220', out] = process.argv.slice(2);
const specs = JSON.parse(fs.readFileSync(path.join(root, 'client', 'specs.json'), 'utf8'));
const FRAME = 16;

// The pattern the page scores against, to script a plausible pull against it
function patternOf(settings) {
  const spec = structuredClone(specs.find((s) => s.name === settings['game::weapon']));
  for (const mod of (settings['game::mods'] || '').split(',').filter(Boolean)) Object.assign(spec, spec.mods[mod]);
  const sc = Math.max(0.1, Math.min(10, 1 / Number(settings['game::sens'] || 5)));
  const my = settings['game::invert-y'] === 'true' ? -1 : 1;
  return { spec, points: spec.x.map((x, i) => ({ x: x * sc, y: my * spec.y[i] * sc })) };
}

function patternAt({ spec, points }, t) {
  const tp = spec.time_points;
  let i = 0;
  while (i + 1 < points.length && t > tp[i + 1]) i++;
  if (i + 1 >= points.length) return points[points.length - 1];
  const f = Math.max(0, Math.min(1, (t - tp[i]) / (tp[i + 1] - tp[i])));
  return { x: points[i].x + (points[i + 1].x - points[i].x) * f, y: points[i].y + (points[i + 1].y - points[i].y) * f };
}

const defaults = {
  'game::mute': 'true',
  'game::show-instructions': 'false',
  'game::hint': 'true',
  'game::moving-target': 'false',
  'game::speed': '100',
};

// Each run: settings and a script. hold: keep the trigger down until releaseAt or the end; clicks:
// single presses at these times (ms after the first). track: how the cursor follows the pattern.
const runs = [
  { name: 'R-99, base magazine, full auto, close tracking', settings: { 'game::weapon': 'r99', 'game::mag': '0', 'game::sens': '5' }, hold: true, track: { gain: 1, noise: 2, lag: 0 } },
  { name: 'R-301, level 2 magazine, full auto, inverted Y, loose tracking', settings: { 'game::weapon': 'r301', 'game::mag': '2', 'game::sens': '3.5', 'game::invert-y': 'true' }, hold: true, track: { gain: 0.8, noise: 6, lag: 60 } },
  { name: 'Flatline, level 3 magazine, full auto, no compensation', settings: { 'game::weapon': 'flatline', 'game::mag': '3', 'game::sens': '7' }, hold: true, track: { gain: 0, noise: 1, lag: 0 } },
  { name: 'Spitfire, level 1 magazine with the corrupted stock', settings: { 'game::weapon': 'spitfire', 'game::mag': '1', 'game::sens': '4', 'game::corrupted-stock': 'true' }, hold: true, track: { gain: 1, noise: 4, lag: 30 } },
  { name: 'Rampage with the thermite grenade', settings: { 'game::weapon': 'rampage', 'game::mag': '0', 'game::sens': '5', 'game::mods': 'revved_up' }, hold: true, track: { gain: 0.9, noise: 3, lag: 20 } },
  { name: 'R-99 at half firing speed (not counted in the history)', settings: { 'game::weapon': 'r99', 'game::mag': '1', 'game::sens': '5', 'game::speed': '50' }, hold: true, track: { gain: 1, noise: 3, lag: 0 }, speed: 0.5 },
  { name: 'R-99 released early', settings: { 'game::weapon': 'r99', 'game::mag': '0', 'game::sens': '5' }, hold: true, releaseAt: 480, track: { gain: 1, noise: 2, lag: 0 } },
  { name: 'Hemlok, bursts with the trigger held', settings: { 'game::weapon': 'hemlok', 'game::mag': '0', 'game::sens': '5', 'game::fire-mode': 'burst' }, hold: true, holdFor: 3600, track: { gain: 0.6, noise: 3, lag: 0 } },
  { name: 'Prowler, bursts with the trigger held', settings: { 'game::weapon': 'prowler', 'game::mag': '0', 'game::sens': '5', 'game::fire-mode': 'burst' }, hold: true, holdFor: 2600, track: { gain: 0.5, noise: 3, lag: 0 } },
  { name: 'R-301 single fire, clicked fast (some clicks inside the refire delay)', settings: { 'game::weapon': 'r301', 'game::mag': '0', 'game::sens': '5', 'game::fire-mode': 'single' }, clicks: Array.from({ length: 40 }, (_, i) => 90 + i * 110), track: { gain: 0, noise: 3, lag: 0 } },
  { name: 'Wingman single fire, clicked slowly', settings: { 'game::weapon': 'wingman', 'game::mag': '0', 'game::sens': '5' }, clicks: [420, 840, 1260, 1680], track: { gain: 0, noise: 2, lag: 0 } },
  { name: 'G7 Scout single fire, left idle until it times out', settings: { 'game::weapon': 'g7_scout', 'game::mag': '0', 'game::sens': '5' }, clicks: [300, 600], idleUntil: 3600, track: { gain: 0, noise: 2, lag: 0 } },
];

// Runs in the page before its scripts: logs mouse events and animation frames with the page's time
const recorderInit = () => {
  const log = [];
  window.__rec = { log };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    raf((ts) => {
      log.push(['frame', Date.now()]);
      cb(ts);
    });
  for (const type of ['mousemove', 'mousedown', 'mouseup']) {
    window.addEventListener(type, (e) => log.push([type.slice(5), Date.now(), e.clientX, e.clientY]), true);
  }
};

const browser = await chromium.launch({ channel: 'chrome' });
const recorded = [];
for (const run of runs) {
  const settings = { ...defaults, ...run.settings };
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-10-23T12:00:00Z') });
  await page.addInitScript(recorderInit);
  await page.addInitScript((s) => {
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, settings);
  await page.goto(base + '/');
  await page.locator('#weapon-select > .btn').first().waitFor();
  // Stop real time: from here the clock moves only when the script advances it, so the logged
  // times are the times the page reads
  await page.clock.pauseAt(new Date('2026-10-23T12:01:00Z'));
  await page.clock.runFor(500);
  const box = await page.locator('#stage .konvajs-content').boundingBox();
  const start = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height * 0.5) };
  await page.mouse.move(start.x, start.y);
  await page.clock.runFor(2 * FRAME);
  const pattern = patternOf(settings);
  const speed = run.speed ?? 1;
  const tp = pattern.spec.time_points;
  const fullTime =
    run.holdFor ??
    (run.clicks ? (run.idleUntil ?? run.clicks[run.clicks.length - 1] + 700) : tp[Math.min(tp.length, 40) - 1] / speed + 250);
  const end = run.releaseAt ?? fullTime;
  const cursorAt = (t) => {
    const p = patternAt(pattern, Math.max(0, (t - run.track.lag) * speed));
    return {
      x: Math.round(start.x - run.track.gain * p.x + run.track.noise * Math.sin(t / 90)),
      y: Math.round(start.y - run.track.gain * p.y + run.track.noise * Math.cos(t / 130)),
    };
  };
  await page.mouse.down();
  if (!run.hold) await page.mouse.up();
  const clicks = [...(run.clicks ?? [])];
  for (let t = FRAME; t <= end; t += FRAME) {
    const c = cursorAt(t);
    await page.mouse.move(c.x, c.y);
    while (clicks.length && clicks[0] <= t) {
      clicks.shift();
      await page.mouse.down();
      await page.mouse.up();
    }
    await page.clock.runFor(FRAME);
  }
  if (run.hold) await page.mouse.up();
  await page.clock.runFor(3000);
  const data = await page.evaluate(() => ({
    log: window.__rec.log,
    lastRun: window.__spraydownLastRun ?? null,
    stats: localStorage.getItem('game::stats'),
    rect: (() => {
      const r = document.querySelector('#stage .konvajs-content').getBoundingClientRect();
      return { left: r.left, top: r.top };
    })(),
  }));
  await context.close();
  if (!data.lastRun) throw new Error(`${run.name}: the run did not finish`);
  const firstDown = data.log.findIndex((e) => e[0] === 'down');
  const t0 = data.log[firstDown][1];
  const events = data.log
    .slice(firstDown)
    .filter((e) => e[1] <= data.lastRun.finishedAt)
    .map((e) => (e[0] === 'frame' ? ['frame', e[1] - t0] : [e[0], e[1] - t0, e[2] - data.rect.left, e[3] - data.rect.top]));
  const stats = JSON.parse(data.stats || '[]');
  recorded.push({
    name: run.name,
    settings,
    events,
    result: {
      score: data.lastRun.score,
      shots: data.lastRun.shots,
      finishedAt: data.lastRun.finishedAt - t0,
      hitTimes: data.lastRun.hitTimes.map((t) => t - t0),
      hitScores: data.lastRun.hitScores,
    },
    stored: stats.length ? stats[0].todayResults.at(-1) : null,
  });
  console.log(`${run.name}: ${data.lastRun.shots} shots, score ${(100 * data.lastRun.score).toFixed(3)}`);
}
await browser.close();

if (out) {
  const target = path.resolve(root, out);
  const fixture = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : {};
  fixture.runs = recorded;
  fs.writeFileSync(target, JSON.stringify(fixture) + '\n');
  console.log(`wrote ${recorded.length} runs to ${path.relative(root, target)}`);
}
