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
* **Analysis Confirmation & Tagging:**
  * Before analyzing any recording session or uploaded wall screenshot, the studio prompts an **Analysis Confirmation** dialog.
  * You can confirm or change the target **Weapon** and **Fire Mode** (preventing unintentional overwrites to the default R-99).
  * Choose whether to **Save capture to library** (`processing/captures/`). If loading a screenshot extracted from an existing video capture session, leave this unchecked to prevent duplicating files on disk while still performing full analysis and canvas overlay alignment.

---

## 2. In-Game Shooting & Recording Guidelines

To ensure pixel-accurate recoil extraction that aligns with Source Engine geometry:

### Sights & Optics
* **2x Bruiser (Recommended for 20m):** Select `2x` from the Optic dropdown in `/editor`. The system automatically scales the pattern by `1 / 2.0` so it converts cleanly to native 1x training coordinates.
* **1x (Iron Sights / 1x HCOG / 1x Holo):** Supported if shooting at closer distances (5–8m).
* *Note:* Higher magnification (3x, 4x) is also selectable in the studio if desired.

### Attachments
* **NO Barrel Stabilizer:** Stabilizers compress the recoil pitch/yaw cone and alter weapon kick patterns.
* **NO Stock:** Stocks alter weapon handling and aim drift.
* **Max Magazine (Purple L3 or Corrupted L4):** Equip the highest capacity magazine available so you capture the full spray trajectory in a single burst.

### Distance & Calibration
* **Stand 20 meters away** from the white target board in the Firing Range with a **2x Bruiser** scope.
  * *Why:* At closer ranges (<15m), high fire-rate bullet decals land nearly on top of each other and blend into single overlapping clusters. At 20m with a 2x optic, every individual bullet impact is clearly separated, sharp, and easy for the computer vision detector to isolate and sequence.
* Face the target board directly perpendicular ($90^\circ$) without angling your camera.
* Fire the full magazine **uncompensated without moving your mouse**.
* **Allow Reload to Finish, Then Re-enter ADS:** When the magazine empties, the gun auto-reloads and drops out of ADS. Let the reload animation finish (~2.5–3.5s), then right-click back into ADS and center your scope on the bullet decals. The studio's **Re-Aim Buffer** gives you 4.5s post-firing to do this, then snaps the crystal-clear wall screenshot automatically.

### 1:1 Recoil Game Scale Calibration & Muscle Memory
* In Apex Legends (Source engine), mouse input is measured in mickeys (counts) where 1 count $= 0.022^\circ \times \text{sensitivity}$.
* To cancel recoil, the counter-movement in mouse counts is directly proportional to angular viewangle kick.
* Decal pixels on a wall screenshot depend on camera FOV, optic magnification $Z$, and screen height $H_{\text{frame}}$. The camera focal length scales inversely with $\tan(\text{FOV} / 2)$:
  $$\text{fovFactor}(\text{FOV}) = \frac{\tan(45^\circ)}{\tan(\text{FOV} / 2)} = \frac{1}{\tan(\text{FOV} / 2)}$$
* At the standard competitive **FOV = 104°**, $\tan(52^\circ) \approx 1.28$, meaning decals on screen are visually $\approx 22\%$ smaller in pixels than at default 90° FOV:
  $$\text{mouse\_counts} = \left(\frac{\text{raw\_pixels}}{Z}\right) \times 3.36 \times \left(\frac{1080}{H_{\text{frame}}}\right) \times \tan\left(\frac{\text{FOV}}{2}\right)$$
* When overlaying a canonical spec on top of a screenshot captured at magnification $Z$, height $H_{\text{frame}}$, and field of view $\text{FOV}$:
  $$\text{screen\_pixels} = \left(\frac{\text{spec}}{\text{multiplier}}\right) \times \left(\frac{Z}{3.36}\right) \times \left(\frac{H_{\text{frame}}}{1080}\right) \times \left(\frac{1}{\tan(\text{FOV} / 2)}\right)$$
* This mathematical calibration ensures that specs in `client/specs.json` remain 100% true to the in-game mouse feel, while visual overlays in the `/editor` canvas align 1:1 with the screenshot bullet decals automatically without requiring manual slider guesswork. Both live and offline panels support configuring in-game FOV (defaulting to **104°**).

### HDR vs SDR Display Colors & Automated Tone-Mapping Fix
* **Why Captures Look Washed Out with Windows HDR / Auto HDR:**
  * When Windows HDR or Auto HDR is turned on, Apex Legends renders in high dynamic range (up to 1000 nits). When captured via WebRTC `getDisplayMedia` or standard screenshots, high luminance values get linearly clamped into standard 8-bit SDR ($[0, 255]$) without monitor tone-mapping.
  * This blows out midtones (elevating mean luminance over 190), turns concrete walls blindingly bright gray/white, and washes out color saturation.
