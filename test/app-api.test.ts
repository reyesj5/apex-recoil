import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { discoveryStatus, sessionList, specHistory, specList } from '../shared/api.ts';
import { createApp } from '../server/app.ts';
import { DatabaseService, type SpecDoc } from '../server/db.ts';
import { JobQueue } from '../server/job-queue.ts';
import { AssetStorageService } from '../server/storage.ts';

const root = path.join(import.meta.dirname, '..');

// The app runs on a throwaway database, specs.json, captures and upload folder: these tests must
// never touch data/recoil.db or client/specs.json.
const realSpecsPath = path.join(root, 'client', 'specs.json');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex_api_test_'));
const specsPath = path.join(tempDir, 'specs.json');
const capturesDir = path.join(tempDir, 'captures');
const uploadDir = path.join(tempDir, 'uploads');
fs.copyFileSync(realSpecsPath, specsPath);

const sessionId = 'session_r301_auto_1720000000000';
fs.mkdirSync(path.join(capturesDir, sessionId), { recursive: true });
fs.writeFileSync(path.join(capturesDir, sessionId, 'spray_01.webm'), 'fake video');
fs.writeFileSync(path.join(capturesDir, sessionId, 'spray_01_wall.jpg'), 'fake image');

const db = new DatabaseService(path.join(tempDir, 'recoil.db'), specsPath);
const storage = new AssetStorageService({ provider: 'local', localBaseDir: capturesDir });
const jobQueue = new JobQueue({ storage });

const distDir = path.join(root, 'dist');
const built = fs.existsSync(path.join(distDir, 'trainer.js'));

const importRe = /(?:import|from)\s*["'](\.{1,2}\/[^"']+\.js)["']/g;

// Concatenate a built entry with every chunk it statically imports.
function readEntryGraph(entryFile: string, seen = new Set<string>()): string {
  if (seen.has(entryFile)) return '';
  seen.add(entryFile);
  const code = fs.readFileSync(entryFile, 'utf8');
  let combined = code;
  for (const m of code.matchAll(importRe)) {
    combined += readEntryGraph(path.resolve(path.dirname(entryFile), m[1]), seen);
  }
  return combined;
}

// A built file and every chunk it statically imports, without those in `seen`.
function entryFiles(entryFile: string, seen = new Set<string>()) {
  if (seen.has(entryFile)) return seen;
  seen.add(entryFile);
  for (const m of fs.readFileSync(entryFile, 'utf8').matchAll(importRe)) {
    entryFiles(path.resolve(path.dirname(entryFile), m[1]), seen);
  }
  return seen;
}

/** A JSON response's body, for the fields a test reads */
async function json<T = Record<string, unknown>>(res: Response) {
  return (await res.json()) as T;
}

