#!/usr/bin/env node
'use strict';

/**
 * Standalone analysis worker for the Redis/BullMQ queue (`pnpm worker`).
 * Runs on any machine with Python and the processing/ requirements installed. Workers on a
 * different machine than the API need STORAGE_PROVIDER=s3 so they can fetch job inputs.
 * Uses the same environment variables as the server (REDIS_URL, STORAGE_PROVIDER, S3_*, PYTHON,
 * RECOIL_WORKER_CONCURRENCY); a .env file in the working directory is loaded if present.
 */

const fs = require('fs');

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const { startAnalysisWorker } = require('./bull_queue');
const { getStorage } = require('./storage');

if (!process.env.REDIS_URL) {
  console.error('REDIS_URL is not set; the standalone worker only works with the Redis/BullMQ queue.');
  process.exit(1);
}

const storage = getStorage();
const handle = startAnalysisWorker({ redisUrl: process.env.REDIS_URL, storage });

handle.waitUntilReady().then(() => {
  console.log(`[Worker] processing analysis jobs (concurrency ${handle.worker.concurrency}, storage: ${storage.provider})`);
}, (err) => {
  console.error('[Worker] failed to start:', err.message);
  process.exit(1);
});

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[Worker] ${signal} received, finishing running jobs...`);
  // Running jobs finish; anything interrupted is picked up again by another worker
  await handle.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
