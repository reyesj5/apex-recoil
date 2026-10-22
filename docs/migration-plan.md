# Architectural Migration & Modernization Plan: Apex Legends Recoil Suite

This document establishes the master architectural blueprint, execution roadmap, testing strategy, and progress tracking framework for transitioning the **Apex Legends Recoil Suite** from its legacy single-process, flat-file topology to a horizontally scalable, asynchronous, modern multi-tier platform.

---

## 🎯 Strategic Migration Objectives

1. **Eliminate Memory & Concurrency Bottlenecks:**
   - Terminate in-flight 150MB base64 video payloads and V8 heap exhaustion by moving to binary streaming uploads.
   - Decouple compute-heavy OpenCV/NumPy processing into dedicated asynchronous worker pools.
   - Refactor video ingestion to stream frames iteratively without multi-gigabyte memory arrays.
2. **Modernize Client & Developer Experience:**
   - Migrate from Gulp/Browserify/Pug/Monolithic SCSS to Vite + React/TypeScript + Tailwind CSS.
   - Code-split the public Aim Trainer (<150KB gzip) from the heavy Auto-Capture Studio & CV Inspector.
   - Decompose the 5,388-line [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts) into modular, testable components.
3. **Establish Resilient, ACID-Compliant Persistence:**
   - Migrate weapon specifications from flat-file [`client/specs.json`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/specs.json) to an atomic, versioned database model with file-locking guards.
   - Transition video and screenshot storage to S3/MinIO-compatible object storage.
4. **Preserve Sub-Millisecond Simulation Accuracy:**
   - Guarantee 100% mathematical parity with Source Engine mouse coordinates ($K_{px\_to\_mouse} = 3.36$), ground loot specs, and Arduino HID export alignment.

---

## 📊 Master Progress Dashboard

