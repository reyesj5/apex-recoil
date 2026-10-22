'use strict';

const EventEmitter = require('events');
const crypto = require('crypto');
const os = require('os');
const { processAnalysisJob } = require('./job_processor');
const { CANCELLED_MESSAGE } = require('./analysis_runner');

/**
 * Asynchronous In-Memory Compute Job Queue with Concurrency Control,
 * Hard Timeouts, Real-Time Progress Streaming (SSE), and Automated Temp Directory Cleanup.
 *
 * Default queue when REDIS_URL is not set. Jobs live in this process and are lost on restart;
 * see server/bull_queue.js for the persistent (Redis/BullMQ) variant with the same interface.
 */
class JobQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.concurrency = options.concurrency || Math.min(4, Math.max(1, (os.cpus() || []).length - 1));
    this.defaultTimeoutMs = options.defaultTimeoutMs || 120000; // 2 minutes
    this.retentionMs = options.retentionMs || 3600000; // 1 hour
    this.killGraceMs = options.killGraceMs || 3000;
    this.pythonCommand = options.pythonCommand || process.env.PYTHON || 'python';
    this.storage = options.storage || null;
    // Jobs run in this process, so inputs can stay on local disk even with S3 storage
    this.runsLocally = true;
    this.queue = [];
    this.active = new Map();
    this.jobs = new Map();

    // Periodic prune of expired jobs
    this._pruneTimer = setInterval(() => this.pruneExpiredJobs(), 300000);
    if (this._pruneTimer.unref) this._pruneTimer.unref();
  }

  /**
   * Create and enqueue a new compute job. `onComplete(job)` runs once if the job succeeds.
   * `input` is { kind: 'local', dir } or { kind: 'storage', prefix } (`sessionDir` is shorthand
   * for a local input). The input is deleted when the job finishes unless `cleanupInput` is
   * false (default: delete only when the capture is not being saved).
   */
  createJob({ type = 'session', cliArgs = [], input, sessionDir, saveCapture = false, cleanupInput, cleanupSessionDir, timeoutMs, metadata = {}, onComplete = null }) {
    const id = `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const cleanup = cleanupInput !== undefined ? cleanupInput : cleanupSessionDir;
    const job = {
      id,
      type,
      status: 'queued',
      progress: 0,
      stage: 'queued',
      details: null,
      result: null,
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      data: {
        cliArgs,
        input: input || (sessionDir ? { kind: 'local', dir: sessionDir } : null),
        saveCapture,
        cleanupInput: cleanup !== undefined ? cleanup : !saveCapture,
        timeoutMs: timeoutMs || this.defaultTimeoutMs
      },
      timeoutMs: timeoutMs || this.defaultTimeoutMs,
      metadata,
      onComplete,
      childProc: null,
      abortController: null,
      sseClients: new Set()
    };

    this.jobs.set(id, job);
    this.queue.push(id);
    this.emit('job:created', job);

    // Trigger queue processing on next tick
    setImmediate(() => this.processNext());
    return job;
  }

  /**
   * Get public job view.
   */
  getJob(id) {
    const job = this.jobs.get(id);
    if (!job) return null;
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      details: job.details,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      metadata: job.metadata
    };
  }

  /**
   * Process next queued job within concurrency limits.
   */
  processNext() {
    if (this.active.size >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const jobId = this.queue.shift();
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'cancelled') {
      return setImmediate(() => this.processNext());
    }

    this.active.set(job.id, job);
    job.status = 'running';
    job.startedAt = Date.now();
    job.stage = 'starting';
    job.progress = 2;
    job.abortController = new AbortController();
    this.broadcastJobEvent(job, 'progress', {
      status: job.status,
      stage: job.stage,
      progress: job.progress
    });

    processAnalysisJob(job.data, {
      storage: this.storage,
      signal: job.abortController.signal,
      pythonCommand: this.pythonCommand,
      killGraceMs: this.killGraceMs,
      onSpawn: (proc) => { job.childProc = proc; },
      onProgress: (payload) => this.applyProgress(job, payload)
    }).then((result) => {
      if (job.status === 'running') this.finishJob(job, 'completed', result, null);
    }, (err) => {
      if (job.status === 'running') this.finishJob(job, 'failed', null, err.message);
    }).finally(() => {
      // The slot is freed only once the process has exited and the input is cleaned up
      job.childProc = null;
      this.active.delete(job.id);
      setImmediate(() => this.processNext());
    });
  }

  /**
   * Record a structured progress update and notify SSE clients.
   */
  applyProgress(job, payload) {
    if (job.status !== 'running') return;
    job.progress = payload.progress !== undefined ? payload.progress : job.progress;
    job.stage = payload.stage || job.stage;
    job.details = payload.details || job.details;
    this.broadcastJobEvent(job, 'progress', {
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      details: job.details
    });
  }

  /**
   * Finalize a job with status and broadcast.
   */
  finishJob(job, status, result, error) {
    job.status = status;
    job.finishedAt = Date.now();
    job.result = result;
    job.error = error;
    job.progress = status === 'completed' ? 100 : job.progress;
    job.stage = status;

    if (status === 'completed') {
      this.broadcastJobEvent(job, 'complete', { status: 'completed', result: job.result });
      this.emit('job:completed', job);
      if (typeof job.onComplete === 'function') {
        try {
          job.onComplete(job);
        } catch (err) {
          console.warn(`[JobQueue] onComplete handler for ${job.id} failed:`, err.message);
        }
      }
    } else {
      // Named `failed` rather than `error`: EventSource reserves `error` for connection errors.
      this.broadcastJobEvent(job, 'failed', { status: job.status, error: job.error });
      this.emit('job:failed', job);
    }

    // Close any SSE clients attached to this job
    for (const client of job.sseClients) {
      try {
        client.end();
      } catch (_) {}
    }
    job.sseClients.clear();
  }

  /**
   * Cancel an existing job.
   */
  cancelJob(id) {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (job.status === 'queued') {
      const idx = this.queue.indexOf(id);
      if (idx !== -1) this.queue.splice(idx, 1);
      this.finishJob(job, 'cancelled', null, CANCELLED_MESSAGE);
      return true;
    }

    if (job.status === 'running') {
      // The runner terminates the process; the slot frees once it has exited
      if (job.abortController) job.abortController.abort(CANCELLED_MESSAGE);
      this.finishJob(job, 'cancelled', null, CANCELLED_MESSAGE);
      return true;
    }

    return false;
  }

  /**
   * Attach a Server-Sent Events (SSE) client response stream to a job.
   */
  attachSSE(id, req, res) {
    const job = this.jobs.get(id);
    if (!job) {
      res.status(404).json({ success: false, error: `Job ${id} not found` });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders?.();

    // Send immediate initial state
    res.write(`event: state\ndata: ${JSON.stringify(this.getJob(id))}\n\n`);

    // If already finalized, send final event and close
    if (job.status === 'completed') {
      res.write(`event: complete\ndata: ${JSON.stringify({ status: 'completed', result: job.result })}\n\n`);
      res.end();
      return;
    }
    if (job.status === 'failed' || job.status === 'cancelled') {
      res.write(`event: failed\ndata: ${JSON.stringify({ status: job.status, error: job.error })}\n\n`);
      res.end();
      return;
    }

    job.sseClients.add(res);

    // Keepalive heartbeat every 15 seconds
    const heartbeat = setInterval(() => {
      if (res.writableEnded) return;
      try {
        res.write(': keepalive\n\n');
      } catch (_) {}
    }, 15000);
    if (heartbeat.unref) heartbeat.unref();

    // The stream ends either when the client disconnects or when the job finishes
    const detach = () => {
      clearInterval(heartbeat);
      job.sseClients.delete(res);
    };
    req.on('close', detach);
    if (res.on) res.on('close', detach);
  }

  /**
   * Broadcast an SSE event to all connected clients for a job.
   */
  broadcastJobEvent(job, eventName, payload) {
    const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of job.sseClients) {
      try {
        client.write(message);
      } catch (_) {}
    }
  }

  /**
   * Wait for a job to complete (Promise wrapper for sync fallback).
   */
  waitForJob(id, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const job = this.jobs.get(id);
      if (!job) return reject(new Error(`Job ${id} not found`));

      if (job.status === 'completed') return resolve(job.result);
      if (job.status === 'failed') return reject(new Error(job.error || 'Job failed'));
      if (job.status === 'cancelled') return reject(new Error('Job cancelled'));

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for job ${id}`));
      }, timeoutMs);

      const onCompleted = (completedJob) => {
        if (completedJob.id === id) {
          cleanup();
          resolve(completedJob.result);
        }
      };

      const onFailed = (failedJob) => {
        if (failedJob.id === id) {
          cleanup();
          reject(new Error(failedJob.error || 'Job failed'));
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.off('job:completed', onCompleted);
        this.off('job:failed', onFailed);
      };

      this.on('job:completed', onCompleted);
      this.on('job:failed', onFailed);
    });
  }

  /**
   * Prune jobs older than retention window.
   */
  pruneExpiredJobs() {
    const cutoff = Date.now() - this.retentionMs;
    for (const [id, job] of this.jobs.entries()) {
      if (job.status !== 'queued' && job.status !== 'running' && job.finishedAt && job.finishedAt < cutoff) {
        this.jobs.delete(id);
      }
    }
  }

  async close() {
    clearInterval(this._pruneTimer);
    for (const job of this.active.values()) {
      if (job.abortController) job.abortController.abort('Server shutting down');
    }
  }
}

module.exports = {
  JobQueue
};
