'use strict';

/**
 * Runs the Python discovery CLI for one analysis job: streams structured PROGRESS lines,
 * enforces the timeout, honours cancellation (AbortSignal) and parses the JSON result from
 * stdout. The promise settles only after the process has exited, so callers can safely delete
 * the job's files afterwards. Shared by the in-process JobQueue and the BullMQ worker.
 */

const path = require('path');
const { spawn } = require('child_process');

// Keep only the tail of stderr for error messages; progress output can be long.
const MAX_STDERR_CHARS = 64 * 1024;
const PROCESSING_DIR = path.join(__dirname, '..', 'processing');
const CANCELLED_MESSAGE = 'Job was cancelled by user';

class AnalysisError extends Error {
  /**
   * @param {string} message
   * @param {'spawn'|'exit'|'parse'|'timeout'|'cancelled'} code
   */
  constructor(message, code) {
    super(message);
    this.name = 'AnalysisError';
    this.code = code;
  }
}

/**
 * Parse one stderr line; returns the payload of a `PROGRESS:{json}` line or null.
 */
function parseProgressLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('PROGRESS:')) return null;
  try {
    return JSON.parse(trimmed.slice(9));
  } catch (_) {
    return null;
  }
}

/**
 * Send SIGTERM, escalating to SIGKILL if the process is still alive after the grace period.
 */
function terminateProcess(proc, graceMs) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  try {
    proc.kill('SIGTERM');
  } catch (_) {}
  const killTimer = setTimeout(() => {
    if (proc.exitCode === null && proc.signalCode === null) {
      try { proc.kill('SIGKILL'); } catch (_) {}
    }
  }, graceMs);
  if (killTimer.unref) killTimer.unref();
  proc.once('exit', () => clearTimeout(killTimer));
}

function abortReason(signal) {
  const reason = signal && signal.reason;
  if (typeof reason === 'string' && reason) return reason;
  if (reason && typeof reason.message === 'string' && reason.message && reason.name !== 'AbortError') return reason.message;
  return CANCELLED_MESSAGE;
}

/**
 * @param {object} options
 * @param {string[]} options.cliArgs   Python arguments (e.g. ['-m', 'recoil_discovery.cli', 'session', ...])
 * @param {string} [options.workDir]   Input folder, passed to the CLI as `--dir`
 * @param {number} [options.timeoutMs]
 * @param {AbortSignal} [options.signal]
 * @param {(p: {progress?: number, stage?: string, details?: any}) => void} [options.onProgress]
 * @param {(proc: import('child_process').ChildProcess) => void} [options.onSpawn]
 * @returns {Promise<object>} the parsed CLI result
 */
function runAnalysis({
  cliArgs,
  workDir,
  timeoutMs = 120000,
  signal,
  onProgress,
  onSpawn,
  pythonCommand,
  killGraceMs = 3000,
  cwd = PROCESSING_DIR
}) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(new AnalysisError(abortReason(signal), 'cancelled'));
      return;
    }

    const args = workDir ? [...cliArgs, '--dir', workDir] : [...cliArgs];
    let proc;
    try {
      proc = spawn(pythonCommand || process.env.PYTHON || 'python', args, { cwd });
    } catch (err) {
      reject(new AnalysisError(`Spawn exception: ${err.message}`, 'spawn'));
      return;
    }
    if (onSpawn) onSpawn(proc);

    let settled = false;
    let stopReason = null; // set when we terminate the process ourselves
    let stdoutData = '';
    let stderrData = '';
    let stderrPartialLine = '';

    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (err) reject(err);
      else resolve(result);
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

    const handleLine = (line) => {
      const payload = parseProgressLine(line);
      if (payload && onProgress) {
        try {
          onProgress(payload);
        } catch (_) {}
      }
    };

    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');

    proc.stdout.on('data', (chunk) => {
      stdoutData += chunk;
    });

    proc.stderr.on('data', (text) => {
      stderrData = (stderrData + text).slice(-MAX_STDERR_CHARS);
      // A PROGRESS line may be split across chunks
      const lines = (stderrPartialLine + text).split('\n');
      stderrPartialLine = lines.pop();
      lines.forEach(handleLine);
    });

    proc.stderr.on('end', () => {
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
          } catch (_) {
            if (!errDetail) errDetail = stdoutData;
          }
        }
        finish(new AnalysisError(`Discovery process exited with code ${code}${errDetail ? `: ${errDetail}` : ''}`, 'exit'));
        return;
      }

      try {
        const raw = stdoutData.trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}$/);
        finish(null, JSON.parse(jsonMatch ? jsonMatch[0] : raw));
      } catch (parseErr) {
        finish(new AnalysisError(`Failed to parse discovery output: ${parseErr.message}\n${stdoutData}`, 'parse'));
      }
    });
  });
}

module.exports = {
  runAnalysis,
  terminateProcess,
  parseProgressLine,
  AnalysisError,
  CANCELLED_MESSAGE
};
