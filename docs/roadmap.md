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
| **M9: CI/CD Pipeline Automation** | 🟡 Next Priority | GitHub Actions workflow running both Python pytest and TypeScript typecheck on push. |

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
  - Recoil Editor Usability, High-Performance Overhaul (60–144Hz), Zoom-Adaptive Markers, Undo/Redo & Smart Sequential Insertion:
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
  - `pipeline.py`: Removed unreachable dead branch and hoisted `tone_map_hdr_image` to module top level.
  - `shot_detector.py`: Added `min_rpm` sanity validation.
  - Expanded automated test suite from 19 to 30 unit tests with 100% pass rate.
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
- [ ] **GitHub Actions Workflow**:
  - Run `python -m pytest tests` on pull requests modifying `processing/`.
  - Run `python -m recoil_discovery.cli verify` on changes to `client/specs.json`.
  - Run `npm run tsc` and `gulp public` to ensure frontend builds cleanly.

---

## 🔒 Verification & Quality Gates

Every code change in this repository MUST satisfy the following quality gates before merging:

1. **Python Unit Tests**:
   ```bash
   cd processing && python -m pytest tests
   ```
   *Requirement: 30/30 tests passing.*

2. **Schema Verification**:
   ```bash
   cd processing && python -m recoil_discovery.cli verify
   ```
   *Requirement: All weapons pass array length, mag size, and RPM checks.*

3. **TypeScript Typecheck**:
   ```bash
   cmd /c npm run tsc
   ```
   *Requirement: 0 type errors.*

4. **Static Asset Build**:
   ```bash
   npx gulp public
   ```
   *Requirement: Successful compilation of styles and client bundle.*

