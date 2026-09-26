# Apex Legends Recoil Discovery & Management Guide

This project provides two complementary ways to discover, update, and manage weapon recoils:
1. **Web UI Weapon Manager & Editor** (`/editor`): An interactive visual interface to quickly edit weapon magazine sizes, RPM, recoil curves, and persist directly to `client/specs.json`.
2. **Automated Video Discovery Pipeline** (`processing/recoil_discovery`): An automated computer vision engine that measures RPM, shot count, and recoil trajectories directly from gameplay video clips without manual guesswork.

---

## 1. Web UI Weapon Manager (Quick Edits & Visual Preview)

When a gun gets a balance update (e.g. mag size changed, RPM tweaked) or you want to adjust weapon specs directly in your browser:

### Running Locally
1. Start the development server:
   ```bash
   npm run dev
   ```
2. Open your browser to: **`http://localhost:3000/editor`**

### What You Can Do in the UI
* **Select Any Weapon:** Choose any weapon from the dropdown list (R-301, Flatline, R-99, Havoc, etc.).
* **Instant Recoil Visualization:** The exact recoil trajectory is automatically plotted on the canvas.
* **Quickly Edit Weapon Parameters:**
  * **RPM**: Adjust the fire rate. The UI automatically displays the millisecond interval per shot ($\Delta t = 60000 / \text{RPM}$).
  * **Multiplier**: Fine-tune the recoil sensitivity multiplier.
  * **Magazine Sizes (Tiers 0 – 4)**:
    * **Base** (Tier 0)
    * **White L1** (Tier 1)
    * **Blue L2** (Tier 2)
    * **Purple/Gold L3** (Tier 3)
    * **Corrupted L4** (Tier 4 / Red)
* **Save with One Click:**
  * Click **💾 Save to specs.json**.
  * The backend API automatically recalculates the firing `time_points`, saves the updated data to `client/specs.json`, and creates a backup (`client/specs.json.bak`).
* **Paste / Import Discovery JSON:**
  * Expand the *Paste / Import Discovery JSON* drawer, paste output from the automated discovery CLI, and click **Apply to Selected Weapon**.

---

## 2. In-Game Shooting & Recording Guidelines

To ensure pixel-accurate recoil extraction that aligns with Source Engine geometry:

### Sights & Optics
* **Iron Sights or standard 1x (HCOG Classic / 1x Holo) ONLY.**
* **Do NOT equip 2x, 3x, 4x, or higher magnification optics.**
  * *Why:* Scopes zoom the Field of View (FOV) and scale your mouse input by the game's per-optic ADS sensitivity slider. Magnification also visually stretches the decal pattern on screen. The recoil trainer is calibrated for base 1x / iron sights.

### Attachments
* **NO Barrel Stabilizer:** Stabilizers compress the recoil pitch/yaw cone and alter weapon kick patterns.
* **NO Stock:** Stocks alter weapon handling and aim drift.
* **Max Magazine (Purple L3 or Corrupted L4):** Equip the highest capacity magazine available so you capture the full spray trajectory in a single burst.

### Distance & Angle
* **Stand 10 to 15 meters away** from a clean, flat wall in the Firing Range.
  * *Why:* If you are too close (< 5m), high-climb weapons (Havoc, Flatline) will climb off the top of your screen. If you are too far (> 25m), random spread cone, bullet drop, and tiny decals introduce measurement error. At 10–15m, the entire spray fits squarely in view, bullet drop is zero, and decals are crisp.
* Face the wall directly perpendicular ($90^\circ$) without angling your camera.
* Fire the full magazine **without moving your mouse**.

---

## 3. Hands-Free In-Game Auto-Capture Studio (Web UI)

Instead of manually recording clips with OBS or Shadowplay, chopping files, and running CLI commands, you can use the built-in **In-Game Auto-Capture Studio** right in your browser at `http://localhost:3000/editor` (or `:3001/editor`):

