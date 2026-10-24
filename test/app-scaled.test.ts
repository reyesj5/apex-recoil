// End-to-end tests for the scaled mode: Redis/BullMQ job queue + S3 capture storage, running
// the real discovery CLI. Requires Redis, an S3-compatible server and the Python requirements:
//   docker compose up -d && pnpm test:services
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { screenshotList, sessionList, uploadPlan } from '../shared/api.ts';
import type { BullJobQueue } from '../server/bull-queue.ts';
import type { DatabaseService } from '../server/db.ts';
import type { AssetStorageService } from '../server/storage.ts';

const redisUrl = process.env.TEST_REDIS_URL;
const s3Endpoint = process.env.TEST_S3_ENDPOINT;
const skip =
  (!redisUrl || !s3Endpoint) &&
  'set TEST_REDIS_URL and TEST_S3_ENDPOINT (pnpm test:services) to run the scaled-mode tests';

const root = path.join(import.meta.dirname, '..');
const run = crypto.randomBytes(3).toString('hex');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex_scaled_test_'));
const clipPath = path.join(tempDir, 'spray_01.webm');
const wallPath = path.join(tempDir, 'spray_01_wall.png');

interface Event {
  event: string;
  data: {
    status?: string;
    stage?: string;
    error?: string;
    result?: { spec: { x: number[] }; measured_rpm: number; saved_to_disk: boolean; trials_count: number };
  } | null;
}

