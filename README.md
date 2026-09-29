# Apex Legends Recoil Trainer & Discovery Toolkit

Live site: [https://apexlegendsrecoils.net](https://apexlegendsrecoils.net)

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
   - Live canvas preview of recoil curves.
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
   - Comprehensive test suite with 22 automated unit tests.

---

## Running Locally

### 1. Prerequisites
* **Node.js** (v18+ recommended) & **npm** / **pnpm**
* **Python 3.10+** (for the automated discovery engine)

### 2. Frontend & Web Server
From the repository root:
```bash
# Install dependencies
pnpm install  # or: npm install

# Build assets
pnpm tsc
npx gulp public

# Start development server
npm run dev
```

Open your browser to:
* Recoil Trainer: **`http://localhost:3000/`**
* Recoil Editor & Auto-Capture Studio: **`http://localhost:3000/editor`**

> **Note on Port Collisions:** If port 3000 is already in use by another local process, the server automatically retries and binds to **`http://localhost:3001`**.

### 3. Python Recoil Discovery Pipeline
From the `processing/` directory:
```bash
cd processing

# Install dependencies
pip install -r requirements.txt

# Run automated test suite
python -m pytest tests

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

Detailed documentation is available in [docs/capture.md](./docs/capture.md).

---

## Static Production Deployment

Deployment is fully static:
```bash
npm run static
```
Copy the contents of `./static` to your web server directory (e.g. Nginx / Apache / S3).

---

## Contributing & Community

Contributions, balance patch updates, and recoil submissions are welcome!
* [Contributing Guidelines](./docs/contributing.md)
* [Implementation Plan & Roadmap](./docs/roadmap.md)
* [Live Weapons Wiki & Patch Reference](./docs/weapons-wiki-stats.md)
* [AI Agent Guidelines](./AGENTS.md)
* [Release Notes](./docs/release-notes.md)
* [Recoil Discovery Guide](./docs/capture.md)

---

## License & Disclaimers

Source code is licensed under [Apache 2.0](./LICENSE).

*This project is not affiliated with or sponsored by Electronic Arts Inc., Respawn Entertainment, or Google.*

### Assets
Images, weapon names, audio clips, and behavior come from Apex Legends or websites owned by [Electronic Arts Inc.](https://ea.com) or [Respawn Entertainment](https://www.respawn.com/). Multimedia content from [assets](./assets) is **NOT** licensed under Apache 2.0.
