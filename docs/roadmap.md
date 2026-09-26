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
| **M6: Weapon Arsenal Calibration** | 🟡 In Progress | Auto-capturing and updating remaining weapons with legacy `rpm: 0` in `specs.json`. |
| **M7: UI/Asset Polish** | ⚪ Planned | Dedicated artwork for Corrupted Mag, cleanup of remaining codebase TODOs. |
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
  - Web Audio API acoustic gunfire sensor with real-time decibel meter and customizable trigger sensitivity slider.
  - Automatic spray recording and auto-stop ~450ms post-firing.
  - Sample manager: embedded mini video players, 1-click sample discard, slot re-recording.
  - One-click session analysis calling `POST /api/discovery/process-session`.
- [x] **Web UI Weapon Manager**:
  - Live weapon parameter controls (RPM, multiplier, mag tiers 0–4) in `/editor`.
  - Backend REST API endpoints `GET /api/specs` and `POST /api/specs` in [app.js](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/app.js) with automatic `.bak` backups.
- [x] **Automated Recoil Discovery Engine**:
  - Python package in `processing/recoil_discovery/` covering homography stabilization, chronological decal differencing, acoustic RPM estimation, and multi-spray median-delta integration.
  - Complete CLI suite (`verify`, `process`, `batch`, `session`, `diff`, `export-arduino`).
  - 19 automated unit tests in `processing/tests/` with 100% pass rate.
- [x] **Server Port Resilience**:
  - EADDRINUSE automatic fallback from port 3000 to 3001 in [bin/www](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/bin/www).

---

### Milestone 6: Weapon Arsenal Calibration (Current Priority)
Several weapons in [client/specs.json](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/specs.json) have legacy placeholder values (`rpm: 0`) and need updated sprays captured and integrated:
- [ ] **Volt SMG**: Record 3–5 clean wall sprays in Firing Range, measure RPM, and update recoil coordinates.
- [ ] **Devotion LMG (Turbocharger)**: Update spin-up ramp rate and recoil curve.
- [ ] **Prowler Burst PDW**: Determine burst timing points and recoil pattern.
- [ ] **RE-45 Auto**: Record sprays, compute RPM and trajectory.
- [ ] **Rampage LMG**: Calibrate base and Revved Up fire rates.
- [ ] **C.A.R. SMG**: Calibrate recoil pattern and rate of fire.

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
