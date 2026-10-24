# Implementation Plan & Project Roadmap

This document outlines the architectural milestones, completed implementations, and upcoming tasks for the **Apex Legends Recoil Trainer & Discovery Toolkit**.

---

## 🎯 Progress Dashboard

| Milestone | Status | Description |
| :--- | :---: | :--- |
| **M1: Core Recoil Trainer** | ✅ Completed | WebGL/Canvas recoil training simulation, scoring algorithm, attachment selection. |
| **M2: Moving Target & Localization** | ✅ Completed | Moving target mode, Russian (`/ru`) and Chinese (`/zh-CN`) translations. |
| **M3: Corrupted Magazine (Tier 4 / Red)** | ✅ Completed | Full Tier 4 magazine support across UI, specs, CSS theming, and translations. |
| **M4: Auto-Capture Studio (`/editor`)** | ✅ Completed | Hands-free WebRTC window capture with acoustic gunfire trigger, sample manager, and REST API. |
| **M5: Python Recoil Discovery Engine** | ✅ Completed | Zero-guesswork computer vision and signal processing engine with 30 passing unit tests. |
| **M6: Weapon Arsenal & Attachments** | ✅ Completed | All 31 Apex weapons supported with official SVGs, 5-tier specs, and Corrupted Stock attachment. |
| **M7: Full-Stack Hardening & Robustness** | ✅ Completed | Comprehensive senior review covering 25 fixes across security, correctness, error handling, and performance. |
| **M8: UI/UX Modernization & Polish** | ✅ Completed | Google Fonts, instant weapon search & category pills, live mag capacities, toolbar ergonomics, corrupted mag SVG. |
| **M9: CI/CD Pipeline Automation** | ✅ Completed | `.github/workflows/ci.yml`: typecheck, Vite build, Node tests and static build (Node 20/22); integration job with Redis + S3 (compose.yaml); pytest, spec verify and shadow parity (Python 3.12). First GitHub run (PR #2, 2026-10-22) passed all four jobs. |
| **M10: Platform & Architectural Overhaul** | ✅ Completed | Streaming ingestion, in-process or Redis/BullMQ job queue, Vite 8 route bundles, lossless SQLite spec store, local or S3 capture storage with direct uploads, full-document shadow parity, the Recoil Editor split into modules, and all styling in Tailwind 4 (no Sass). Optional: a warm Python worker. |
| **M11: UI Rebuild (React, Tailwind, shadcn/ui)** | 🚧 Phases 0 to 5 done; open: the manual capture check, the Lighthouse results, two design decisions (radius scale, marks under 3:1) and the owner's values | Trainer and editor rebuilt as React 19 components styled only with Tailwind 4 and shadcn/ui, with a new design and identity; no pug, hand-written CSS, Plotly, tarteaucitron or links to the original project. Plan: [docs/ui-migration-plan.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/ui-migration-plan.md); design: [docs/ui-redesign.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/ui-redesign.md); ownership: [docs/ownership-register.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/ownership-register.md). Phase 0 (2026-10-22): React 19 and TypeScript 6 toolchain, ESLint 10 and Prettier, Vite hot reload inside Express, compression and caching, Vitest, and 25 Playwright scenarios on the current app, accessibility checks included. Phase 1 (2026-10-23): the design system in code (tokens, components, a gallery at `/next/components`), storage, API hooks, translations and analytics consent. Phase 2.1 (2026-10-23): the trainer's engine, without a DOM, proved on recorded runs. Phase 2.2 (2026-10-23): the trainer rebuilt at `/next`, scoring bit for bit like the current page. Phase 2.4 to 2.6 (2026-10-23): the new pages prerendered in each language with their own meta descriptions, consent with the server's settings, and under 200 kB of JavaScript on first load, checked by `pnpm test`. 2026-10-24: the Patterns page, the translations reviewed, the privacy policy, FAQ and changelog as pages, and the switch: the new pages serve `/`, `/ru` and `/zh-CN`, and the old trainer is gone. Phase 3 (2026-10-24): the Studio replaces the Recoil Editor at `/editor`. Phase 4 (2026-10-24): no pug, Express 5 and multer 2, and the server in TypeScript that Node runs directly, split into routers, with the API's zod schemas shared by the browser and the server. Phase 5 (2026-10-24): leftovers deleted, and the conventions and a release's placeholders checked (`pnpm lint`, `pnpm release`). Status and handoff: [docs/ui-migration-progress.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/ui-migration-progress.md). |

---

## 📋 Detailed Milestones & Tasks

### Milestone 1 – 5: Completed Foundation (v260922)
- [x] **Corrupted Magazine (Tier 4)**:
  - Added `.tier-4` and `.mag-4` styling with `#e63946` accent in [theme.json](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/theme.json) / [theme.scss](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/theme.scss) / [style.scss](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/style.scss).
  - Updated magazine selector bounds in [client/game.ts](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/game.ts) and [client/editor.ts](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts).
  - Localized in [views/index.pug](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/index.pug), [views/index-ru.pug](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/index-ru.pug), [views/index-zh-CN.pug](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/index-zh-CN.pug).
- [x] **Hands-Free In-Game Auto-Capture Studio**:
  - WebRTC window stream capture with live video monitor in [client/editor.ts](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts) and [views/editor.pug](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/editor.pug).
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
  - Havoc Weapon Multiplier Normalization (0.73): normalized Havoc (`havoc_tc`) in [`client/specs.json`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/specs.json) back to standard assault rifle multiplier `0.73` ($y$ ending at $-393.11$) while preserving lossless `raw_1x_x` and `raw_1x_y` (ending at $-538.5$), aligning Havoc with R-99/R-301 and re-exporting [`arduino_mouse/src/recoil.inc`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/arduino_mouse/src/recoil.inc).
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
  - Backend REST API endpoints `GET /api/specs` and `POST /api/specs` in [app.js](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/app.js) with automatic `.bak` backups.
- [x] **Automated Recoil Discovery Engine**:
  - Python package in `processing/recoil_discovery/` covering post-spray settled frame decal extraction, homography stabilization, acoustic RPM estimation, and multi-spray median-delta integration.
  - Recommended capture calibration: 20m wall distance with 2x Bruiser optic (auto-scaled).
  - 34-hole decal extraction with local Black Top-Hat peak decomposition, horizontal railing traversal, detour-minimizing side hook insertion, and overlapping shot interpolation.
  - Complete CLI suite (`verify`, `process`, `batch`, `session`, `diff`, `export-arduino`).
  - 24 automated unit tests in `processing/tests/` with 100% pass rate.
- [x] **Server Port Resilience**:
  - EADDRINUSE automatic fallback from port 3000 to 3001 in [bin/www](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/bin/www).

---

### Milestone 6: Weapon Arsenal & Attachments (Completed)
All 31 weapons in [client/specs.json](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/specs.json) now have exact, calibrated in-game RPM rates, full 5-tier magazine progressions, official vector SVG icons, and complete frontend UI integration:
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
- [x] **Wiki Scrape & Master Stats Audit**: Full database of all 32 weapons compiled into [docs/weapons-wiki-stats.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/weapons-wiki-stats.md) and `processing/data/wiki_weapons.json`.
- [x] **Ground Loot & Corrupted (L4) Deep Scrape**: Extracted detailed subpage stats for all 29 weapon subpages into `processing/data/wiki_weapons_detailed.json`. Clarified ground loot identity for rotational Care Package weapons (R-99, Devotion, Alternator) and uncovered all Tier 4 (Corrupted) magazine capacities.
- [x] **Patch Balance Sync (Mag Sizes)**: Updated ground loot magazine progressions and extended coordinate arrays for Corrupted L4.
- [x] **Top Navigation & Visual Polish**: Direct link to Recoil Studio 🛠️ in top links across English, Russian, and Chinese views, plus glowing mythic box shadow on Corrupted `.mag-4` and `.mod-corrupted_stock`.
- [x] **Dynamic Magazine Tooltips**: Real-time ammo capacity displayed on all magazine selectors (`.mag-0`..`.mag-4`) and fixed capacity badge (`.mag-drop`), accounting for Corrupted Stock penalties across English, Russian, and Simplified Chinese views.
- [x] **Shotgun & Semi-Auto Audio Engine**: Synthesized dedicated `shotgun_shot.wav` and `single_shot.wav` audio samples with synchronized per-shot playback, ensuring Peacekeeper and semi-automatic weapons fire exactly their real capacity with no runaway automatic spray noise.
- [x] **Weapon Shooting Styles & Trigger Mechanics**:
  - Full semi-automatic single-action support (click per shot, refire cooldown, smooth recoil recovery) for Peacekeeper, Mastiff, Wingman, P2020, G7 Scout, 30-30, Triple Take, Bocek, Charge Rifle, Longbow, Sentinel, Kraber.
  - Authentic burst fire mechanics (3-round for Hemlok, 4-round for Nemesis, 5-round for Prowler) with intra-burst cadence and recoil recovery/resetting between bursts.
  - Interactive Fire Mode Selector (`#fire-mode-select`) with Auto, Burst, and Single modes, and `[B]` toggle shortcut for select-fire weapons (Prowler: Burst/Auto, Hemlok: Burst/Single).
  - Segmented burst pattern rendering and radial single-fire kick visualization in [`drawPattern()`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/game.ts) and [`TracePreview`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/game.ts).

---

### Milestone 7: Full-Stack Hardening & Robustness (Completed)
- [x] **Server Process Safety & Validation ([app.js](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/app.js))**:
  - Attached `proc.on('error')` failure listeners to Python `spawn()` processes preventing server crashes on missing binaries.
  - Fixed multi-part weapon name splitting in `/api/discovery/sessions` (`havoc_tc`, `p2020_akimbo`, `mozambique_akimbo`).
  - Switched synchronous `writeFileSync` to non-blocking async `fs.promises.writeFile`.
  - Added input sanitization for CLI parameters (`weaponTag`, `cleanHdr`, `cleanStrategy`, positive numeric validation).
  - Added `isValidWeaponSpec` JSON schema validation for spec updates with automatic backup preservation.
- [x] **Python Discovery Engine Robustness ([processing/recoil_discovery/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/))**:
  - `tracker.py`: Unconditionally initialized `cx = w // 2` to eliminate `UnboundLocalError` risk; hoisted `maximum_filter` to module top level.
  - `spec_manager.py`: Added in-memory caching to `load_specs`; handled `common_len == 0` in `diff_weapon_spec` returning `EMPTY_PATTERN` status without crashing.
  - `aggregator.py`: Guarded `mean_recoil` against empty trials; synchronized `time_points` array length to `max_len` in `weighted_merge_recoil`.
  - `cli.py`: Enforced strict 55-element bounds in `cmd_export_arduino` to match Arduino firmware memory alignment.
  - `pipeline.py`: Eliminated self-referencing circular dictionary cycle in `aggregate_and_build_spec` when using `overwrite` strategy (`batch_spec["standalone_batch_spec"] = copy.deepcopy(batch_spec)`), preventing `ValueError: Circular reference detected` during JSON serialization.
  - `cli.py`: Attached `traceback.print_exc(file=sys.stderr)` in `cmd_session` ensuring complete Python tracebacks are emitted to stderr on failure.
  - `app.js`: Enhanced Express discovery endpoints to extract structured error messages from `stdoutData` when child processes exit with code 1.
  - Expanded automated test suite from 30 to 31 unit tests with 100% pass rate.
- [x] **Client Math & State Engine ([client/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/))**:
  - `point.ts`: Corrected `Point.atan2()` argument order to standard `Math.atan2(this.y, this.x)`; added docstrings and aliases `scale`, `scaleX`, `scaleY`.
  - `storage.ts`: Activated attribute updates before invoking `poke()` in `resumeAttrUpdates()` to prevent dropped updates.
  - `stats.ts`: Wrapped persistence in `try/catch` and resolved duplicate array push on legacy migration.
  - `main.ts`: Upgraded migration origin redirect to HTTPS.
  - `game.ts`: Fixed `0 / 0 = NaN` stat calculation in `Shooting.finish()`; guarded trail rendering; renamed `displayTace()` typo to `displayTrace()`.
- [x] **UI Robustness & Security ([client/editor.ts](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts))**:
  - Guarded `update()` against empty point graphs (`pp.length === 0`).
  - Added HTTP status verification (`!res.ok`) before calling `res.json()`.
  - Added `escapeHtml()` utility to sanitize dynamic variables before setting `innerHTML`.
  - Parallelized past session fetching with `Promise.all`.

---

### Milestone 8: UI/UX Modernization, Accessibility & Polish
- [x] **Remove Legacy Development Hiatus & End-of-Support Splash**: Removed outdated September 2024 notice dialog and associated attributes (`#notify-splash`, `aShowDevUpdate`) from [`views/index.pug`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/index.pug) and [`client/game.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/game.ts).
- [x] **Custom Corrupted Magazine Graphic**: Created authentic Tier 4 / Red vector magazine graphic in [`assets/images/corrupted_mag.svg`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/assets/images/corrupted_mag.svg) to replace the CSS-tinted `magi.png`.
- [x] **Modern Typography & UI Styling**: Integrated Google Fonts 'Inter' (sans-serif) and 'JetBrains Mono' (monospace numbers/stats), enabled subpixel smoothing, unified dark form elements, and fixed responsive media queries.
- [x] **Trainer Search & Weapon Categorization**: Real-time search bar, category pills (All, AR, SMG, LMG, Mark, Snip, Shot, Pist), data-category tags for all 31 weapons, and live mag capacity badges.
- [x] **Editor Toolbar Ergonomics & Sub-1400px Compaction**: Organized tools into segmented button groups, implemented 2-tier responsive compaction (<1450px and <1250px) preventing crowding on sub-1400px viewports, and added minimize button to Discrepancy HUD.
- [x] **Accessibility Audit & High-Contrast Controls**: Conducted WCAG 2.1 AA audit ([`accessibility_audit.md`](file:///C:/Users/micro.VADER/.gemini/antigravity-ide/brain/733f6ac0-5f64-4bff-9739-d504f9dfdc0d/accessibility_audit.md)), resolved Undo/Redo invisibility in disabled state (replacing 1.8:1 washed-out opacity with solid $\ge 3.8:1$ borders and slate tones), and added global high-visibility `:focus-visible` focus ring.
- [x] **Recoil Editor Canvas Tools & Global Contrast Audit (WCAG AA/AAA Compliance)**:
  - Overhauled stage toolbar buttons (`.small-btn`, `.tool-btn`, `#save-stage-spec-btn`, `.segmented-btn-group`): eliminated browser user-agent `buttonface` grey background bleed with CSS resets in [`reset.scss`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/reset.scss); provided dark slate backgrounds (`rgba(30, 41, 59, 0.9)`), crisp borders, and vibrant `#f8fafc` text (17.5:1, WCAG AAA).
  - Fixed severe 1.58:1 contrast failure on `.primary-btn` and Save Spec buttons by enforcing dark slate text (`#0f172a`) and icon strokes on Apex gold (`#f59e0b`) for 9.8:1 contrast.
  - Enhanced canvas rendering on Konva stage in [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts) with dark drop shadows (`shadowColor: '#000000', shadowBlur: 3, shadowOpacity: 0.9`) on manual points, lines, candidate specs, and delta vectors for crystal clarity against sunny/light rock wall screenshots. Added text outline strokes to delta distance labels (`Δ28px`).
  - Styled WebKit range sliders (opacity/scale) with visible `#334155` tracks and glowing `#38bdf8` thumbs; styled Wall toggle pill; raised form labels to `#e2e8f0` (14.2:1); recalibrated all 5 magazine tier badges to $\ge 5:1$; upgraded method tabs and status badges.
  - Upgraded trainer recovery lines in [`client/game.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/game.ts) and canvas hint/start colors in [`theme.json`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/theme.json) to vibrant emerald and slate.
- [x] **Vector Icon System**: Standardized all system emojis across toolbar, modals, drawers, and headers with scalable, accessible inline SVG icons ([`views/mixins/icons.pug`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/mixins/icons.pug)).
- [x] **Touch Target Sizing & ARIA Hygiene**: Expanded interactive bounds for secondary icon buttons (`#scale-reset-btn`, `#min-hud-btn`, `#close-hud-btn`, `#reset-samples-btn`) to $\ge 28\times 28$px / $26\times 26$px; added `aria-label`s to magazine inputs and buttons; added `rel="noopener noreferrer"` across external links.
- [x] **Recoil Pattern Opacity & Visibility Inspection Controls**: Added `#toggle-pattern` checkbox and `#pattern-opacity-slider` (0–100%) to stage toolbar; added `P` hotkey toggle; updated canvas shapes to reactively fade or hide pattern overlay so users can inspect underlying bullet decals on screenshots without visual clutter.
- [x] **Tactile Screenshot Analysis Button Redesign**: Overhauled `#analyze-wall-file-btn` and `.file-import-label` with prominent 3D button affordances, defined borders, drop shadows, and bevel depths; resolved ambiguous flat disabled state with clear button structure and tooltips; added dynamic batch count labels (e.g. `⚡ Analyze 3 Screenshots`) and pulsing ready-state animation.
- [x] **Global Escape Key Dismissal**: Instant dismissal of modal dialogs, instruction overlays, and stat graphs.
- [x] **Codebase TODOs & Technical Debt Elimination**:
  - Resolved `TODO` in [client/game.ts](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/game.ts#L788-L802): removed dead code `const w = selectedWeapon();` and clarified `drawPattern` isolated preview parameters.
  - Resolved `TODO` in [client/game.ts](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/game.ts#L1644): merged `aMovingTarget` into the multi-attribute `watch([...], showStats)` array.
  - Resolved `TODO` in [client/editor.ts](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts#L986-L994): removed redundant `img.draw()` call and added `img.isCached()` guard for Konva filter updates.
  - Resolved `TODO` in [client/editor.ts](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts#L2374-L2384): added user-facing status warning and console warning when anchor count $\ne 2$ in manual calibration.

---

### Milestone 9: CI/CD Pipeline Automation
- [x] **GitHub Actions Workflow** ([.github/workflows/ci.yml](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/.github/workflows/ci.yml), replaces the Gulp workflow):
  - Run `python -m pytest tests`, `python -m recoil_discovery.cli verify` and `python -m recoil_discovery.shadow_parity` (full-document parity) on every push/PR to `main`.
  - Run `pnpm exec tsc --noEmit`, `pnpm build`, `pnpm test` and `pnpm static` on Node 20.x and 22.x.
  - Integration job: `docker compose up` (Redis + SeaweedFS) and `pnpm test:services`, covering BullMQ, S3 and end-to-end analysis with the real Python CLI.
- [x] Dry run of all three jobs from a clean copy of the tree (fresh `pnpm install`, fresh Python venv): all green.
- [ ] Confirm the first workflow run on GitHub (opencv system libraries, sqlite3 native build).
- [ ] Optional: path filters so Python-only and client-only changes skip the other job.

---

### Milestone 10: Modern Platform & Architectural Overhaul (M10)
Tracked and executed in alignment with the master [Architectural Migration Plan](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/migration-plan.md):

- [x] **Phase 1: Stabilization & Memory Hardening**:
  - [x] Switch 150MB Base64 JSON ingestion to streaming `multipart/form-data` with `multer` and binary `FormData` uploads.
  - [x] Replace synchronous `fs.readdirSync` and `fs.statSync` with async `fs.promises` in [app.js](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/app.js) with 60s memory caching.
  - [x] Add atomic temp-file swap (`fs.rename` / `Path.replace()`) to [client/specs.json](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/specs.json).
  - [x] Refactor Python video decoder ([pipeline.py](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/pipeline.py)) to keep only the last 21 frames instead of accumulating full-clip arrays (peak 328 MB on a 5 s 1080p clip, constant with clip length).
- [x] **Phase 2: Compute Worker Service & Asynchronous Job Architecture**:
  - [x] Establish dedicated asynchronous JobQueue service ([server/job_queue.js](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/server/job_queue.js)) with unit testing ([test/job_queue.test.js](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/test/job_queue.test.js)).
  - [x] Transition `POST /api/discovery/process-session` and `process-static-image` to asynchronous job dispatch (`202 Accepted` + `job_id`).
  - [x] Implement Server-Sent Events (SSE) progress streaming (`GET /api/discovery/jobs/:id/events`) and polling fallback (`GET /api/discovery/jobs/:id`).
  - [x] Add worker concurrency control, 120s task timeouts, process kill guards, and automatic temp-folder cleanup.
  - [x] Persistent queue with Redis/BullMQ (`REDIS_URL`): jobs survive restarts, standalone workers (`npm run worker`), crash recovery, cross-process cancellation ([server/bull_queue.js](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/server/bull_queue.js)).
- [x] **Phase 3: Modern Frontend Architecture & Component Decomposition**:
  - [x] Set up Vite 8 bundler with entries `trainer`, `editor`, legacy `bundle` router and `tailwind`, plus `theme.json` → `theme-tokens.css` generation (`vite.config.mjs`).
  - [x] Separate public Aim Trainer into its own route bundle (`client/trainer_main.ts` + shared stage in `client/stage.ts`): 89 kB gzip without editor code (<150KB budget).
  - [x] Decompose [client/editor.ts](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts) into reusable modules: [`types.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/modules/types.ts), [`utils.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/modules/utils.ts), and [`DiscrepancyInspector.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/modules/analysis/DiscrepancyInspector.ts) (now used by `editor.ts`).
  - [x] Split the rest of `client/editor.ts` (5,153 lines) into [client/modules/editor/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/modules/editor/): state, layout, toolbar, canvas, calibration, overlays, weapon manager, capture studio, screenshots, sessions and the analysis dialog; `editor.ts` is a ~100-line entry.
  - [x] Tailwind 4 foundation: theme.json palette tokens, computed-style snapshot tool ([scripts/style-snapshot.mjs](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/scripts/style-snapshot.mjs)); trainer footer migrated with zero computed-style change.
  - [x] Move all styles to Tailwind: `style.scss`/`reset.scss` ported to [client/styles/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/styles/) without Sass, app CSS in a cascade layer below the utilities, trainer and editor page layout as utilities, no `tw:` prefix, WCAG AA/AAA tokens preserved. No preflight (it would restyle images, links, borders and form controls); stateful widgets stay component CSS.
- [x] **Phase 4: Database Layer & Persistent Asset Storage**:
  - [x] Deploy SQLite relational schema in [`server/db.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/server/db.js) and [`processing/recoil_discovery/db.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/db.py) with versioned, lossless weapon specs (`spec_json`, `sort_order`), `spec_revisions` audit logs, and import of external `specs.json` edits before every read/write.
  - [x] Persist session metadata in `discovery_sessions`, merged into the session list (from capture storage) served to the editor.
  - [x] `AssetStorageService` ([`server/storage.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/server/storage.js)) with local and S3-compatible providers (AWS SDK v3); all capture I/O in `app.js` goes through it.
  - [x] Direct browser uploads to S3 via presigned PUT + signed grants, media streamed by the API at `/captures`, `tmp/` cleanup; tested against SeaweedFS ([compose.yaml](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/compose.yaml)) and in headless Chrome.
- [x] **Phase 5: Shadow Parity, Benchmarking & Decommissioning**:
  - [x] Execute automated shadow validation suite ensuring 100% field-level parity (all fields, order, coordinates) across all 31 weapons ([`processing/recoil_discovery/shadow_parity.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/shadow_parity.py)).
  - [x] Validate microcontroller firmware alignment ([`arduino_mouse/src/recoil.inc`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/arduino_mouse/src/recoil.inc)).
  - [x] Decommissioned legacy Gulp, Browserify, Tsify, Watchify, and Gulp build configs in favor of pure Vite 8 standalone pipeline; `npm run static` restored via [`scripts/build-static.mjs`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/scripts/build-static.mjs).
- [x] **Phase 6: Frontend Runtime Module Resolution & Weapon Manager Polish**:
  - [x] Load the Vite ES modules with `type="module"` in [`views/layout.pug`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/layout.pug) (now per route: `/trainer.js`, `/editor.js`).
  - [x] Persist `mods` and `ping_points` in SQLite schema ([`server/db.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/server/db.js)) and deduplicate active specs, maintaining 100% parity across layers with zero drift.
  - [x] Implement "+ New Weapon" creation flow and automatic canvas synchronization in Recoil Editor ([`views/editor.pug`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/editor.pug), [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts)).
- [x] **Phase 7: Migration Audit & Hardening (2026-10-19)** — details in the [Audit Log](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/migration-plan.md):
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

### Milestone 11: UI Rebuild with React, Tailwind and shadcn/ui (planned)
Decided 2026-10-22: the trainer and the editor are rebuilt as React 19 components styled only with Tailwind 4, with shadcn/ui for standard controls; no pug, no CSS files besides one Tailwind entry, no Plotly or tarteaucitron. Analysis, stack, conventions and steps: [docs/ui-migration-plan.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/ui-migration-plan.md). The UI gets a new design and identity of its own ("graphite and volt"); the audit, tokens and screens are in [docs/ui-redesign.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/ui-redesign.md). Every reference to the original project is replaced with placeholders following [docs/ownership-register.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/ownership-register.md); the license and copyright notices stay.
- [x] **Design**: UI audit (screenshots and runtime baseline), new identity, six mockups on the design canvas (trainer ready, after a run, progress; Studio; phone pattern viewer; foundations), tokens and component inventory.
- [x] **Design system** (2026-10-22): a Design System artifact (https://claude.ai/artifact/XK1KCFGz6tF9WzmKUykaFe) with the tokens, 30 components with live previews, the brand book, the shadcn/ui mapping and the logos. Token edits there restyle every preview. For agents that can't open the artifacts, [docs/design/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/design/README.md) holds a snapshot (2026-10-24): PNGs of the canvas's fourteen artboards and of every component preview, with the brand book, tokens, component rules and the artboards' markup. `scripts/export-design.mjs` refreshes it; Claude keeps reading the artifacts.
  - Follow-ups for Phase 1:
    - [ ] Settle the radius scale: the mockups use 9 px for 38 px controls and 12 px for cards in panels, where the spec says 8 and 10. The system keeps both as tokens.
    - [x] Add the mockups' extra colors (outline, outline-card, outline-strong, the washes, text-soft, pattern-ink and the dot grids) to the token table in `docs/ui-redesign.md` (2026-10-24, with every color of `tokens.json` and its contrast).
    - [ ] Fix or accept three marks under 3:1: the destructive button's outline, the chart's tries bars and the neutral segmented control's selected fill.
    - [x] Design what the mockups leave out: Dialog, Alert dialog, Drawer, the Command palette, the error toast, a result below the median, and hover for primary buttons. (2026-10-24: in the Design System, with the danger badge and the result card's other lines; overlay titles take `panel-title` and a dialog's Cancel is secondary, and the app follows.)
    - [x] Generate the Tailwind theme from the system's `tokens.json` (2026-10-23; the old pages keep `theme.json` until they are deleted).
- [x] **Ownership register** applied (2026-10-22): the original author's analytics ID, donation link, privacy policies, links and domain redirect are gone; pages read owner values from `site.json` (placeholders until the owner provides them); new privacy policy; license notices (`NOTICE`, `Modified by` lines, footer credit).
- [x] **Phase 0: Tooling and safety net (2026-10-22)**:
  - [x] Name placeholder "Spraydown" and the logo: mark, wordmark, lockups and favicons in [brand/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/brand/) and `etc/`.
  - [x] React 19 with the React Compiler, TypeScript 6.0 (separate browser and Node configs, `@/` alias), Konva 10.
  - [x] ESLint 10 (flat config with typescript-eslint, React Hooks, jsx-a11y and Tailwind class checks) and Prettier with the Tailwind plugin: `pnpm lint`, `pnpm format`.
  - [x] Node `^22.22.2 || >=24.15.0` in `engines`; CI web job on Node 22 and 24 with lint, formatting, both typechecks and unit tests. Node 24.22.1 is installed with fnm; the default is still 23.10.
  - [x] `pnpm dev`: Express hosts Vite in middleware mode (hot reload, local only); `npm-run-all` removed.
  - [x] Brotli or gzip for text responses (not for the analysis event streams), a year of immutable caching for hashed chunks, revalidation for entry files and pages.
  - [x] Vitest with Testing Library and MSW (`pnpm test:unit`); Playwright with a throwaway-data server (`pnpm test:e2e`): 25 scenarios covering the trainer, the consent banner, the editor (including the Python discovery runs) and accessibility (axe, nothing beyond today's baseline). CI runs them in the integration job.
  - [x] Fixed what the scenarios found: Konva 10 broke the legacy threshold tools on high-density screens, and tooltips swallowed clicks meant for the controls under them.
  - Follow-ups:
    - [x] Make Node 24 the local default (2026-10-23): the system PATH points at fnm's `default` alias (Node 24.22.1), with pnpm 12.14.0 and the other global tools installed for it; `fnm default` now picks the version.
    - [x] Move the GitHub Actions steps (`checkout`, `setup-node`, `setup-python`, `upload-artifact`) to their releases on the Node 24 action runtime (2026-10-24: v7 of each).
    - [x] Phases 1 to 3: bring the accessibility baseline to zero (2026-10-24): the rebuilt pages and the Studio have no axe violations, and `e2e/accessibility.spec.ts` went with the Recoil Editor; tarteaucitron went with the old trainer.
    - [x] Phase 3: the legacy auto-target search no longer recurses (a large dark area overflowed the stack), and the Studio shows a measured fire rate only for recorded clips (screenshots reported the one sent).
    - [ ] A realistic static-image fixture, so the screenshot scenario can check the detected shots (the small synthetic wall yields none).
- [x] **Phase 1: Design system and shared foundations** (2026-10-23; status, conventions and next steps in [docs/ui-migration-progress.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/ui-migration-progress.md)):
  - [x] shadcn/ui (`new-york`, Radix) on the design system's tokens: `client/styles/tokens.json` generates the Tailwind theme and the `type-*` text styles; `client/styles/app.css` is the new UI's only stylesheet, with self-hosted Chakra Petch, Inter and JetBrains Mono.
  - [x] 31 shadcn/ui components restyled to the design, and the app's own WeaponTile, TierOption, StatTile, ScoreCard, RunResult, ConsentBanner and InputWithUnit, on a gallery at `/next/components` with component tests and three scenarios (axe with no violations, every overlay open, phone width).
  - [x] `lib/storage` under the existing `localStorage` keys (tested against values recorded from the current app), `lib/api` (zod schemas, TanStack Query hooks, direct uploads, job progress), `lib/i18n` (English, Russian and Chinese catalogs with typed keys), `lib/analytics` (Consent Mode v2) and `lib/site`.
  - [x] Icons (plan 1.4): Lucide for every generic icon, with the old icons mapped to Lucide names; the redesign needs no game attachment art.
  - Follow-ups:
    - [x] Sync the Design System artifact with what the code taught (2026-10-23, version 7): font family names, underlined inline links, radio groups for single-choice controls, the selected tile's fire-rate color, keyboard access for scrolling tables, slider names, and how the tokens reach Tailwind.
    - [x] Replace the recurring `text-[13px]` and `text-[11px]` with the type scale's size steps (`text-13`, `text-11`), generated from `tokens.json`.
    - [x] A control for the Rampage's thermite grenade (`game::mods` = `revved_up`): a switch under Corrupted stock in the rebuilt trainer, shown only for the Rampage (2026-10-23; still to add to the design artifacts).
    - [x] Collapsible, form, sheet and sidebar: the Studio didn't need them; deleted in Phase 5 (2026-10-24).
    - [x] Review of the Russian and Chinese strings written during extraction (2026-10-24, by Claude at the owner's request; two Chinese weapon names are left for a native speaker, listed in the progress report).
    - [x] Phase 2: rewrite the consent scenario for the new banner (2026-10-23, in `e2e/trainer-next.spec.ts`).
    - [x] Phase 2.8: update section 4 of the privacy policy when the new pages replace the current ones (the choice moves to `localStorage`, `consent:analytics`, for 12 months). Done 2026-10-24, with section 5's Google Fonts paragraph removed.
- [x] **Phase 2: Trainer** (2026-10-24): game engine separated from the UI, one component tree for three locales, prerendered HTML, charts with Recharts; delete the trainer templates, `trainer.css`, Plotly and tarteaucitron.
  - [x] 2.1 The engine (2026-10-23): [client/engine/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/engine/) holds the weapons, patterns, a run's timing and scoring, the target and the score history, without a DOM; the current trainer runs on it. Twelve runs recorded from the trainer before the split (full auto, bursts, single fire, attachments, half speed, an early release, an idle timeout) replay with the same shot times and scores, in Vitest and again in Chrome.
  - [x] 2.2 to 2.4, the trainer at `/next` (2026-10-23): [client/trainer/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/trainer/) builds the redesign's trainer in English, Russian and Chinese: the top bar with the weapon search (Ctrl K), the loadout panel, the range on a Konva canvas that drives the engine (Follow path, still and moving targets; results around the target, as dots or as lines; Replay), the session panel with today's trend, the settings and help dialogs, the legal footer, the consent banner, and the phone pattern viewer. The 12 recorded runs replay through it bit for bit in Chrome; the first load is 191.5 to 197.3 KiB of JavaScript (gzip).
  - [x] The Progress page at `/next/progress` (2026-10-23, [client/trainer/progress/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/trainer/progress/)): runs, best, median with its trend and days practiced over 7 days, 30 days or all time; the score per day (Recharts, loaded after the page); results per weapon; recent runs from a new run log (`game::runs`); CSV export.
  - [x] The Patterns page at `/next/patterns` (2026-10-24; the owner wants it in the first release): [client/trainer/patterns/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/trainer/patterns/) shows every weapon's pattern in a library filtered by class, all at one scale, and the selected one large with Play spray, its magazines and fire modes, and a link to practice it. Phones get the pattern viewer.
  - [x] 2.4 to 2.6, prerendering and consent (2026-10-23): each new page is rendered ahead of time in its language, with its own title and meta description ([server/prerender.mjs](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/server/prerender.mjs)), and hydrated in the browser, so it shows before its JavaScript runs. The consent banner works with the server's `site.json` values, Cookie settings and `#cookies` reopen it, and the Google tag loads only after Accept. `cn()` merges with tables compiled at build time (5.6 kB less JavaScript per page), and `pnpm test` checks the 200 kB first-load budget: 191.0 to 196.1 kB on the trainer, 176.6 to 181.8 kB on the Progress page.
  - [x] 2.7, the privacy policy, FAQ and changelog as pages (2026-10-24): `/privacy`, `/faq` and `/changelog` from Markdown in `docs/`, converted at build time ([scripts/markdown-plugin.mjs](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/scripts/markdown-plugin.mjs)); a new players' changelog (`docs/changelog.md`), and the original project's release history in `docs/history/` (ownership register, item 16).
  - [x] 2.8, the switch (2026-10-24): the pages serve `/`, `/ru` and `/zh-CN` with `/patterns` and `/progress` after each; `/next/...` redirects there; unknown addresses get a 404 page. The old trainer's templates, code, styles, Plotly, tarteaucitron, images and Google Fonts are deleted; the Recoil Editor self-hosts its fonts. Lighthouse runs in CI ([lighthouserc.json](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/lighthouserc.json)): 90 or more on the desktop profile, the phone profile recorded.
  - [ ] Once `siteUrl` is set: canonical and `hreflang` links on the pages.
  - Follow-ups:
    - [x] Bring the design artifacts in line with what the trainer added or changed (listed in the progress report): the pattern drawn as the path to follow, the Studio and support links, the settings and help dialogs, the ADS setting, the selected chip's count color, and artboards for the Patterns page, the documents and the 404 page. (2026-10-24: canvas version 20, also with the Studio's panels and dialogs; the support link stays off the artboards, since it shows only when `site.json` sets one.)
    - [x] Review of the Russian and Chinese strings written for the redesign (2026-10-24, by Claude at the owner's request).
- [x] **Phase 3: Recoil Editor** (2026-10-24): the Studio at `/editor` ([client/studio/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/studio/)), from the Studio artboard; `editor.pug`, the remaining CSS, `theme.json` and `client/modules/` are deleted.
  - [x] 3.1 The logic without a DOM, tested ([client/studio/model/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/studio/model/)): specs, calibration, the discrepancy report, placement, pattern editing, undo, the decal finder, the capture sequence as a reducer, analyses. The calibration and the report match results recorded from the Recoil Editor; the decal finder and the color correction match their originals.
  - [x] 3.2 to 3.4 The store (Zustand, under the editor's keys), the shell (top bar, icon rail, inspector, status bar, shortcuts, dialogs) and the canvas (react-konva: select, pan, align, correct and fit tools, the comparison, smooth dragging at the browser's frame rate).
  - [x] 3.5 The panels: Live capture, Screenshots, Manual, the library, sessions with clip import, discovery JSON import, the analysis' progress and result, the save checkpoint.
  - [x] 3.6 The switch: `/editor` serves the Studio; 14 scenarios replace the editor's 12 and its accessibility baseline.
  - [x] Fixed on the way: a save no longer renames the magazines' sounds, triples a single magazine or evens out the shot times (the Devotion's spin-up, the burst weapons); an edit without a screenshot no longer rescales a tall pattern; shots that weren't moved keep their exact values.
  - [ ] 3.7 Run the manual capture check ([docs/studio-capture-check.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/studio-capture-check.md)) with the game: it needs a person.
- [x] **Phase 4: Server and build** (2026-10-24): no pug, 404 for unknown paths, `app.js` split into routers, Express 5, multer 2, TypeScript with shared zod schemas.
  - [x] 4.1 No pug: the shells of the Studio and the gallery come from the server, and failed requests get a prerendered error page.
  - [x] 4.2 `createApp()` and routers ([server/routes/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/server/routes/)): specs, discovery, jobs, captures, pages; upload staging and errors in their own modules.
  - [x] 4.3 Express 5.3, multer 2.5, morgan 1.12; `cookie-parser`, `debug` and `http-errors` removed; `pnpm audit --prod` clean.
  - [x] 4.4 The server and its tests in TypeScript, run by Node without a build (`tsconfig.server.json` in `pnpm tsc`); the API's schemas in [shared/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/shared/), read by the server's routes.
  - [x] 4.5 `node:test` stays the server's test runner.
  - [x] The Redis, S3 and end-to-end analysis suites pass on the TypeScript server (`pnpm test:services`, 64/64).
  - [x] Dev-only advisories (`pnpm audit`): `minimatch`, `brace-expansion` and `picomatch` overridden to their fixed versions; `postcss-selector-parser` 6 under `@tailwindcss/typography` stays (fixed only in 7, build time only).
- [x] **Phase 5: Removal and lock-in** (2026-10-24): delete leftovers, CI guards for the Tailwind conventions, docs.
  - [x] 5.1 Unused dependencies and the four unused shadcn components deleted.
  - [x] 5.2 `pnpm lint` checks the UI's conventions ([scripts/check-conventions.mjs](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/scripts/check-conventions.mjs)), the Tailwind lint's rules are errors, and `pnpm release` ([scripts/check-release.mjs](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/scripts/check-release.mjs)) fails while placeholders remain; CI runs it for version tags.
  - [x] 5.3 The ownership register's items done, but for item 18 (the identifiers take the final name's slug).
  - [x] 5.4 README, AGENTS.md, contributing, roadmap and release notes.
  - [ ] Fill in the owner's values: `node scripts/check-release.mjs` lists the 47 placeholders (owner).

---

## 🔒 Verification & Quality Gates

Every code change in this repository MUST satisfy the following quality gates before merging:

1. **Python Unit Tests & Shadow Parity**:
   ```bash
   cd processing && python -m pytest tests
   python -m recoil_discovery.shadow_parity
   ```
   *Requirement: 43/43 pytest tests passing and 31/31 weapons at full-document parity (0 drift).*

2. **Schema Verification**:
   ```bash
   cd processing && python -m recoil_discovery.cli verify
   ```
   *Requirement: All 31 weapons pass array length, mag size, and RPM checks.*

3. **Node.js Automated Test Suites**:
   ```bash
   pnpm build && pnpm test
   ```
   *Requirement: 50/50 tests passing across database, job queue, storage, request parsing and API (the two bundle tests are skipped without a build). With `docker compose up -d`, `pnpm test:services` also runs the Redis, S3 and end-to-end suites (64/64).*

4. **TypeScript Typecheck**:
   ```bash
   pnpm tsc
   ```
   *Requirement: 0 type errors in the browser config (`tsconfig.json`), the tools config (`tsconfig.node.json`) and the server config (`tsconfig.server.json`).*

5. **Lint, Formatting and Unit Tests**:
   ```bash
   pnpm lint && pnpm format:check && pnpm test:unit
   ```
   *Requirement: 0 lint errors and 0 warnings, every file Prettier formatted, all Vitest tests passing.*

6. **End-to-End Scenarios**:
   ```bash
   pnpm build && pnpm test:e2e
   ```
   *Requirement: 59/59 Playwright scenarios passing in Chrome, with no accessibility violation on any page. The discovery scenarios need Python with the processing requirements; without them they are skipped locally and fail in CI.*

7. **Static Asset Build (Vite 8)**:
   ```bash
   pnpm build
   pnpm static
   ```
   *Requirement: Successful compilation of styles and route bundles, and of the static site.*

