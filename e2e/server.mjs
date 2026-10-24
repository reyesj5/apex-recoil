// Runs the app for the end-to-end tests (pnpm test:e2e; playwright.config.ts starts it). Everything
// it writes goes to a throwaway folder: database, specs.json, captures and uploads, so a run never
// touches data/recoil.db or client/specs.json. It serves the built client from dist/ (run pnpm build
// first), uses the in-process job queue and local storage, and runs the discovery CLI with PYTHON
// (default: python).
//   PORT           port to listen on (default 3210)
//   E2E_ANALYTICS  1: analytics on with a test measurement ID, for the consent scenarios
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.ts';
import { DatabaseService } from '../server/db.ts';
import { JobQueue } from '../server/job-queue.ts';
import { loadSite, root } from '../server/site.ts';
import { AssetStorageService } from '../server/storage.ts';

const port = Number(process.env.PORT || 3210);

if (
  !fs.existsSync(path.join(root, 'dist', 'trainer.js')) ||
  !fs.existsSync(path.join(root, 'dist-ssr', 'prerender.mjs'))
) {
  console.error('e2e server: dist/ or dist-ssr/ has no build, run pnpm build first');
  process.exit(1);
}

// A fixed folder per port, emptied on start: on Windows the server is killed without a chance to clean up
const dataDir = path.join(os.tmpdir(), `spraydown-e2e-${port}`);
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.copyFileSync(path.join(root, 'client', 'specs.json'), path.join(dataDir, 'specs.json'));

const storage = new AssetStorageService({ provider: 'local', localBaseDir: path.join(dataDir, 'captures') });
const app = await createApp({
  db: new DatabaseService(path.join(dataDir, 'recoil.db'), path.join(dataDir, 'specs.json')),
  storage,
  jobQueue: new JobQueue({ storage }),
  uploadDir: path.join(dataDir, 'uploads'),
  dev: false,
  // The pages render with these values (client/lib/site.ts)
  site:
    process.env.E2E_ANALYTICS === '1'
      ? { ...loadSite(), gaMeasurementId: 'G-E2ETEST000', privacyUrl: '/privacy' }
      : loadSite(),
});

http.createServer(app).listen(port, '127.0.0.1', () => {
  console.log(`e2e server on http://127.0.0.1:${port}, data in ${dataDir}`);
});
