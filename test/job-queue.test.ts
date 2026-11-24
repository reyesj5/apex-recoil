import test from 'node:test';
import assert from 'node:assert';
import { JobQueue, type Job } from '../server/job-queue.ts';

// Starting Python takes a few seconds on some machines (2 to 5 s on Windows, more when two start
// at once), so the tests that run it wait well beyond that.
const PYTHON_MS = 20000;

test('JobQueue creates, queues, and tracks jobs', () => {
  const queue = new JobQueue({ concurrency: 1 });
  const job = queue.createJob({
    type: 'session',
    cliArgs: ['-c', 'import sys; sys.exit(0)'],
    saveCapture: false,
  });

  assert.strictEqual(job.status, 'queued');
  assert.strictEqual(typeof job.id, 'string');
  assert.ok(job.id.startsWith('job_'));

  const fetched = queue.getJob(job.id);
  assert.ok(fetched);
  assert.strictEqual(fetched.id, job.id);
});

test('JobQueue cancels queued job cleanly', () => {
  const queue = new JobQueue({ concurrency: 1 });
  const job = queue.createJob({
    type: 'session',
    cliArgs: ['-c', 'import time; time.sleep(10)'],
    saveCapture: false,
  });

  const cancelled = queue.cancelJob(job.id);
  assert.strictEqual(cancelled, true);
  const fetched = queue.getJob(job.id);
  assert.strictEqual(fetched?.status, 'cancelled');
});

test('JobQueue executes Python command and emits completion', async () => {
  const queue = new JobQueue({ concurrency: 1, defaultTimeoutMs: PYTHON_MS });
  const job = queue.createJob({
    type: 'session',
    cliArgs: ['-c', 'import json; print(json.dumps({"success": True, "result": 42}))'],
    saveCapture: false,
  });

  const result = await queue.waitForJob(job.id, PYTHON_MS);
  assert.strictEqual(result?.success, true);
  assert.strictEqual(result?.result, 42);

  const finalJob = queue.getJob(job.id);
  assert.strictEqual(finalJob?.status, 'completed');
  assert.strictEqual(finalJob?.progress, 100);
});

// Collects the SSE frames a job broadcasts.
function attachRecorder(job: Job) {
  const frames: string[] = [];
  job.sseClients.add({ write: (msg) => frames.push(msg), end: () => {} });
  return frames;
}

function framesOf(frames: string[], event: string) {
  return frames
    .filter((f) => f.startsWith(`event: ${event}\n`))
    .map((f) => JSON.parse(f.split('\ndata: ')[1]) as { stage?: string; progress?: number; status?: string });
}

test('JobQueue parses PROGRESS lines from stderr', async () => {
  const queue = new JobQueue({ concurrency: 1, defaultTimeoutMs: PYTHON_MS });

  const job = queue.createJob({
    type: 'session',
    cliArgs: [
      '-c',
      'import sys, json; sys.stderr.write("PROGRESS:" + json.dumps({"stage": "testing", "progress": 55}) + "\\n"); sys.stderr.flush(); print(json.dumps({"success": True}))',
    ],
    saveCapture: false,
  });
  const frames = attachRecorder(job);

  const result = await queue.waitForJob(job.id, PYTHON_MS);
  assert.strictEqual(result?.success, true);
  const finalJob = queue.getJob(job.id);
  assert.strictEqual(finalJob?.status, 'completed');
  assert.ok(framesOf(frames, 'progress').some((p) => p.stage === 'testing' && p.progress === 55));
});

test('JobQueue parses PROGRESS lines split across output chunks', async () => {
  const queue = new JobQueue({ concurrency: 1, defaultTimeoutMs: PYTHON_MS });
  const script = [
    'import sys, time, json',
    'line = "PROGRESS:" + json.dumps({"stage": "split_stage", "progress": 42}) + "\\n"',
    'sys.stderr.write(line[:15]); sys.stderr.flush(); time.sleep(0.3)',
    'sys.stderr.write(line[15:]); sys.stderr.flush()',
    'print(json.dumps({"success": True}))',
  ].join('\n');

  const job = queue.createJob({ type: 'session', cliArgs: ['-c', script] });
  const frames = attachRecorder(job);

  await queue.waitForJob(job.id, PYTHON_MS);
  assert.ok(framesOf(frames, 'progress').some((p) => p.stage === 'split_stage' && p.progress === 42));
});

test('JobQueue runs onComplete for its own job even when another job finishes first', async () => {
  const queue = new JobQueue({ concurrency: 2, defaultTimeoutMs: PYTHON_MS });
  const calls: [string, string][] = [];

  const slow = queue.createJob({
    type: 'session',
    cliArgs: ['-c', 'import time, json; time.sleep(0.8); print(json.dumps({"success": True, "id": "slow"}))'],
    onComplete: (j) => calls.push(['slow', j.id]),
  });
  const fast = queue.createJob({
    type: 'session',
    cliArgs: ['-c', 'import json; print(json.dumps({"success": True, "id": "fast"}))'],
    onComplete: (j) => calls.push(['fast', j.id]),
  });

  await Promise.all([queue.waitForJob(slow.id, PYTHON_MS), queue.waitForJob(fast.id, PYTHON_MS)]);
  assert.deepEqual(calls.map((c) => c[0]).sort(), ['fast', 'slow']);
  assert.ok(calls.every(([name, id]) => id === (name === 'slow' ? slow.id : fast.id)));
});

test('JobQueue escalates to SIGKILL when a timed-out process ignores SIGTERM', async () => {
  const queue = new JobQueue({ concurrency: 1, killGraceMs: 300 });
  const job = queue.createJob({
    type: 'session',
    cliArgs: [
      '-c',
      'import signal, time\nif hasattr(signal, "SIGTERM"): signal.signal(signal.SIGTERM, signal.SIG_IGN)\ntime.sleep(30)',
    ],
    timeoutMs: 1500,
  });

  let pid: number | undefined;
  while (pid === undefined) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    const proc = queue.jobs.get(job.id)!.childProc;
    if (proc) pid = proc.pid;
  }

  await assert.rejects(() => queue.waitForJob(job.id, 5000), /timed out/);
  const deadline = Date.now() + 5000;
  let alive = true;
  while (alive && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      process.kill(pid, 0);
    } catch {
      alive = false;
    }
  }
  assert.strictEqual(alive, false, 'process should be killed after the grace period');
});

test('JobQueue reports cancellation over SSE as a failed event', async () => {
  const queue = new JobQueue({ concurrency: 1 });
  const job = queue.createJob({ type: 'session', cliArgs: ['-c', 'import time; time.sleep(10)'] });
  const frames = attachRecorder(job);

  assert.strictEqual(queue.cancelJob(job.id), true);
  const failed = framesOf(frames, 'failed');
  assert.strictEqual(failed.length, 1);
  assert.strictEqual(failed[0].status, 'cancelled');
  assert.strictEqual(framesOf(frames, 'error').length, 0);
});
