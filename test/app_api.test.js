const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Point the app at a throwaway database, specs.json, captures and upload folder before it
// loads: these tests must never touch data/recoil.db or client/specs.json.
const realSpecsPath = path.join(__dirname, '..', 'client', 'specs.json');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex_api_test_'));
const specsPath = path.join(tempDir, 'specs.json');
const capturesDir = path.join(tempDir, 'captures');
const uploadDir = path.join(tempDir, 'uploads');
process.env.RECOIL_DB_PATH = path.join(tempDir, 'recoil.db');
process.env.RECOIL_SPECS_PATH = specsPath;
process.env.RECOIL_CAPTURES_DIR = capturesDir;
process.env.RECOIL_UPLOAD_TMP_DIR = uploadDir;
fs.copyFileSync(realSpecsPath, specsPath);

const sessionId = 'session_r301_auto_1720000000000';
fs.mkdirSync(path.join(capturesDir, sessionId), { recursive: true });
fs.writeFileSync(path.join(capturesDir, sessionId, 'spray_01.webm'), 'fake video');
fs.writeFileSync(path.join(capturesDir, sessionId, 'spray_01_wall.jpg'), 'fake image');

const app = require('../app');
const { dbService } = require('../server/db');

const distDir = path.join(__dirname, '..', 'dist');

// Concatenate a built entry with every chunk it statically imports.
function readEntryGraph(entryFile, seen = new Set()) {
  if (seen.has(entryFile)) return '';
  seen.add(entryFile);
  const code = fs.readFileSync(entryFile, 'utf8');
  let combined = code;
  const importRe = /(?:import|from)\s*["'](\.{1,2}\/[^"']+\.js)["']/g;
  let m;
  while ((m = importRe.exec(code)) !== null) {
    combined += readEntryGraph(path.resolve(path.dirname(entryFile), m[1]), seen);
  }
  return combined;
}

