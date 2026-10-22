// End-to-end tests for the scaled mode: Redis/BullMQ job queue + S3 capture storage, running
// the real discovery CLI. Requires Redis, an S3-compatible server and the Python requirements:
//   docker compose up -d && pnpm test:services
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const redisUrl = process.env.TEST_REDIS_URL;
const s3Endpoint = process.env.TEST_S3_ENDPOINT;
const skip = (!redisUrl || !s3Endpoint) && 'set TEST_REDIS_URL and TEST_S3_ENDPOINT (pnpm test:services) to run the scaled-mode tests';

const run = crypto.randomBytes(3).toString('hex');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex_scaled_test_'));
const clipPath = path.join(tempDir, 'spray_01.webm');
const wallPath = path.join(tempDir, 'spray_01_wall.png');

if (!skip) {
  // Configure the app before it loads
  fs.copyFileSync(path.join(__dirname, '..', 'client', 'specs.json'), path.join(tempDir, 'specs.json'));
  Object.assign(process.env, {
    RECOIL_DB_PATH: path.join(tempDir, 'recoil.db'),
    RECOIL_SPECS_PATH: path.join(tempDir, 'specs.json'),
    RECOIL_UPLOAD_TMP_DIR: path.join(tempDir, 'uploads'),
    REDIS_URL: redisUrl,
    RECOIL_QUEUE_PREFIX: `apex-it-${run}`,
    STORAGE_PROVIDER: 's3',
    S3_ENDPOINT: s3Endpoint,
    S3_BUCKET: `apex-it-${run}`,
    S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY_ID || 'apex-dev',
    S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_ACCESS_KEY || 'apex-dev-secret'
  });
}

// Read an SSE stream until a terminal event
async function followEvents(baseUrl, url) {
  const res = await fetch(baseUrl + url);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const name = /^event: (.*)$/m.exec(frame);
      const data = /^data: (.*)$/m.exec(frame);
      if (name) events.push({ event: name[1], data: data ? JSON.parse(data[1]) : null });
    }
  }
  return events;
}

