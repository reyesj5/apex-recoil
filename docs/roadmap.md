# Implementation Plan & Project Roadmap

This document outlines the architectural milestones, completed implementations, and upcoming tasks for the **Apex Legends Recoil Trainer & Discovery Toolkit**. It is the plan, and its Progress Dashboard and the boxes under it are the only place progress is tracked: a row for each milestone and for each phase of M10 and M11, and a box for each step. M11's boxes carry the step ids of its plan, as every new step does; the finished milestones before it keep their boxes as they were. The milestone plans ([migration-plan.md](migration-plan.md) for M10, [ui-migration-plan.md](ui-migration-plan.md) for M11) hold each phase's scope and decisions, and [architecture.md](architecture.md) the system as it is.

> **Corrections** ([corrections.md](corrections.md) outranks this plan):
> - C1 (2026-10-19): M10's dashboard overstated Phases 1 to 5; the audit found what was missing, and Phase 7 fixed it.
> - C2 (2026-10-21): the streaming decoder's 60 MB target is not achievable; its peak is 328 MB on a 5 s 1080p clip, constant with the clip.
> - C3 (2026-10-21): `client/storage.ts` never registered its attributes twice; the audit misread overlapping output.
> - C4 (2026-10-23): M11's prerender renders every page when the server starts, rather than into three `index*.html` files.
> - C5 (2026-10-23): M11's first loads until then were KiB labeled kB, 2.3 % low.
> - C6 (2026-10-24): the Studio needed no collapsible, form, sheet or sidebar; they were deleted.
> - C7 (2026-10-24): no part of the Studio uses React Hook Form.

---

## 🎯 Progress Dashboard

| Milestone and phase | Status | Description |
| :--- | :---: | :--- |
| **M1: Core Recoil Trainer** | ✅ Completed | WebGL/Canvas recoil training simulation, scoring algorithm, attachment selection. |
| **M2: Moving Target & Localization** | ✅ Completed | Moving target mode, Russian (`/ru`) and Chinese (`/zh-CN`) translations. |
| **M3: Corrupted Magazine (Tier 4 / Red)** | ✅ Completed | Full Tier 4 magazine support across UI, specs, CSS theming, and translations. |
| **M4: Auto-Capture Studio (`/editor`)** | ✅ Completed | Hands-free WebRTC window capture with acoustic gunfire trigger, sample manager, and REST API. |
| **M5: Python Recoil Discovery Engine** | ✅ Completed | Zero-guesswork computer vision and signal processing engine with 30 passing unit tests. |
| **M6: Weapon Arsenal & Attachments** | ✅ Completed | All 31 Apex weapons supported with official SVGs, 5-tier specs, and Corrupted Stock attachment. |
| **M7: Full-Stack Hardening & Robustness** | ✅ Completed | Comprehensive senior review covering 25 fixes across security, correctness, error handling, and performance. |
| **M8: UI/UX Modernization & Polish** | ✅ Completed | Google Fonts, instant weapon search & category pills, live mag capacities, toolbar ergonomics, corrupted mag SVG. |
| **M9: CI/CD Pipeline Automation** | 🚧 Done but for the owner's decision on the Pipenv files (9.10) and the first run of the audits and the hashed installs (9.11) | `.github/workflows/ci.yml`, on Ubuntu and Windows: lint, formatting, typecheck, Vitest, the build, Node tests and the static build (Node 22/24); the end-to-end scenarios; pytest, spec verify and shadow parity (Python 3.12, installed from a lock with hashes). On Ubuntu only: the integration job with Redis + S3 (compose.yaml), Lighthouse, and `.github/workflows/audit.yml`, which audits both locks on each change and every Monday. The first GitHub run (PR #2, 2026-10-22) passed the four jobs it had then, and the first with Windows (2026-10-25) all nine. |
| **M10: Platform & Architectural Overhaul** | ✅ Completed | Streaming ingestion, in-process or Redis/BullMQ job queue, Vite 8 route bundles, lossless SQLite spec store, local or S3 capture storage with direct uploads, full-document shadow parity, the Recoil Editor split into modules, and all styling in Tailwind 4 (no Sass). Optional: a warm Python worker. |
| M10 Phase 1: Stabilization & Memory Hardening | ✅ Completed | Streaming multipart uploads, asynchronous file I/O, atomic writes of `client/specs.json`, and a streaming video decoder (C2). |
| M10 Phase 2: Compute Worker & Asynchronous Jobs | ✅ Completed | The in-process job queue with progress over Server-Sent Events, and Redis/BullMQ with standalone workers. |
| M10 Phase 3: Frontend Architecture | ✅ Completed | Vite 8 route bundles, the Recoil Editor in modules and all styling in Tailwind 4, all since replaced by M11. |
| M10 Phase 4: Database & Asset Storage | ✅ Completed | The lossless, versioned SQLite spec store, and local or S3 capture storage with direct uploads. |
| M10 Phase 5: Shadow Parity & Decommissioning | ✅ Completed | Full-document shadow parity, the Arduino export checked, and Gulp removed. |
| M10 Phase 6: Module Resolution & Weapon Manager | ✅ Completed | ES modules per route, attachments and ping points in the database, and + New Weapon. |
| M10 Phase 7: Migration Audit & Hardening | ✅ 2026-10-19 | What the audit found, fixed and tested (C1, C3). |
| M10 Phase 8: Scaled Mode & Styling Foundation | ✅ 2026-10-21 | Redis/BullMQ and S3 with `compose.yaml`, and the Tailwind 4 foundation. |
| M10 Phase 9: Editor Modules, Tailwind & First CI Run | ✅ 2026-10-22 | The Recoil Editor in modules, every style in Tailwind 4, the first CI run on GitHub, and pnpm 12 only. |
| **M11: UI Rebuild (React, Tailwind, shadcn/ui)** | 🚧 Phases 0 to 5 done; open: the manual capture check, and the owner's values and decisions | Trainer and editor rebuilt as React 19 components styled only with Tailwind 4 and shadcn/ui, with a new design and identity; no pug, hand-written CSS, Plotly, tarteaucitron or links to the original project. Plan: [docs/ui-migration-plan.md](ui-migration-plan.md); design: [docs/ui-redesign.md](ui-redesign.md); ownership: [docs/ownership-register.md](ownership-register.md); notes: [docs/ui-notes.md](ui-notes.md). |
| M11 Design | ✅ 2026-10-22; decisions 2026-10-25 | The audit, the identity, the mockups and the Design System, and the owner's decisions on the radius scale, the marks under 3:1 and a score that doesn't exist yet. |
| M11 Phase 0: Tooling and safety net | ✅ 2026-10-22 | React 19 and TypeScript 6, ESLint 10 and Prettier, Vite hot reload inside Express, compression and caching, Vitest, and 25 Playwright scenarios on the current app, accessibility checks included. |
| M11 Phase 1: Design system and shared foundations | ✅ 2026-10-23 | The design system in code (tokens, components, a gallery at `/next/components`), storage, API hooks, translations and analytics consent. |
| M11 Phase 2: Trainer | ✅ 2026-10-25; two optional steps open (2.13, 2.14) | The engine without a DOM, proved on recorded runs; the trainer and its Patterns and Progress pages, prerendered in each language, with consent, the documents as pages and under 200 kB of JavaScript on first load. They serve `/`, `/ru` and `/zh-CN` since 2026-10-24, and the old trainer is gone. |
| M11 Phase 3: Recoil Editor | 🚧 Done but for the manual capture check (3.7) | The Studio replaces the Recoil Editor at `/editor` (2026-10-24). |
| M11 Phase 4: Server and build | ✅ 2026-10-24 | No pug, Express 5 and multer 2, and the server in TypeScript that Node runs directly, split into routers, with the API's zod schemas shared by the browser and the server. |
| M11 Phase 5: Removal and lock-in | 🚧 Done but for the owner's values and decisions (5.5, 5.7 and 5.8) | Leftovers deleted, and the conventions and a release's placeholders checked (`pnpm lint`, `pnpm release`). |

---

## 📋 Detailed Milestones & Tasks

### Milestone 1 – 5: Completed Foundation (v260922)
- [x] **Corrupted Magazine (Tier 4)**:
  - Added `.tier-4` and `.mag-4` styling with `#e63946` accent in [theme.json](../theme.json) / [theme.scss](../theme.scss) / [style.scss](../style.scss).
  - Updated magazine selector bounds in [client/game.ts](../client/game.ts) and [client/editor.ts](../client/editor.ts).
  - Localized in [views/index.pug](../views/index.pug), [views/index-ru.pug](../views/index-ru.pug), [views/index-zh-CN.pug](../views/index-zh-CN.pug).
