// Integration tests for the Redis/BullMQ job queue. Requires a Redis server:
//   docker compose up -d redis && pnpm test:services
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import type { Request, Response } from 'express';
import type { BullJobQueue as Queue } from '../server/bull-queue.ts';
import type { JobStatus } from '../server/jobs.ts';

const redisUrl = process.env.TEST_REDIS_URL;
const skip = !redisUrl && 'set TEST_REDIS_URL (pnpm test:services) to run the Redis/BullMQ tests';

const py = (code: string) => ['-c', code];
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Frame {
  event: string;
  data: { status?: string; stage?: string; progress?: number; result?: { success?: boolean } } | null;
}

// Fake SSE response that records frames
function recordSSE(queue: Queue, id: string) {
  const frames: Frame[] = [];
  let resolveEnded!: () => void;
  const ended = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });
  const closeHandlers: (() => void)[] = [];
  const res = {
    writableEnded: false,
    on(event: string, fn: () => void) {
      if (event === 'close') closeHandlers.push(fn);
    },
    writeHead() {},
    flushHeaders() {},
    status() {
      return this;
    },
    json(body: Frame['data']) {
      frames.push({ event: 'http', data: body });
      this.end();
    },
    write(msg: string) {
      const event = /^event: (.*)$/m.exec(msg);
      const data = /^data: (.*)$/m.exec(msg);
      if (event) frames.push({ event: event[1], data: data ? JSON.parse(data[1]) : null });
    },
    end() {
      this.writableEnded = true;
      closeHandlers.forEach((fn) => fn());
      resolveEnded();
    },
  };
  const req = { on() {} };
  const attached = queue.attachSSE(id, req as unknown as Request, res as unknown as Response);
  return { frames, ended, attached };
}

async function waitForStatus(queue: Queue, id: string, status: JobStatus, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const view = await queue.getJob(id);
    if (view && view.status === status) return view;
    if (Date.now() > deadline) throw new Error(`job ${id} did not reach ${status} (last: ${view && view.status})`);
    await delay(100);
  }
}

