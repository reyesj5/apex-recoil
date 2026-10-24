/**
 * Persistent analysis job queue on Redis (BullMQ), used when REDIS_URL is set.
 *
 * Same interface as the in-process JobQueue (createJob / getJob / cancelJob / attachSSE /
 * waitForJob and 'job:completed' / 'job:failed' events), but queued and running jobs survive API
 * restarts (a job interrupted by a crash is picked up again once its lock expires) and any
 * number of workers can process them: the API runs an embedded worker unless
 * RECOIL_EMBEDDED_WORKER=false, and `pnpm worker` (server/worker.ts) starts more. Workers on
 * other machines need object storage (STORAGE_PROVIDER=s3) so they can read the job inputs.
 *
 * Results (~1 MB with preview frames) are stored under their own Redis key with a TTL rather
 * than as the job's return value, because BullMQ copies return values into its event stream.
 * Cancellation of a running job is relayed to the worker that holds it via Redis pub/sub.
 */

import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import os from 'node:os';
import type { Request, Response } from 'express';
import { Redis } from 'ioredis';
import { Queue, Worker, QueueEvents as BullQueueEvents, UnrecoverableError, type Job as BullJob } from 'bullmq';
import { processAnalysisJob, type JobData } from './job-processor.ts';
import { AnalysisError, CANCELLED_MESSAGE, type AnalysisResult } from './analysis-runner.ts';
import type { AnalysisQueue, JobMetadata, JobOptions, JobStatus, JobView, QueueEvents } from './jobs.ts';
import type { AssetStorageService } from './storage.ts';

export const QUEUE_NAME = 'analysis';

/** What a BullMQ job carries: the job's data, and what it reports when it finishes */
type QueuedData = JobData & { metadata: JobMetadata };

/** A job's progress as the worker reports it */
interface ReportedProgress {
  progress?: number;
  stage?: string;
  details?: Record<string, unknown> | null;
}

function defaultConcurrency() {
  const fromEnv = Number(process.env.RECOIL_WORKER_CONCURRENCY);
  if (fromEnv > 0) return fromEnv;
  return Math.min(4, Math.max(1, (os.cpus() || []).length - 1));
}

// Extra keys live outside BullMQ's own `${prefix}:${QUEUE_NAME}:*` namespace
function queueKeys(prefix: string) {
  return {
    result: (jobId: string) => `${prefix}:analysis-results:${jobId}`,
    cancel: (jobId: string) => `${prefix}:analysis-cancel:${jobId}`,
    cancelChannel: `${prefix}:analysis-cancel`,
  };
}

/**
 * Error listener that logs at most every 30 s: ioredis keeps retrying while Redis is down,
 * and BullMQ objects without an 'error' listener would crash the process.
 */
function throttledWarn(label: string, intervalMs = 30000) {
  let last = 0;
  return (err: unknown) => {
    const now = Date.now();
    if (now - last < intervalMs) return;
    last = now;
    console.warn(`[${label}]`, err instanceof Error ? err.message : err);
  };
}

function redisConnection(redisUrl: string) {
  // BullMQ requires maxRetriesPerRequest: null for its blocking connections
  return { url: redisUrl, maxRetriesPerRequest: null };
}

export interface WorkerOptions {
  redisUrl?: string;
  prefix?: string;
  storage?: AssetStorageService | null;
  concurrency?: number;
  pythonCommand?: string;
  killGraceMs?: number;
  resultTtlSec?: number;
  lockDuration?: number;
  stalledInterval?: number;
}

/**
 * Start a BullMQ worker that runs analysis jobs (embedded in the API or standalone).
 */