* **Built-in HDR Color Correction (`☀️ Color`):**
  * Both the **In-Game Live Studio** and **Offline Screenshot** panels include an HDR color dropdown:
    * `☀️ HDR Fix (Natural)` (Default): Balanced tone mapping ($\gamma \approx 1.6$, exposure $0.85$, contrast $1.20$, saturation $1.25$). Restores true concrete textures and deep black bullet decals.
    * `☀️ HDR Fix (Vibrant)`: Deeper contrast and vivid colors ($\gamma \approx 1.75$, exposure $0.80$, contrast $1.30$, saturation $1.40$).
    * `Standard (SDR)`: Direct un-tone-mapped image, for users playing with Windows HDR disabled.
  * The fix applies in real time to the live video preview via GPU CSS filters and is baked directly into wall decal screenshots via Canvas 2D LUT processing.
  * Selecting a different mode in `/editor` re-renders the canvas background immediately without reloading the page or re-selecting files.

---

## 3. Hands-Free In-Game Auto-Capture Studio (Web UI)

Instead of manually recording clips with OBS or Shadowplay, chopping files, and running CLI commands, you can use the built-in **In-Game Auto-Capture Studio** right in your browser at `http://localhost:3000/editor` (or `:3001/editor`):

1. **Connect Apex Window:**
   * Open `/editor` in Chrome or Edge.
   * Use the **Recording Method Tabs** (`🎥 In-Game Live Studio`, `🖼️ Offline Screenshot`, `🎯 Manual / Legacy`) to select your preferred workflow. Unused methods are hidden to keep your workspace clean.
   * You can collapse the 380px sidebar at any time by clicking **`◀ Sidebar`** in the toolbar or pressing **`[M]`** on your keyboard to give the canvas full screen width.
   * Under **🎥 In-Game Auto-Capture Studio**, click **🔴 Connect Game Window**.
   * In the browser share dialog, select the **Apex Legends** window. Make sure to check **"Share system audio"** so gunfire can be detected acoustically!
   * Select your optic (e.g. **2x Bruiser**) and stand at **20 meters**.
2. **Hands-Free Spray Recording & Decoupled Capture:**
   * Tab into Apex Legends and aim at the center of the white target board.
   * Fire your weapon! The studio detects gunfire, records the audio/video to calculate RPM and weapon sound.
   * When firing stops, the **Re-Aim Buffer** countdown begins (default 4.5s).
   * Once your reload animation finishes, right-click to re-enter ADS and steady your crosshair on the bullet decals.
   * Tap **`[Spacebar]`** or click **`📸 Snap Wall & Finish`** to lock in the screenshot immediately, or simply hold still until the timer reaches zero!
3. **Inspect Samples Side-by-Side:**
   * Each sample card displays:
     * **Spray Video:** Left column showing the recorded clip and allowing you to check RPM or listen to the sound.
     * **Wall Screenshot:** Right column showing the high-res ADS decal screenshot used to extract the pattern.
   * **👁️ Canvas:** Project the wall screenshot directly onto the editor canvas to inspect how detected points align with decals.
   * **📷 Re-snap Wall:** If you weren't fully in ADS or want to re-aim, click *Re-snap Wall*. The studio starts a **3-second countdown with audio beeps** so you have ample time to tab back into the game and hold ADS before the shot is snapped.
   * **💾 Save Image:** Download and save the high-resolution wall screenshot to disk for your library or offline re-analysis.
   * **🔊 Audio:** Play the recorded gunfire sound (gunfire audio sensor automatically mutes during playback with a 1.5s echo-safety cooldown to prevent false recording triggers).
   * **🗑 Discard:** Discard bad sprays with a single click.
4. **Canvas Navigation & Dynamic Auto-Resize:**
   * **Dynamic Auto-Resize:** The canvas automatically computes available viewport space and scales the background wall screenshot and recoil pattern points smoothly to fit smaller laptop screens.
   * **Pan Canvas:** Right-click & drag, Middle-click & drag, Spacebar + drag, or toggle **✋ Pan Canvas** in the toolbar.
   * **Zoom Canvas:** Mouse wheel zooms in and out centered on your cursor.
   * **Fit & Center:** Click **🎯 Fit & Center** to reset canvas pan and zoom.
   * **Move All:** Toggle **✥ Move All (Align)** to shift all points simultaneously if you want to micro-align with the target board.
5. **One-Click Analysis & Spec Update:**
   * Click **⚡ Analyze Sprays & Calculate Recoil** (or **⚡ Analyze Screenshot(s)** in the Offline tab).
   * Captures are organized under `processing/captures/session_<weapon>_<mode>_<timestamp>/` containing companion video clips and high-res wall screenshots.
   * The backend runs **Target Board Isolation** and **Morphological Black Top-Hat Filtering** to isolate dark bullet decals while completely ignoring dark target frame pillars, vertical seams, and weapon sights.
   * Old patterns on the canvas are automatically cleared before plotting new sprays.
   * An inline **Discrepancy Health Check** badge appears on the results card (`🟢 Consistent`, `🟡 Moderate Drift`, or `🔴 Major Discrepancy Alert`), along with an **⚖️ Inspect Discrepancies** button.
   * Click **💾 Save to specs.json** (or press **Ctrl+S**) to trigger the **Spec Safety Verification Checkpoint**.