*Status as of the 2026-10-19 audit (see [Audit Log](#-audit-log-2026-10-19) below). Gates marked "not measured" have no automated check yet.*

| Phase | Focus Area | Status | Deliverables | Verification Gate |
| :--- | :--- | :---: | :--- | :--- |
| **Phase 1** | **Stabilization & Memory Hardening** | 🟢 Complete | Streaming multipart uploads, async fs calls, atomic JSON writes, streaming video decoder | Decoder buffer no longer grows with clip length (328 MB peak on a 5 s 1080p clip vs 632 MB+ before); event-loop stalls not measured |
| **Phase 2** | **Compute Worker Service & Async Queue** | 🟢 Complete | In-process `JobQueue` (default) or Redis/BullMQ (`REDIS_URL`): persistent jobs, embedded or standalone workers (`npm run worker`), crash recovery, cross-process cancellation, SSE progress. Each job still starts a fresh Python process (no warm OpenCV daemon) | Integration tests on Redis, including a worker killed mid-job; dispatch latency not measured |
| **Phase 3** | **Modern Frontend Architecture** | 🟡 In Progress (3.4 started) | Vite bundler, route bundles (`trainer.js` vs `editor.js`), editor analysis modules; Tailwind 4 (prefixed `tw:`) next to the SCSS with theme.json tokens, first component migrated. React is not used | Trainer route 89 kB gzip (< 150 kB); migrated markup verified with zero computed-style change; Lighthouse not measured |
| **Phase 4** | **Database & Asset Storage Layer** | 🟢 Complete | SQLite versioned, lossless spec store kept in sync with `specs.json`; session metadata index; local or S3-compatible capture storage (AWS SDK v3) with direct browser uploads via presigned PUT | Byte-identical `specs.json` round trip, no lost updates between writers; S3 tested against SeaweedFS |
| **Phase 5** | **Shadow Parity, Benchmarks & Cutover** | 🟢 Complete | Full-document shadow parity, legacy Gulp removed, static site build restored, CI with Redis + S3 integration job | 100% field-level parity across all 31 weapons |

**Runtime modes** (see [`.env.example`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/.env.example)): by default the app needs no services, running jobs in-process and keeping captures in `processing/captures`. Setting `REDIS_URL` switches to the BullMQ queue, and `STORAGE_PROVIDER=s3` to object storage. They can be combined freely; workers on other machines need both. [`compose.yaml`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/compose.yaml) runs Redis and an S3-compatible server (SeaweedFS) for development and CI.

---

## 🗺️ Architectural Topology: Target State

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                TARGET ARCHITECTURE                                     │
│                                                                                        │
│  [Client Tier - Vite / TypeScript / React 19 / Canvas Core]                           │
│    ├── Route A: Lightweight Aim Trainer (Static Edge CDN, Konva/WebGL Canvas, <150KB)  │
│    └── Route B: Discovery Studio (Lazy-Loaded Plotly, MediaRecorder, WebGL HDR LUTs)   │
│               │                                                                        │
│               │ 1. Direct Presigned Upload (Tus / S3 Multipart Stream)                 │
│               │ 2. OpenAPI / REST Client                                               │
│               │ 3. WebSocket / SSE Progress Channel                                    │
│               ▼                                                                        │
│  [API Gateway Tier - Fastify (Node.js) or Go]                                          │
│    ├── Stateless, Zero-Buffer Gateway                                                  │
│    ├── Issues presigned S3/R2 upload URLs (Payloads bypass API memory completely)      │
│    ├── Validates JSON schemas (Zod / TypeBox)                                          │
│    └── Dispatches async jobs to Redis Queue                                            │
│               │                                                                        │
│               ├── Enqueue Job (BullMQ / Redis)                                         │
│               ▼                                                                        │
│  [Message Broker & Cache - Redis 7 (Valkey)]                                           │
│    ├── Job Queues (spray_analysis, batch_aggregation, diff_generation)                 │
│    └── Pub/Sub for Real-Time SSE/WebSocket Status Updates                             │
│               │                                                                        │
│               ├── Dequeue & Process                                                    │
│               ▼                                                                        │
│  [Compute Worker Tier - Python 3.12 (Celery / RQ / FastAPI Daemon)]                    │
│    ├── Warm In-Memory Python Workers (OpenCV & SciPy preloaded, 0ms cold-start)        │
│    ├── Frame-Streaming Video Ingestion (Iterative, max 35MB RAM per job)               │
│    └── Hardware-Accelerated Decal Detection (CUDA / OpenCL if available)               │
│               │                                                                        │
│               ├── Write Extracted Specs & Session Metadata                             │
│               ▼                                                                        │
│  [Data Tier - PostgreSQL 16 + S3 / MinIO Object Storage]                               │
│    ├── PostgreSQL: Weapon specs (versioned JSONB), session runs, user trials           │
│    └── S3 / MinIO: Raw gameplay videos, wall screenshots, generated diff plots          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Detailed Phased Implementation Breakdown

### Phase 1: Stabilization, Memory Hardening & Non-Blocking I/O
*Goal: Eliminate server crashes and event-loop blocking while preserving existing frontend and CLI contracts.*

- [x] **1.1 Multipart/Form-Data Streaming Ingestion**:
  - Replace `express.json({ limit: '150mb' })` with `multer` streaming file uploads (global JSON limit lowered to 20MB, multer streaming configured with 60MB file caps).
  - Update [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts) to send binary `FormData` with raw video `Blob`s and `dataUrlToBlob` screenshots instead of base64 strings.
  - Enforce max file size limit (60MB binary per clip) and EXDEV-safe cross-filesystem streaming file moves.
- [x] **1.2 Non-Blocking Asynchronous Directory Traversal in [`app.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/app.js)**:
  - Replace synchronous `fs.readdirSync` and `fs.statSync` in `/api/discovery/sessions` and `/api/discovery/screenshots` with `fs.promises.readdir` and `fs.promises.stat`.
  - Add in-memory TTL caching (60s) with automatic cache invalidation on new session and screenshot saves.
- [x] **1.3 Atomic File Write Safeguards for [`client/specs.json`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/specs.json)**:
  - Implement write-to-temp-file followed by atomic swap (`Path.replace()` / `fs.rename`) in [`app.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/app.js) and [`processing/recoil_discovery/spec_manager.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/spec_manager.py).
  - Add unit test coverage in `processing/tests/test_spec_manager.py` verifying atomic replacement without data corruption.
- [x] **1.4 Streaming Video Decoder in Python Engine ([`pipeline.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/pipeline.py))**:
  - Refactored `process_video_clip` to use rolling buffers (`deque(maxlen=21)`, the tracker looks back at most 20 frames) for settled frames instead of accumulating all uncompressed arrays into `frames_gray = []`.
  - Implemented sparse on-demand seeking fallback for temporal differencing.
  - Measured with `tracemalloc` on a synthetic 5 s, 60 fps, 1080p clip: 328 MB peak, constant with clip length (the pre-streaming decoder held 632 MB of gray frames alone and grew linearly). Parity tests in [`processing/tests/test_pipeline.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/tests/test_pipeline.py) compare it against the full-decode algorithm on both extraction paths.
  - Considered and dropped (2026-10-21): re-decoding the chosen settled BGR frame instead of buffering 21 of them would save ~130 MB at 1080p but costs a second decode pass, measured at 1.1 s of a 4.9 s clip analysis (+22% CPU). Analysis is CPU-bound and concurrency is capped at 4, so the memory is the cheaper resource.

---

### Phase 2: Compute Worker Service & Asynchronous Job Architecture
*Goal: Decouple long-running computer vision tasks into a dedicated worker pool with real-time feedback.*

- [x] **2.1 Worker Pool & Queue Broker ([server/job_queue.js](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/server/job_queue.js))**:
  - Established dedicated in-memory asynchronous `JobQueue` service with configurable concurrency (`os.cpus() - 1`, capped at 4) and job lifecycle tracking (`queued`, `running`, `completed`, `failed`, `cancelled`).
  - Added unit test suite [`test/job_queue.test.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/test/job_queue.test.js) and integrated `npm test` script into `package.json`.
  - Implemented structured `PROGRESS:` streaming protocol between Python discovery engine and Node.js worker pool.
- [x] **2.2 Asynchronous Job API & Real-Time Progress Channel**:
  - Refactored `POST /api/discovery/process-session` and `POST /api/discovery/process-static-image` to return `202 Accepted` with a unique `job_id` and events/status URLs (with `?sync=true` backward compatibility).
  - Implemented Server-Sent Events (SSE) endpoint `GET /api/discovery/jobs/:id/events` with keepalive heartbeats and status polling fallback `GET /api/discovery/jobs/:id`.
  - Added cancellation endpoint `POST /api/discovery/jobs/:id/cancel` terminating worker child processes.
  - Integrated `pollOrStreamJobResult` in [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts) showing live `[0%..100%]` progress bars and stage messages in the UI.
- [x] **2.3 Worker Concurrency Control & Fault Isolation**:
  - Enforced CPU-aware concurrency ceilings preventing process saturation.
  - Added hard timeout guard (120 seconds default) with automatic child process termination (`SIGTERM` -> `SIGKILL` after a 3 s grace period).
  - Implemented automated temporary directory cleanup on job completion, timeout, cancellation, or failure (deferred until a killed process has exited).
  - With the in-process queue, jobs live in server memory: a restart loses queued and running jobs (the client reports this instead of polling forever). See 2.4 for the persistent queue.
- [x] **2.4 Persistent Queue & Remote Workers (Redis/BullMQ, [`server/bull_queue.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/server/bull_queue.js))**:
  - With `REDIS_URL` set, [`server/jobs.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/server/jobs.js) selects `BullJobQueue` (BullMQ 6 + ioredis 6), which has the same interface as the in-process queue; both run jobs through [`server/job_processor.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/server/job_processor.js) and [`server/analysis_runner.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/server/analysis_runner.js).
  - The API runs an embedded worker unless `RECOIL_EMBEDDED_WORKER=false`; `npm run worker` ([`server/worker.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/server/worker.js)) starts more, on any machine with Python. Job inputs are a local folder or, with S3 storage, an object prefix that remote workers download.
  - Queued jobs survive restarts; a job whose worker dies is retried by another worker once its lock expires (about a minute with BullMQ's default 30 s lock and stalled-check intervals). Completions missed while the API was down are replayed at startup so saved sessions still get indexed.
  - Cancellation of a running job is relayed to whichever worker holds it (Redis pub/sub + `Worker.cancelJob`); queued jobs are removed. Results (~1 MB with preview frames) are stored under their own key with a 1 h TTL instead of in BullMQ's event stream.
  - Tests: [`test/bull_queue.test.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/test/bull_queue.test.js) against Redis, including a worker process killed mid-job.

---

### Phase 3: Modern Frontend Architecture & Component Decomposition
*Goal: Replace legacy Gulp/Browserify/Pug with Vite + React/TypeScript + Tailwind CSS and route-level code splitting.*

- [x] **3.1 Modern Bundler Setup (Vite + TypeScript)**:
  - `vite.config.mjs` builds the route entries `trainer` and `editor`, a legacy `bundle` router, `style` (SCSS) and `tailwind`, and regenerates `theme.scss` and `client/styles/theme-tokens.css` from `theme.json` (formerly gulp's json-sass task).
  - `npm run build` (production) and `npm run watch` (rebuild on change, used by `npm run dev`).
- [x] **3.2 Core Aim Trainer Bundle Separation**:
  - The shared Konva stage lives in [`client/stage.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/stage.ts) (previously `game.ts`/`editor.ts` imported it from `main.ts`, which pulled the whole editor into every entry).
  - `views/layout.pug` loads `/trainer.js`; `views/editor.pug` loads `/editor.js`. `/bundle.js` remains as a small router for cached pages.
  - Trainer route: `trainer.js` + shared `chunks/game-*.js` = 89 kB gzip (< 150 kB target), with no editor/CV code. Editor route: 120 kB gzip.
- [x] **3.3 Modularization of the Recoil Editor ([`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts))**:
  - Extracted modular files:
    - [`client/modules/types.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/modules/types.ts): Shared TypeScript interfaces (`Edge`, `SessionTrialData`, `ActiveSessionData`, `DiscrepancyReport`, etc.).
    - [`client/modules/utils.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/modules/utils.ts): Binary conversions (`blobToBase64`, `dataUrlToBlob`), tone mapping, and async SSE streaming.
    - [`client/modules/analysis/DiscrepancyInspector.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/modules/analysis/DiscrepancyInspector.ts): Scaling calculations and vector discrepancy reporting.
  - `client/editor.ts` delegates capture scaling and discrepancy reports to `DiscrepancyInspector.ts` through thin wrappers that pass the editor's zoom, FOV, canvas scale and merge strategy. `editor.ts` is still ~5,200 lines; further decomposition (capture studio, weapon manager, canvas tools) is open.
- [ ] **3.4 Responsive UI & Modern Design Tokens** — in progress:
  - Goal: migrate styling from the 3,600-line [`style.scss`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/style.scss) to Tailwind CSS utilities, preserving all WCAG AA/AAA high-contrast tokens, tactile button affordances, and vector icons. Pages are server-rendered pug without a component framework, so "scoped CSS modules" become utilities in the markup plus `@utility` definitions in `tailwind.css` for repeated patterns.
  - [x] Tailwind 4 next to the SCSS: [`client/styles/tailwind.css`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/styles/tailwind.css) is built to `dist/tailwind.css` and linked after `style.css`. No preflight; utilities are unlayered and prefixed `tw:`. Without the prefix, 58 utilities were generated from existing class names, two of them (`.grid`, `.hidden`) overriding legacy rules.
  - [x] Design tokens: the palette comes only from `theme.json`, via generated [`client/styles/theme-tokens.css`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/styles/theme-tokens.css), e.g. `tw:text-foreground` and `tw:bg-score-7`. `--spacing` is 4px because `html` is 14px. `hover:` behaves like the SCSS `:hover`.
  - [x] Verification: [`scripts/style-snapshot.mjs`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/scripts/style-snapshot.mjs) records every element's computed style and box on `/`, `/ru`, `/zh-CN`, `/editor` at desktop and phone widths, with forced `:hover` on chosen selectors. A migration must compare with no differences; two captures of the same build agree exactly.
  - [x] First component: the trainer footer (`#copyright`, `#version`) in `index.pug`, `index-ru.pug` and `index-zh-CN.pug`. Its SCSS was removed, with zero computed-style differences across all 14 page states.
  - [ ] Remaining components, smallest and most self-contained first (tooltips, buttons, modals), then the trainer (`#game`, ~450 lines of SCSS) and the editor (`#editor`, ~1,750 lines, plus HTML strings in `editor.ts`). Remove `style.scss` and `reset.scss` (replaced by Tailwind's preflight) once empty, then drop the `tw:` prefix.

---

### Phase 4: Database Layer & Persistent Asset Storage
*Goal: Replace flat files and local folders with a structured database and object storage.*

- [x] **4.1 Relational Schema for Weapon Specifications & History**:
  - Implemented ACID-compliant SQLite schema in [`server/db.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/server/db.js) and [`processing/recoil_discovery/db.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/db.py) (identical schema and migrations) with WAL journal mode and foreign key constraints:
    - `weapons`: Metadata (name, category, default rpm, multiplier, `sort_order` = position in `specs.json`).
    - `weapon_specs`: Versioned specs. `spec_json` holds the full document (every field, e.g. `raw_1x_x`, absent multipliers); typed columns mirror it for queries.
    - `spec_revisions`: Audit history tracking deviations, change notes, and version diffs.
    - `meta`: SHA-256 of the last synchronized `specs.json`.
  - Data flow: `client/specs.json` stays the artifact read by the trainer bundle, the Python CLI and the Arduino exporter. Edits made to the file outside the API (Python CLI, git pull, hand edits) are imported as new versions (`specs_json_sync`) before every API read/write, so a save never reverts them. Saves merge into the current spec (same semantics as the original flat-file API) and re-export only the changed weapon's block, byte-identical elsewhere.
  - Writes run in `BEGIN IMMEDIATE` transactions through a per-process queue; versions are `MAX(version) + 1`.
  - Added `GET /api/specs/history/:weapon` endpoint returning complete revision audits.
  - Implemented unit and integration test suites: [`test/db.test.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/test/db.test.js), [`test/app_api.test.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/test/app_api.test.js) (isolated temp DB/specs via `RECOIL_*` env vars), and [`processing/tests/test_db.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/tests/test_db.py).
- [x] **4.2 Session Runs & Sample Metadata**:
  - Persisted session recordings, detected shot counts, measured RPM, and convergence scores in `discovery_sessions` table with timestamp index (recorded when the job's `job:completed` event arrives; with Redis also for jobs that finished while the API was down).
  - `GET /api/discovery/sessions` lists the session folders in capture storage (the files the editor loads, local or S3) and merges the indexed metadata by session id; results are cached for 60 s.
- [x] **4.3 Object Storage Integration (S3-compatible)**:
  - [`server/storage.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/server/storage.js) `AssetStorageService` with a local provider (default) and an S3 provider (`STORAGE_PROVIDER=s3`, AWS SDK v3: put/get with HTTP ranges/list/copy/delete, presigned PUT and GET, bucket + CORS setup for development).
  - All capture I/O in [`app.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/app.js) goes through it: saved sessions, the screenshot library, analysis inputs, and the session/screenshot listings. Key layout: `session_<weapon>_<mode>_<ts>/`, `screenshots/`, `tmp/<id>/`.
  - Browsers load media from `/captures/<key>` in both modes; with S3 the API streams objects (with `Range` support), so reads need no bucket CORS.
  - Direct uploads: `POST /api/discovery/uploads` returns presigned PUT URLs and a signed grant. The editor ([`submitDiscoveryJob`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/modules/utils.ts)) uploads straight to the bucket and submits only the grant, falling back to multipart through the API if that fails. Uploads land in `tmp/` and are filed as a session or library entry only when submitted. Stale `tmp/` uploads are pruned after a day.
  - The SDK's default CRC32 checksums are disabled (`requestChecksumCalculation: 'WHEN_REQUIRED'`); they put the checksum of an empty body into presigned PUT URLs, so every direct upload failed with `BadDigest`.
  - MinIO no longer publishes community container images, so development and CI use SeaweedFS ([`compose.yaml`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/compose.yaml)). The provider is plain S3 API and also works with AWS S3 or R2.
  - Tests: [`test/storage.test.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/test/storage.test.js) (local + S3) and [`test/app_scaled.test.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/test/app_scaled.test.js). The latter covers end-to-end analysis with BullMQ + S3, direct uploads, forged grants, the library and cancellation. A headless-Chrome run of the real editor confirmed the direct-upload path, including CORS.

---

### Phase 5: Shadow Parity, Benchmarking & Decommissioning
*Goal: Validate 100% mathematical accuracy and decommission legacy build infrastructure.*

- [x] **5.1 Dual-Run Shadow Validation Suite**:
  - Built automated parity validation engine in [`processing/recoil_discovery/shadow_parity.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/shadow_parity.py).
  - Compares every field of every spec (not only x/y), the weapon order, and weapons active only in the database. Imports `specs.json` edits first by default; `--no-sync` only reports drift.
  - Verified 100% parity ($0.000000$ drift) across all 31 weapons comparing SQLite active specs against verified [`client/specs.json`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/specs.json).
  - Integrated continuous shadow parity test into automated test suite via [`processing/tests/test_shadow_parity.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/tests/test_shadow_parity.py) (runs on a temp database seeded from a copy of `specs.json`).
- [x] **5.2 Microcontroller Firmware Alignment**:
  - Executed `python -m recoil_discovery.cli export-arduino`.
  - Validated that [`arduino_mouse/src/recoil.inc`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/arduino_mouse/src/recoil.inc) produces identical 55-element arrays with zero memory offset drift for the ATmega32U4 target.
- [x] **5.3 Decommissioning Legacy Tooling**:
  - Removed `gulpfile.js`, Browserify, Tsify, Watchify, Gulp plugins, and legacy build dependencies (and their stale entries in `package-lock.json`).
  - Replaced build infrastructure with standalone Vite 8 (`npm run build`, `npm run dev`).
  - Configured Express in [`app.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/app.js) to serve Vite production bundles (`dist/trainer.js`, `dist/editor.js`, `dist/chunks/`, `dist/style.css`) and static directories directly.
  - `npm run static` ([`scripts/build-static.mjs`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/scripts/build-static.mjs)) again produces the deployable `static/` site: Vite bundles, `etc/`, `assets/` and the four pug pages rendered to HTML.
  - CI ([`.github/workflows/ci.yml`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/.github/workflows/ci.yml)) replaces the Gulp workflow: typecheck, build, Node tests and static build on Node 20/22; an integration job running all Node suites against the `compose.yaml` Redis and S3 services; pytest, `verify` and shadow parity on Python 3.12. All three jobs were dry-run locally from a clean copy of the tree.

---

## 🔒 Verification & Quality Gates

Every implementation step across all phases must satisfy the following automated gates:

```bash
# 1. Python Unit Tests & Shadow Parity (43/43 passing, 31/31 full-document parity)
cd processing && python -m pytest tests
python -m recoil_discovery.shadow_parity

# 2. Recoil Spec Schema Verification (All 31 weapons Status: OK)
cd processing && python -m recoil_discovery.cli verify

# 3. Node.js Tests (41/41; run the build first so the bundle-split test is not skipped)
pnpm build && pnpm test    # or: npm run build && npm test
# Plus the Redis, S3 and end-to-end suites (55/55 in total), against compose.yaml services:
docker compose up -d && pnpm test:services

# 4. TypeScript Typecheck (0 compilation errors)
pnpm tsc     # or: npm run tsc / cmd /c npm run tsc

# 5. Production Asset Build & Static Site (Vite 8)
pnpm build   # or: npm run build
pnpm static  # or: npm run static

# 6. Memory Footprint (manual)
# Peak decoder allocations stay constant with clip length: 328 MB on a 5 s 1080p clip
# (tracemalloc). The former "< 60 MB per clip" target is not achievable with full-resolution
# frames; see the 1.4 follow-up.
```

The same gates run in CI ([`.github/workflows/ci.yml`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/.github/workflows/ci.yml)).

---

## 🔎 Audit Log (2026-10-19)

An audit of Phases 1–5 found the dashboard overstated several items and that a number of changes were broken. Everything below was fixed and covered by tests unless marked otherwise.

**Data integrity**
- `test/app_api.test.js` wrote to the real `data/recoil.db` (17 test versions of flatline, one of them active) and rewrote `client/specs.json` during every run. Tests now use temp paths via `RECOIL_DB_PATH`, `RECOIL_SPECS_PATH`, `RECOIL_CAPTURES_DIR`, `RECOIL_UPLOAD_TMP_DIR`.
- `DatabaseService.init()` was not idempotent: concurrent calls opened two connections and seeded every weapon twice.
- The database round trip was lossy: it dropped fields such as havoc_tc's `raw_1x_x/raw_1x_y`, turned an absent `multiplier` into `0.73` for 10 weapons (the editor treats absent as `1.0`), and exports re-sorted `specs.json` alphabetically. The old shadow parity check compared only rpm/multiplier (with the same default on both sides) and x/y, so it reported 100% while 11 weapons differed.
- Edits to `specs.json` from the Python CLI never reached the database, and the next web-editor save exported the stale database over them.
- `processing/recoil_discovery/db.py` had no `mods`/`ping_points` columns and its export kept only 8 fields; one call would have wiped attachments and ping points for all 31 weapons.
- Saves were not transactional (a crash between deactivate and insert left no active spec; concurrent saves could reuse a version number).
- Local cleanup: the polluted rows were pruned from `data/recoil.db` after a backup to `data/recoil.pre-audit-cleanup.db`.

**Broken features**
- Loading a past session failed (`session.samples` undefined) as soon as one session was indexed, because the database-backed list had no sample files; older on-disk sessions also disappeared from the list.
- Route splitting was not wired: every page loaded `bundle.js` (trainer + editor, 118.7 kB gzip), and `trainer.js`/`editor.js` imported `bundle.js`, so loading them would have initialized the app twice.
- `npm run static` no longer produced HTML (pug rendering and asset copy were lost with Gulp); CI still ran `gulp`; `package-lock.json` still listed the Gulp toolchain.
- `applyHdrToneMappingToCanvas` (moved to `client/modules/utils.ts`) computed the blue channel from green.
- `pipeline.py` still referenced the removed `frames_gray` when a clip decoded zero frames (`NameError` failed the whole session).
- `DiscrepancyInspector.ts` was dead code duplicating `editor.ts`.

**Job queue & API**
- Session indexing used `jobQueue.once('job:completed')`, which is consumed by whichever job finishes first.
- The SIGTERM → SIGKILL escalation never fired (the process handle was cleared first).
- `PROGRESS:` lines split across stderr chunks were dropped.
- Failures were sent as an SSE event named `error`, which EventSource also uses for connection errors; the client now listens for `failed`.
- Rejected uploads left multer temp files behind; `sample_count` counted wall screenshots as samples; multer limit errors tried to render a missing `error` view.
- Saving a single screenshot analyzed the whole screenshot library (pre-existing): the CLI processes every image in `--dir`.
- `server/storage.js` reported success for S3 uploads without storing anything; it now throws until an S3 client is implemented.
- `nodemon` restarted the server (killing in-flight jobs) on every Vite rebuild and spec save; it now watches only server code.

**Follow-up (2026-10-21)**
- Done: Redis/BullMQ queue (2.4), S3 storage with direct uploads (4.3), Tailwind foundation and first migrated component (3.4), CI integration job.
- Decided: the decoder BGR re-decode (1.4) is not worth its CPU cost.
- Correction: an earlier version of this log said `client/storage.ts` registers every attribute twice. That was a misreading of overlapping output; there is a single `allAttributes.push`, and a browser check confirms one keydown handler per numeric input.

**Still open**
- 3.4: migrating the remaining components to Tailwind.
- Further `editor.ts` decomposition (capture studio, weapon manager, canvas tools).
- A warm Python worker (keeping OpenCV loaded between jobs) if the per-job start-up time (~1–3 s) matters.
- Confirm the first CI run on GitHub.

---

## 🤖 Protocol for AI Assistants & LLMs

Whenever working on any phase or task of this migration:
1. **Check this document first:** Identify the active milestone and task in the dashboard.
2. **Execute tests before & after edits:** Run `pytest`, `verify`, and `tsc` on every change.
3. **Update documentation:**
   - Mark completed tasks with `[x]` in this plan and in [`docs/roadmap.md`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/roadmap.md).
   - Log behavioral and architectural changes in [`docs/release-notes.md`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/release-notes.md).
4. **Preserve mathematical invariants:**
   - Source Engine scale factor: $K_{px\_to\_mouse} = 3.36$ (or $0.2976$ px/mickey).
   - Havoc TC multiplier: `0.73` ($y$ end $-393.11$).
   - Arduino PROGMEM bound: exactly 55 elements per weapon array.
