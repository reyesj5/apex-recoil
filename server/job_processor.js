'use strict';

/**
 * Executes one analysis job: makes its input files available in a local folder, runs the
 * discovery CLI and removes inputs that are not kept. Shared by the in-process JobQueue and
 * the BullMQ workers, so both queues behave the same.
 *
 * Job data:
 *   cliArgs       Python arguments without --dir
 *   input         { kind: 'local', dir } (same machine as the API) or
 *                 { kind: 'storage', prefix } (object storage; workers may run anywhere)
 *   cleanupInput  delete the input once the job has finished (not for saved captures)
 *   saveCapture   whether the capture was kept (reported to the client as saved_to_disk)
 *   timeoutMs
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runAnalysis } = require('./analysis_runner');

async function removeInput(input, storage) {
  try {
    if (input.kind === 'local') {
      await fs.promises.rm(input.dir, { recursive: true, force: true });
    } else if (input.kind === 'storage') {
      await storage.deletePrefix(input.prefix);
    }
  } catch (err) {
    console.warn('[Jobs] Failed to remove job input:', err.message);
  }
}

/**
 * @param {object} data   job data (see above)
 * @param {object} ctx    { storage, signal, onProgress, onSpawn, pythonCommand, killGraceMs, beforeRun }
 */
async function processAnalysisJob(data, ctx = {}) {
  const input = data.input || null;
  let downloadDir = null;

  try {
    let workDir;
    if (input && input.kind === 'storage') {
      if (!ctx.storage) throw new Error('Job input is in object storage but no storage is configured');
      downloadDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'apex_job_'));
      const files = await ctx.storage.downloadPrefix(input.prefix, downloadDir);
      if (!files.length) throw new Error(`No input files found under ${input.prefix}`);
      workDir = downloadDir;
    } else if (input && input.kind === 'local') {
      try {
        await fs.promises.access(input.dir);
      } catch (_) {
        throw new Error(`Input folder not found: ${input.dir} (with local storage, workers must run on the API machine)`);
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
      killGraceMs: ctx.killGraceMs
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

module.exports = {
  processAnalysisJob
};