- [x] **Hands-Free In-Game Auto-Capture Studio**:
  - WebRTC window stream capture with live video monitor in [client/editor.ts](../client/editor.ts) and [views/editor.pug](../views/editor.pug).
  - Web Audio API acoustic gunfire sensor with real-time decibel meter, customizable trigger sensitivity slider, and dynamic audio input switcher (System Audio, Default Microphone, and hardware devices like Stereo Mix / Headsets).
  - Output speaker change resilience: auto-resuming suspended `AudioContext` states, `devicechange` listener, muted track alerts, and 1-click `🔄 Reconnect` button without interrupting video.
  - Post-Firing Reload & Re-Aim Buffer: Configurable 1.5–8.0s buffer allowing full empty-mag reload animation to finish and re-entry to ADS, paired with live countdown and `[Spacebar]` / 1-click `📸 Snap Wall & Finish`.
  - Sample manager: side-by-side spray video (cadence/audio playback) and high-res wall screenshot preview, 1-click `📷 Re-snap Wall`, modal inspect, slot re-recording.
  - Interactive Wall Overlay: live display of settled post-spray video frames on the editor canvas with opacity control, mouse-wheel zoom, pan navigation, sample-by-sample spray inspection, and Move-All pattern alignment.
  - Responsive canvas viewport & dynamic auto-resize: stage container dimensions dynamically measured via debounced `ResizeObserver`, scaling screenshots and recoil patterns smoothly to fit smaller screens.
  - Collapsible sidebar menu toggle (`◀ Sidebar` / `[M]` key) to maximize canvas workspace.
  - Segmented recording method tabs: In-Game Live Studio, Offline Screenshot Analysis, and Manual/Legacy fine-tuning, with state persistence in `localStorage`.
  - Capture naming conventions: automated tracking of weapon and fire mode across session directories (`session_<weapon>_<mode>_<timestamp>`) and static screenshot uploads.
  - Robust plain wall decal tracking: adaptive median intensity thresholding supporting captures on plain concrete pillars and columns.
  - Reload background scale preservation & spec reloading: decoupled canvas clear from legacy unscaled image poke, and disentangled canonical specs from detected decals so clicking Reload cleanly loads the spec from specs.json over the photo.
  - Analysis confirmation modal & duplicate capture prevention: interactive modal to verify weapon, fire mode, and library saving before running analysis, avoiding accidental R-99 tags and duplicate storage.
  - Multi-Screenshot Batch Analysis & Fast Stage Carousel Navigation: multi-select image uploading, server screenshot library explorer, batch manager cards, multi-spray backend aggregation (`process_images_session`), and Stage Toolbar prev/next buttons with `[` and `]` keyboard shortcuts.
  - In-Game Live Studio Past Sessions Loader: browse and load past recorded sessions from disk, load companion wall screenshots into sample cards, import local video/companion files from disk, and re-run discovery.
  - Sidebar preview containment & full footage visibility: resolved SCSS nesting selector mismatch, enforced `overflow-x: hidden` on `#tools`, constrained `.sample-media-row .media-col video, img` (height: 95px, object-fit: contain), and fixed `img.batch-thumb` (52x38px) thumbnail styling so 100% of footage is visible and cards fit neatly without horizontal expansion.
  - Duplicate image and video clip upload prevention: validates incoming filenames, URLs, and base64 contents across disk uploads, server libraries, and local imports, blocking duplicates.
  - 1:1 Recoil Game Scale Calibration & True Muscle Memory Guarantee: calibrated canvas overlay mapping with Source Engine 1080p 1x geometric constant ($K_{px\_to\_mouse} = 3.36$ or $0.2976$ px/mickey) and restored `havoc_tc` in `client/specs.json` with canonical 35-round recoil and full ground loot mag progression `[18, 21, 25, 29, 35]`, guaranteeing identical in-game mouse counter-aiming.
  - One-click session analysis calling `POST /api/discovery/process-session`.
  - Shot Count Mismatch Detection & Manual Correction Mode: compares detected bullet holes against expected magazine size, flags mismatches with amber badges on batch cards and dropdown entries, and provides a `🔧 Correct Shots` toolbar toggle for manually adding/removing bullet holes with a live shot counter status bar.
  - Recoil Editor Usability, Dedicated Collapsible Right Editing Tools Sidebar & High-Performance Overhaul (60–144Hz):
    - Dedicated Collapsible Right Editing Tools Panel: eliminated horizontal overcrowding and scrolling from `#stage-toolbar`, reorganizing tools into 4 vertical cards (Actions & History, Canvas Modes, Layers & Visibility, View & Comparison) with `[E]` keyboard shortcut and `localStorage` persistence.
    - Minimal Canvas Header: replaced top clutter with a clean 44px bar displaying sidebar toggles, shortcuts trigger `[?]`, and live status tags (`🎯 Weapon • Shots • Scale`).
    - Zero `shadowBlur` rasterization: eliminated all Canvas 2D CPU Gaussian blur passes across markers, lines, candidate overlays, and discrepancy vectors, yielding silky 144 FPS canvas rendering.
    - Decoupled dragmove I/O: replaced continuous `localStorage.setItem` writes and DOM textarea re-serialization during point dragging with instantaneous memory-only line updates (< 0.05ms) and deferred persistence on `dragend`.
    - `requestAnimationFrame`-throttled panning & debounced wheel zoom marker re-scaling.
    - Canvas zoom and pan preserved across view switches (`spec`, `analyzed`, `trial-X`), batch image selections, and spec reloads (`🔄 Reload`) without resetting the user's view coordinates.
    - Zoom-adaptive marker circles ($r = 4.5 / s$, $w = 1.2 / s$) maintaining crisp ~4.5px screen radius across 1x–8x zoom with translucent fills (`rgba(0, 229, 255, 0.22)`) so decal holes underneath remain clearly visible.
    - Scaled hitboxes in stage coordinates allowing effortless placement of new markers close to existing markers in crowded decal clusters without blocking clicks.
    - Complete 50-step Undo / Redo history stack with toolbar buttons (`↩ Undo`, `↪ Redo`) and keyboard shortcuts (`Ctrl+Z`, `Ctrl+Y`, `Ctrl+Shift+Z`).
    - Smart sequential trajectory insertion: newly added markers automatically project onto the nearest spray segment or endpoint ($0 \to 1 \dots \to N-1$), re-indexing points and rebuilding connected lines automatically. Right-click deletes and reconnects lines seamlessly.
    - Eliminated legacy `edgeStartName` bolding on click.
  - Interactive Keyboard Shortcuts & Controls Reference (`⌨️ Shortcuts` / `?`): full in-UI modal reference table documenting all editor keyboard shortcuts, batch navigation keys (`[` and `]`), pan controls, mouse wheel zoom, and correction mode clicks.
  - Stage Visual Scale Fine-Tuner (`Scale: 100% ↺`): toolbar slider (80%–120%) enabling live fine-tuning of the overlay scale to compensate for player FOV variations (90° vs 110°) without modifying canonical game specs.
  - Pre-Analysis Reticle Alignment & Offline Screenshot Positioning: pre-analysis overlays on loaded wall screenshots anchor directly at the 20m target board center reticle ($X \approx 48.7\%, Y \approx 49.5\%$) and dynamically adjust to the selected optic zoom (1x, 2x, 3x, 4x).
  - Startup Cache Purge & Standalone Pattern Responsive Fit: purged legacy `localStorage` keys on startup to prevent double-pattern ghosting, and added responsive standalone canvas scaling fitting trajectories within 65% of viewport height.
  - View Dropdown Synchronization & Batch Card Integration: `#stage-preview-select` is fully synchronized with batch thumbnail card clicks, carousel navigation (`[` and `]`), and non-session screenshot loading (`batch-0`, `batch-1`). Reloading specs preserves active inspection views without resetting to spec.
  - Fit & Center Pattern & Correction Preservation: `fitAndCenterCanvas()` re-centers the stage and linearly rescales Konva shapes without clearing canvas or re-fetching overlays, preserving analyzed patterns and manual corrections.
  - In-Game FOV 104 Perspective Calibration & Automatic Scale Automation: integrated $\text{fovFactor} = \frac{1}{\tan(\text{FOV} / 2)}$ into camera projection layers across Python CV backend and frontend editor, automatically calibrating decal pixels to true mouse mickeys for 104° FOV without manual slider adjustments.
  - Havoc Weapon Multiplier Normalization (0.73): normalized Havoc (`havoc_tc`) in [`client/specs.json`](../client/specs.json) back to standard assault rifle multiplier `0.73` ($y$ ending at $-393.11$) while preserving lossless `raw_1x_x` and `raw_1x_y` (ending at $-538.5$), aligning Havoc with R-99/R-301 and re-exporting [`arduino_mouse/src/recoil.inc`](../arduino_mouse/src/recoil.inc).
  - HDR-to-SDR Color Tone-Mapping & Over-Exposure Correction: implemented 2D Canvas LUT-based tone mapping ($\gamma \approx 1.6$, exposure $0.85$, contrast $1.20$, saturation boost $1.25$), dynamic video preview CSS filter, and Python OpenCV tone-mapping with dedicated `#capture-hdr-select` and `#static-hdr-select` controls, completely resolving washed-out over-bright captures from Windows HDR / Auto HDR.
  - 1-Click Spec Saving & Direct Stage Toolbar Integration:
    - Added dedicated `💾 Save Spec` (`#save-stage-spec-btn`) button to the stage toolbar and global `Ctrl+S` / `Cmd+S` keyboard shortcut with transient "✅ Saved!" button feedback.
    - Added prominent 1-click `💾 Save Analyzed Pattern to specs.json` button inside both live session completion cards (`#session-process-status`) and batch screenshot completion cards (`#wall-file-status`), eliminating confusion about how to commit analysis results.
  - Spec Safety Verification Checkpoint & Dual Comparison Overlay:
    - Pre-save safety verification checkpoint modal (`#spec-checkpoint-modal`) checking for shot count truncations, deflection drift, large single-shot outliers, and recoil direction inversions before committing to `specs.json`.
    - Dual-curve comparison overlay mode (`⚖️ Compare: Spec vs Candidate Overlay` / `#compare-stage-btn` / `O` shortcut) concurrently rendering Cyan baseline spec, Orange candidate spec, and color-coded discrepancy vector lines over canvas wall decals.
    - Ground-truth screenshot-accurate scaling: Candidate points directly anchor to detected bullet decals on the screenshot wall without shrinking to theoretical spec sizes; baseline spec coordinates are dynamically scaled via least-squares empirical ratio ($K_{\text{cap}}$) to match the physical scale of the capture on the screenshot.
    - Floating on-stage Discrepancy HUD (`#discrepancy-hud`) providing real-time alignment metrics (shots, mean delta, max delta, and status badges).
    - Inline discrepancy health check badges and `⚖️ Inspect Discrepancies` action button in live and batch analysis cards.
  - Incremental Proportional Spec Accumulation vs Overwrite:
    - Implemented mathematical proportional sample merging via `RecoilAggregator.weighted_merge_recoil` and updated the Python pipeline to weight new samples proportionally: $\text{Coord}_{\text{combined}}[i] = \frac{N \cdot \text{Coord}_{\text{old}}[i] + M \cdot \text{Coord}_{\text{new}}[i]}{N + M}$.
    - Added Spec Integration Mode selection in `#analysis-confirm-modal` (`➕ Proportional Accumulation` vs `🔄 Fresh Overwrite`).
    - Added `sample_count` tracking in `client/specs.json` and a sidebar sample counter `#spec-samples-info` with a 1-click reset button `↺` to reset sample count back to 1 after patches.
    - Added `🔬 New Batch Alone` option in the stage View dropdown (`#stage-preview-select`) to compare newly captured batch samples against the accumulated canonical spec.
