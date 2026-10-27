# Apex Legends Recoil Discovery & Management Guide

This project provides two complementary ways to discover, update, and manage weapon recoils:
1. **The Studio** (`/editor`): An interactive visual interface to record sprays, analyze them, edit weapon magazine sizes, RPM and recoil curves, and save them to the spec database and `client/specs.json`.
2. **Automated Video Discovery Pipeline** (`processing/recoil_discovery`): An automated computer vision engine that measures RPM, shot count, and recoil trajectories directly from gameplay video clips without manual guesswork.

---

## 1. The Studio (Quick Edits & Visual Preview)

When a gun gets a balance update (e.g. mag size changed, RPM tweaked) or you want to adjust weapon specs directly in your browser:

### Running Locally
1. Start the development server:
   ```bash
   pnpm dev
   ```
2. Open your browser to: **`http://localhost:3000/editor`** (the Studio; the trainer's top bar links to it).

### What You Can Do in the UI
* **Pick Any Weapon:** the weapon button in the top bar lists every spec by class, with a search field (R-301, Flatline, R-99, Havoc, etc.), and **New weapon…** adds one.
* **Instant Recoil Visualization:** the pattern is drawn on the canvas, shot 0 in cyan. Without a screenshot it is drawn in the spec's own units; on a screenshot, at the image's scale (see section 2).
* **Edit the Pattern on the Canvas:** the tools on the left of the canvas: **Select** (V) drags shots, a right click removes one and a middle click marks an anchor; **Correct shots** (C) adds a shot where you click, at the place in the sequence it fits; **Align** (A) moves the whole spray onto the wall decals; **Pan** (H, or hold Space) and the mouse wheel move and zoom; **Fit** (F) shows everything. Ctrl Z and Ctrl Y undo and redo.
* **Quickly Edit Weapon Parameters** (the inspector, right of the canvas):
  * **Fire rate**: the shot interval follows ($\Delta t = 60000 / \text{RPM}$), and the shot times move with it: even times stay even, and a spin-up or burst timing keeps its shape.
  * **Multiplier**: Fine-tune the recoil sensitivity multiplier.
  * **Magazine sizes**: Base, Lv 1, Lv 2, Lv 3 and Corrupted. Each magazine keeps its sound; a tier is added after the last one (it takes the sound of the one below) and cleared from the last.
  * **Samples**: how many sprays the pattern is the median of, with a reset to 1 after a balance patch.
* **Save** (**Save spec**, or Ctrl S):
  * A changed pattern, or one from an analysis, goes through the save checkpoint first (section 3, step 6). Only what was edited changes: the sounds, the other magazines and the shot times stay as they were.
  * The server saves the spec as a new version in the database and in `client/specs.json`; the inspector's **History** lists the versions. The top bar shows **Unsaved changes** until then, and **Discard unsaved changes** goes back to the saved spec.
* **Import Discovery JSON:** the **Import** section takes the output of the discovery CLI (`process --json`) or a spec, and applies its pattern, fire rate, shot times and magazines to the selected weapon.
* **Analysis Confirmation & Tagging:**
  * Before analyzing recorded sprays or wall screenshots, the Studio asks to confirm the **Weapon** and **Fire mode** and how the result goes into the spec (blended, or a new baseline).
  * **Keep the files in the captures** saves them to the library (`processing/captures/`, or the S3 bucket when the server runs with `STORAGE_PROVIDER=s3`). It is on for recorded sprays and off for screenshots; leave it off for a screenshot taken from a saved session, so the files aren't duplicated.

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
* **Allow Reload to Finish, Then Re-enter ADS:** When the magazine empties, the gun auto-reloads and drops out of ADS. Let the reload animation finish (~2.5–3.5s), then right-click back into ADS and center your scope on the bullet decals. The Studio's **Reload and re-aim time** gives you 4.5 s after firing to do this, then captures the crystal-clear wall screenshot automatically.

### 1:1 Recoil Game Scale Calibration & Muscle Memory
* In Apex Legends (Source engine), mouse input is measured in mickeys (counts) where 1 count $= 0.022^\circ \times \text{sensitivity}$.
* To cancel recoil, the counter-movement in mouse counts is directly proportional to angular viewangle kick.
* Decal pixels on a wall screenshot depend on camera FOV, optic magnification $Z$, and screen height $H_{\text{frame}}$. The camera focal length scales inversely with $\tan(\text{FOV} / 2)$:
  $$\text{fovFactor}(\text{FOV}) = \frac{\tan(45^\circ)}{\tan(\text{FOV} / 2)} = \frac{1}{\tan(\text{FOV} / 2)}$$
* At the standard competitive **FOV = 104°**, $\tan(52^\circ) \approx 1.28$, meaning decals on screen are visually $\approx 22\%$ smaller in pixels than at default 90° FOV:
  $$\text{mouse\_counts} = \left(\frac{\text{raw\_pixels}}{Z}\right) \times 3.36 \times \left(\frac{1080}{H_{\text{frame}}}\right) \times \tan\left(\frac{\text{FOV}}{2}\right)$$
* When overlaying a canonical spec on top of a screenshot captured at magnification $Z$, height $H_{\text{frame}}$, and field of view $\text{FOV}$:
  $$\text{screen\_pixels} = \left(\frac{\text{spec}}{\text{multiplier}}\right) \times \left(\frac{Z}{3.36}\right) \times \left(\frac{H_{\text{frame}}}{1080}\right) \times \left(\frac{1}{\tan(\text{FOV} / 2)}\right)$$
* This mathematical calibration ensures that specs in `client/specs.json` remain 100% true to the in-game mouse feel, while visual overlays in the `/editor` canvas align 1:1 with the screenshot bullet decals automatically without requiring manual slider guesswork. The Setup card, shared by the Live and Screenshots tabs, sets the in-game FOV (defaulting to **104°**). Once an analysis has found the decals, the overlay uses the scale the decals measure instead; the inspector's **Visual scale** fine-tunes the optic's scale where there are none.

### HDR vs SDR Display Colors & Automated Tone-Mapping Fix
* **Why Captures Look Washed Out with Windows HDR / Auto HDR:**
  * When Windows HDR or Auto HDR is turned on, Apex Legends renders in high dynamic range (up to 1000 nits). When captured via WebRTC `getDisplayMedia` or standard screenshots, high luminance values get linearly clamped into standard 8-bit SDR ($[0, 255]$) without monitor tone-mapping.
  * This blows out midtones (elevating mean luminance over 190), turns concrete walls blindingly bright gray/white, and washes out color saturation.
* **Built-in HDR Color Correction:**
  * The Setup card's **Color correction** applies to the live preview, the captured walls and the screenshots:
    * `HDR fix (natural)` (Default): Balanced tone mapping ($\gamma \approx 1.6$, exposure $0.85$, contrast $1.20$, saturation $1.25$). Restores true concrete textures and deep black bullet decals.
    * `HDR fix (vibrant)`: Deeper contrast and vivid colors ($\gamma \approx 1.75$, exposure $0.80$, contrast $1.30$, saturation $1.40$).
    * `None (SDR)`: Direct un-tone-mapped image, for users playing with Windows HDR disabled.
  * The fix applies in real time to the live video preview via GPU CSS filters and is baked directly into wall decal screenshots via Canvas 2D LUT processing.
  * Changing it re-renders the canvas' screenshot immediately without reloading the page or re-selecting files, and the choice is remembered.

---

## 3. Hands-Free In-Game Auto-Capture (the Studio's Live tab)

Instead of manually recording clips with OBS or Shadowplay, chopping files, and running CLI commands, you can record sprays right in your browser at `http://localhost:3000/editor` (or `:3001/editor`), in the **Capture** section's **Live** tab. Screen capture can't run in automated tests, so [studio-capture-check.md](studio-capture-check.md) checks this part by hand.

1. **Connect the Apex Window:**
   * Open `/editor` in Chrome or Edge. The Capture section has three tabs: **Live** (this), **Screenshots** (step 10) and **Manual** (section 6). The tab is remembered.
   * **M** hides or shows the Capture panel and **E** the inspector, to give the canvas the screen's width.
   * Set the **Setup** card: distance (20 m), field of view (104°), optic (2× Bruiser) and color correction (section 2). It is remembered, and the Screenshots tab shares it.
   * Click **Connect game window**, select the **Apex Legends** window in the browser's dialog and check **"Share system audio"** so gunfire can be detected acoustically. **Audio input** can take a microphone or line-in instead, and **Reconnect** recovers from Windows changing the output device.
2. **Hands-Free Spray Recording & Decoupled Capture:**
   * Tab into Apex Legends and aim at the center of the white target board.
   * Fire your weapon! The gunfire sensor starts the recording at the first shot (its **Trigger level** sets how loud a shot must be), so the clip carries the fire rate and the weapon's sound.
   * When firing stops, the **Reload and re-aim time** counts down (4.5 s by default); a burst weapon's next burst carries on recording.
   * Once your reload animation finishes, right-click to re-enter ADS and steady your crosshair on the bullet decals.
   * Press **Space** or click **Snap wall** to capture the wall at once, or hold still until the count reaches zero. **Record a spray by hand** starts and finishes a recording without the sensor. A spray stops by itself after 20 s.
3. **Inspect the Samples:**
   * Each sample card shows the recorded clip (to check the fire rate or listen to it) and the wall screenshot the pattern is measured from, with these actions:
   * **Show on the canvas:** the wall on the canvas with the weapon's pattern over it.
   * **Capture the wall again:** a **3-second countdown with beeps** gives you time to tab back into the game and hold ADS before the wall is captured.
   * **Save the wall image:** downloads the high-resolution wall screenshot.
   * **Play the sound:** the gunfire sensor stays muted while a sample plays, and 1.5 s after, so a playback doesn't start a recording.
   * **Enlarge**, **Record this spray again** (the next recording replaces it) and **Discard**.
4. **Canvas Navigation:**
   * The canvas fits the screenshot or the pattern to the space it has, and fits again when a panel opens or closes, until you zoom or pan.
   * **Pan:** the Pan tool (H), holding Space, or dragging with the right or middle button. **Zoom:** the mouse wheel, around the pointer, or the zoom control. **Fit** (F) shows everything again.
   * **Align** (A) moves the whole spray to line it up with the decals.
5. **One-Click Analysis & Spec Update:**
   * Click **Analyze the sprays** (or **Analyze N screenshots** in the Screenshots tab), and confirm.
   * Captures are organized under `processing/captures/session_<weapon>_<mode>_<timestamp>/` containing companion video clips and high-res wall screenshots.
   * The backend runs **Target Board Isolation** and **Morphological Black Top-Hat Filtering** to isolate dark bullet decals while completely ignoring dark target frame pillars, vertical seams, and weapon sights.
   * The progress shows each stage, then the result: the shots found (against a full magazine), the measured fire rate, the convergence, how the samples went into the spec, and a check against the saved spec (**Consistent**, **Moderate drift** or **Major discrepancy**). The weapon's spec takes the measured pattern, and the canvas shows the first spray's frame with the pattern over its decals.
   * A spray that found fewer shots than a full magazine is counted on the canvas (31/33 shots); **Correct shots** (C) adds the missing ones where you click.
   * Click **Save spec** (or press **Ctrl S**) to go through the save checkpoint.
6. **The Save Checkpoint:**
   * Before a changed or analyzed pattern replaces the saved spec, the Studio shows how far it strays:
     * **Shot count:** the candidate's shots against the saved spec's; fewer shots shorten the pattern (a red flag).
     * **Average stray:** how far a shot lands from its saved place, on average, in image pixels and mouse counts.
     * **Largest stray:** the shot that lands farthest from its saved place.
     * **Warnings:** a shortened pattern, extra shots, a large average or single stray, and a pattern running the other way up from the saved one (camera tracking).
     * An overall verdict: the pattern matches, drifts, or differs a lot. **Inspect on the canvas** opens the comparison instead of saving.
7. **The Comparison:**
   * **Compare spec with candidate** in the inspector, or **O**:
     * **Saved spec** (dashed): the pattern as saved.
     * **Candidate** (volt): on a screenshot, the decals the analysis found, then the candidate's later shots.
     * **Strays:** a line from each saved shot to the candidate's, cyan under 10 px, amber to 22 px, red beyond, with the length written next to the longest.
     * The figures (shots, average and largest stray, the verdict and the warnings) float in the canvas' corner.
   * **Shown pattern** in the inspector also shows the saved spec, the new samples alone (when they were blended), or the decals found on the current spray.
8. **Incremental Proportional Spec Accumulation vs Overwrite:**
   * **Blend into the spec (Recommended for refining specs):**
     * Blends candidate recordings into the existing pattern weighted by total sample count:
       $$\vec{P}_{\text{combined}} = \frac{N \cdot \vec{P}_{\text{baseline}} + M \cdot \vec{P}_{\text{candidate}}}{N + M}$$
     * Each new spray incrementally reduces noise and variance without wiping out established ground-truth data.
   * **Start a new baseline (Post-Patch Re-calibration):**
     * Replaces the canonical spec entirely with the candidate curve. Recommended when Respawn publishes a balance update modifying a weapon's recoil pattern.
9. **Loading Past Sessions & Importing Local Clips:**
   * The **Sessions** section lists the saved sessions (weapon, fire mode, sprays, and the shots, fire rate and convergence once analyzed); **Load** brings a session's clips and wall screenshots into the Live tab's sample cards, on its weapon.
   * You can inspect, re-snap, or click **Analyze the sprays** to re-analyze historical sessions at any time!
   * **Import clips** takes `.webm` or `.mp4` recordings from your disk with their wall `.jpg` / `.png` screenshots (`spray_01.webm` goes with `spray_01_wall.jpg`); images alone go to the Screenshots tab.
10. **Batch Wall Screenshot Analysis & Navigation:**
   * The **Screenshots** tab analyzes saved wall screenshots in batches.
   * **Choose images** takes several screenshots from disk at once; the **Server library** card (or the **Library** section, with thumbnails) adds screenshots kept on the server.
   * Each screenshot is a card with a status (`Ready`, `Analyzing…`, `N shots`, `N/M shots` when some are missing, `Failed`); a click shows it on the canvas.
   * Click **Analyze N screenshots** to run the batch discovery pipeline (`process_images_session`).
   * **Navigation:** the arrows at the top of the canvas, or **[** and **]**, go through the screenshots, and after an analysis through its sprays.

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
3. From `processing/`, calculate the angular pixel distance between the two points: `python -c "from recoil_discovery.math_utils import angular_pixel_distance as d; print(round(d(pitch1, yaw1, pitch2, yaw2), 2))"`, with the four readings in place of the names.
4. In the Studio (`/editor`), the Capture section's **Manual** tab loads the screenshot, finds the decals with a threshold and a size range (**Add the targets as shots**), marks two anchors (middle-click a shot) at the distance you enter, and shows the pattern in the original editor's version 2 format to copy.
