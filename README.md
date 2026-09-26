# Apex Legends Recoil Trainer & Discovery Toolkit

Live site: [https://apexlegendsrecoils.net](https://apexlegendsrecoils.net)

An interactive recoil pattern visualization, muscle memory trainer, and automated discovery toolkit for [Apex Legends](https://www.ea.com/games/apex-legends).

---

## Key Features

1. **Interactive Recoil Trainer (`/`)**:
   - Practice full spray recoil control against animated targets with live scoring and hit rate analytics.
   - Complete weapon arsenal with attachment options:
     - **Magazines**: Base (L0), White (L1), Blue (L2), Purple/Gold (L3), and the new **Corrupted Magazine (Tier 4 / Red)**.
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
   - **Acoustic Gunfire Sensor**: Real-time decibel monitor automatically triggers recording when you pull the trigger in the Firing Range, and automatically stops when your magazine empties.
   - **Sample Management**:
     - Embedded video preview player for every captured spray.
     - **🗑 Discard** flubbed sprays or accidental mouse movements.
     - **🔄 Re-record** any specific sample slot.
     - Collect unlimited samples (3 to 5 recommended for statistical convergence).
   - **⚡ 1-Click Discovery**: Uploads clips to the backend pipeline, extracts bullet decals, measures RPM, and renders the updated recoil trajectory on the canvas.

4. **Automated Computer Vision Engine (`processing/recoil_discovery`)**:
   - Python-based pipeline for zero-guesswork recoil discovery from video clips.
   - Automatic acoustic and visual rate of fire (RPM) measurement ($\text{RPM} = 60000 / \text{median}(\Delta t_{\text{ms}})$).
   - Camera homography stabilization and chronological bullet decal tracking.
   - Multi-spray median-delta integration and convergence scoring ($rc\_score$).
   - Comprehensive test suite with 19 automated unit tests.

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
* **Optics:** Use **Iron Sights** or standard **1x (HCOG Classic / 1x Holo) ONLY**. Never equip 2x, 3x, or 4x scopes (magnification alters FOV, ADS scaling, and decal spacing).
* **Attachments:** **NO barrel stabilizer** (stabilizers reduce recoil spread), **NO stock**. Equip maximum magazine (Level 3 or Corrupted L4) to capture the complete continuous spray.
* **Distance:** Stand **10 to 15 meters** away, facing perpendicular ($90^\circ$) to a flat, clean wall.
* **Firing:** Fire the full magazine **without moving your mouse**.

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
* [Code of Conduct](./docs/code-of-conduct.md)
* [Release Notes](./docs/release-notes.md)
* [Recoil Discovery Guide](./docs/capture.md)

---

## License & Disclaimers

Source code is licensed under [Apache 2.0](./LICENSE).

*This project is not affiliated with or sponsored by Electronic Arts Inc., Respawn Entertainment, or Google.*

### Assets
Images, weapon names, audio clips, and behavior come from Apex Legends or websites owned by [Electronic Arts Inc.](https://ea.com) or [Respawn Entertainment](https://www.respawn.com/). Multimedia content from [assets](./assets) is **NOT** licensed under Apache 2.0.