- [x] **Web UI Weapon Manager**:
  - Live weapon parameter controls (RPM, multiplier, mag tiers 0–4) in `/editor`.
  - Backend REST API endpoints `GET /api/specs` and `POST /api/specs` in [app.js](../app.js) with automatic `.bak` backups.
- [x] **Automated Recoil Discovery Engine**:
  - Python package in `processing/recoil_discovery/` covering post-spray settled frame decal extraction, homography stabilization, acoustic RPM estimation, and multi-spray median-delta integration.
  - Recommended capture calibration: 20m wall distance with 2x Bruiser optic (auto-scaled).
  - 34-hole decal extraction with local Black Top-Hat peak decomposition, horizontal railing traversal, detour-minimizing side hook insertion, and overlapping shot interpolation.
  - Complete CLI suite (`verify`, `process`, `batch`, `session`, `diff`, `export-arduino`).
  - 24 automated unit tests in `processing/tests/` with 100% pass rate.
- [x] **Server Port Resilience**:
  - EADDRINUSE automatic fallback from port 3000 to 3001 in [bin/www](../bin/www).

---

### Milestone 6: Weapon Arsenal & Attachments (Completed)
All 31 weapons in [client/specs.json](../client/specs.json) now have exact, calibrated in-game RPM rates, full 5-tier magazine progressions, official vector SVG icons, and complete frontend UI integration:
- [x] **Full 31-Weapon Arsenal Available Across UI**:
  - ARs: Flatline, R-301, HAVOC, Hemlok, Nemesis
  - SMGs: Alternator, Prowler, R-99, Volt, C.A.R.
  - LMGs: Devotion, L-STAR, Spitfire, Rampage
  - Marksman: G7 Scout, Triple Take, 30-30 Repeater, Bocek Bow
  - Snipers: Charge Rifle, Longbow, Sentinel, Kraber
  - Shotguns: EVA-8, Mastiff, Mozambique, Mozambique Akimbo, Peacekeeper
  - Pistols: RE-45, P2020, P2020 Akimbo, Wingman
- [x] **Corrupted Stock Attachment**:
  - Added `.mod-corrupted_stock` toggle next to `#mag-select` with mythic red styling.
  - Reduces ammo capacity by 4 rounds for stock-using weapons, and by 1 shell for single-shell shotguns.
  - Automatically hidden for weapons without a stock slot (Pistols, Akimbos, Bocek, Kraber).
- [x] **Wiki Scrape & Master Stats Audit**: Full database of all 32 weapons compiled into [docs/weapons-wiki-stats.md](weapons-wiki-stats.md) and `processing/data/wiki_weapons.json`.
- [x] **Ground Loot & Corrupted (L4) Deep Scrape**: Extracted detailed subpage stats for all 29 weapon subpages into `processing/data/wiki_weapons_detailed.json`. Clarified ground loot identity for rotational Care Package weapons (R-99, Devotion, Alternator) and uncovered all Tier 4 (Corrupted) magazine capacities.
- [x] **Patch Balance Sync (Mag Sizes)**: Updated ground loot magazine progressions and extended coordinate arrays for Corrupted L4.
- [x] **Top Navigation & Visual Polish**: Direct link to Recoil Studio 🛠️ in top links across English, Russian, and Chinese views, plus glowing mythic box shadow on Corrupted `.mag-4` and `.mod-corrupted_stock`.
- [x] **Dynamic Magazine Tooltips**: Real-time ammo capacity displayed on all magazine selectors (`.mag-0`..`.mag-4`) and fixed capacity badge (`.mag-drop`), accounting for Corrupted Stock penalties across English, Russian, and Simplified Chinese views.
- [x] **Shotgun & Semi-Auto Audio Engine**: Synthesized dedicated `shotgun_shot.wav` and `single_shot.wav` audio samples with synchronized per-shot playback, ensuring Peacekeeper and semi-automatic weapons fire exactly their real capacity with no runaway automatic spray noise.
- [x] **Weapon Shooting Styles & Trigger Mechanics**:
  - Full semi-automatic single-action support (click per shot, refire cooldown, smooth recoil recovery) for Peacekeeper, Mastiff, Wingman, P2020, G7 Scout, 30-30, Triple Take, Bocek, Charge Rifle, Longbow, Sentinel, Kraber.
  - Authentic burst fire mechanics (3-round for Hemlok, 4-round for Nemesis, 5-round for Prowler) with intra-burst cadence and recoil recovery/resetting between bursts.
  - Interactive Fire Mode Selector (`#fire-mode-select`) with Auto, Burst, and Single modes, and `[B]` toggle shortcut for select-fire weapons (Prowler: Burst/Auto, Hemlok: Burst/Single).
  - Segmented burst pattern rendering and radial single-fire kick visualization in [`drawPattern()`](../client/game.ts) and [`TracePreview`](../client/game.ts).

---

### Milestone 7: Full-Stack Hardening & Robustness (Completed)
- [x] **Server Process Safety & Validation ([app.js](../app.js))**:
  - Attached `proc.on('error')` failure listeners to Python `spawn()` processes preventing server crashes on missing binaries.
  - Fixed multi-part weapon name splitting in `/api/discovery/sessions` (`havoc_tc`, `p2020_akimbo`, `mozambique_akimbo`).
  - Switched synchronous `writeFileSync` to non-blocking async `fs.promises.writeFile`.
  - Added input sanitization for CLI parameters (`weaponTag`, `cleanHdr`, `cleanStrategy`, positive numeric validation).
  - Added `isValidWeaponSpec` JSON schema validation for spec updates with automatic backup preservation.
- [x] **Python Discovery Engine Robustness ([processing/recoil_discovery/](../processing/recoil_discovery/))**:
  - `tracker.py`: Unconditionally initialized `cx = w // 2` to eliminate `UnboundLocalError` risk; hoisted `maximum_filter` to module top level.
  - `spec_manager.py`: Added in-memory caching to `load_specs`; handled `common_len == 0` in `diff_weapon_spec` returning `EMPTY_PATTERN` status without crashing.
  - `aggregator.py`: Guarded `mean_recoil` against empty trials; synchronized `time_points` array length to `max_len` in `weighted_merge_recoil`.
  - `cli.py`: Enforced strict 55-element bounds in `cmd_export_arduino` to match Arduino firmware memory alignment.
  - `pipeline.py`: Eliminated self-referencing circular dictionary cycle in `aggregate_and_build_spec` when using `overwrite` strategy (`batch_spec["standalone_batch_spec"] = copy.deepcopy(batch_spec)`), preventing `ValueError: Circular reference detected` during JSON serialization.
  - `cli.py`: Attached `traceback.print_exc(file=sys.stderr)` in `cmd_session` ensuring complete Python tracebacks are emitted to stderr on failure.
  - `app.js`: Enhanced Express discovery endpoints to extract structured error messages from `stdoutData` when child processes exit with code 1.
  - Expanded automated test suite from 30 to 31 unit tests with 100% pass rate.
- [x] **Client Math & State Engine ([client/](../client/))**:
  - `point.ts`: Corrected `Point.atan2()` argument order to standard `Math.atan2(this.y, this.x)`; added docstrings and aliases `scale`, `scaleX`, `scaleY`.
  - `storage.ts`: Activated attribute updates before invoking `poke()` in `resumeAttrUpdates()` to prevent dropped updates.
  - `stats.ts`: Wrapped persistence in `try/catch` and resolved duplicate array push on legacy migration.
  - `main.ts`: Upgraded migration origin redirect to HTTPS.
  - `game.ts`: Fixed `0 / 0 = NaN` stat calculation in `Shooting.finish()`; guarded trail rendering; renamed `displayTace()` typo to `displayTrace()`.
- [x] **UI Robustness & Security ([client/editor.ts](../client/editor.ts))**:
  - Guarded `update()` against empty point graphs (`pp.length === 0`).
  - Added HTTP status verification (`!res.ok`) before calling `res.json()`.
  - Added `escapeHtml()` utility to sanitize dynamic variables before setting `innerHTML`.
  - Parallelized past session fetching with `Promise.all`.

---

