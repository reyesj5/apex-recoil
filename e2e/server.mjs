// Runs the app for the end-to-end tests (pnpm test:e2e; playwright.config.ts starts it). Everything
// it writes goes to a throwaway folder: database, specs.json, captures and uploads, so a run never
// touches data/recoil.db or client/specs.json. It serves the built client from dist/ (run pnpm build
// first), uses the in-process job queue and local storage, and runs the discovery CLI with PYTHON
// (default: python).
//   PORT           port to listen on (default 3210)
//   E2E_ANALYTICS  1: analytics on with a test measurement ID, for the consent scenarios
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 3210);

if (!fs.existsSync(path.join(root, 'dist', 'trainer.js'))) {
  console.error('e2e server: dist/ has no build, run pnpm build first');
  process.exit(1);
}

// A fixed folder per port, emptied on start: on Windows the server is killed without a chance to clean up
const dataDir = path.join(os.tmpdir(), `spraydown-e2e-${port}`);
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.copyFileSync(path.join(root, 'client', 'specs.json'), path.join(dataDir, 'specs.json'));
Object.assign(process.env, {
  RECOIL_DB_PATH: path.join(dataDir, 'recoil.db'),
  RECOIL_SPECS_PATH: path.join(dataDir, 'specs.json'),
  RECOIL_CAPTURES_DIR: path.join(dataDir, 'captures'),
  RECOIL_UPLOAD_TMP_DIR: path.join(dataDir, 'uploads'),
});
delete process.env.REDIS_URL;
delete process.env.STORAGE_PROVIDER;

const require = createRequire(import.meta.url);
const app = require('../app.js');
if (process.env.E2E_ANALYTICS === '1') {
  // The pages read site.json through this object (see pageLocals in app.js)
  Object.assign(app.locals.site, { gaMeasurementId: 'G-E2ETEST000', privacyUrl: '/privacy' });
}

http.createServer(app).listen(port, '127.0.0.1', () => {
  console.log(`e2e server on http://127.0.0.1:${port}, data in ${dataDir}`);
});