6. **Spec Safety Verification Checkpoint & Discrepancy Inspection:**
   * Before modifying `specs.json`, the editor opens the **Spec Safety Verification Checkpoint**:
     * **Shot Count Check:** Verifies total shots match the weapon magazine. Flags potential truncation (e.g. firing stopped early or magazine size mismatch) as **🚨 High Risk**.
     * **Mean Deflection Drift:** Checks average spatial variation across all coordinate points.
     * **Outlier Deflection Spikes:** Highlights any individual shots drifting more than $25\text{px}$ from baseline.
     * **Recoil Direction Inversion:** Detects if any shot moves in the opposite cardinal direction compared to canonical spec.
     * **Safety Score:** Displays an overall risk badge (`🛡️ SAFE TO SAVE`, `⚠️ MODERATE DRIFT`, or `🚨 HIGH RISK`).
7. **Dual Comparison Overlay & Real-Time Discrepancy HUD:**
   * Toggle **⚖️ Compare** in the stage toolbar, select **Overlay Comparison** in the View dropdown, or press **`O`** on your keyboard:
     * **Saved Spec (Cyan Dashed):** Renders the existing baseline spec from `specs.json`.
     * **Candidate Spec (Orange Solid):** Renders the newly analyzed or edited recoil curve.
     * **Delta Vectors:** Color-coded connecting lines illustrate per-shot drift:
       * **Green ($<8\text{px}$):** Tight consistency.
       * **Amber ($8\text{--}20\text{px}$):** Normal spray variance or minor crosshair offset.
       * **Red ($>20\text{px}$):** Significant anomaly or misdetected decal, annotated with pixel delta labels.
     * **Floating Discrepancy HUD:** Displays real-time summary statistics on-canvas, including shot count agreement, mean deviation, and maximum delta.
8. **Incremental Proportional Spec Accumulation vs Overwrite:**
   * **Proportional Accumulation (Recommended for refining specs):**
     * Blends candidate recordings into the existing pattern weighted by total sample count:
       $$\vec{P}_{\text{combined}} = \frac{N \cdot \vec{P}_{\text{baseline}} + M \cdot \vec{P}_{\text{candidate}}}{N + M}$$
     * Each new spray incrementally reduces noise and variance without wiping out established ground-truth data.
   * **Complete Overwrite (Post-Patch Re-calibration):**
     * Replaces the canonical spec entirely with the candidate curve. Recommended when Respawn publishes a balance update modifying a weapon's recoil pattern.
9. **Loading Past Sessions & Importing Local Clips:**
   * Under **Past Recording Sessions** in the Live Studio, choose any past session from the dropdown and click **📥 Load Session**.
   * The studio fetches the session's recorded `.webm` videos, audio, and companion wall screenshots directly into the sample cards.
   * You can inspect, re-snap, or click **⚡ Analyze Sprays & Calculate Recoil** to re-analyze historical sessions at any time!
   * To import local video files from your disk, click **📁 Import Local Video(s)**. You can select multiple `.webm` or `.mp4` recordings along with companion wall `.jpg` / `.png` screenshots.
10. **Batch Wall Screenshot Analysis & Stage Carousel Navigation:**
   * Switch to the **🖼️ Offline Screenshot** tab to analyze saved wall screenshots in batches.
   * **Choose Image(s) (Multi-Select):** Select multiple screenshots from disk at once.
   * **Server Screenshots Library:** Choose any saved screenshot from `processing/captures/` and click **📥 Add to Batch**.
   * Each loaded image appears as a card in the **Loaded Screenshots** tray with a live status badge (`Ready`, `Analyzing...`, `N shots`) and remove button.
   * Click **⚡ Analyze Screenshot(s)** to run the batch discovery pipeline (`process_images_session`).
   * **Fast Stage Carousel Navigation:**
     * Use the **`◀ Prev`** and **`Next ▶`** buttons in the stage toolbar or press **`[`** / **`]`** on your keyboard to instantly flip through screenshots on the canvas.
     * Use the **View** dropdown to inspect individual spray decal detections, view the median aggregated spec across the batch, or overlay the saved canonical spec from `specs.json`.

---

## 4. Automated CLI Discovery Pipeline (Optional Headless)

```bash
# 1. Verify schema and integrity of specs.json
python -m recoil_discovery.cli verify

# 2. Process a single video clip (auto-measures RPM and shots)
python -m recoil_discovery.cli process --input clip.mp4 --weapon r301

# 3. Batch process multiple clips, compute median-delta recoil, and generate patch diff plot
python -m recoil_discovery.cli batch --dir ./recordings/r301/ --weapon r301 --plot

# 4. Process an Auto-Capture Studio session with proportional accumulation or overwrite
python -m recoil_discovery.cli session --dir ./captures/session_r301_auto_12345/ --weapon r301 --strategy accumulate --existing-samples 5

# 5. Commit changes directly into specs.json once satisfied
python -m recoil_discovery.cli batch --dir ./recordings/r301/ --weapon r301 --update

# 6. Export to Arduino mouse hardware table (optional)
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