### Milestone 8: UI/UX Modernization, Accessibility & Polish
- [x] **Remove Legacy Development Hiatus & End-of-Support Splash**: Removed outdated September 2024 notice dialog and associated attributes (`#notify-splash`, `aShowDevUpdate`) from [`views/index.pug`](../views/index.pug) and [`client/game.ts`](../client/game.ts).
- [x] **Custom Corrupted Magazine Graphic**: Created authentic Tier 4 / Red vector magazine graphic in [`assets/images/corrupted_mag.svg`](../assets/images/corrupted_mag.svg) to replace the CSS-tinted `magi.png`.
- [x] **Modern Typography & UI Styling**: Integrated Google Fonts 'Inter' (sans-serif) and 'JetBrains Mono' (monospace numbers/stats), enabled subpixel smoothing, unified dark form elements, and fixed responsive media queries.
- [x] **Trainer Search & Weapon Categorization**: Real-time search bar, category pills (All, AR, SMG, LMG, Mark, Snip, Shot, Pist), data-category tags for all 31 weapons, and live mag capacity badges.
- [x] **Editor Toolbar Ergonomics & Sub-1400px Compaction**: Organized tools into segmented button groups, implemented 2-tier responsive compaction (<1450px and <1250px) preventing crowding on sub-1400px viewports, and added minimize button to Discrepancy HUD.
- [x] **Accessibility Audit & High-Contrast Controls**: Conducted WCAG 2.1 AA audit (`accessibility_audit.md` (an assistant's notes, never committed)), resolved Undo/Redo invisibility in disabled state (replacing 1.8:1 washed-out opacity with solid $\ge 3.8:1$ borders and slate tones), and added global high-visibility `:focus-visible` focus ring.
- [x] **Recoil Editor Canvas Tools & Global Contrast Audit (WCAG AA/AAA Compliance)**:
  - Overhauled stage toolbar buttons (`.small-btn`, `.tool-btn`, `#save-stage-spec-btn`, `.segmented-btn-group`): eliminated browser user-agent `buttonface` grey background bleed with CSS resets in [`reset.scss`](../reset.scss); provided dark slate backgrounds (`rgba(30, 41, 59, 0.9)`), crisp borders, and vibrant `#f8fafc` text (17.5:1, WCAG AAA).
  - Fixed severe 1.58:1 contrast failure on `.primary-btn` and Save Spec buttons by enforcing dark slate text (`#0f172a`) and icon strokes on Apex gold (`#f59e0b`) for 9.8:1 contrast.
  - Enhanced canvas rendering on Konva stage in [`client/editor.ts`](../client/editor.ts) with dark drop shadows (`shadowColor: '#000000', shadowBlur: 3, shadowOpacity: 0.9`) on manual points, lines, candidate specs, and delta vectors for crystal clarity against sunny/light rock wall screenshots. Added text outline strokes to delta distance labels (`Δ28px`).
  - Styled WebKit range sliders (opacity/scale) with visible `#334155` tracks and glowing `#38bdf8` thumbs; styled Wall toggle pill; raised form labels to `#e2e8f0` (14.2:1); recalibrated all 5 magazine tier badges to $\ge 5:1$; upgraded method tabs and status badges.
  - Upgraded trainer recovery lines in [`client/game.ts`](../client/game.ts) and canvas hint/start colors in [`theme.json`](../theme.json) to vibrant emerald and slate.
- [x] **Vector Icon System**: Standardized all system emojis across toolbar, modals, drawers, and headers with scalable, accessible inline SVG icons ([`views/mixins/icons.pug`](../views/mixins/icons.pug)).
- [x] **Touch Target Sizing & ARIA Hygiene**: Expanded interactive bounds for secondary icon buttons (`#scale-reset-btn`, `#min-hud-btn`, `#close-hud-btn`, `#reset-samples-btn`) to $\ge 28\times 28$px / $26\times 26$px; added `aria-label`s to magazine inputs and buttons; added `rel="noopener noreferrer"` across external links.
- [x] **Recoil Pattern Opacity & Visibility Inspection Controls**: Added `#toggle-pattern` checkbox and `#pattern-opacity-slider` (0–100%) to stage toolbar; added `P` hotkey toggle; updated canvas shapes to reactively fade or hide pattern overlay so users can inspect underlying bullet decals on screenshots without visual clutter.
- [x] **Tactile Screenshot Analysis Button Redesign**: Overhauled `#analyze-wall-file-btn` and `.file-import-label` with prominent 3D button affordances, defined borders, drop shadows, and bevel depths; resolved ambiguous flat disabled state with clear button structure and tooltips; added dynamic batch count labels (e.g. `⚡ Analyze 3 Screenshots`) and pulsing ready-state animation.
- [x] **Global Escape Key Dismissal**: Instant dismissal of modal dialogs, instruction overlays, and stat graphs.
- [x] **Codebase TODOs & Technical Debt Elimination**:
  - Resolved `TODO` in [client/game.ts](../client/game.ts#L788-L802): removed dead code `const w = selectedWeapon();` and clarified `drawPattern` isolated preview parameters.
  - Resolved `TODO` in [client/game.ts](../client/game.ts#L1644): merged `aMovingTarget` into the multi-attribute `watch([...], showStats)` array.
  - Resolved `TODO` in [client/editor.ts](../client/editor.ts#L986-L994): removed redundant `img.draw()` call and added `img.isCached()` guard for Konva filter updates.
  - Resolved `TODO` in [client/editor.ts](../client/editor.ts#L2374-L2384): added user-facing status warning and console warning when anchor count $\ne 2$ in manual calibration.

---

### Milestone 9: CI/CD Pipeline Automation
- [x] 9.1 **GitHub Actions Workflow** ([.github/workflows/ci.yml](../.github/workflows/ci.yml), replaces the Gulp workflow):
  - Run `python -m pytest tests`, `python -m recoil_discovery.cli verify` and `python -m recoil_discovery.shadow_parity` (full-document parity) on every push/PR to `main`.
  - Run `pnpm exec tsc --noEmit`, `pnpm build`, `pnpm test` and `pnpm static` on Node 20.x and 22.x.
  - Integration job: `docker compose up` (Redis + SeaweedFS) and `pnpm test:services`, covering BullMQ, S3 and end-to-end analysis with the real Python CLI.
- [x] 9.2 Dry run of all three jobs from a clean copy of the tree (fresh `pnpm install`, fresh Python venv): all green.
- [x] 9.3 Confirm the first workflow run on GitHub (opencv system libraries, sqlite3 native build): PR #2 passed all four jobs on 2026-10-22 (M10 Phase 9).
- [ ] 9.4 Optional: path filters so Python-only and client-only changes skip the other job.
- [x] 9.5 CI on Windows too (2026-10-25), where the project is developed: the web checks on Node 22 and 24, the pipeline's tests and the end-to-end scenarios, with git keeping the files' LF endings. The Redis and S3 suites stay on Ubuntu, since Windows runners can't run their Linux containers. Every action is pinned to its release's commit.
- [x] 9.6 Dry run of the Windows jobs from a fresh copy of the tree with LF endings, as CI checks it out (2026-10-25): install, lint, formatting, the three typechecks, Vitest (238), the build, the Node tests (54), the static site, the end-to-end scenarios (59), pytest (43), spec verification and shadow parity (31 of 31), all green on Node 24. Node 22 isn't installed on the development computer, so its Windows leg first runs on GitHub.
- [x] 9.7 Confirm the first run on GitHub with the Windows jobs (after the owner's push): CI run 40210519106 on 80bed95 (2026-10-25) passed all nine jobs, Windows on Node 22 and 24 included.
- [x] 9.8 Audit both locks for known vulnerabilities on each change and every Monday (2026-10-25, [.github/workflows/audit.yml](../.github/workflows/audit.yml)): `pnpm audit`, and pip-audit 2.10.1 on `processing/requirements.txt`, both clean. The one advisory, in `postcss-selector-parser` 6 under `@tailwindcss/typography` (GHSA-rj75-hqrm-r3gf, fixed only in 7, which the plugin doesn't take), is fixed by an override to 7.1.6 in `pnpm-workspace.yaml`: built both ways, all 84 files in `dist/` are byte for byte the same, the plugin's prose rules included.
- [x] 9.9 The pipeline's packages locked with their hashes (2026-10-25): `processing/requirements.txt` is made from `processing/requirements.in` by `uv pip compile --universal --generate-hashes` for Python 3.12 on every system, and pins the 22 packages CI installed that day; CI installs it with `--require-hashes`. Installed that way in a fresh environment here: pytest 43, verify 31 OK, parity 31 of 31.
- [ ] 9.10 The original project's Pipenv files for its notebooks (`processing/Pipfile` and `Pipfile.lock`, last changed in 2024) are a second package manager and a second lock for the pipeline, which nothing audits. The owner decides: delete them (the notebooks then run in the pipeline's environment, with JupyterLab installed beside it), or add JupyterLab to `requirements.in`.
- [ ] 9.11 Confirm the first run on GitHub of the audit workflow and of the installs with `--require-hashes` (after the owner's push): both were run here with the same commands (9.8, 9.9).

---

### Milestone 10: Modern Platform & Architectural Overhaul (M10)
Tracked and executed in alignment with the master [Architectural Migration Plan](migration-plan.md):

- [x] **Phase 1: Stabilization & Memory Hardening**:
  - [x] Switch 150MB Base64 JSON ingestion to streaming `multipart/form-data` with `multer` and binary `FormData` uploads.
  - [x] Replace synchronous `fs.readdirSync` and `fs.statSync` with async `fs.promises` in [app.js](../app.js) with 60s memory caching.
  - [x] Add atomic temp-file swap (`fs.rename` / `Path.replace()`) to [client/specs.json](../client/specs.json).
  - [x] Refactor Python video decoder ([pipeline.py](../processing/recoil_discovery/pipeline.py)) to keep only the last 21 frames instead of accumulating full-clip arrays (peak 328 MB on a 5 s 1080p clip, constant with clip length).
- [x] **Phase 2: Compute Worker Service & Asynchronous Job Architecture**:
  - [x] Establish dedicated asynchronous JobQueue service ([server/job_queue.js](../server/job_queue.js)) with unit testing ([test/job_queue.test.js](../test/job_queue.test.js)).
  - [x] Transition `POST /api/discovery/process-session` and `process-static-image` to asynchronous job dispatch (`202 Accepted` + `job_id`).
  - [x] Implement Server-Sent Events (SSE) progress streaming (`GET /api/discovery/jobs/:id/events`) and polling fallback (`GET /api/discovery/jobs/:id`).
  - [x] Add worker concurrency control, 120s task timeouts, process kill guards, and automatic temp-folder cleanup.
  - [x] Persistent queue with Redis/BullMQ (`REDIS_URL`): jobs survive restarts, standalone workers (`npm run worker`), crash recovery, cross-process cancellation ([server/bull_queue.js](../server/bull_queue.js)).
- [x] **Phase 3: Modern Frontend Architecture & Component Decomposition**:
  - [x] Set up Vite 8 bundler with entries `trainer`, `editor`, legacy `bundle` router and `tailwind`, plus `theme.json` → `theme-tokens.css` generation (`vite.config.mjs`).
  - [x] Separate public Aim Trainer into its own route bundle (`client/trainer_main.ts` + shared stage in `client/stage.ts`): 89 kB gzip without editor code (<150KB budget).
  - [x] Decompose [client/editor.ts](../client/editor.ts) into reusable modules: [`types.ts`](../client/modules/types.ts), [`utils.ts`](../client/modules/utils.ts), and [`DiscrepancyInspector.ts`](../client/modules/analysis/DiscrepancyInspector.ts) (now used by `editor.ts`).
  - [x] Split the rest of `client/editor.ts` (5,153 lines) into [client/modules/editor/](../client/modules/editor/): state, layout, toolbar, canvas, calibration, overlays, weapon manager, capture studio, screenshots, sessions and the analysis dialog; `editor.ts` is a ~100-line entry.
  - [x] Tailwind 4 foundation: theme.json palette tokens, computed-style snapshot tool ([scripts/style-snapshot.mjs](../scripts/style-snapshot.mjs)); trainer footer migrated with zero computed-style change.
  - [x] Move all styles to Tailwind: `style.scss`/`reset.scss` ported to [client/styles/](../client/styles/) without Sass, app CSS in a cascade layer below the utilities, trainer and editor page layout as utilities, no `tw:` prefix, WCAG AA/AAA tokens preserved. No preflight (it would restyle images, links, borders and form controls); stateful widgets stay component CSS.
- [x] **Phase 4: Database Layer & Persistent Asset Storage**:
  - [x] Deploy SQLite relational schema in [`server/db.js`](../server/db.js) and [`processing/recoil_discovery/db.py`](../processing/recoil_discovery/db.py) with versioned, lossless weapon specs (`spec_json`, `sort_order`), `spec_revisions` audit logs, and import of external `specs.json` edits before every read/write.
  - [x] Persist session metadata in `discovery_sessions`, merged into the session list (from capture storage) served to the editor.
  - [x] `AssetStorageService` ([`server/storage.js`](../server/storage.js)) with local and S3-compatible providers (AWS SDK v3); all capture I/O in `app.js` goes through it.
  - [x] Direct browser uploads to S3 via presigned PUT + signed grants, media streamed by the API at `/captures`, `tmp/` cleanup; tested against SeaweedFS ([compose.yaml](../compose.yaml)) and in headless Chrome.
- [x] **Phase 5: Shadow Parity, Benchmarking & Decommissioning**:
  - [x] Execute automated shadow validation suite ensuring 100% field-level parity (all fields, order, coordinates) across all 31 weapons ([`processing/recoil_discovery/shadow_parity.py`](../processing/recoil_discovery/shadow_parity.py)).
  - [x] Validate microcontroller firmware alignment ([`arduino_mouse/src/recoil.inc`](../arduino_mouse/src/recoil.inc)).
  - [x] Decommissioned legacy Gulp, Browserify, Tsify, Watchify, and Gulp build configs in favor of pure Vite 8 standalone pipeline; `npm run static` restored via [`scripts/build-static.mjs`](../scripts/build-static.mjs).
- [x] **Phase 6: Frontend Runtime Module Resolution & Weapon Manager Polish**:
  - [x] Load the Vite ES modules with `type="module"` in [`views/layout.pug`](../views/layout.pug) (now per route: `/trainer.js`, `/editor.js`).
  - [x] Persist `mods` and `ping_points` in SQLite schema ([`server/db.js`](../server/db.js)) and deduplicate active specs, maintaining 100% parity across layers with zero drift.
  - [x] Implement "+ New Weapon" creation flow and automatic canvas synchronization in Recoil Editor ([`views/editor.pug`](../views/editor.pug), [`client/editor.ts`](../client/editor.ts)).
- [x] **Phase 7: Migration Audit & Hardening (2026-10-19)** — details in the [Audit Log](migration-plan.md):
  - [x] Isolate API tests from `data/recoil.db` / `client/specs.json`; make `DatabaseService.init()` idempotent; prune test rows from the local database (backup in `data/recoil.pre-audit-cleanup.db`).
  - [x] Lossless, order-preserving, transactional spec store in Node and Python; import external `specs.json` edits before saves; full-document shadow parity.
  - [x] Fix past-session loading, route bundle wiring, static site build, CI, stale `package-lock.json`, HDR blue channel, zero-frame `NameError`, job-queue completion/kill/progress bugs, upload temp-file leaks, single-screenshot analysis scope, and S3 fake success.
  - [x] End-to-end checks: headless Chrome loads `/` and `/editor` with no errors; upload → JobQueue → Python CLI → SSE → session index verified with a synthetic spray clip.
- [x] **Phase 8: Scaled Mode & Styling Foundation (2026-10-21)**:
  - [x] Redis/BullMQ queue (2.4), S3 storage with direct uploads (4.3), `compose.yaml` services, `.env.example`, `npm run worker`, `npm run test:services`.
  - [x] Tailwind 4 foundation and first migrated component (3.4), verified with computed-style snapshots.
  - [x] CI integration job; decoder BGR re-decode (1.4) measured and dropped (+22% CPU for ~130 MB).
- [x] **Phase 9: Editor Modules, Tailwind Migration & First CI Run (2026-10-22)**:
  - [x] First CI run on GitHub (PR #2): web (Node 20/22), integration (Redis/BullMQ + S3) and processing jobs all passed.
  - [x] Recoil Editor split into modules (3.3), verified with a scripted 33-step editor session giving identical DOM, canvas and storage.
  - [x] All styles in Tailwind 4 without Sass (3.4), verified with zero computed-style differences on 142 recorded page states.
  - [x] pnpm 12 only: pinned under `devEngines` (npm refuses to run), settings in `pnpm-workspace.yaml` (`allowBuilds`), `package-lock.json` removed, CI on `pnpm/action-setup@v6`; dependencies deduplicated.
  - [x] Removed the stale `public/` folder (old Gulp and tsc output that Express still served); `tsc` only typechecks.
- [ ] Optional: a warm Python worker that keeps OpenCV loaded between jobs, if the per-job start-up (about 1 to 3 s) matters (migration-plan.md, *Audit Log*).

### Milestone 11: UI Rebuild with React, Tailwind and shadcn/ui
Decided 2026-10-22: the trainer and the editor are rebuilt as React 19 components styled only with Tailwind 4, with shadcn/ui for standard controls; no pug, no CSS files besides one Tailwind entry, no Plotly or tarteaucitron. Analysis, stack and each step's scope: [docs/ui-migration-plan.md](ui-migration-plan.md), whose step ids these boxes carry (a follow-up takes the next id in its phase); this section is the only place M11's progress is tracked. The UI gets a new design and identity of its own ("graphite and volt"); the audit, tokens and screens are in [docs/ui-redesign.md](ui-redesign.md). Every reference to the original project is replaced with placeholders following [docs/ownership-register.md](ownership-register.md); the license and copyright notices stay. What the rebuild taught, the conventions to keep and the pitfalls already paid for, is in [docs/ui-notes.md](ui-notes.md), and where its code is in [docs/architecture.md](architecture.md). The work is on the `migration` branch: Phase 0 in `e0d2dec`, Phase 1 in `f0d389b`, Phase 2.1 to 2.6 (without the Patterns page) in `cc696b1`.
- [x] **Design** (2026-10-22; the owner's decisions 2026-10-25):
  - [x] D.1 UI audit (screenshots and runtime baseline), new identity, six mockups on the design canvas (trainer ready, after a run, progress; Studio; phone pattern viewer; foundations), tokens and component inventory.
  - [x] D.2 **Design system** (2026-10-22): a Design System artifact (https://claude.ai/artifact/XK1KCFGz6tF9WzmKUykaFe) with the tokens, 30 components with live previews, the brand book, the shadcn/ui mapping and the logos. Token edits there restyle every preview. For agents that can't open the artifacts, [docs/design/](design/README.md) holds a snapshot (2026-10-24): PNGs of the canvas's fourteen artboards and of every component preview, with the brand book, tokens, component rules and the artboards' markup. `scripts/export-design.mjs` refreshes it; Claude keeps reading the artifacts.
  - Follow-ups for Phase 1:
    - [x] D.3 Settle the radius scale: the mockups use 9 px for 38 px controls and 12 px for cards in panels, where the spec says 8 and 10. The system keeps both as tokens. (2026-10-25 owner, 2026-10-25: "fix it to match the design system artifact, that's the ground truth for design choices": the system's scale stays, the written spec now matches it, and the dialog's close button takes its 6 px.)
    - [x] D.4 Add the mockups' extra colors (outline, outline-card, outline-strong, the washes, text-soft, pattern-ink and the dot grids) to the token table in `docs/ui-redesign.md` (2026-10-24, with every color of `tokens.json` and its contrast).
    - [x] D.5 Fix or accept three marks under 3:1: the destructive button's outline, the chart's tries bars and the neutral segmented control's selected fill. (2026-10-25 owner, 2026-10-25: "Go with recommendations": a 1 px field outline on the selected neutral item and Studio tab, the destructive outline at 65 %, the tries bars kept.)
    - [x] D.6 Show a score that doesn't exist yet without a dash that reads as a bar (2026-10-25 owner, 2026-10-25: "That dash for missing score is too big and that's why it looks bad. Find a better way to show no scores"): the session card shows its hint in place of the score, and a tile's missing value is a thin dash in the muted color.
    - [x] D.7 Design what the mockups leave out: Dialog, Alert dialog, Drawer, the Command palette, the error toast, a result below the median, and hover for primary buttons. (2026-10-24: in the Design System, with the danger badge and the result card's other lines; overlay titles take `panel-title` and a dialog's Cancel is secondary, and the app follows.)
    - [x] D.8 Generate the Tailwind theme from the system's `tokens.json` (2026-10-23; the old pages kept `theme.json` until they were deleted).
- [x] **Phase 0: Tooling and safety net (2026-10-22)**:
  - [x] 0.1 React 19 with the React Compiler, and TypeScript 6.0 with separate browser and Node configs and the `@/` alias.
  - [x] 0.2 ESLint 10 (flat config with typescript-eslint, React Hooks, jsx-a11y and Tailwind class checks) and Prettier with the Tailwind plugin: `pnpm lint`, `pnpm format`.
  - [x] 0.3 Node `^22.22.2 || >=24.15.0` in `engines`; CI web job on Node 22 and 24 with lint, formatting, both typechecks and unit tests. Node 24.22.1 is installed with fnm; ~~the default is still 23.10~~ it is the default since 0.11.
  - [x] 0.4 `pnpm dev`: Express hosts Vite in middleware mode (hot reload, local only); `npm-run-all` removed.
  - [x] 0.5 Vitest with Testing Library and MSW (`pnpm test:unit`); Playwright with a throwaway-data server (`pnpm test:e2e`).
  - [x] 0.6 25 scenarios covering the trainer, the consent banner, the editor (including the Python discovery runs) and accessibility (axe, nothing beyond the old pages' baseline). CI runs them in the integration job.
  - [x] 0.7 Konva 10, and what the scenarios found fixed: Konva 10 broke the legacy threshold tools on high-density screens, and tooltips swallowed clicks meant for the controls under them.
  - [x] 0.8 Brotli or gzip for text responses (not for the analysis event streams), a year of immutable caching for hashed chunks, revalidation for entry files and pages.
  - [x] 0.9 **Ownership register** applied (2026-10-22): the original author's analytics ID, donation link, privacy policies, links and domain redirect are gone; pages read owner values from `site.json` (placeholders until the owner provides them); new privacy policy; license notices (`NOTICE`, `Modified by` lines, footer credit).
  - [x] 0.10 Name placeholder "Spraydown" and the logo: mark, wordmark, lockups and favicons in [brand/](../brand/) and `etc/`.
  - Follow-ups:
    - [x] 0.11 Make Node 24 the local default (2026-10-23): the system PATH points at fnm's `default` alias (Node 24.22.1), with pnpm 12.14.0 and the other global tools installed for it; `fnm default` now picks the version.
    - [x] 0.12 Move the GitHub Actions steps (`checkout`, `setup-node`, `setup-python`, `upload-artifact`) to their releases on the Node 24 action runtime (2026-10-24: v7 of each).
    - [x] 0.13 Phases 1 to 3: bring the accessibility baseline to zero (2026-10-24): the rebuilt pages and the Studio have no axe violations, and `e2e/accessibility.spec.ts` went with the Recoil Editor; tarteaucitron went with the old trainer.
    - [x] 0.14 Phase 3: the legacy auto-target search no longer recurses (a large dark area overflowed the stack), and the Studio shows a measured fire rate only for recorded clips (screenshots reported the one sent).
- [x] **Phase 1: Design system and shared foundations** (2026-10-23):
  - [x] 1.1 shadcn/ui: `new-york`, Radix through `radix-ui`, lucide icons ([components.json](../components.json)). The CLI 4.x writes `import { cn } from 'cn'`, which Vite, Vitest and tsconfig resolve to our token-aware helper.
  - [x] 1.2 Tokens: `client/styles/tokens.json`, copied from the Design System artifact, generates the Tailwind theme and the `type-*` text styles; `client/styles/app.css` is the new UI's only stylesheet, with self-hosted Chakra Petch, Inter and JetBrains Mono.
  - [x] 1.3 31 shadcn/ui components restyled to the design (27 since 1.13), and the app's own WeaponTile, TierOption, StatTile, ScoreCard, RunResult, ConsentBanner and InputWithUnit, on a gallery at `/next/components` with component tests and three scenarios (axe with no violations, every overlay open, phone width). Every component renders in all its states there, and the gallery's scenarios attach full-page screenshots.
  - [x] 1.4 Icons: Lucide for every generic icon, with the old icons mapped to Lucide names; the logo and the crosshair placeholder are our own SVG components (`client/components/icons.tsx`), and the redesign needs no game attachment art (magazine tiers are color bars, attachments are switches).
  - [x] 1.5 `lib/storage` under the existing `localStorage` keys, tested against values recorded from the current app.
  - [x] 1.6 `lib/api`: zod schemas, TanStack Query hooks, direct uploads and job progress (`useJobEvents`).
  - [x] 1.7 `lib/i18n`: English, Russian and Chinese catalogs with typed keys; a test checks each locale's keys, placeholders and tags.
  - [x] 1.8 `lib/analytics`: consent and the Google tag with Consent Mode v2.
  - [x] 1.9 `lib/site`: typed `site.json`, with the ownership register's rules.
  - Follow-ups:
    - [x] 1.10 Sync the Design System artifact with what the code taught (2026-10-23, version 7): font family names, underlined inline links, radio groups for single-choice controls, the selected tile's fire-rate color, keyboard access for scrolling tables, slider names, and how the tokens reach Tailwind.
    - [x] 1.11 Replace the recurring `text-[13px]` and `text-[11px]` with the type scale's size steps (`text-13`, `text-11`), generated from `tokens.json`.
    - [x] 1.12 A control for the Rampage's thermite grenade (`game::mods` = `revved_up`): a switch under Corrupted stock in the rebuilt trainer, shown only for the Rampage (2026-10-23; on the canvas's Main artboard since 2026-10-24).
    - [x] 1.13 Collapsible, form, sheet and sidebar: the Studio didn't need them; deleted in Phase 5 (2026-10-24; corrections, C6).
    - [x] 1.14 Review of the Russian and Chinese strings written during extraction (2026-10-24, by Claude at the owner's request; two Chinese weapon names are left for a native speaker, 2.14).
    - [x] 1.15 Phase 2: rewrite the consent scenario for the new banner (2026-10-23, in `e2e/trainer-next.spec.ts`).
    - [x] 1.16 Phase 2.8: update section 4 of the privacy policy when the new pages replace the current ones (the choice moves to `localStorage`, `consent:analytics`, for 12 months). Done 2026-10-24, with section 5's Google Fonts paragraph removed.
- [x] **Phase 2: Trainer** (2026-10-24; 2.11 and 2.12 on 2026-10-25): game engine separated from the UI, one component tree for three locales, prerendered HTML, charts with Recharts; delete the trainer templates, `trainer.css`, Plotly and tarteaucitron.
  - [x] 2.1 The engine (2026-10-23): [client/engine/](../client/engine/) holds the weapons, patterns, a run's timing and scoring, the target and the score history, without a DOM; the previous trainer ran on it until 2.8. Twelve runs recorded from the trainer before the split (full auto, bursts, single fire, attachments, half speed, an early release, an idle timeout) replay with the same shot times and scores, in Vitest and again in Chrome. Pointer lock and controller input don't exist yet, so nothing moved for them.
  - [x] 2.2 The screens from the redesign:
    - [x] The trainer at `/next` (2026-10-23): [client/trainer/](../client/trainer/) builds the redesign's trainer in English, Russian and Chinese: the top bar with the weapon search (Ctrl K), the loadout panel, the range on a Konva canvas that drives the engine (Follow path, still and moving targets; results around the target, as dots or as lines; Replay), the session panel with today's trend, the settings and help dialogs, the legal footer, the consent banner, and the phone pattern viewer. The range draws with Konva and plays its sounds with Howler ([client/trainer/range/](../client/trainer/range/)). The 12 recorded runs replay through it bit for bit in Chrome (`e2e/trainer.spec.ts`); the first load is 191.5 to 197.3 KiB of JavaScript (gzip).
    - [x] The Progress page at `/next/progress` (2026-10-23, [client/trainer/progress/](../client/trainer/progress/)): runs, best, median with its trend and days practiced over 7 days, 30 days or all time; the score per day (Recharts, loaded after the page); results per weapon; recent runs from a new run log (`game::runs`); CSV export.
    - [x] The Patterns page at `/next/patterns` (2026-10-24; the owner wants it in the first release): [client/trainer/patterns/](../client/trainer/patterns/) shows every weapon's pattern in a library filtered by class, all at one scale, and the selected one large with Play spray, its magazines and fire modes, and a link to practice it. Phones get the pattern viewer.
  - [x] 2.3 State (2026-10-23): settings in `useTrainerSettings` (the current keys, plus `game::ads` and `game::replay-speed`); this visit's runs and the open dialog in `useSession` (`client/trainer/session.ts`), set when the engine reports the end of a run. Nothing in React renders during a run.
  - [x] 2.4 Locales (2026-10-23): one component tree for en, ru and zh-CN; each page has its language's `lang`, title and meta description (`meta.description` for the trainer, `patterns.description` and `progress.description` for the other two), and loads only its own catalog besides English.
  - [x] 2.5 Prerendering (2026-10-23; corrections, C4): each new page is rendered ahead of time in its language, with its own title and meta description, and hydrated in the browser, so it shows before its JavaScript runs. `pnpm build` also builds `client/entries/prerender.tsx` for Node (`dist-ssr/prerender.mjs`); the server renders every page with its own `site.json` values when it starts and serves them from memory (`server/prerender.mjs`, `server/prerender.ts` since 4.4), and `pnpm static` writes a folder per page (`static/ru/patterns/index.html`). The browser loads the stored settings and history after hydrating; without JavaScript the pages show their content. `cn()` merges with tables compiled at build time (5.6 kB less JavaScript per page), and `pnpm test` checks the 200 kB first-load budget: 191.0 to 196.1 kB on the trainer, 176.6 to 181.8 kB on the Progress page.
  - [x] 2.6 Consent (2026-10-23): the banner on every page, with the values the server runs with (each page carries them in `<script id="site-json">`); the footer's Cookie settings and an address ending in `#cookies` reopen it, and the Google tag loads only after Accept (`e2e/trainer.spec.ts`).
  - [x] 2.7 The privacy policy, FAQ and changelog as pages (2026-10-24): `/privacy`, `/faq` and `/changelog` from Markdown in `docs/`, converted at build time ([scripts/markdown-plugin.mjs](../scripts/markdown-plugin.mjs)), in English, between the top bar and the legal footer; `site.json` can point `privacyUrl`, `faqUrl` and `changelogUrl` to them once their placeholders are filled. A new players' changelog (`docs/changelog.md`), and the original project's release history in `docs/history/` (ownership register, item 16).
  - [x] 2.8 The switch (2026-10-24): the pages serve `/`, `/ru` and `/zh-CN` with `/patterns` and `/progress` after each; `/next/...` redirects there (301), except the gallery at `/next/components`; unknown addresses get a 404 page. Deleted: the old trainer's templates, `trainer.css`, `game.ts`, `stats.ts`, `trainer_main.ts`, the legacy `bundle.js` router, Plotly, tarteaucitron, the old trainer's images and icons, the Google Fonts links (the Recoil Editor self-hosted its fonts) and `scripts/record-runs.mjs`; the static build keeps `index-ru.html` and `index-zh-CN.html` for servers set up for them. Lighthouse runs in CI ([lighthouserc.json](../lighthouserc.json)): 90 or more on the desktop profile, the phone profile recorded.
  - Follow-ups:
    - [x] 2.9 Bring the design artifacts in line with what the trainer added or changed: the pattern drawn as the path to follow, the Studio and support links, the settings and help dialogs, the ADS setting, the selected chip's count color, and artboards for the Patterns page, the documents and the 404 page. (2026-10-24: canvas version 20, also with the Studio's panels and dialogs; the support link stays off the artboards, since it shows only when `site.json` sets one.)
    - [x] 2.10 Review of the Russian and Chinese strings written for the redesign (2026-10-24, by Claude at the owner's request). What it changed and why is in the release notes ("Translation Review").
    - [x] 2.11 Once `siteUrl` is set: canonical and `hreflang` links for the three languages on the pages (`renderPage`); ~~the owner has no domain yet~~ `siteUrl` is https://spraydown.click since 2026-10-25. `pageLinks` in [server/prerender.ts](../server/prerender.ts) gives every page with an address its canonical link, and the trainer, Patterns and Progress pages an alternate for each language (en, ru, zh-CN) and `x-default` (the English page); none without an http(s) `siteUrl`, and none on the 404 and error pages. The static site has them too. The phone viewer's Copy link now copies the trainer in the page's language at the site's address (it copied the bare root). Tests: `test/prerender.test.ts` (5) and `client/trainer/links.test.ts` (2).
    - [x] 2.12 Phase 2's last exit criterion: read the `lighthouse` job's results after the next push. The desktop profile must score 90 or more for performance and accessibility (it fails the job otherwise); the phone profile's performance is recorded and only warned about. Measured here with Playwright on 2026-10-24 (Lighthouse's curves on Chrome's own metrics, not Lighthouse itself): about 100 on desktop for the trainer, Patterns, Progress and the FAQ, and about 98, 99, 96 and 100 on the phone profile. Read on 2026-10-25 from CI run 40210519106 on 80bed95 (Lighthouse 12.6.1, medians): on desktop, performance 99 on `/` and `/ru` and 100 on `/faq`, `/patterns` and `/progress`, with accessibility, best practices and SEO 100 on all five; on the phone profile (no `/ru`), performance 97, 95, 98 and 99 on `/`, `/faq`, `/patterns` and `/progress`, accessibility and SEO 100, and best practices 96 on `/`, `/patterns` and `/progress`, from Lighthouse's legible-text audit.
    - [ ] 2.13 Consider `<link rel="modulepreload">` for an entry's chunks and its page's catalog in the prerendered head: the browser discovers them one level at a time (read the hashed names from a Vite manifest).
    - [ ] 2.14 A native speaker, if one is available before launch, checks two Chinese weapon names taken from the original project's page: `G7侦灵枪` (Claude would expect 侦察 or 侦查) and `猎手冲锋枪` (possibly 猎兽). The other weapon names, also from the original pages, are kept in the game's localized forms.
- [x] **Phase 3: Recoil Editor** (2026-10-24, but for 3.7): the Studio at `/editor` ([client/studio/](../client/studio/)), from the Studio artboard; `editor.pug`, the remaining CSS, `theme.json` and `client/modules/` are deleted.
  - [x] 3.1 The logic without a DOM, tested ([client/studio/model/](../client/studio/model/)): specs, calibration, the discrepancy report, placement, pattern editing, undo, the decal finder, the capture sequence as a reducer, analyses. The calibration and the report match results recorded from the Recoil Editor on 2026-10-24 (`editor-parity.fixture.json`, its cases in `parity.cases.ts`); the decal finder and the color correction match ports of their originals.
  - [x] 3.2 The store (Zustand, `client/studio/store.ts`): the specs as saved and the drafts, undo, the session, the screenshots and sprays, what the canvas shows, the dialogs. The settings that last are `useEditorSettings`, under the Recoil Editor's keys plus new ones for the capture setup and the trigger.
  - [x] 3.3 The shell from the Studio artboard (`client/studio/studio-app.tsx`): the top bar (weapon picker, unsaved changes, undo, redo, shortcuts, Save spec), the icon rail (Capture, Library, Sessions, Import), the side panel, the canvas, the inspector and the status bar (job queue, storage), with the keys in `use-shortcuts.ts` and the dialogs in `dialogs.tsx`. No analytics and no consent banner.
  - [x] 3.4 The canvas (react-konva, `client/studio/canvas/`): the screenshot, the pattern with its shots and anchors, the read-only patterns, the comparison; the tool palette (select, pan, align, correct, fit), the spray navigator, the status pill and the zoom. Dragging a shot or the whole spray, measured on 2026-10-24: frames of 8 ms (the browser's own rate), at most 16 ms, 32 ms once at 4× CPU slowdown.
  - [x] 3.5 The panels (`client/studio/panels/`): Live capture, Screenshots, Manual, the library, sessions with clip import, discovery JSON import, the analysis' progress and result, the save checkpoint; the spec form and the layers in the inspector.
  - [x] 3.6 The switch: `/editor` serves the Studio (`/editor/next` redirects there); 14 scenarios replace the editor's 12 and its accessibility baseline. Deleted: `views/editor.pug`, `views/mixins/`, `client/modules/`, `client/editor.ts`, `editor_main.ts`, `bootstrap.ts`, `stage.ts`, `storage.ts`, `utils.ts`, the old stylesheets, `theme.json` (and its Vite plugin), `scripts/style-snapshot.mjs`, `e2e/editor.spec.ts` and the editor's axe baseline (`e2e/accessibility.spec.ts`).
  - [ ] 3.7 The manual capture check: written ([docs/studio-capture-check.md](studio-capture-check.md): screen sharing, the gunfire sensor, recording, the samples, an analysis), not run yet. It needs a person with the game; fix what it finds.
  - [x] 3.8 Fixed on the way: a save no longer renames the magazines' sounds, triples a single magazine or evens out the shot times (the Devotion's spin-up, the burst weapons); an edit without a screenshot no longer rescales a tall pattern; shots that weren't moved keep their exact values.
  - [ ] 3.9 A realistic static-image fixture, so the screenshot scenario can check the detected shots (the small synthetic wall yields none).
- [x] **Phase 4: Server and build** (2026-10-24): no pug, 404 for unknown paths, `app.js` split into routers, Express 5, multer 2, TypeScript with shared zod schemas.
  - [x] 4.1 No pug: the shells of the Studio and the gallery come from the server (`renderShell` in `server/prerender.ts`), and a failed request gets the error page, prerendered like the 404 page, with the error's status (and, in development, the error under it; plain text for anything but a browser). `views/` and `pug` are gone, and `pnpm static` writes `editor.html` from the same shell.
  - [x] 4.2 `createApp()` and routers ([server/routes/](../server/routes/)): `app.js` became `server/app.ts`, whose `createApp()` builds the app around a database, capture storage, job queue, upload folder and site values (the environment's unless given, so the tests and the end-to-end server pass throwaway ones), with routers for specs, discovery, jobs, captures and pages, and upload staging and errors in their own modules; `bin/www` became `server/main.ts`.
  - [x] 4.3 Express 5.3, multer 2.5 (2.4 and older have a denial of service), morgan 1.12 (log injection fixed); `cookie-parser`, `debug` and `http-errors` removed, and `pnpm-workspace.yaml` pins node-gyp's `undici` past two advisories; `pnpm audit --prod` clean.
  - [x] 4.4 The server and its tests in TypeScript, run by Node without a build (`tsconfig.server.json` in `pnpm tsc`); the API's schemas in [shared/](../shared/), read by the server's routes and re-exported by `client/lib/api/schemas.ts`. The status endpoint names the queue it runs on (`jobQueue.kind`).
  - [x] 4.5 `node:test` stays the server's test runner: it runs the TypeScript tests without tooling of its own, each file in its own process, and the Redis and S3 suites skip themselves without their services. Vitest stays with the client.
  - [x] 4.6 The Redis, S3 and end-to-end analysis suites pass on the TypeScript server (`pnpm test:services`, 64/64).
  - [x] 4.7 Dev-only advisories (`pnpm audit`): `minimatch`, `brace-expansion` and `picomatch` overridden to their fixed versions; ~~`postcss-selector-parser` 6 under `@tailwindcss/typography` stays (fixed only in 7, build time only)~~ `postcss-selector-parser` 6 under `@tailwindcss/typography` is overridden to 7.1.6 since 2026-10-25, which builds every file the same (M9, 9.8).
  - [x] 4.8 The server answers this computer only (2026-10-25): `server/main.ts` listens on 127.0.0.1 in every mode, and `createApp` refuses a request addressed to any host but this computer, until there is a sign-in (`test/main.test.ts`, `test/app-api.test.ts`).
- [x] **Phase 5: Removal and lock-in** (2026-10-24, but for 5.5, 5.7 and 5.8; 5.6 on 2026-10-25): delete leftovers, CI guards for the Tailwind conventions, docs.
  - [x] 5.1 Unused dependencies and the four unused shadcn components deleted: collapsible, form, sheet and sidebar (with the `use-mobile` hook); `hotkeys-js`, `json-diff`, `stats-lite` and their types, `ts-assert-exists`, `tslib`, `react-hook-form` and `@hookform/resolvers`. `esbuild` stays: it is Vite's optional peer.
  - [x] 5.2 `pnpm lint` checks the UI's conventions ([scripts/check-conventions.mjs](../scripts/check-conventions.mjs)), and the Tailwind lint's correctness rules and `no-deprecated-classes`, `no-duplicate-classes` and `no-unnecessary-whitespace` are errors (the notes' *Pitfalls* say why two others aren't); `pnpm release` ([scripts/check-release.mjs](../scripts/check-release.mjs)) fails while placeholders remain, and CI runs it for version tags. Prettier formats the scripts, `vite.config.mjs` and `app.css` too; `tokens.json` stays exactly as the Design System artifact has it.
  - [x] 5.3 The ownership register's items done, but for items 18 (5.6) and 19 (5.7): items 14 (the header logo) and 16 (the release history) included. The original's notice is on the 24 files that hold its code (the register lists them).
  - [x] 5.4 README, AGENTS.md, contributing, roadmap and release notes; `capture.md` and contributing's Styles section were rewritten with the Studio.
  - [ ] 5.5 Fill in the owner's values (owner): ~~the final name~~ (Spraydown), logo, ~~domain (none yet, 2026-10-24)~~ (spraydown.click; owner, 2026-10-25: "The name wll be Spraydown no? I have a domain now. spraydown.click"), GA4 measurement ID, privacy policy URL and support link, in `site.json` ([docs/ownership-register.md](ownership-register.md)). `node scripts/check-release.mjs` lists ~~the 47~~ 46 placeholders.
  - [x] 5.6 Ownership register item 18: the identifiers that hold `apex` take the final name's slug, once it is chosen (2026-10-25: `spraydown`): the compose project, its containers and volumes, the development S3 credentials, the queue prefix (`RECOIL_QUEUE_PREFIX`), the upload and job temp folders, and the tests' prefixes. `pnpm test:services` passed 73 of 73 under the new names. A computer that ran the old ones keeps the unused `apex-recoil_*` volumes and `apex` queue.
  - [ ] 5.7 Ownership register item 19: the owner reviews the game's art and sounds before launch.
  - [ ] 5.8 Four one-off scrapers at the top of `processing/` (`extract_all_weapon_svgs.py`, `extract_nemesis_svg.py`, `parse_detailed_wiki.py` and `scrape_wiki_weapons.py`, from 2026-09-29) read wiki pages that Antigravity saved in its own folder on the development computer during one conversation, so they run nowhere else, and the two parsers need BeautifulSoup, which no requirement lists. What they made is committed: the weapons' SVGs in `assets/images/`, and the stats in `docs/weapons-wiki-stats.md`, which `processing/generate_wiki_docs.py` writes from two gitignored JSON files. The owner decides: delete them (and decide about `generate_wiki_docs.py`), or rebuild them as one tool that fetches the wiki's pages itself, tested on recorded pages.

**Phases 0 to 5 verified** on 2026-10-24 (Node 24.22.1, Windows; `pnpm test:unit` again on 2026-10-25), with all of the above in place:
| Gate | Result |
| --- | --- |
| `python -m pytest tests` (in `processing/`) | 43 passed |
| `python -m recoil_discovery.shadow_parity` | 31 weapons, 0.000000 drift |
| `python -m recoil_discovery.cli verify` | every weapon OK |
| `pnpm build` | passes: the client into `dist/`, the Studio on its own into `dist/` (`dist/studio.js`, 1.15 MB, 360 kB gzip, one file), the prerender into `dist-ssr/`. The gallery's and the Studio's entries are over 500 kB, hence Vite's chunk-size warnings. First loads (gzip, kB of 1000 bytes; English, Russian, Chinese): the trainer 189.3, 194.6 and 194.0 kB; the Patterns page and the Progress page 172.8, 178.1 and 177.5 kB; the documents 155.3 kB (English only) |
| `pnpm test` | 50 of 50 (the TypeScript server; 5 new for the request parsing), the first-load budget and `/api/discovery/status` included. The job queue's tests that start Python wait 20 s for it: one of them timed out at 5 s once, with two Python processes starting at the same time on Windows |
| `pnpm test:unit` | 238 tests in 33 files (2026-10-25): 40 for the engine, 20 for the trainer and the Progress page, 5 for the prerender, and 71 for the Studio (its model, with the parity cases against the Recoil Editor; the store; the color correction; the analysis' progress in words) |
| `pnpm test:e2e` | 59 of 59: 24 on the trainer (the 12 recorded runs, the pages without JavaScript and consent included), 6 on the Patterns page, 6 on the Progress page, 6 on the documents and the 404 and error pages, 3 on the gallery, and 14 on the Studio (the Python discovery runs included) |
| `pnpm tsc` | no errors in the three configs (browser, tools, server) |
| `pnpm lint` | no errors and no warnings (the 219 warnings were in the JavaScript server, scripts and tests), then the conventions check |
| `pnpm format:check` | clean, the scripts, `vite.config.mjs` and `app.css` included |
| `node scripts/check-release.mjs` | fails with the 47 placeholders still to fill in, as it should until the owner's values are in |
| `pnpm audit --prod` | no advisories (one moderate in the dev tools, accepted, section 4) |

`pnpm test:services` (Redis and SeaweedFS from `compose.yaml`, after starting Docker Desktop): 64 of 64, the BullMQ queue (a worker killed mid-job included), S3 storage and the scaled mode's end-to-end analyses on the TypeScript server. By hand: the Studio's drag (3.4), a session analyzed on the local server, looked at in Chrome, and `node server/main.ts --dev` serving the pages, the sources and the API through Vite. `pnpm static` writes the 12 prerendered pages, the trainer's copies under `index-ru.html` and `index-zh-CN.html`, `404.html` and `editor.html`.

For 2.1, `scripts/record-runs.mjs` was also run against the build: the trainer running on the engine reproduced the 12 recorded runs exactly (events, shot times, scores, stored results). Since 2.2, `e2e/trainer.spec.ts` replays them through the range on every run of the suite; the recorder was deleted with the old trainer in 2.8.

For the compiled `cn()` tables (2.5), the six prerendered pages and every element's classes on the gallery, the trainer and the Progress page in Chrome (desktop and phone) were captured before and after: identical. A differential run over 422,105 random combinations of the sources' class names and of classes on every token scale, with variants, merged them the same way with both.

---

## 🔒 Checks

Every change passes the checks in [AGENTS.md](../AGENTS.md) (*Checks*), which keeps the commands, the folders they run from and what each must show; this plan keeps no copy of them.
