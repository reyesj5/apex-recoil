/**
 * Runs the Python discovery CLI for one analysis job: streams structured PROGRESS lines,
 * enforces the timeout, honours cancellation (AbortSignal) and parses the JSON result from
 * stdout. The promise settles only after the process has exited, so callers can safely delete
 * the job's files afterwards. Shared by the in-process JobQueue and the BullMQ worker.
 */

import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { root } from './site.ts';

// Keep only the tail of stderr for error messages; progress output can be long.
const MAX_STDERR_CHARS = 64 * 1024;
const PROCESSING_DIR = path.join(root, 'processing');
export const CANCELLED_MESSAGE = 'Job was cancelled by user';

export type AnalysisErrorCode = 'spawn' | 'exit' | 'parse' | 'timeout' | 'cancelled';

export class AnalysisError extends Error {
  code: AnalysisErrorCode;

  constructor(message: string, code: AnalysisErrorCode) {
    super(message);
    this.name = 'AnalysisError';
    this.code = code;
  }
}

/** A structured progress update from the CLI (a `PROGRESS:{json}` line on stderr) */
export interface Progress {
  progress?: number;
  stage?: string;
  details?: Record<string, unknown> | null;
}

/** What the discovery CLI prints on success; the API passes it on as it is */
export type AnalysisResult = Record<string, unknown>;

/**
 * Parse one stderr line; returns the payload of a `PROGRESS:{json}` line or null.
 */
export function parseProgressLine(line: string): Progress | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('PROGRESS:')) return null;
  try {
    return JSON.parse(trimmed.slice(9)) as Progress;
  } catch {
    return null;
  }
}

/**
 * Send SIGTERM, escalating to SIGKILL if the process is still alive after the grace period.
 */
export function terminateProcess(proc: ChildProcess | null, graceMs: number) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  try {
    proc.kill('SIGTERM');
  } catch {
    // Already gone
  }
  const killTimer = setTimeout(() => {
    if (proc.exitCode === null && proc.signalCode === null) {
      try {
        proc.kill('SIGKILL');
      } catch {
        // Already gone
      }
    }
  }, graceMs);
  killTimer.unref();
  proc.once('exit', () => clearTimeout(killTimer));
}

function abortReason(signal: AbortSignal | undefined) {
  const reason: unknown = signal && signal.reason;
  if (typeof reason === 'string' && reason) return reason;
  const { message, name } = (reason ?? {}) as { message?: unknown; name?: unknown };
  if (typeof message === 'string' && message && name !== 'AbortError') return message;
  return CANCELLED_MESSAGE;
}

export interface RunOptions {
  /** Python arguments (e.g. ['-m', 'recoil_discovery.cli', 'session', ...]) */
  cliArgs: string[];
  /** Input folder, passed to the CLI as `--dir` */
  workDir?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: Progress) => void;
  onSpawn?: (proc: ChildProcess) => void;
  pythonCommand?: string;
  killGraceMs?: number;
  cwd?: string;
}

/** Runs the CLI and resolves with its parsed result */
export function runAnalysis({
  cliArgs,
  workDir,
  timeoutMs = 120000,
  signal,
  onProgress,
  onSpawn,
  pythonCommand,
  killGraceMs = 3000,
  cwd = PROCESSING_DIR,
}: RunOptions): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(new AnalysisError(abortReason(signal), 'cancelled'));
      return;
    }

    const args = workDir ? [...cliArgs, '--dir', workDir] : [...cliArgs];
    let proc: ChildProcess;
    try {
      proc = spawn(pythonCommand || process.env.PYTHON || 'python', args, { cwd });
    } catch (err) {
      reject(new AnalysisError(`Spawn exception: ${(err as Error).message}`, 'spawn'));
      return;
    }
    if (onSpawn) onSpawn(proc);

    let settled = false;
    let stopReason: AnalysisError | null = null; // set when we terminate the process ourselves
    let stdoutData = '';
    let stderrData = '';
    let stderrPartialLine = '';

    const finish = (err: AnalysisError | null, result?: AnalysisResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (err) reject(err);
      else resolve(result!);
    };

    const timer = setTimeout(() => {
      stopReason = new AnalysisError(`Compute job timed out after ${timeoutMs / 1000}s`, 'timeout');
      terminateProcess(proc, killGraceMs);
    }, timeoutMs);

    function onAbort() {
      if (!stopReason) stopReason = new AnalysisError(abortReason(signal), 'cancelled');
      terminateProcess(proc, killGraceMs);
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    const handleLine = (line: string) => {
      const payload = parseProgressLine(line);
      if (payload && onProgress) {
        try {
          onProgress(payload);
        } catch {
          // A failing listener doesn't stop the analysis
        }
      }
    };

    const stdout = proc.stdout!;
    const stderr = proc.stderr!;
    stdout.setEncoding('utf8');
    stderr.setEncoding('utf8');

    stdout.on('data', (chunk: string) => {
      stdoutData += chunk;
    });

    stderr.on('data', (text: string) => {
      stderrData = (stderrData + text).slice(-MAX_STDERR_CHARS);
      // A PROGRESS line may be split across chunks
      const lines = (stderrPartialLine + text).split('\n');
      stderrPartialLine = lines.pop()!;
      lines.forEach(handleLine);
    });

    stderr.on('end', () => {
      if (stderrPartialLine) handleLine(stderrPartialLine);
      stderrPartialLine = '';
    });

    proc.on('error', (err) => {
      finish(new AnalysisError(`Failed to spawn Python process: ${err.message}`, 'spawn'));
    });

    proc.on('close', (code) => {
      if (stopReason) {
        finish(stopReason);
        return;
      }

      if (code !== 0) {
        let errDetail = stderrData;
        if (stdoutData) {
          try {
            const parsed = JSON.parse(stdoutData.trim());
            if (parsed && parsed.error) {
              errDetail = parsed.error + (stderrData ? `\n${stderrData}` : '');
            }
          } catch {
            if (!errDetail) errDetail = stdoutData;
          }
        }
        finish(
          new AnalysisError(`Discovery process exited with code ${code}${errDetail ? `: ${errDetail}` : ''}`, 'exit'),
        );
        return;
      }

      try {
        const raw = stdoutData.trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}$/);
        finish(null, JSON.parse(jsonMatch ? jsonMatch[0] : raw) as AnalysisResult);
      } catch (parseErr) {
        finish(
          new AnalysisError(`Failed to parse discovery output: ${(parseErr as Error).message}\n${stdoutData}`, 'parse'),
        );
      }
    });
  });
}