describe('Scaled mode: BullMQ queue + S3 storage', { skip }, () => {
  let app;
  let server;
  let baseUrl;
  let storage;

  before(async () => {
    const gen = spawnSync(process.env.PYTHON || 'python', [path.join(__dirname, 'fixtures', 'synthetic_spray.py'), clipPath, wallPath], { encoding: 'utf8' });
    assert.equal(gen.status, 0, `fixture generation failed: ${gen.stderr}`);

    app = require('../app');
    storage = app.locals.storage;
    await storage.ensureBucket();
    await app.locals.jobQueue.waitUntilReady();
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (app) {
      const queue = app.locals.jobQueue;
      await queue.queue.obliterate({ force: true }).catch(() => {});
      const keys = await queue.redis.keys(`apex-it-${run}:*`);
      if (keys.length) await queue.redis.del(...keys);
      await queue.close();
      for (const obj of await storage.listObjects('')) await storage.deletePrefix(obj.key);
      const { DeleteBucketCommand } = require('@aws-sdk/client-s3');
      await storage._client().send(new DeleteBucketCommand({ Bucket: storage.s3Bucket })).catch(() => {});
      await require('../server/db').dbService.close();
    }
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  test('analyzes an uploaded clip on a BullMQ worker and keeps the session in S3', async () => {
    const form = new FormData();
    form.append('weapon', 'synthetic_smg');
    form.append('mode', 'auto');
    form.append('save_capture', 'true');
    form.append('videos', new Blob([fs.readFileSync(clipPath)], { type: 'video/webm' }), 'spray_01.webm');
    const accepted = await fetch(`${baseUrl}/api/discovery/process-session`, { method: 'POST', body: form });
    assert.equal(accepted.status, 202);
    const { events_url: eventsUrl } = await accepted.json();

    const events = await followEvents(baseUrl, eventsUrl);
    const done = events.find((e) => e.event === 'complete');
    assert.ok(done, JSON.stringify(events.at(-1)));
    assert.ok(events.some((e) => e.event === 'progress' && /processing_clip_1_of_1/.test(e.data.stage)));
    assert.equal(done.data.result.spec.x.length, 6);
    assert.ok(Math.abs(done.data.result.measured_rpm - 600) < 1);
    assert.equal(done.data.result.saved_to_disk, true);

    const keys = (await storage.listObjects('session_synthetic_smg_auto_')).map((o) => o.key);
    assert.equal(keys.length, 1);
    assert.match(keys[0], /^session_synthetic_smg_auto_\d+\/spray_01\.webm$/);

    // The session list carries loadable URLs (streamed from S3 by the app) and indexed results
    let session;
    for (let i = 0; i < 40 && !(session && session.measured_rpm); i++) {
      const listed = await (await fetch(`${baseUrl}/api/discovery/sessions`)).json();
      session = listed.sessions.find((s) => s.weapon === 'synthetic_smg');
      if (!(session && session.measured_rpm)) await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(session && Math.abs(session.measured_rpm - 600) < 1, JSON.stringify(session));
    assert.equal(session.shot_count, 6);

    const video = await fetch(baseUrl + session.samples[0].videoUrl);
    assert.equal(video.status, 200);
    assert.equal(video.headers.get('content-type'), 'video/webm');
    assert.ok(Buffer.from(await video.arrayBuffer()).equals(fs.readFileSync(clipPath)));
    const ranged = await fetch(baseUrl + session.samples[0].videoUrl, { headers: { Range: 'bytes=0-9' } });
    assert.equal(ranged.status, 206);
    assert.equal((await ranged.arrayBuffer()).byteLength, 10);
    assert.equal((await fetch(`${baseUrl}/captures/session_missing/x.webm`)).status, 404);
  });

  test('direct uploads go from the browser to the bucket and are cleaned up after analysis', async () => {
    const plan = await (await fetch(`${baseUrl}/api/discovery/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose: 'session', weapon: 'synthetic_smg', mode: 'auto', save_capture: 'false',
        files: [{ field: 'videos', name: 'spray_01.webm', type: 'video/webm', size: fs.statSync(clipPath).size }]
      })
    })).json();
    assert.equal(plan.direct, true);
    assert.match(plan.prefix, /^tmp\//);

    const put = await fetch(plan.files[0].url, { method: 'PUT', headers: plan.files[0].headers, body: fs.readFileSync(clipPath) });
    assert.equal(put.status, 200);

    const accepted = await fetch(`${baseUrl}/api/discovery/process-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weapon: 'synthetic_smg', mode: 'auto', save_capture: 'false', upload: { token: plan.token } })
    });
    assert.equal(accepted.status, 202);
    const events = await followEvents(baseUrl, (await accepted.json()).events_url);
    const done = events.find((e) => e.event === 'complete');
    assert.ok(done, JSON.stringify(events.at(-1)));
    assert.equal(done.data.result.spec.x.length, 6);
    assert.equal(done.data.result.saved_to_disk, false);
    assert.deepEqual(await storage.listObjects(plan.prefix), [], 'unsaved inputs are removed');
  });

  test('a saved direct upload is filed as a session only once it is submitted', async () => {
    const plan = await (await fetch(`${baseUrl}/api/discovery/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose: 'session', weapon: 'synthetic_dmr', mode: 'auto', save_capture: 'true',
        files: [{ field: 'videos', name: 'spray_01.webm', type: 'video/webm', size: fs.statSync(clipPath).size }]
      })
    })).json();
    assert.match(plan.prefix, /^tmp\//, 'uploads land in tmp/ until submitted');
    await fetch(plan.files[0].url, { method: 'PUT', headers: plan.files[0].headers, body: fs.readFileSync(clipPath) });
    assert.deepEqual(await storage.listObjects('session_synthetic_dmr_'), [], 'no session before submission');

    const accepted = await fetch(`${baseUrl}/api/discovery/process-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weapon: 'synthetic_dmr', save_capture: 'true', upload: { token: plan.token } })
    });
    const events = await followEvents(baseUrl, (await accepted.json()).events_url);
    assert.ok(events.find((e) => e.event === 'complete'), JSON.stringify(events.at(-1)));

    const sessionKeys = (await storage.listObjects('session_synthetic_dmr_auto_')).map((o) => o.key);
    assert.equal(sessionKeys.length, 1);
    assert.match(sessionKeys[0], /\/spray_01\.webm$/);
    assert.deepEqual(await storage.listObjects(plan.prefix), [], 'temp upload removed after analysis');
  });

  test('rejects forged or unfinished direct uploads', async () => {
    const plan = await (await fetch(`${baseUrl}/api/discovery/uploads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose: 'session', weapon: 'r301', files: [{ field: 'videos', name: 'spray_01.webm', type: 'video/webm', size: 10 }] })
    })).json();

    const submit = (token) => fetch(`${baseUrl}/api/discovery/process-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weapon: 'r301', upload: { token } })
    });
    const [payload, signature] = plan.token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), prefix: 'session_other/' })).toString('base64url');

    const forgedRes = await submit(`${forged}.${signature}`);
    assert.equal(forgedRes.status, 400);
    const missingRes = await submit(plan.token);
    assert.equal(missingRes.status, 400);
    assert.match((await missingRes.json()).error, /was not uploaded/);
  });

  test('a single saved screenshot is analyzed alone and filed in the S3 library', async () => {
    await storage.saveAsset('screenshots/other_weapon_wall.png', fs.readFileSync(wallPath));

    const form = new FormData();
    form.append('weapon', 'synthetic_smg');
    form.append('save_capture', 'true');
    form.append('images', new Blob([fs.readFileSync(wallPath)], { type: 'image/png' }), 'my_wall.png');
    const accepted = await fetch(`${baseUrl}/api/discovery/process-static-image`, { method: 'POST', body: form });
    assert.equal(accepted.status, 202);
    const events = await followEvents(baseUrl, (await accepted.json()).events_url);
    const done = events.find((e) => e.event === 'complete');
    assert.ok(done, JSON.stringify(events.at(-1)));
    assert.equal(done.data.result.trials_count, 1);

    const library = (await storage.listObjects('screenshots/')).map((o) => o.key);
    assert.equal(library.length, 2);
    assert.ok(library.some((k) => k.includes('my_wall')));

    const listed = await (await fetch(`${baseUrl}/api/discovery/screenshots`)).json();
    const mine = listed.screenshots.find((s) => s.filename.includes('my_wall'));
    assert.ok(mine);
    assert.equal((await fetch(baseUrl + mine.url)).status, 200);
  });

  test('cancels a job through the API', async () => {
    const form = new FormData();
    form.append('weapon', 'synthetic_smg');
    form.append('save_capture', 'false');
    form.append('videos', new Blob([fs.readFileSync(clipPath)], { type: 'video/webm' }), 'spray_01.webm');
    const { job_id: jobId, events_url: eventsUrl } = await (await fetch(`${baseUrl}/api/discovery/process-session`, { method: 'POST', body: form })).json();

    const cancel = await fetch(`${baseUrl}/api/discovery/jobs/${jobId}/cancel`, { method: 'POST' });
    assert.equal(cancel.status, 200);
    const events = await followEvents(baseUrl, eventsUrl);
    const failed = events.find((e) => e.event === 'failed');
    assert.equal(failed && failed.data.status, 'cancelled', JSON.stringify(events));
    const status = await (await fetch(`${baseUrl}/api/discovery/jobs/${jobId}`)).json();
    assert.equal(status.job.status, 'cancelled');
  });
});
