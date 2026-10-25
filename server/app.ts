/**
 * Copyright 2021 Mikhail Goncharov
 * Modified by [OWNER NAME], 2025-2026.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// The app: the built client and the static folders, the captures, the API (routes/), the pages, and
// the error handling. createApp builds it around its database, capture storage, job queue and site
// values, each configured from the environment unless given, so the tests and the end-to-end server
// run it on throwaway data.

import path from 'node:path';
import compression from 'compression';
import express from 'express';
import morgan from 'morgan';
import { DatabaseService } from './db.ts';
import { errorHandler } from './errors.ts';
import { createJobQueue, type AnalysisQueue } from './jobs.ts';
import { capturesRouter } from './routes/captures.ts';
import { discoveryRouter } from './routes/discovery.ts';
import { createPages } from './routes/pages.ts';
import { specsRouter } from './routes/specs.ts';
import { loadSite, root, type SiteValues } from './site.ts';
import { getStorage, type AssetStorageService } from './storage.ts';
import { UploadStaging } from './uploads.ts';

export interface AppOptions {
  /** Owner-specific names and links for the pages (default: site.json) */
  site?: SiteValues;
  /** The specs and the index of analyzed sessions (default: RECOIL_DB_PATH and RECOIL_SPECS_PATH) */
  db?: DatabaseService;
  /** Where captures are kept (default: STORAGE_PROVIDER and its settings) */
  storage?: AssetStorageService;
  /** Where analyses run (default: Redis with REDIS_URL, otherwise in this process) */
  jobQueue?: AnalysisQueue;
  /** Where uploads wait until they are staged (default: RECOIL_UPLOAD_TMP_DIR) */
  uploadDir?: string;
  /** pnpm dev: Vite serves the client sources with hot reload (default: RECOIL_VITE_DEV=1) */
  dev?: boolean;
}

/** Whether a Host header names this computer: localhost, 127.0.0.1 or [::1], on any port */
function addressedToThisComputer(host: string | undefined) {
  const name = (host ?? '').replace(/:\d+$/, '').toLowerCase();
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]';
}

export async function createApp(options: AppOptions = {}) {
  const site = options.site ?? loadSite();
  const dev = options.dev ?? process.env.RECOIL_VITE_DEV === '1';
  const db = options.db ?? new DatabaseService();
  db.init().catch((err: Error) => {
    console.warn('[DB] Failed to initialize database:', err.message);
  });

  // Captures (session folders, screenshot library) live in local storage or in S3
  // (STORAGE_PROVIDER, see server/storage.ts). Browsers always load them from /captures.
  const storage = options.storage ?? getStorage();
  if (storage.isRemote && process.env.S3_AUTO_CREATE_BUCKET === 'true') {
    const corsOrigins = (process.env.S3_CORS_ORIGINS || '*')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    storage.ensureBucket({ corsOrigins }).catch((err: Error) => {
      console.warn('[Storage] Could not prepare bucket ' + storage.s3Bucket + ':', err.message);
    });
  }

  // Analysis jobs run in-process, or on Redis/BullMQ workers when REDIS_URL is set
  const jobQueue = options.jobQueue ?? (await createJobQueue({ storage }));
  const uploads = new UploadStaging({ storage, runsLocally: jobQueue.runsLocally, dir: options.uploadDir });
  uploads.schedulePruning();

  const pages = createPages({ site, dev });
  const app = express();

  app.use(morgan('dev'));
  // Until the app has a sign-in it answers this computer only (main.ts listens on 127.0.0.1), and
  // refuses a request addressed to any other host: a page elsewhere could point its own name at
  // this computer and have the browser call the API, which saves specs (DNS rebinding)
  app.use((req, res, next) => {
    if (addressedToThisComputer(req.headers.host)) return next();
    res.status(403).type('text/plain').send('This server answers only requests addressed to localhost.');
  });
  // Brotli or gzip for text responses, except the analysis event streams: compressing those would
  // hold each progress event in the compressor's buffer instead of sending it right away
  app.use(
    compression({
      filter(req, res) {
        const type = res.getHeader('Content-Type');
        if (typeof type === 'string' && type.indexOf('text/event-stream') === 0) return false;
        return compression.filter(req, res);
      },
    }),
  );
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));
  const vite = pages.vite;
  if (vite) {
    app.use((req, res, next) => {
      vite.then((server) => server.middlewares(req, res, next), next);
    });
  }
  // Chunk and asset file names (scripts, fonts) carry a content hash, so browsers keep them for a
  // year; the entry files (trainer.js, studio.js, app.css...) keep their names and are revalidated
  const dist = path.join(root, 'dist');
  const hashedDirs = ['chunks', 'assets'].map((dir) => path.join(dist, dir) + path.sep);
  app.use(
    express.static(dist, {
      setHeaders(res, filePath) {
        const hashed = hashedDirs.some((dir) => filePath.startsWith(dir));
        res.set('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );
  app.use(express.static(path.join(root, 'assets')));
  app.use('/assets', express.static(path.join(root, 'assets')));
  app.use(express.static(path.join(root, 'etc')));

  app.use('/captures', capturesRouter(storage));
  app.use('/api/specs', specsRouter(db));
  app.use('/api/discovery', discoveryRouter({ db, storage, jobQueue, uploads }));
  app.use(pages.router);
  app.use(pages.notFound);
  app.use(errorHandler(pages));

  // For the HTTP server and graceful shutdown
  app.locals.site = site;
  app.locals.db = db;
  app.locals.storage = storage;
  app.locals.jobQueue = jobQueue;
  return app;
}