1. **Connect Apex Window:**
   * Open `/editor` in Chrome or Edge.
   * Under **🎥 In-Game Auto-Capture Studio**, click **🔴 Connect Game Window**.
   * In the browser share dialog, select the **Apex Legends** window. Make sure to check **"Share system audio"** so gunfire can be detected acoustically!
   * A live video monitor and decibel meter will appear.
2. **Hands-Free Spray Recording:**
   * Tab into Apex Legends and aim at the wall.
   * Fire your weapon! The studio detects the audio transient of gunfire, begins recording, and stops automatically ~450ms after the magazine finishes.
   * Each spray is immediately added to your **Collected Samples** list.
3. **Preview, Discard & Re-record:**
   * **Preview Playback:** Each sample card has a mini video player so you can inspect the spray and check if you accidentally nudged your mouse.
   * **🗑 Discard:** If a spray was flubbed or hit an edge, click *Discard* to delete it from the batch.
   * **🔄 Re-record:** Click *Re-record* on any sample to mark that specific slot to be replaced on your next spray.
   * **Unlimited Samples:** Collect as many sprays as you want (recommend 3 to 5 for statistical convergence).
4. **One-Click Analysis & Spec Update:**
   * Click **⚡ Analyze Sprays & Calculate Recoil**.
   * The clips are sent to the Python pipeline, which stabilizes camera motion, tracks bullet decals frame-by-frame, measures RPM, and computes the median-delta recoil curve.
   * The discovered curve is instantly plotted on the Konva canvas, and RPM / stats are pre-filled in the editor.
   * Click **💾 Save to specs.json** to commit the new pattern directly to the trainer!

---

## 4. Automated CLI Discovery Pipeline (Optional Headless)

```bash
# 1. Verify schema and integrity of specs.json
python -m recoil_discovery.cli verify

# 2. Process a single video clip (auto-measures RPM and shots)
python -m recoil_discovery.cli process --input clip.mp4 --weapon r301

# 3. Batch process multiple clips, compute median-delta recoil, and generate patch diff plot
python -m recoil_discovery.cli batch --dir ./recordings/r301/ --weapon r301 --plot

# 4. Commit changes directly into specs.json once satisfied
python -m recoil_discovery.cli batch --dir ./recordings/r301/ --weapon r301 --update

# 5. Export to Arduino mouse hardware table (optional)
python -m recoil_discovery.cli export-arduino
```

---

## 5. How to Know What Changed in a Patch

When Apex Legends releases a balance patch:
1. **Automatic Measurement from Video:** Record 2–3 sprays of the changed gun in the Firing Range and pass the folder to `batch` or use the Web UI Auto-Capture Studio. The tool prints:
   ```
   [+] Video Analysis: Auto-measured 31 shots at 780.5 RPM (Pre-patch: 810.0 RPM)
   ```
2. **Patch Diff Inspection:** The CLI compares the new curve against current `specs.json` and prints:
   ```
   ============================================================
   PATCH DIFF REPORT: R301
   ============================================================
   Status:         UPDATED
   Summary:        Recoil pattern modified (mean deviation: 12.4 px, peak: 24.1 px at shot #16); Rate of fire changed from 810 to 780.5 RPM
   ============================================================
   ```
   And saves `diff_r301.png` showing a side-by-side plot of the old vs. new recoil trajectory.
3. **Official Patch Notes / Wiki:** Respawn's seasonal patch notes and the [Apex Legends Wiki](https://apexlegends.fandom.com/wiki/Weapons) also list explicit stat changes (e.g. "R-99 magazine capacity reduced to 28"). You can quickly punch these numbers into the Web UI at `/editor`.

---

## 6. Legacy Manual Method
For manual coordinate extraction using Avidemux and static screenshot cropping:
1. Crop the bullet hole pattern from a video frame.
2. Scope in with a 4–8x sniper scope on two distant points, noting `pitch` and `yaw` from `+cl_showpos 1`.
3. In `processing/recoils.ipynb`, calculate angular pixel distance: `points(pitch1, yaw1, pitch2, yaw2)`.
4. In `/editor`, use the *Image Pattern Extraction* section to load the screenshot, set thresholds, connect anchor points, and export raw coordinates.