describe('API Endpoints (SQLite Specs & Versioning)', () => {
  let server: http.Server;
  let baseUrl: string;
  const originalSpecs = JSON.parse(fs.readFileSync(realSpecsPath, 'utf8')) as SpecDoc[];
  const post = (url: string, body: unknown) =>
    fetch(`${baseUrl}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  before(async () => {
    await db.init();
    const app = await createApp({ db, storage, jobQueue, uploadDir });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await jobQueue.close();
    await db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('GET /api/specs returns client/specs.json content in file order', async () => {
    const res = await fetch(`${baseUrl}/api/specs`);
    assert.equal(res.status, 200);
    const specs = await json<SpecDoc[]>(res);
    assert.ok(Array.isArray(specs));
    assert.ok(specs.length >= 31);
    assert.deepEqual(
      specs.map((s) => s.name),
      originalSpecs.map((s) => s.name),
    );
    // Lossless: optional fields (raw_1x_*), absent multipliers and mods survive the database
    assert.deepEqual(JSON.parse(JSON.stringify(specs)), JSON.parse(JSON.stringify(originalSpecs)));
    // And the browser's schema takes them
    assert.ok(specList.safeParse(specs).success);
  });

  test('a request addressed to any host but this computer is refused, while there is no sign-in', async () => {
    const port = (server.address() as { port: number }).port;
    const status = (host: string) =>
      new Promise<number>((resolve, reject) => {
        http
          .get({ host: '127.0.0.1', port, path: '/api/specs', headers: { Host: host } }, (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          })
          .on('error', reject);
      });
    // A page elsewhere can point its own name at this computer and have the browser call the API
    assert.equal(await status('example.com'), 403);
    assert.equal(await status(`example.com:${port}`), 403);
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`, 'localhost', `[::1]:${port}`]) {
      assert.equal(await status(host), 200, host);
    }
  });

  test('GET /api/specs/history/:weapon returns revision history', async () => {
    const res = await fetch(`${baseUrl}/api/specs/history/r301`);
    assert.equal(res.status, 200);
    const data = specHistory.parse(await res.json());
    assert.equal(data.success, true);
    assert.equal(data.weapon, 'r301');
    assert.ok(Array.isArray(data.history));
    assert.ok(data.history.length >= 1);
  });

  test('POST /api/specs merges a partial update, versions it and rewrites only that weapon', async () => {
    const havoc = originalSpecs.find((s) => s.name === 'havoc_tc')!;
    assert.ok(havoc.raw_1x_x, 'fixture: havoc_tc carries raw_1x_x');

    const postRes = await post('/api/specs', {
      weapon: {
        name: 'havoc_tc',
        rpm: (havoc.rpm as number) + 1,
        x: havoc.x,
        y: havoc.y,
        time_points: havoc.time_points,
      },
      author: 'integration_test',
      notes: 'API test update',
    });

    assert.equal(postRes.status, 200);
    const postData = await json<{ success: boolean; weapon: string; version: number }>(postRes);
    assert.equal(postData.success, true);
    assert.equal(postData.weapon, 'havoc_tc');
    assert.ok(postData.version >= 2);

    const written = JSON.parse(fs.readFileSync(specsPath, 'utf8')) as SpecDoc[];
    const savedHavoc = written.find((s) => s.name === 'havoc_tc')!;
    assert.equal(savedHavoc.rpm, (havoc.rpm as number) + 1);
    assert.deepEqual(savedHavoc.raw_1x_x, havoc.raw_1x_x);
    assert.deepEqual(savedHavoc.mods, havoc.mods);
    assert.deepEqual(
      written.map((s) => s.name),
      originalSpecs.map((s) => s.name),
    );
    written
      .filter((s) => s.name !== 'havoc_tc')
      .forEach((s) => {
        assert.deepEqual(
          s,
          originalSpecs.find((o) => o.name === s.name),
        );
      });

    const histRes = await fetch(`${baseUrl}/api/specs/history/havoc_tc`);
    const histData = specHistory.parse(await histRes.json());
    assert.equal(histData.history[0].author, 'integration_test');
    assert.ok(histData.history.length >= 2);
  });

  test('POST /api/specs with unchanged content does not create a version', async () => {
    const specs = await json<SpecDoc[]>(await fetch(`${baseUrl}/api/specs`));
    const r99 = specs.find((s) => s.name === 'r99');
    const data = await json<{ success: boolean; unchanged: boolean }>(await post('/api/specs', { weapon: r99 }));
    assert.equal(data.success, true);
    assert.equal(data.unchanged, true);
  });

  test('POST /api/specs keeps edits made to specs.json outside the API', async () => {
    const external = JSON.parse(fs.readFileSync(specsPath, 'utf8')) as SpecDoc[];
    external.find((s) => s.name === 'volt')!.rpm = 777;
    fs.writeFileSync(specsPath, JSON.stringify(external, null, 4));

    const r301 = external.find((s) => s.name === 'r301')!;
    const res = await post('/api/specs', {
      weapon: { name: 'r301', rpm: (r301.rpm as number) + 1, x: r301.x, y: r301.y, time_points: r301.time_points },
    });
    assert.equal(res.status, 200);

    const written = JSON.parse(fs.readFileSync(specsPath, 'utf8')) as SpecDoc[];
    assert.equal(written.find((s) => s.name === 'volt')!.rpm, 777);
    assert.equal(written.find((s) => s.name === 'r301')!.rpm, (r301.rpm as number) + 1);
  });

  test('POST /api/specs rejects invalid specs', async () => {
    const res = await post('/api/specs', { weapon: { name: 'broken', x: [0, 1], y: [0], time_points: [0, 1] } });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'Invalid weapon spec schema' });

    // A pattern is numbers, and a list of specs names the one that is wrong
    const text = await post('/api/specs', { weapon: { name: 'broken', x: ['0'], y: [0], time_points: [0] } });
    assert.equal(text.status, 400);
    const list = await post('/api/specs', [{ name: 'r99', x: [], y: [], time_points: [] }, { name: '' }]);
    assert.equal(list.status, 400);
    assert.deepEqual(await list.json(), { error: 'Invalid spec schema at index 1' });
    const neither = await post('/api/specs', { name: 'r99' });
    assert.deepEqual(await neither.json(), { error: 'Expected array of specs or { weapon: ... }' });
  });

  test('GET /api/discovery/status names the storage and the job queue', async () => {
    const res = await fetch(`${baseUrl}/api/discovery/status`);
    assert.equal(res.status, 200);
    const status = await res.json();
    assert.deepEqual(status, { success: true, storage: 'local', queue: 'memory' });
    assert.ok(discoveryStatus.safeParse(status).success);
  });

  test('GET /api/discovery/sessions lists loadable samples with indexed metadata', async () => {
    await db.recordDiscoverySession({
      id: sessionId,
      weapon: 'r301',
      mode: 'auto',
      shot_count: 28,
      sample_count: 1,
      measured_rpm: 811.5,
      convergence_score: 97.2,
      storage_path: '/captures/' + sessionId,
      timestamp: 1720000000000,
    });

    const res = await fetch(`${baseUrl}/api/discovery/sessions`);
    assert.equal(res.status, 200);
    const data = sessionList.parse(await res.json());
    assert.equal(data.success, true);
    const session = data.sessions.find((s) => s.id === sessionId);
    assert.ok(session, 'session folder should be listed');
    assert.equal(session.samples.length, 1);
    assert.equal(session.samples[0].videoUrl, `/captures/${sessionId}/spray_01.webm`);
    assert.equal(session.samples[0].screenshotUrl, `/captures/${sessionId}/spray_01_wall.jpg`);
    assert.equal(session.measured_rpm, 811.5);
    assert.equal(session.convergence_score, 97.2);

    const videoRes = await fetch(`${baseUrl}${session.samples[0].videoUrl}`);
    assert.equal(videoRes.status, 200);
  });

  test('rejected uploads leave no temp files behind', async () => {
    const form = new FormData();
    form.append('mode', 'auto');
    form.append('videos', new Blob(['fake video'], { type: 'video/webm' }), 'spray_01.webm');
    const res = await fetch(`${baseUrl}/api/discovery/process-session`, { method: 'POST', body: form });
    assert.equal(res.status, 400);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(fs.readdirSync(uploadDir), []);
  });

  test('upload limit errors are returned as JSON', async () => {
    const form = new FormData();
    form.append('weapon', 'r301');
    for (let i = 0; i < 31; i++) {
      form.append('images', new Blob(['x'], { type: 'image/jpeg' }), `shot_${i}.jpg`);
    }
    const res = await fetch(`${baseUrl}/api/discovery/process-static-image`, { method: 'POST', body: form });
    assert.equal(res.status, 413);
    const data = await json(res);
    assert.equal(data.success, false);
  });

  test('pages load their own route bundle', async () => {
    const index = await (await fetch(`${baseUrl}/`)).text();
    assert.match(index, /src="\/trainer\.js"/);
    assert.doesNotMatch(index, /src="\/studio\.js"/);

    const studio = await (await fetch(`${baseUrl}/editor`)).text();
    assert.match(studio, /src="\/studio\.js"/);
    assert.doesNotMatch(studio, /src="\/trainer\.js"/);
    // The preview's address leads to it
    const preview = await fetch(`${baseUrl}/editor/next`, { redirect: 'manual' });
    assert.equal(preview.status, 301);
    assert.equal(preview.headers.get('location'), '/editor');
  });

  test('moves the old previews to their pages and answers unknown addresses with 404', async () => {
    const preview = await fetch(`${baseUrl}/next/ru/patterns`, { redirect: 'manual' });
    assert.equal(preview.status, 301);
    assert.equal(preview.headers.get('location'), '/ru/patterns');
    assert.equal((await fetch(`${baseUrl}/next`, { redirect: 'manual' })).headers.get('location'), '/');

    // A browser gets the 404 page; a script or stylesheet that doesn't exist, a bare 404
    const page = await fetch(`${baseUrl}/no-such-page`, { headers: { Accept: 'text/html' } });
    assert.equal(page.status, 404);
    assert.match(await page.text(), /data-page="not-found"/);
    const script = await fetch(`${baseUrl}/no-such-script.js`);
    assert.equal(script.status, 404);
    assert.doesNotMatch(await script.text(), /data-page/);
  });

  test('answers a request it fails with the error page, or plain text', async () => {
    // An address that can't be decoded fails in the router
    const page = await fetch(`${baseUrl}/%E0%A4%A`, { headers: { Accept: 'text/html' } });
    assert.equal(page.status, 400);
    const html = await page.text();
    if (fs.existsSync(path.join(root, 'dist-ssr', 'prerender.mjs'))) {
      assert.match(html, /data-page="error"/);
      assert.match(html, /<meta name="robots" content="noindex">/);
    }
    const plain = await fetch(`${baseUrl}/%E0%A4%A`);
    assert.equal(plain.status, 400);
    assert.match(plain.headers.get('content-type') ?? '', /^text\/plain/);
  });

  test(
    'serves Vite bundles with the trainer split from the Studio',
    { skip: !built && 'run `pnpm build` first' },
    async () => {
      const trainerRes = await fetch(`${baseUrl}/trainer.js`);
      assert.equal(trainerRes.status, 200);
      const studioRes = await fetch(`${baseUrl}/studio.js`);
      assert.equal(studioRes.status, 200);

      // One stylesheet for every page, with the utilities the Studio uses (h-screen) as well
      const cssRes = await fetch(`${baseUrl}/app.css`);
      assert.equal(cssRes.status, 200);
      assert.match(await cssRes.text(), /\.h-screen\{/);
      assert.equal((await fetch(`${baseUrl}/tailwind.css`)).status, 404);

      // The trainer must not ship (or execute) the Studio, which builds on its own
      const trainerGraph = readEntryGraph(path.join(distDir, 'trainer.js'));
      assert.ok(!trainerGraph.includes('/api/discovery/process-session'), 'trainer bundle pulls in Studio code');
      const studioGraph = readEntryGraph(path.join(distDir, 'studio.js'));
      assert.ok(studioGraph.includes('/api/discovery/process-session'));
    },
  );

  // The new pages' budget (docs/ui-migration-plan.md, Phase 2): at most 200 kB (200,000 bytes) of
  // JavaScript, gzip, on first load: the entry, what it imports statically, and on the Russian and
  // Chinese pages the catalog the page waits for before it renders
  test(
    'keeps the new pages within 200 kB of JavaScript on first load',
    { skip: !built && 'run `pnpm build` first' },
    () => {
      const gzipSize = (files: Set<string>) =>
        [...files].reduce((sum, file) => sum + zlib.gzipSync(fs.readFileSync(file)).length, 0);
      const chunks = fs.readdirSync(path.join(distDir, 'chunks'));
      const catalog = (locale: string) => {
        const name = chunks.find((file) => new RegExp(`^${locale}-[\\w-]{8}\\.js$`).test(file));
        assert.ok(name, `no catalog chunk for ${locale}`);
        return path.join(distDir, 'chunks', name);
      };
      for (const entry of ['trainer', 'patterns', 'progress', 'docs']) {
        const files = entryFiles(path.join(distDir, `${entry}.js`));
        const sizes = {
          en: gzipSize(files),
          ru: gzipSize(entryFiles(catalog('ru'), new Set(files))),
          'zh-CN': gzipSize(entryFiles(catalog('zh-CN'), new Set(files))),
        };
        for (const [locale, size] of Object.entries(sizes)) {
          assert.ok(
            size <= 200000,
            `${entry} in ${locale}: ${(size / 1000).toFixed(1)} kB of JavaScript on first load`,
          );
        }
      }
    },
  );
});