// Read an SSE stream until a terminal event
async function followEvents(baseUrl: string, url: string) {
  const res = await fetch(baseUrl + url);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: Event[] = [];
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
  let db: DatabaseService;
  let storage: AssetStorageService;
  let queue: BullJobQueue;
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    const gen = spawnSync(
      process.env.PYTHON || 'python',
      [path.join(import.meta.dirname, 'fixtures', 'synthetic_spray.py'), clipPath, wallPath],
      { encoding: 'utf8' },
    );
    assert.equal(gen.status, 0, `fixture generation failed: ${gen.stderr}`);

    // The app on a throwaway database and specs.json, a bucket and a queue prefix of its own
    fs.copyFileSync(path.join(root, 'client', 'specs.json'), path.join(tempDir, 'specs.json'));
    const [{ createApp }, { DatabaseService }, { AssetStorageService }, { BullJobQueue }] = await Promise.all([
      import('../server/app.ts'),
      import('../server/db.ts'),
      import('../server/storage.ts'),
      import('../server/bull-queue.ts'),
    ]);
    db = new DatabaseService(path.join(tempDir, 'recoil.db'), path.join(tempDir, 'specs.json'));
    storage = new AssetStorageService({
      provider: 's3',
      s3: {
        endpoint: s3Endpoint,
        bucket: `apex-it-${run}`,
        accessKeyId: process.env.TEST_S3_ACCESS_KEY_ID || 'apex-dev',
        secretAccessKey: process.env.TEST_S3_SECRET_ACCESS_KEY || 'apex-dev-secret',
      },
    });
    queue = new BullJobQueue({ redisUrl, prefix: `apex-it-${run}`, storage });
    const app = await createApp({ db, storage, jobQueue: queue, uploadDir: path.join(tempDir, 'uploads') });
    await storage.ensureBucket();
    await queue.waitUntilReady();
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (queue) {
      await queue.queue.obliterate({ force: true }).catch(() => {});
      const keys = await queue.redis.keys(`apex-it-${run}:*`);
      if (keys.length) await queue.redis.del(...keys);
      await queue.close();
      for (const obj of await storage.listObjects('')) await storage.deletePrefix(obj.key);
      const { DeleteBucketCommand } = await import('@aws-sdk/client-s3');
      await (await storage.s3Client()).send(new DeleteBucketCommand({ Bucket: storage.s3Bucket })).catch(() => {});
      await db.close();
    }
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  const postJson = (url: string, body: unknown) =>
    fetch(`${baseUrl}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const accepted = async (res: Response) => (await res.json()) as { job_id: string; events_url: string };

  test('analyzes an uploaded clip on a BullMQ worker and keeps the session in S3', async () => {
    const form = new FormData();
    form.append('weapon', 'synthetic_smg');
    form.append('mode', 'auto');
    form.append('save_capture', 'true');
    form.append('videos', new Blob([fs.readFileSync(clipPath)], { type: 'video/webm' }), 'spray_01.webm');
    const res = await fetch(`${baseUrl}/api/discovery/process-session`, { method: 'POST', body: form });
    assert.equal(res.status, 202);
    const { events_url: eventsUrl } = await accepted(res);

    const events = await followEvents(baseUrl, eventsUrl);
    const done = events.find((e) => e.event === 'complete');
    assert.ok(done?.data?.result, JSON.stringify(events.at(-1)));
    assert.ok(events.some((e) => e.event === 'progress' && /processing_clip_1_of_1/.test(e.data?.stage ?? '')));
    assert.equal(done.data.result.spec.x.length, 6);
    assert.ok(Math.abs(done.data.result.measured_rpm - 600) < 1);
    assert.equal(done.data.result.saved_to_disk, true);

    const keys = (await storage.listObjects('session_synthetic_smg_auto_')).map((o) => o.key);
    assert.equal(keys.length, 1);
    assert.match(keys[0], /^session_synthetic_smg_auto_\d+\/spray_01\.webm$/);

    // The session list carries loadable URLs (streamed from S3 by the app) and indexed results
    let session;
    for (let i = 0; i < 40 && !(session && session.measured_rpm); i++) {
      const listed = sessionList.parse(await (await fetch(`${baseUrl}/api/discovery/sessions`)).json());
      session = listed.sessions.find((s) => s.weapon === 'synthetic_smg');
      if (!(session && session.measured_rpm)) await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(session && Math.abs((session.measured_rpm ?? 0) - 600) < 1, JSON.stringify(session));
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
    const plan = uploadPlan.parse(
      await (
        await postJson('/api/discovery/uploads', {
          purpose: 'session',
          weapon: 'synthetic_smg',
          mode: 'auto',
          save_capture: 'false',
          files: [{ field: 'videos', name: 'spray_01.webm', type: 'video/webm', size: fs.statSync(clipPath).size }],
        })
      ).json(),
    );
    assert.ok(plan.direct);
    assert.match(plan.prefix, /^tmp\//);

    const put = await fetch(plan.files[0].url, {
      method: 'PUT',
      headers: plan.files[0].headers,
      body: fs.readFileSync(clipPath),
    });
    assert.equal(put.status, 200);

    const res = await postJson('/api/discovery/process-session', {
      weapon: 'synthetic_smg',
      mode: 'auto',
      save_capture: 'false',
      upload: { token: plan.token },
    });
    assert.equal(res.status, 202);
    const events = await followEvents(baseUrl, (await accepted(res)).events_url);
    const done = events.find((e) => e.event === 'complete');
    assert.ok(done?.data?.result, JSON.stringify(events.at(-1)));
    assert.equal(done.data.result.spec.x.length, 6);
    assert.equal(done.data.result.saved_to_disk, false);
    assert.deepEqual(await storage.listObjects(plan.prefix), [], 'unsaved inputs are removed');
  });

  test('a saved direct upload is filed as a session only once it is submitted', async () => {
    const plan = uploadPlan.parse(
      await (
        await postJson('/api/discovery/uploads', {
          purpose: 'session',
          weapon: 'synthetic_dmr',
          mode: 'auto',
          save_capture: 'true',
          files: [{ field: 'videos', name: 'spray_01.webm', type: 'video/webm', size: fs.statSync(clipPath).size }],
        })
      ).json(),
    );
    assert.ok(plan.direct);
    assert.match(plan.prefix, /^tmp\//, 'uploads land in tmp/ until submitted');
    await fetch(plan.files[0].url, { method: 'PUT', headers: plan.files[0].headers, body: fs.readFileSync(clipPath) });
    assert.deepEqual(await storage.listObjects('session_synthetic_dmr_'), [], 'no session before submission');

    const res = await postJson('/api/discovery/process-session', {
      weapon: 'synthetic_dmr',
      save_capture: 'true',
      upload: { token: plan.token },
    });
    const events = await followEvents(baseUrl, (await accepted(res)).events_url);
    assert.ok(
      events.find((e) => e.event === 'complete'),
      JSON.stringify(events.at(-1)),
    );

    const sessionKeys = (await storage.listObjects('session_synthetic_dmr_auto_')).map((o) => o.key);
    assert.equal(sessionKeys.length, 1);
    assert.match(sessionKeys[0], /\/spray_01\.webm$/);
    assert.deepEqual(await storage.listObjects(plan.prefix), [], 'temp upload removed after analysis');
  });

  test('rejects forged or unfinished direct uploads', async () => {
    const plan = uploadPlan.parse(
      await (
        await postJson('/api/discovery/uploads', {
          purpose: 'session',
          weapon: 'r301',
          files: [{ field: 'videos', name: 'spray_01.webm', type: 'video/webm', size: 10 }],
        })
      ).json(),
    );
    assert.ok(plan.direct);

    const submit = (token: string) => postJson('/api/discovery/process-session', { weapon: 'r301', upload: { token } });
    const [payload, signature] = plan.token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), prefix: 'session_other/' }),
    ).toString('base64url');

    const forgedRes = await submit(`${forged}.${signature}`);
    assert.equal(forgedRes.status, 400);
    const missingRes = await submit(plan.token);
    assert.equal(missingRes.status, 400);
    assert.match(((await missingRes.json()) as { error: string }).error, /was not uploaded/);
  });

  test('a single saved screenshot is analyzed alone and filed in the S3 library', async () => {
    await storage.saveAsset('screenshots/other_weapon_wall.png', fs.readFileSync(wallPath));

    const form = new FormData();
    form.append('weapon', 'synthetic_smg');
    form.append('save_capture', 'true');
    form.append('images', new Blob([fs.readFileSync(wallPath)], { type: 'image/png' }), 'my_wall.png');
    const res = await fetch(`${baseUrl}/api/discovery/process-static-image`, { method: 'POST', body: form });
    assert.equal(res.status, 202);
    const events = await followEvents(baseUrl, (await accepted(res)).events_url);
    const done = events.find((e) => e.event === 'complete');
    assert.ok(done?.data?.result, JSON.stringify(events.at(-1)));
    assert.equal(done.data.result.trials_count, 1);

    const library = (await storage.listObjects('screenshots/')).map((o) => o.key);
    assert.equal(library.length, 2);
    assert.ok(library.some((k) => k.includes('my_wall')));

    const listed = screenshotList.parse(await (await fetch(`${baseUrl}/api/discovery/screenshots`)).json());
    const mine = listed.screenshots.find((s) => s.filename.includes('my_wall'));
    assert.ok(mine);
    assert.equal((await fetch(baseUrl + mine.url)).status, 200);
  });

  test('cancels a job through the API', async () => {
    const form = new FormData();
    form.append('weapon', 'synthetic_smg');
    form.append('save_capture', 'false');
    form.append('videos', new Blob([fs.readFileSync(clipPath)], { type: 'video/webm' }), 'spray_01.webm');
    const { job_id: jobId, events_url: eventsUrl } = await accepted(
      await fetch(`${baseUrl}/api/discovery/process-session`, { method: 'POST', body: form }),
    );

    const cancel = await fetch(`${baseUrl}/api/discovery/jobs/${jobId}/cancel`, { method: 'POST' });
    assert.equal(cancel.status, 200);
    const events = await followEvents(baseUrl, eventsUrl);
    const failed = events.find((e) => e.event === 'failed');
    assert.equal(failed && failed.data?.status, 'cancelled', JSON.stringify(events));
    const status = (await (await fetch(`${baseUrl}/api/discovery/jobs/${jobId}`)).json()) as {
      job: { status: string };
    };
    assert.equal(status.job.status, 'cancelled');
  });
});