describe('API Endpoints (SQLite Specs & Versioning)', () => {
  let server;
  let baseUrl;
  const originalText = fs.readFileSync(realSpecsPath, 'utf8');
  const originalSpecs = JSON.parse(originalText);

  before(async () => {
    await dbService.init();
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await dbService.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('GET /api/specs returns client/specs.json content in file order', async () => {
    const res = await fetch(`${baseUrl}/api/specs`);
    assert.equal(res.status, 200);
    const specs = await res.json();
    assert.ok(Array.isArray(specs));
    assert.ok(specs.length >= 31);
    assert.deepEqual(specs.map(s => s.name), originalSpecs.map(s => s.name));
    // Lossless: optional fields (raw_1x_*), absent multipliers and mods survive the database
    assert.deepEqual(JSON.parse(JSON.stringify(specs)), JSON.parse(JSON.stringify(originalSpecs)));
  });

  test('GET /api/specs/history/:weapon returns revision history', async () => {
    const res = await fetch(`${baseUrl}/api/specs/history/r301`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.weapon, 'r301');
    assert.ok(Array.isArray(data.history));
    assert.ok(data.history.length >= 1);
  });

  test('POST /api/specs merges a partial update, versions it and rewrites only that weapon', async () => {
    const havoc = originalSpecs.find(s => s.name === 'havoc_tc');
    assert.ok(havoc.raw_1x_x, 'fixture: havoc_tc carries raw_1x_x');

    const postRes = await fetch(`${baseUrl}/api/specs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weapon: { name: 'havoc_tc', rpm: havoc.rpm + 1, x: havoc.x, y: havoc.y, time_points: havoc.time_points },
        author: 'integration_test',
        notes: 'API test update'
      })
    });

    assert.equal(postRes.status, 200);
    const postData = await postRes.json();
    assert.equal(postData.success, true);
    assert.equal(postData.weapon, 'havoc_tc');
    assert.ok(postData.version >= 2);

    const written = JSON.parse(fs.readFileSync(specsPath, 'utf8'));
    const savedHavoc = written.find(s => s.name === 'havoc_tc');
    assert.equal(savedHavoc.rpm, havoc.rpm + 1);
    assert.deepEqual(savedHavoc.raw_1x_x, havoc.raw_1x_x);
    assert.deepEqual(savedHavoc.mods, havoc.mods);
    assert.deepEqual(written.map(s => s.name), originalSpecs.map(s => s.name));
    written.filter(s => s.name !== 'havoc_tc').forEach((s) => {
      assert.deepEqual(s, originalSpecs.find(o => o.name === s.name));
    });

    const histRes = await fetch(`${baseUrl}/api/specs/history/havoc_tc`);
    const histData = await histRes.json();
    assert.equal(histData.history[0].author, 'integration_test');
    assert.ok(histData.history.length >= 2);
  });

  test('POST /api/specs with unchanged content does not create a version', async () => {
    const specs = await (await fetch(`${baseUrl}/api/specs`)).json();
    const r99 = specs.find(s => s.name === 'r99');
    const res = await fetch(`${baseUrl}/api/specs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weapon: r99 })
    });
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.unchanged, true);
  });

  test('POST /api/specs keeps edits made to specs.json outside the API', async () => {
    const external = JSON.parse(fs.readFileSync(specsPath, 'utf8'));
    external.find(s => s.name === 'volt').rpm = 777;
    fs.writeFileSync(specsPath, JSON.stringify(external, null, 4));

    const r301 = external.find(s => s.name === 'r301');
    const res = await fetch(`${baseUrl}/api/specs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weapon: { name: 'r301', rpm: r301.rpm + 1, x: r301.x, y: r301.y, time_points: r301.time_points } })
    });
    assert.equal(res.status, 200);

    const written = JSON.parse(fs.readFileSync(specsPath, 'utf8'));
    assert.equal(written.find(s => s.name === 'volt').rpm, 777);
    assert.equal(written.find(s => s.name === 'r301').rpm, r301.rpm + 1);
  });

  test('POST /api/specs rejects invalid specs', async () => {
    const res = await fetch(`${baseUrl}/api/specs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weapon: { name: 'broken', x: [0, 1], y: [0], time_points: [0, 1] } })
    });
    assert.equal(res.status, 400);
  });

  test('GET /api/discovery/sessions lists loadable samples with indexed metadata', async () => {
    await dbService.recordDiscoverySession({
      id: sessionId,
      weapon: 'r301',
      mode: 'auto',
      shot_count: 28,
      sample_count: 1,
      measured_rpm: 811.5,
      convergence_score: 97.2,
      storage_path: '/captures/' + sessionId,
      timestamp: 1720000000000
    });

    const res = await fetch(`${baseUrl}/api/discovery/sessions`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    const session = data.sessions.find(s => s.id === sessionId);
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
    const data = await res.json();
    assert.equal(data.success, false);
  });

  test('pages load their own route bundle', async () => {
    const index = await (await fetch(`${baseUrl}/`)).text();
    assert.match(index, /src="\/trainer\.js"/);
    assert.doesNotMatch(index, /src="\/editor\.js"/);

    const editor = await (await fetch(`${baseUrl}/editor`)).text();
    assert.match(editor, /src="\/editor\.js"/);
    assert.doesNotMatch(editor, /src="\/trainer\.js"/);
  });

  test('serves Vite bundles with the trainer split from the editor', { skip: !fs.existsSync(path.join(distDir, 'trainer.js')) && 'run `npm run build` first' }, async () => {
    const trainerRes = await fetch(`${baseUrl}/trainer.js`);
    assert.equal(trainerRes.status, 200);
    const editorRes = await fetch(`${baseUrl}/editor.js`);
    assert.equal(editorRes.status, 200);

    const styleRes = await fetch(`${baseUrl}/style.css`);
    assert.equal(styleRes.status, 200);
    const styleText = await styleRes.text();
    assert.ok(styleText.length > 10000, 'Expected style.css to contain compiled CSS');

    // Tailwind layer for migrated components; utilities are prefixed (tw:) so legacy class
    // names never match them
    const tailwindRes = await fetch(`${baseUrl}/tailwind.css`);
    assert.equal(tailwindRes.status, 200);
    const tailwindText = await tailwindRes.text();
    assert.match(tailwindText, /\.tw\\:mb-1/);
    assert.doesNotMatch(tailwindText, /(^|[}\s,])\.(grid|hidden|flex|border)\s*\{/);

    const plotlyRes = await fetch(`${baseUrl}/plotly-cartesian.min.js`);
    assert.equal(plotlyRes.status, 200);

    // The trainer must not ship (or execute) the Recoil Editor / discovery studio
    const trainerGraph = readEntryGraph(path.join(distDir, 'trainer.js'));
    assert.ok(!trainerGraph.includes('/api/discovery/process-session'), 'trainer bundle pulls in editor code');
    const editorGraph = readEntryGraph(path.join(distDir, 'editor.js'));
    assert.ok(editorGraph.includes('/api/discovery/process-session'));
  });
});
