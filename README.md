# Spraydown: Recoil Trainer & Discovery Toolkit for Apex Legends

Live site: [SITE URL] (no domain yet; set `siteUrl` in [site.json](./site.json))

An interactive recoil pattern visualization, muscle memory trainer, and automated discovery toolkit for [Apex Legends](https://www.ea.com/games/apex-legends).

---

## Key Features

1. **Interactive Recoil Trainer (`/`)**:
   - Practice full spray recoil control against animated targets with live scoring, a result card after every run and today's trend.
   - **Patterns (`/patterns`)**: every weapon's recoil pattern in one library at one scale, with the spray played shot by shot; phones get a pattern viewer.
   - **Progress (`/progress`)**: best and median scores by day and by weapon, recent runs and CSV export, kept in the browser.
   - The privacy policy, FAQ and changelog as pages (`/privacy`, `/faq`, `/changelog`), prerendered pages in every language, and Google Analytics only with consent.
   - Complete **31-weapon arsenal** covering all weapon classes (Assault Rifles, SMGs, LMGs, Marksman, Snipers, Shotguns, and Pistols/Akimbos).
   - **Realistic Shooting Styles & Trigger Mechanics**:
     - **Semi-Automatic & Shotguns**: Click-per-shot mechanics for Peacekeeper, Mastiff, Wingman, P2020, G7 Scout, 30-30, Triple Take, Bocek, Charge Rifle, Longbow, Sentinel, Kraber with refire cooldown and smooth recoil recentering.
     - **Burst Weapons**: Multi-shot bursts (Prowler: 5, Hemlok: 3, Nemesis: 4) with intra-burst cadence and inter-burst recoil reset.
     - **Select-Fire Toggle**: Switch modes on select-fire weapons like Prowler (Burst / Auto) and Hemlok (Burst / Single) using the UI buttons or keyboard shortcut `[B]`.
   - Comprehensive attachment options:
     - **Magazines**: Base (L0), White (L1), Blue (L2), Purple/Gold (L3), and the new **Corrupted Magazine (Tier 4 / Red)** with real-time ammo tooltips.
     - **Stocks**: Standard stocks and the new **Corrupted Stock** attachment (-4 capacity penalty across stock-equipped weapons, -1 shell for single-shell shotguns).
     - **Weapon Mods**: Rampage *Revved Up* thermite grenade mod, turbocharger variants, and drop weapon configs.
   - Multi-language support: English, Russian (`/ru`), and Simplified Chinese (`/zh-CN`).
   - Sensitivity matching: exact Source Engine sensitivity and ADS multiplier scaling.

2. **The Studio (`/editor`)**, for the specs' maintainers:
   - Pick a weapon and edit its fire rate, multiplier and magazine sizes (Base to Corrupted); each magazine keeps its sound and the shot times keep their timing, so a save changes only what was edited.
   - The pattern on a canvas (react-konva) with select, pan, align, correct and fit tools, wheel zoom, and undo and redo (`Ctrl+Z` / `Ctrl+Y`), on a wall screenshot at its measured scale or in the spec's own units.
   - **Save checkpoint**: before a changed pattern replaces the saved spec, the shot count, the average and largest stray, and warnings for a shortened or inverted pattern.
   - **Comparison** (`O`): the saved spec (dashed) against the candidate (volt), a line for each shot that strays, and the figures in a corner.
   - **Blend or replace**: new captures blend into the spec weighted by its sample count, or start a new baseline after a balance patch.
   - Every save is a new version in the spec database and in `client/specs.json`, listed under History; a discovery JSON can be pasted in (Import).
   - **Live capture**: connects to the **Apex Legends** window through the browser's screen sharing; an acoustic gunfire sensor records each spray from the first shot, and the wall is captured once you have reloaded and aimed back at the decals (or with Space). The sensor stays muted while a sample plays.
   - **Samples**: each recorded spray with its clip and wall, to show on the canvas, capture again after a 3-second countdown, download, listen to, enlarge or discard.
   - **Screenshots**: wall screenshots from disk or the server's library, analyzed together; **Sessions** brings saved sessions and imported clips back; **Manual** finds decals with a threshold, as the original editor did.
   - **One-click discovery**: uploads the clips or screenshots to the pipeline (Black Top-Hat filtering of the decals, measured RPM), follows the job's progress, and shows the result on the first spray's frame.

4. **Automated Computer Vision Engine (`processing/recoil_discovery`)**:
   - Python-based pipeline for zero-guesswork recoil discovery.
   - **Dynamic Target Board Isolation & Morphological Black Top-Hat Filtering**: isolates bullet decals on the white target board while completely rejecting dark frame pillars, vertical seams, and weapon sights.
   - Automatic acoustic and visual rate of fire (RPM) measurement ($\text{RPM} = 60000 / \text{median}(\Delta t_{\text{ms}})$).
   - Multi-spray median-delta integration and convergence scoring ($rc\_score$).
   - SQLite persistence layer with versioned, lossless specs (kept in sync with `client/specs.json`), audit history, and full-document shadow parity verification.
   - Optional scaled mode: Redis/BullMQ job queue with standalone workers, and S3-compatible capture storage with direct browser uploads.
   - Comprehensive test suite with 43 Python unit tests, 64 Node.js tests (14 of them need Redis/S3, see below), Vitest unit and component tests and 59 Playwright end-to-end scenarios in Chrome, including axe accessibility checks, and Lighthouse in CI.

---

## Stack

- **Pages**: React 19 with Tailwind CSS 4 and shadcn/ui (Radix primitives), built by Vite 8. The trainer's pages are prerendered in each language and hydrated in the browser; the range draws with Konva and plays its sounds with Howler, and the Studio's canvas is react-konva.
- **Server**: Express 5 in TypeScript, which Node runs without a build step ([server/](./server/)), with the API's zod schemas shared with the browser ([shared/](./shared/)). Weapon specs live in SQLite, kept in sync with `client/specs.json`; analyses run in the server's process or on Redis/BullMQ workers; captures are kept on disk or in S3-compatible storage.
- **Discovery**: Python with OpenCV ([processing/](./processing/)), started by the server for each analysis.
- **Checks**: Vitest and Testing Library for the client, `node:test` for the server, Playwright with axe for the pages and pytest for the pipeline; TypeScript, ESLint and Prettier, and Lighthouse on the trainer's pages in CI.

---

## Running Locally

### 1. Prerequisites
* **Node.js** 22.22+ or 24.15+, 24 LTS recommended (`engines` in `package.json`; the test tools need these versions). Node runs the server's TypeScript as it is, without a build step
* **pnpm** 12 ([installation](https://pnpm.io/installation)). pnpm 11 and newer switch to the version pinned in `package.json` (`devEngines`) on their own; npm is not supported and stops with `EBADDEVENGINES`.
* **Python 3.10+** (for the automated discovery engine)
* **Google Chrome** (for the end-to-end tests)

### 2. Frontend & Web Server
From the repository root:
```bash
# Install dependencies (pnpm-workspace.yaml lists the native builds allowed to run: esbuild, sqlite3)
pnpm install

# Start the development server: Vite serves the client sources with hot reload
# (styles update in place, code changes reload the page, server changes restart it), on this computer only
pnpm dev

# Build assets (Vite 8 production build into dist/: the pages' entries such as trainer.js and studio.js, and app.css; and the pages' prerender into dist-ssr/); pnpm start serves them
pnpm build

# Run Node test suites (50 tests across database, queue, storage, request parsing, API and the built bundles; build first)
pnpm test

# Unit and component tests (Vitest)
pnpm test:unit

# End-to-end scenarios in Chrome against the built app, on throwaway data (Playwright; build first)
pnpm test:e2e

# Typecheck (browser, tools and server configs), lint (ESLint, then the UI's conventions: one stylesheet,
# no hex colors) and check formatting (pnpm format rewrites files)
pnpm tsc
pnpm lint
pnpm format:check
```

Open your browser to:
* Recoil Trainer: **`http://localhost:3000/`**
* The Studio (specs, capture and discovery): **`http://localhost:3000/editor`**

> **Note on Port Collisions:** If port 3000 is already in use by another local process, the server automatically retries and binds to **`http://localhost:3001`**.

> **Data & configuration:** weapon specs are versioned in `data/recoil.db` (SQLite) and exported to `client/specs.json`, which the trainer bundle imports. Editing `specs.json` directly (or through the Python CLI) is fine: the server imports those edits as new versions before its next read or write. Settings come from environment variables or a `.env` file; see [.env.example](./.env.example).

#### Optional: scaled mode (Redis job queue + S3 storage)
By default analysis jobs run inside the server process and captures are stored in `processing/captures`. To let jobs survive restarts, run them on separate workers, or keep captures in object storage:
```bash
docker compose up -d          # Redis + an S3-compatible server (SeaweedFS), see compose.yaml
cp .env.example .env          # then uncomment REDIS_URL and/or the STORAGE_PROVIDER=s3 block
pnpm dev                      # the server runs one embedded worker
pnpm worker                   # optional: more workers (other machines need S3 storage)

# Run every Node suite, including the Redis, S3 and end-to-end tests (64 tests)
pnpm test:services
```
With S3 storage the Studio uploads recordings straight to the bucket; the bucket must allow `PUT` from the app's origin (CORS). `S3_AUTO_CREATE_BUCKET=true` creates the bucket and that rule for development.

### 3. Python Recoil Discovery Pipeline
From the `processing/` directory:
```bash
cd processing

# Install dependencies
pip install -r requirements.txt

# Run automated test suite (44 tests)
python -m pytest tests

# Run shadow parity suite (SQLite vs specs.json, every field; --no-sync to only report drift)
python -m recoil_discovery.shadow_parity

# Run discovery CLI commands
python -m recoil_discovery.cli verify
python -m recoil_discovery.cli session --help
```

---

## In-Game Recording & Calibration Rules

When recording sprays in the Apex Legends Firing Range for discovery:
* **Optics:** Use **2x Bruiser (Recommended for 20m)** or standard **1x (Iron Sights / 1x HCOG)**. The studio automatically scales 2x Bruiser captures by $1 / 2.0$ to produce native 1x training specs.
* **Attachments:** **NO barrel stabilizer** (stabilizers reduce recoil spread), **NO stock**. Equip maximum magazine (Level 3 or Corrupted L4) to capture the complete continuous spray.
* **Distance:** Stand **20 meters** away from the white target board, facing perpendicular ($90^\circ$).
* **Firing:** Fire the full magazine **without moving your mouse**.
* **Post-Spray ADS:** Allow the reload animation to finish, then re-enter ADS and aim steadily at the bullet decals. The studio captures the high-res screenshot automatically when the buffer ends.

Detailed documentation is available in [docs/capture.md](./docs/capture.md).

---

## Static Production Deployment

Deployment is fully static:
```bash
pnpm static
```
This builds the Vite bundles, copies `etc/` and `assets/`, and writes the pages into `./static`: the prerendered trainer, Patterns and Progress pages in each language and the privacy policy, FAQ and changelog, a folder per page (`ru/patterns/index.html`), plus `index.html`, `index-ru.html` and `index-zh-CN.html` for the trainer, `404.html` and `editor.html` (the Studio). Copy its contents to your web server directory (e.g. Nginx / Apache / S3). The Studio's capture and spec-saving features need the Node server and are not available on a static host. Compression and caching headers for Nginx are in [docs/playbooks.md](./docs/playbooks.md).

For a release, `pnpm release` first checks that the owner's values have replaced every placeholder (in `site.json`, `NOTICE`, the copyright headers and the pages' documents; see the [ownership register](./docs/ownership-register.md)), then runs `pnpm build` and `pnpm static`. CI runs it for a version tag (`v*`).

---

## Contributing & Community

Contributions, balance patch updates, and recoil submissions are welcome!
* [Contributing Guidelines](./docs/contributing.md)
* [Implementation Plan & Roadmap](./docs/roadmap.md)
* [Architectural Migration Plan](./docs/migration-plan.md)
* [Live Weapons Wiki & Patch Reference](./docs/weapons-wiki-stats.md)
* [AI Agent Guidelines](./AGENTS.md)
* [Release Notes](./docs/release-notes.md)
* [Recoil Discovery Guide](./docs/capture.md)
* [Privacy Policy](./docs/privacy-policy.md)
* [UI Migration Plan](./docs/ui-migration-plan.md), its [progress report](./docs/ui-migration-progress.md) (the conventions to keep) and the [UI Redesign](./docs/ui-redesign.md)
* [Ownership Register](./docs/ownership-register.md): placeholders for the owner's names, links and IDs
* [Brand](./brand/README.md): the logo, its variants and how to regenerate them

---

## License & Disclaimers

Source code is licensed under [Apache 2.0](./LICENSE). The project is based on [apex-recoil](https://github.com/metaflow/apex-recoil) by Mikhail Goncharov, also licensed under Apache 2.0 (see [NOTICE](./NOTICE)); files that contain its code keep the original copyright header and say that they were modified.

*This project is not affiliated with or sponsored by Electronic Arts Inc., Respawn Entertainment, or Google.*

### Assets
Images, weapon names, audio clips, and behavior come from Apex Legends or websites owned by [Electronic Arts Inc.](https://ea.com) or [Respawn Entertainment](https://www.respawn.com/). Multimedia content from [assets](./assets) is **NOT** licensed under Apache 2.0.
