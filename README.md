# Spraydown: Recoil Trainer & Discovery Toolkit for Apex Legends

Live site: [SITE URL] (no domain yet; set `siteUrl` in [site.json](./site.json))

An interactive recoil pattern visualization, muscle memory trainer, and automated discovery toolkit for [Apex Legends](https://www.ea.com/games/apex-legends).

---

## Key Features

1. **Interactive Recoil Trainer (`/`)**:
   - Practice full spray recoil control against animated targets with live scoring and hit rate analytics.
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

2. **Web UI Weapon Manager & Editor (`/editor`)**:
   - Visual management dashboard to quickly update weapon parameters when balance patches drop.
   - Fine-tune RPM, per-tier magazine sizes (0 through 4), and sensitivity multipliers.
   - Live canvas preview of recoil curves with smooth pan/zoom, zoom-invariant bullet markers, and multi-step Undo/Redo (`Ctrl+Z` / `Ctrl+Y`).
   - **Spec Safety Verification Checkpoint**: Pre-save audit checking for shot count truncation, average deflection drift, outlier spikes ($>25\text{px}$), and directional inversions before modifying `specs.json`.
   - **Dual Comparison Overlay & Real-Time Discrepancy HUD**: Concurrently view saved baseline (Cyan dashed) and candidate spec (Orange solid) with colored delta vector lines and live consistency stats (toggle with `O` key).
   - **Incremental Proportional Spec Accumulation**: Blend new captures proportionally ($1/(N+1)$ weight) to reduce variance over time, or execute complete overwrites post-patch.
   - **💾 Save to specs.json**: Commits changes directly to `client/specs.json` with automatic `.bak` backups.
   - Import/export JSON drawer for direct data exchange.

3. **Hands-Free In-Game Auto-Capture Studio (`/editor`)**:
   - Eliminates manual OBS/Shadowplay recording and video file chopping.
   - Connects directly to the running **Apex Legends** game window via browser screen capture.
   - **Acoustic Gunfire Sensor**: Real-time decibel monitor automatically triggers recording when you pull the trigger in the Firing Range, and automatically stops when your magazine empties. Sensor mutes during playback with a 1.5s echo-safety cooldown to prevent feedback loops.
   - **Decoupled Architecture**: High-cadence video captures audio/RPM, while post-reload ADS high-res screenshot captures clean bullet decals.
   - **Sample Management**:
     - Embedded side-by-side player: spray video (cadence/audio) and wall screenshot preview.
     - **📷 Re-snap Wall**: 3-second countdown with audible beeps gives you time to tab into Apex and hold ADS before snapping.
     - **💾 Save Image**: Download high-resolution wall screenshots for your library.
     - **🗑 Discard**: 1-click sample discard to maintain high batch quality.
   - **Interactive Canvas Navigation**: Full panning (right-click drag, middle-click drag, spacebar drag, pan tool toggle) and smooth mouse-wheel zoom centered on cursor.
   - **🖼️ Offline / Redo Analysis Drawer**: Analyze saved wall screenshots directly to calibrate patterns without being in-game.
   - **⚡ 1-Click Discovery**: Uploads clips to the backend pipeline, extracts bullet decals with Black Top-Hat filtering, measures RPM, and overlays the trajectory on the canvas.

4. **Automated Computer Vision Engine (`processing/recoil_discovery`)**:
   - Python-based pipeline for zero-guesswork recoil discovery.
   - **Dynamic Target Board Isolation & Morphological Black Top-Hat Filtering**: isolates bullet decals on the white target board while completely rejecting dark frame pillars, vertical seams, and weapon sights.
   - Automatic acoustic and visual rate of fire (RPM) measurement ($\text{RPM} = 60000 / \text{median}(\Delta t_{\text{ms}})$).
   - Multi-spray median-delta integration and convergence scoring ($rc\_score$).
   - SQLite persistence layer with versioned, lossless specs (kept in sync with `client/specs.json`), audit history, and full-document shadow parity verification.
   - Optional scaled mode: Redis/BullMQ job queue with standalone workers, and S3-compatible capture storage with direct browser uploads.
   - Comprehensive test suite with 43 Python unit tests, 55 Node.js tests (14 of them need Redis/S3, see below), Vitest unit and component tests and 28 Playwright end-to-end scenarios in Chrome, including axe accessibility checks.

---

## Running Locally

### 1. Prerequisites
* **Node.js** 22.22+ or 24.15+, 24 LTS recommended (`engines` in `package.json`; the test tools need these versions)
* **pnpm** 12 ([installation](https://pnpm.io/installation)). pnpm 11 and newer switch to the version pinned in `package.json` (`devEngines`) on their own; npm is not supported and stops with `EBADDEVENGINES`.
* **Python 3.10+** (for the automated discovery engine)
* **Google Chrome** (for the end-to-end tests)

### 2. Frontend & Web Server
From the repository root:
```bash
# Install dependencies (pnpm-workspace.yaml lists the native builds allowed to run: esbuild, sqlite3)
pnpm install

# Start the development server: Vite serves the client sources with hot reload
# (styles update in place, code and template changes reload the page), on this computer only
pnpm dev

# Build assets (Vite 8 production build: trainer.js, editor.js, tailwind.css); pnpm start serves them
pnpm build

# Run Node test suites (41 tests across database, queue, storage, and API; build first)
pnpm test

# Unit and component tests (Vitest)
pnpm test:unit

# End-to-end scenarios in Chrome against the built app, on throwaway data (Playwright; build first)
pnpm test:e2e

# Typecheck (browser and Node configs), lint and check formatting (pnpm format rewrites files)
pnpm tsc
pnpm lint
pnpm format:check
```

Open your browser to:
* Recoil Trainer: **`http://localhost:3000/`**
* Recoil Editor & Auto-Capture Studio: **`http://localhost:3000/editor`**

> **Note on Port Collisions:** If port 3000 is already in use by another local process, the server automatically retries and binds to **`http://localhost:3001`**.

> **Data & configuration:** weapon specs are versioned in `data/recoil.db` (SQLite) and exported to `client/specs.json`, which the trainer bundle imports. Editing `specs.json` directly (or through the Python CLI) is fine: the server imports those edits as new versions before its next read or write. Settings come from environment variables or a `.env` file; see [.env.example](./.env.example).

#### Optional: scaled mode (Redis job queue + S3 storage)
By default analysis jobs run inside the server process and captures are stored in `processing/captures`. To let jobs survive restarts, run them on separate workers, or keep captures in object storage:
```bash
docker compose up -d          # Redis + an S3-compatible server (SeaweedFS), see compose.yaml
cp .env.example .env          # then uncomment REDIS_URL and/or the STORAGE_PROVIDER=s3 block
pnpm dev                      # the server runs one embedded worker
pnpm worker                   # optional: more workers (other machines need S3 storage)

# Run every Node suite, including the Redis, S3 and end-to-end tests (55 tests)
pnpm test:services
```
With S3 storage the editor uploads recordings straight to the bucket; the bucket must allow `PUT` from the app's origin (CORS). `S3_AUTO_CREATE_BUCKET=true` creates the bucket and that rule for development.

### 3. Python Recoil Discovery Pipeline
From the `processing/` directory:
```bash
cd processing

# Install dependencies
pip install -r requirements.txt

# Run automated test suite (43 tests)
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
This builds the Vite bundles, copies `etc/` and `assets/`, and renders the pages (`index.html`, `index-ru.html`, `index-zh-CN.html`, `editor.html`) into `./static`. Copy its contents to your web server directory (e.g. Nginx / Apache / S3). The Recoil Editor's capture and spec-saving features need the Node server and are not available on a static host. Compression and caching headers for Nginx are in [docs/playbooks.md](./docs/playbooks.md).

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
* [UI Migration Plan](./docs/ui-migration-plan.md) and [UI Redesign](./docs/ui-redesign.md)
* [Ownership Register](./docs/ownership-register.md): placeholders for the owner's names, links and IDs
* [Brand](./brand/README.md): the logo, its variants and how to regenerate them

---

## License & Disclaimers

Source code is licensed under [Apache 2.0](./LICENSE). The project is based on [apex-recoil](https://github.com/metaflow/apex-recoil) by Mikhail Goncharov, also licensed under Apache 2.0 (see [NOTICE](./NOTICE)); files that contain its code keep the original copyright header and say that they were modified.

*This project is not affiliated with or sponsored by Electronic Arts Inc., Respawn Entertainment, or Google.*

### Assets
Images, weapon names, audio clips, and behavior come from Apex Legends or websites owned by [Electronic Arts Inc.](https://ea.com) or [Respawn Entertainment](https://www.respawn.com/). Multimedia content from [assets](./assets) is **NOT** licensed under Apache 2.0.
