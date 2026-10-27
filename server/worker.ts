/**
 * Standalone analysis worker for the Redis/BullMQ queue (`pnpm worker`).
 * Runs on any machine with Python and the processing/ requirements installed. Workers on a
 * different machine than the API need STORAGE_PROVIDER=s3 so they can fetch job inputs.
 * Uses the same environment variables as the server (REDIS_URL, STORAGE_PROVIDER, S3_*, PYTHON,
 * RECOIL_WORKER_CONCURRENCY); a .env file in the working directory is loaded if present.
 */

import fs from 'node:fs';
import { checkSettings } from './settings.ts';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
// Each setting checked before anything starts: REDIS_URL among them, which a worker needs
checkSettings('worker');

// Loaded after .env, so they see its values
const { startAnalysisWorker } = await import('./bull-queue.ts');
const { getStorage } = await import('./storage.ts');

const storage = getStorage();
const handle = startAnalysisWorker({ redisUrl: process.env.REDIS_URL, storage });

handle.waitUntilReady().then(
  () => {
    console.log(
      `[Worker] processing analysis jobs (concurrency ${handle.worker.concurrency}, storage: ${storage.provider})`,
    );
  },
  (err: Error) => {
    console.error('[Worker] failed to start:', err.message);
    process.exit(1);
  },
);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[Worker] ${signal} received, finishing running jobs...`);
  // Running jobs finish; anything interrupted is picked up again by another worker
  await handle.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