export function startAnalysisWorker({
  redisUrl = process.env.REDIS_URL,
  prefix = process.env.RECOIL_QUEUE_PREFIX || 'apex',
  storage = null,
  concurrency = defaultConcurrency(),
  pythonCommand,
  killGraceMs,
  resultTtlSec = 3600,
  lockDuration,
  stalledInterval,
}: WorkerOptions = {}) {
  if (!redisUrl) throw new Error('The analysis worker requires REDIS_URL');
  const keys = queueKeys(prefix);
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const subscriber = redis.duplicate();
  redis.on('error', throttledWarn('Worker redis'));
  subscriber.on('error', throttledWarn('Worker cancel channel'));

  const isCancelled = async (jobId: string) => (await redis.exists(keys.cancel(jobId))) === 1;

  const worker = new Worker<QueuedData, { stored: boolean }>(
    QUEUE_NAME,
    async (job, _token, signal) => {
      const id = job.id!;
      if (await isCancelled(id)) throw new UnrecoverableError(CANCELLED_MESSAGE);
      await job.updateProgress({ progress: 2, stage: 'starting' });

      let result;
      try {
        result = await processAnalysisJob(job.data, {
          storage,
          signal,
          pythonCommand,
          killGraceMs,
          beforeRun: async () => {
            if (await isCancelled(id)) throw new AnalysisError(CANCELLED_MESSAGE, 'cancelled');
          },
          onProgress: (p) => {
            job.updateProgress({ progress: p.progress, stage: p.stage, details: p.details || null }).catch(() => {});
          },
        });
      } catch (err) {
        // Cancellations and timeouts are final
        if (err instanceof AnalysisError && (err.code === 'cancelled' || err.code === 'timeout')) {
          throw new UnrecoverableError(err.message);
        }
        throw err;
      }

      await redis.set(keys.result(id), JSON.stringify(result), 'EX', resultTtlSec);
      return { stored: true };
    },
    {
      connection: redisConnection(redisUrl),
      prefix,
      concurrency,
      ...(lockDuration ? { lockDuration } : {}),
      ...(stalledInterval ? { stalledInterval } : {}),
    },
  );

  worker.on('error', throttledWarn('Worker'));

  const subscribed = subscriber.subscribe(keys.cancelChannel);
  subscriber.on('message', (channel: string, jobId: string) => {
    if (channel === keys.cancelChannel) worker.cancelJob(jobId, CANCELLED_MESSAGE);
  });

  return {
    worker,
    async waitUntilReady() {
      await Promise.all([worker.waitUntilReady(), subscribed]);
    },
    async close(force = false) {
      await worker.close(force);
      await subscriber.quit().catch(() => {});
      await redis.quit().catch(() => {});
    },
  };
}

export interface BullJobQueueOptions extends WorkerOptions {
  defaultTimeoutMs?: number;
  retentionMs?: number;
  /** false: only standalone workers (pnpm worker) run the jobs */
  runWorker?: boolean;
}

export class BullJobQueue extends EventEmitter<QueueEvents> implements AnalysisQueue {
  readonly kind = 'redis';
  // Workers may run on other machines, so job inputs go to object storage when there is one
  readonly runsLocally = false;
  redisUrl: string;
  prefix: string;
  defaultTimeoutMs: number;
  retentionMs: number;
  retentionSec: number;
  storage: AssetStorageService | null;
  keys: ReturnType<typeof queueKeys>;
  queue: Queue<QueuedData>;
  queueEvents: BullQueueEvents;
  redis: Redis;
  sseClients = new Map<string, Set<Response>>();
  workerHandle: ReturnType<typeof startAnalysisWorker> | null;

