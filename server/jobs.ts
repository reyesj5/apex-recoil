/**
 * Picks the analysis job queue from the environment:
 * - REDIS_URL set: BullJobQueue (persistent, multi-worker; embedded worker unless
 *   RECOIL_EMBEDDED_WORKER=false)
 * - otherwise:     in-process JobQueue
 * Both have the interface below, which is all the API uses.
 */

import type { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import type { AnalysisResult } from './analysis-runner.ts';
import type { JobInput } from './job-processor.ts';
import { JobQueue } from './job-queue.ts';
import type { AssetStorageService } from './storage.ts';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** What a job carries for when it finishes: the capture to index, or the library to refresh */
export interface JobMetadata {
  weapon?: string;
  mode?: string;
  savedToLibrary?: boolean;
  session?: { id: string; sampleCount: number; metadata: Record<string, unknown> } | null;
  [key: string]: unknown;
}

export interface JobOptions {
  type?: string;
  cliArgs?: string[];
  input?: JobInput | null;
  /** Shorthand for a local input */
  sessionDir?: string;
  saveCapture?: boolean;
  /** Delete the input when the job finishes; by default only when the capture isn't saved */
  cleanupInput?: boolean;
  /** The old name of cleanupInput */
  cleanupSessionDir?: boolean;
  timeoutMs?: number;
  metadata?: JobMetadata;
}

/** A job as the API shows it (GET /api/discovery/jobs/:id) */
export interface JobView {
  id: string;
  type: string | null;
  status: JobStatus;
  progress: number;
  stage: string;
  details: Record<string, unknown> | null;
  result: AnalysisResult | null;
  error: string | null;
  createdAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  metadata: JobMetadata;
}

/** The events a queue emits when a job finishes, wherever it ran */
export interface QueueEvents {
  'job:created': [{ id: string }];
  'job:completed': [{ id: string; metadata: JobMetadata; result: AnalysisResult | null; finishedAt?: number | null }];
  'job:failed': [{ id: string; status: JobStatus; error: string | null }];
}

/** What the API needs from a job queue */
export interface AnalysisQueue extends EventEmitter<QueueEvents> {
  /** Where jobs wait: in this process, or in Redis */
  readonly kind: 'memory' | 'redis';
  /** Jobs run in this process, so their inputs can stay on local disk even with S3 storage */
  readonly runsLocally: boolean;
  createJob(options: JobOptions): { id: string; timeoutMs: number } | Promise<{ id: string; timeoutMs: number }>;
  getJob(id: string): JobView | null | Promise<JobView | null>;
  cancelJob(id: string): boolean | Promise<boolean>;
  /** Streams the job's progress to the response as Server-Sent Events, or answers 404 */
  attachSSE(id: string, req: Request, res: Response): void | Promise<void>;
  /** Waits for the job's result (for ?sync=true) */
  waitForJob(id: string, timeoutMs?: number): Promise<AnalysisResult | null>;
  /** Reports the jobs that finished while this process was down (Redis only) */
  replayCompletedJobs?(): Promise<void>;
  close(): Promise<void>;
}

export async function createJobQueue({
  storage,
}: { storage?: AssetStorageService | null } = {}): Promise<AnalysisQueue> {
  if (process.env.REDIS_URL) {
    // Loaded only when used, with ioredis and BullMQ
    const { BullJobQueue } = await import('./bull-queue.ts');
    return new BullJobQueue({
      redisUrl: process.env.REDIS_URL,
      storage,
      runWorker: process.env.RECOIL_EMBEDDED_WORKER !== 'false',
    });
  }
  return new JobQueue({ storage });
}
