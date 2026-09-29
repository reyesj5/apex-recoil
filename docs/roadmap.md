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
| **M5: Python Recoil Discovery Engine** | ✅ Completed | Zero-guesswork computer vision and signal processing engine with 19 passing unit tests. |
| **M6: Weapon Arsenal & Attachments** | ✅ Completed | All 31 Apex weapons supported with official SVGs, 5-tier specs, and Corrupted Stock attachment. |
| **M7: UI/Asset Polish** | 🟡 Next Priority | Dedicated artwork for Corrupted Mag, cleanup of remaining codebase TODOs. |
| **M8: CI/CD Pipeline Automation** | ⚪ Planned | GitHub Actions workflow running both Python pytest and TypeScript typecheck on push. |

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
  - 1:1 Recoil Game Scale Calibration & True Muscle Memory Guarantee: calibrated canvas overlay mapping ($\text{px} = \frac{\text{spec}}{\text{mult}} \times \text{zoom}$) and upgraded `havoc_tc` in `client/specs.json` with authentic 36-round recoil and `"multiplier": 0.73`, guaranteeing identical in-game mouse counter-aiming.
  - One-click session analysis calling `POST /api/discovery/process-session`.
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

### Milestone 7: UI & Asset Polish
- [ ] **Custom Corrupted Magazine Graphic**: Create a distinctive Tier 4 / Red magazine icon in `assets/images/` to replace the CSS-tinted `magi.png`.
- [ ] **Codebase Cleanup**:
  - Review and resolve `TODO` in [client/game.ts](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/game.ts#L368) (argument passing).
  - Review and resolve `TODO` in [client/game.ts](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/game.ts#L956) (multi-attribute watcher).
  - Review and resolve `TODO` in [client/editor.ts](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts#L94) & [L311](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts#L311) (anchor length warning).

---

### Milestone 8: CI/CD Pipeline Automation
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
   *Requirement: 19/19 tests passing.*

2. **Schema Verification**:
   ```bash
   cd processing && python -m recoil_discovery.cli verify
   ```
   *Requirement: All weapons pass array length, mag size, and RPM checks.*

3. **TypeScript Typecheck**:
   ```bash
   npm run tsc
   ```
   *Requirement: 0 type errors.*

4. **Static Asset Build**:
   ```bash
   npx gulp public
   ```
   *Requirement: Successful compilation of styles and client bundle.*