describe('BullJobQueue (Redis/BullMQ)', { skip }, () => {
  const prefix = `apex-test-${crypto.randomBytes(3).toString('hex')}`;
  let bull: typeof import('../server/bull-queue.ts');
  let queue: Queue;

  before(async () => {
    bull = await import('../server/bull-queue.ts');
    // Fail fast with a clear message instead of retrying forever when Redis is down
    const { Redis } = await import('ioredis');
    const probe = new Redis(redisUrl!, {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    probe.on('error', () => {});
    try {
      await probe.connect();
      await probe.ping();
    } catch (err) {
      throw new Error(
        `Redis is not reachable at ${redisUrl} (${(err as Error).message}); start it with: docker compose up -d redis`,
        { cause: err },
      );
    } finally {
      probe.disconnect();
    }

    queue = new bull.BullJobQueue({ redisUrl, prefix, concurrency: 1 });
    await queue.waitUntilReady();
  });

  after(async () => {
    await queue.queue.obliterate({ force: true }).catch(() => {});
    const keys = await queue.redis.keys(`${prefix}:*`);
    if (keys.length) await queue.redis.del(...keys);
    await queue.close();
  });

  test('runs a job, streams progress and stores the result', async () => {
    const completed = once(queue, 'job:completed');
    const { id } = await queue.createJob({
      type: 'test',
      cliArgs: py(
        'import sys, json, time; sys.stderr.write("PROGRESS:" + json.dumps({"stage": "testing", "progress": 55}) + "\\n"); sys.stderr.flush(); time.sleep(0.5); print(json.dumps({"success": True, "spec": {"x": [0, 1]}}))',
      ),
      metadata: { weapon: 'r301' },
    });
    const sse = recordSSE(queue, id);

    const [event] = await completed;
    assert.equal(event.id, id);
    assert.equal(event.metadata.weapon, 'r301');
    assert.deepEqual((event.result.spec as { x: number[] }).x, [0, 1]);

    await sse.ended;
    assert.ok(
      sse.frames.some((f) => f.event === 'progress' && f.data?.stage === 'testing' && f.data.progress === 55),
      JSON.stringify(sse.frames),
    );
    assert.ok(sse.frames.some((f) => f.event === 'complete' && f.data?.result?.success === true));

    const view = await queue.getJob(id);
    assert.ok(view);
    assert.equal(view.status, 'completed');
    assert.equal(view.progress, 100);
    assert.equal(view.result?.success, true);
    assert.equal(view.result?.saved_to_disk, false);
  });

  test('cancels a running job', async () => {
    const { id } = await queue.createJob({ type: 'test', cliArgs: py('import time; time.sleep(30)') });
    await waitForStatus(queue, id, 'running');
    await delay(500);
    const sse = recordSSE(queue, id);
    await sse.attached;

    const started = Date.now();
    assert.equal(await queue.cancelJob(id), true);
    await sse.ended;
    assert.ok(Date.now() - started < 10000, 'cancellation should not wait for the job');
    assert.ok(
      sse.frames.some((f) => f.event === 'failed' && f.data?.status === 'cancelled'),
      JSON.stringify(sse.frames),
    );
    assert.equal((await queue.getJob(id))?.status, 'cancelled');
    assert.equal(await queue.cancelJob(id), false);
  });

  test('cancels a queued job before it runs', async () => {
    const blocker = await queue.createJob({ type: 'test', cliArgs: py('import time; time.sleep(30)') });
    await waitForStatus(queue, blocker.id, 'running');
    const queued = await queue.createJob({ type: 'test', cliArgs: py('print("{}")') });

    assert.equal(await queue.cancelJob(queued.id), true);
    const view = await queue.getJob(queued.id);
    assert.equal(view?.status, 'cancelled');

    await queue.cancelJob(blocker.id);
    await waitForStatus(queue, blocker.id, 'cancelled');
  });

  test('reports failures and timeouts', async () => {
    const failing = await queue.createJob({
      type: 'test',
      cliArgs: py('import sys; sys.stderr.write("boom"); sys.exit(3)'),
    });
    await assert.rejects(() => queue.waitForJob(failing.id, 15000), /exited with code 3/);
    assert.equal((await queue.getJob(failing.id))?.status, 'failed');

    const slow = await queue.createJob({ type: 'test', cliArgs: py('import time; time.sleep(30)'), timeoutMs: 1000 });
    await assert.rejects(() => queue.waitForJob(slow.id, 15000), /timed out/);
  });

  test('replays completed jobs for indexing after a restart', async () => {
    const { id } = await queue.createJob({
      type: 'test',
      cliArgs: py('import json; print(json.dumps({"success": True}))'),
      metadata: { session: { id: 'session_test', sampleCount: 1, metadata: {} } },
    });
    await queue.waitForJob(id, 15000);

    const fresh = new bull.BullJobQueue({ redisUrl, prefix, runWorker: false });
    try {
      await fresh.waitUntilReady();
      const replayed: { id: string; metadata: { session?: { id: string } | null }; result: unknown }[] = [];
      fresh.on('job:completed', (job) => replayed.push(job));
      await fresh.replayCompletedJobs();
      const job = replayed.find((j) => j.id === id);
      assert.ok(job, 'completed job should be replayed');
      assert.equal(job.metadata.session?.id, 'session_test');
      assert.equal((job.result as { success: boolean }).success, true);
    } finally {
      await fresh.close();
    }
  });

  test('a job interrupted by a worker crash is finished by another worker', async () => {
    const isolatedPrefix = `${prefix}-crash`;
    const producer = new bull.BullJobQueue({ redisUrl, prefix: isolatedPrefix, runWorker: false });
    let workerB: ReturnType<typeof bull.startAnalysisWorker> | undefined;
    let crashed: ChildProcess | undefined;
    try {
      await producer.waitUntilReady();
      const { id } = await producer.createJob({
        type: 'test',
        cliArgs: py('import time, json; time.sleep(1.5); print(json.dumps({"success": True}))'),
      });

      // Worker A runs in its own process and dies mid-job. Both workers use short lock and
      // stalled-check intervals (BullMQ throttles stalled checks queue-wide to the interval of
      // the worker that ran the last check; with the 30 s defaults recovery takes up to a minute).
      const moduleUrl = JSON.stringify(
        pathToFileURL(path.resolve(import.meta.dirname, '..', 'server', 'bull-queue.ts')).href,
      );
      const options = JSON.stringify({
        redisUrl,
        prefix: isolatedPrefix,
        concurrency: 1,
        lockDuration: 1000,
        stalledInterval: 500,
      });
      crashed = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { startAnalysisWorker } from ${moduleUrl}; startAnalysisWorker(${options});`,
        ],
        { stdio: 'ignore' },
      );
      await waitForStatus(producer, id, 'running');
      crashed.kill('SIGKILL');

      // Worker B notices the expired lock and runs the job again
      workerB = bull.startAnalysisWorker({
        redisUrl,
        prefix: isolatedPrefix,
        concurrency: 1,
        lockDuration: 1000,
        stalledInterval: 500,
      });
      const result = await producer.waitForJob(id, 30000);
      assert.equal(result?.success, true);
      assert.equal((await producer.getJob(id))?.status, 'completed');
    } finally {
      if (crashed && crashed.exitCode === null) crashed.kill('SIGKILL');
      if (workerB) await workerB.close();
      await producer.queue.obliterate({ force: true }).catch(() => {});
      const keys = await producer.redis.keys(`${isolatedPrefix}:*`);
      if (keys.length) await producer.redis.del(...keys);
      await producer.close();
    }
  });
});