  constructor(options: BullJobQueueOptions = {}) {
    super();
    const redisUrl = options.redisUrl || process.env.REDIS_URL;
    if (!redisUrl) throw new Error('BullJobQueue requires REDIS_URL');
    this.redisUrl = redisUrl;
    this.prefix = options.prefix || process.env.RECOIL_QUEUE_PREFIX || 'apex';
    this.defaultTimeoutMs = options.defaultTimeoutMs || 120000;
    this.retentionMs = options.retentionMs || 3600000;
    this.retentionSec = Math.ceil(this.retentionMs / 1000);
    this.storage = options.storage || null;
    this.keys = queueKeys(this.prefix);

    this.queue = new Queue<QueuedData>(QUEUE_NAME, {
      connection: redisConnection(this.redisUrl),
      prefix: this.prefix,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: this.retentionSec },
        removeOnFail: { age: this.retentionSec },
      },
      streams: { events: { maxLen: 2000 } },
    });
    this.queueEvents = new BullQueueEvents(QUEUE_NAME, {
      connection: redisConnection(this.redisUrl),
      prefix: this.prefix,
    });
    this.redis = new Redis(this.redisUrl, { maxRetriesPerRequest: null });
    this.queue.on('error', throttledWarn('Queue'));
    this.redis.on('error', throttledWarn('Queue redis'));
    this.wireEvents();

    this.workerHandle =
      options.runWorker === false
        ? null
        : startAnalysisWorker({
            redisUrl: this.redisUrl,
            prefix: this.prefix,
            storage: this.storage,
            concurrency: options.concurrency,
            pythonCommand: options.pythonCommand,
            killGraceMs: options.killGraceMs,
            resultTtlSec: this.retentionSec,
            lockDuration: options.lockDuration,
            stalledInterval: options.stalledInterval,
          });
  }

  /**
   * Resolves once Redis connections (and the embedded worker) are ready.
   */
  async waitUntilReady() {
    await Promise.all([
      this.queue.waitUntilReady(),
      this.queueEvents.waitUntilReady(),
      this.workerHandle ? this.workerHandle.waitUntilReady() : null,
    ]);
  }

  /**
   * Create and enqueue a job (see JobQueue.createJob; onComplete callbacks are not supported,
   * listen for 'job:completed' instead).
   */
  async createJob({
    type = 'session',
    cliArgs = [],
    input,
    sessionDir,
    saveCapture = false,
    cleanupInput,
    cleanupSessionDir,
    timeoutMs,
    metadata = {},
  }: JobOptions) {
    const id = `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const cleanup = cleanupInput !== undefined ? cleanupInput : cleanupSessionDir;
    const data: QueuedData = {
      cliArgs,
      input: input || (sessionDir ? { kind: 'local', dir: sessionDir } : null),
      saveCapture,
      cleanupInput: cleanup !== undefined ? cleanup : !saveCapture,
      timeoutMs: timeoutMs || this.defaultTimeoutMs,
      metadata,
    };
    await this.queue.add(type, data, { jobId: id });
    return { id, timeoutMs: data.timeoutMs };
  }

  async loadResult(id: string): Promise<AnalysisResult | null> {
    const raw = await this.redis.get(this.keys.result(id));
    return raw ? (JSON.parse(raw) as AnalysisResult) : null;
  }

  private async isCancelled(id: string) {
    return (await this.redis.exists(this.keys.cancel(id))) === 1;
  }

  /**
   * Public job view, same shape as JobQueue.getJob.
   */
  async getJob(id: string): Promise<JobView | null> {
    const job = (await this.queue.getJob(id)) as BullJob<QueuedData> | undefined;
    if (!job) {
      if (await this.isCancelled(id)) {
        return {
          id,
          type: null,
          status: 'cancelled',
          progress: 0,
          stage: 'cancelled',
          details: null,
          result: null,
          error: CANCELLED_MESSAGE,
          createdAt: null,
          startedAt: null,
          finishedAt: null,
          metadata: {},
        };
      }
      return null;
    }

    const state = await job.getState();
    let status: JobStatus;
    if (state === 'completed') status = 'completed';
    else if (state === 'failed')
      status = job.failedReason === CANCELLED_MESSAGE || (await this.isCancelled(id)) ? 'cancelled' : 'failed';
    else if (state === 'active') status = 'running';
    else status = 'queued';

    const p: ReportedProgress =
      job.progress && typeof job.progress === 'object'
        ? (job.progress as ReportedProgress)
        : { progress: typeof job.progress === 'number' ? job.progress : 0 };
    const finished = status === 'completed' || status === 'failed' || status === 'cancelled';

    return {
      id: job.id!,
      type: job.name,
      status,
      progress: status === 'completed' ? 100 : p.progress || 0,
      stage: finished || status === 'queued' ? status : p.stage || 'starting',
      details: p.details || null,
      result: status === 'completed' ? await this.loadResult(id) : null,
      error: status === 'failed' || status === 'cancelled' ? job.failedReason || CANCELLED_MESSAGE : null,
      createdAt: job.timestamp,
      startedAt: job.processedOn || null,
      finishedAt: job.finishedOn || null,
      metadata: (job.data && job.data.metadata) || {},
    };
  }

  /**
   * Cancel a queued or running job (wherever its worker runs).
   */
  async cancelJob(id: string) {
    const job = await this.queue.getJob(id);
    if (!job) return false;
    const state = await job.getState();
    if (state === 'completed' || state === 'failed') return false;

    await this.redis.set(this.keys.cancel(id), String(Date.now()), 'EX', this.retentionSec);
    if (state !== 'active') {
      try {
        await job.remove();
        return true;
      } catch {
        // A worker picked it up meanwhile; cancel it there
      }
    }
    await this.redis.publish(this.keys.cancelChannel, id);
    return true;
  }

  /**
   * Attach a Server-Sent Events (SSE) client response stream to a job.
   */
  async attachSSE(id: string, req: Request, res: Response) {
    let exists;
    try {
      exists = Boolean(await this.queue.getJob(id)) || (await this.isCancelled(id));
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
      return;
    }
    if (!exists) {
      res.status(404).json({ success: false, error: `Job ${id} not found` });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    // Subscribe before reading the state so no event is missed in between
    const clients = this.sseClients.get(id) || new Set();
    clients.add(res);
    this.sseClients.set(id, clients);
    const heartbeat = setInterval(() => {
      if (res.writableEnded) return;
      try {
        res.write(': keepalive\n\n');
      } catch {
        // Closed meanwhile
      }
    }, 15000);
    heartbeat.unref();
    const detach = () => {
      clearInterval(heartbeat);
      clients.delete(res);
      if (!clients.size && this.sseClients.get(id) === clients) this.sseClients.delete(id);
    };
    // The stream ends either when the client disconnects or when we end it
    req.on('close', detach);
    res.on('close', detach);

    const view = await this.getJob(id);
    if (res.writableEnded) return;
    if (!view) {
      res.write(`event: failed\ndata: ${JSON.stringify({ status: 'failed', error: `Job ${id} not found` })}\n\n`);
      res.end();
      detach();
      return;
    }
    res.write(`event: state\ndata: ${JSON.stringify(view)}\n\n`);
    if (view.status === 'completed') {
      res.write(`event: complete\ndata: ${JSON.stringify({ status: 'completed', result: view.result })}\n\n`);
      res.end();
      detach();
    } else if (view.status === 'failed' || view.status === 'cancelled') {
      res.write(`event: failed\ndata: ${JSON.stringify({ status: view.status, error: view.error })}\n\n`);
      res.end();
      detach();
    }
  }

  private broadcast(jobId: string, eventName: string, payload: unknown, end = false) {
    const clients = this.sseClients.get(jobId);
    if (!clients) return;
    const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) {
      if (res.writableEnded) continue;
      try {
        res.write(message);
        if (end) res.end();
      } catch {
        // Closed meanwhile
      }
    }
    if (end) this.sseClients.delete(jobId);
  }

  private wireEvents() {
    this.queueEvents.on('active', ({ jobId }) => {
      this.broadcast(jobId, 'progress', { status: 'running', stage: 'starting', progress: 2 });
    });

    this.queueEvents.on('progress', ({ jobId, data }) => {
      const p: ReportedProgress =
        data && typeof data === 'object' ? (data as ReportedProgress) : { progress: Number(data) || 0 };
      this.broadcast(jobId, 'progress', {
        status: 'running',
        stage: p.stage || 'running',
        progress: p.progress || 0,
        details: p.details || null,
      });
    });

    this.queueEvents.on('completed', ({ jobId }) => {
      this.handleCompleted(jobId).catch((err) => console.warn('[Queue] completion handling failed:', err.message));
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      this.handleFailed(jobId, failedReason).catch((err) =>
        console.warn('[Queue] failure handling failed:', err.message),
      );
    });

    this.queueEvents.on('removed', ({ jobId }) => {
      this.handleFailed(jobId, CANCELLED_MESSAGE).catch(() => {});
    });

    this.queueEvents.on('error', throttledWarn('QueueEvents'));
  }

  private async handleCompleted(jobId: string) {
    const [job, result] = await Promise.all([this.queue.getJob(jobId), this.loadResult(jobId)]);
    this.broadcast(jobId, 'complete', { status: 'completed', result }, true);
    this.emit('job:completed', {
      id: jobId,
      metadata: (job && job.data && job.data.metadata) || {},
      result,
      finishedAt: job ? job.finishedOn : Date.now(),
    });
  }

  private async handleFailed(jobId: string, failedReason: string) {
    const cancelled = failedReason === CANCELLED_MESSAGE || (await this.isCancelled(jobId));
    const status = cancelled ? 'cancelled' : 'failed';
    const error = failedReason || (cancelled ? CANCELLED_MESSAGE : 'Job failed');
    this.broadcast(jobId, 'failed', { status, error }, true);
    this.emit('job:failed', { id: jobId, status, error });
  }

  /**
   * Re-emit 'job:completed' for recently completed jobs, so results that finished while this
   * API process was down still get indexed (listeners must be idempotent).
   */
  async replayCompletedJobs(limit = 200) {
    const jobs = await this.queue.getJobs(['completed'], 0, limit - 1);
    for (const job of jobs) {
      const result = await this.loadResult(job.id!);
      if (result) {
        this.emit('job:completed', {
          id: job.id!,
          metadata: (job.data && job.data.metadata) || {},
          result,
          finishedAt: job.finishedOn,
        });
      }
    }
  }

  /**
   * Wait for a job to finish (sync fallback for ?sync=true).
   */
  async waitForJob(id: string, timeoutMs = 120000) {
    const job = await this.queue.getJob(id);
    if (!job) throw new Error(`Job ${id} not found`);
    await job.waitUntilFinished(this.queueEvents, timeoutMs);
    return this.loadResult(id);
  }

  async close() {
    for (const clients of this.sseClients.values()) {
      for (const res of clients) {
        try {
          res.end();
        } catch {
          // Closed meanwhile
        }
      }
    }
    this.sseClients.clear();
    if (this.workerHandle) await this.workerHandle.close();
    await this.queueEvents.close();
    await this.queue.close();
    await this.redis.quit().catch(() => {});
  }
}
