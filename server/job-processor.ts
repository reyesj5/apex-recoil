/**
 * Executes one analysis job: makes its input files available in a local folder, runs the
 * discovery CLI and removes inputs that are not kept. Shared by the in-process JobQueue and
 * the BullMQ workers, so both queues behave the same.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { runAnalysis, type AnalysisResult, type Progress } from './analysis-runner.ts';
import type { AssetStorageService } from './storage.ts';

/** Where a job's files are: a folder on the API's machine, or a prefix in object storage (workers may run anywhere) */
export type JobInput = { kind: 'local'; dir: string } | { kind: 'storage'; prefix: string };

/** What a job runs on */
export interface JobData {
  /** Python arguments without --dir */
  cliArgs: string[];
  input: JobInput | null;
  /** Delete the input once the job has finished (not for saved captures) */
  cleanupInput: boolean;
  /** Whether the capture was kept (reported to the client as saved_to_disk) */
  saveCapture: boolean;
  timeoutMs: number;
}

export interface JobContext {
  storage?: AssetStorageService | null;
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
  onSpawn?: (proc: ChildProcess) => void;
  pythonCommand?: string;
  killGraceMs?: number;
  /** Runs once the input is ready, just before the CLI starts */
  beforeRun?: () => Promise<void>;
}

async function removeInput(input: JobInput, storage: AssetStorageService | null | undefined) {
  try {
    if (input.kind === 'local') {
      await fs.promises.rm(input.dir, { recursive: true, force: true });
    } else if (input.kind === 'storage' && storage) {
      await storage.deletePrefix(input.prefix);
    }
  } catch (err) {
    console.warn('[Jobs] Failed to remove job input:', (err as Error).message);
  }
}

export async function processAnalysisJob(data: JobData, ctx: JobContext = {}): Promise<AnalysisResult> {
  const input = data.input || null;
  let downloadDir: string | null = null;

  try {
    let workDir;
    if (input && input.kind === 'storage') {
      if (!ctx.storage) throw new Error('Job input is in object storage but no storage is configured');
      downloadDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'spraydown_job_'));
      const files = await ctx.storage.downloadPrefix(input.prefix, downloadDir);
      if (!files.length) throw new Error(`No input files found under ${input.prefix}`);
      workDir = downloadDir;
    } else if (input && input.kind === 'local') {
      try {
        await fs.promises.access(input.dir);
      } catch {
        throw new Error(
          `Input folder not found: ${input.dir} (with local storage, workers must run on the API machine)`,
        );
      }
      workDir = input.dir;
    }

    // Last chance to notice a cancellation that arrived while the input was being fetched
    if (ctx.beforeRun) await ctx.beforeRun();

    const result = await runAnalysis({
      cliArgs: data.cliArgs || [],
      workDir,
      timeoutMs: data.timeoutMs,
      signal: ctx.signal,
      onProgress: ctx.onProgress,
      onSpawn: ctx.onSpawn,
      pythonCommand: ctx.pythonCommand,
      killGraceMs: ctx.killGraceMs,
    });
    result.saved_to_disk = Boolean(data.saveCapture);
    return result;
  } finally {
    if (downloadDir) {
      await fs.promises.rm(downloadDir, { recursive: true, force: true }).catch(() => {});
    }
    if (input && data.cleanupInput) {
      await removeInput(input, ctx.storage);
    }
  }
}
