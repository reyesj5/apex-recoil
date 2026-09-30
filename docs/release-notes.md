# v260922

- **Comprehensive UI/UX Modernization, Ergonomics & Accessibility**:
  - **Modern Typography & Global Theming ([views/layout.pug](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/layout.pug), [style.scss](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/style.scss))**:
    - Replaced generic browser fonts with Google Fonts `Inter` (sans-serif) for high-clarity UI typography and `JetBrains Mono` for monospace data displays, timestamps, and numbers.
    - Enabled subpixel font-smoothing (`-webkit-font-smoothing: antialiased`, `-moz-osx-font-smoothing: grayscale`) across the body.
    - Added `:focus-within` and `:hover` triggers to `.tooltip` elements for keyboard navigation accessibility.
    - Replaced deprecated `@media (max-device-width: 900px)` with standard `@media (max-width: 768px)` viewport width querying, enabling responsive desktop window resizing below 900px without breaking layout.
    - Unified dark mode aesthetics across text inputs, select dropdowns, and range sliders with custom accent thumbs.
  - **Trainer Ergonomics, Instant Search & Category Filtering ([views/index.pug](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/index.pug), [client/game.ts](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/game.ts))**:
    - Added `#weapon-filter-bar` featuring an instant live search input and category pills (`All`, `AR`, `SMG`, `LMG`, `Mark`, `Snip`, `Shot`, `Pist`).
    - Categorized all 31 weapons via `data-category` attributes; dynamic search matches both internal weapon tags and localized weapon display names in real time.
    - Redesigned weapon selection cards with clean vertical flex flow, eliminating artwork overlap by placing names statically beneath thumbnails.
    - Added live magazine capacity badges (`span.mag-cap`) displaying exact round counts for each weapon tier and stock penalties.
    - Created custom vector artwork for Tier 4 Corrupted Magazine ([`assets/images/corrupted_mag.svg`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/assets/images/corrupted_mag.svg)) with authentic crystalline shard geometry.
    - Redesigned `#invert-y-btn` into a modern toggle pill with active state styling.
    - Bound `Escape` key to instantly dismiss instruction overlays and detailed stat graphs.
    - Fully synchronized localized templates ([`views/index-ru.pug`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/index-ru.pug), [`views/index-zh-CN.pug`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/index-zh-CN.pug)).
  - **Recoil Editor Toolbar Reorganization & Modal Ergonomics ([views/editor.pug](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/editor.pug), [client/editor.ts](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts))**:
    - Reorganized the 16-button `#stage-toolbar` into compact segmented control groups (`.segmented-btn-group`) for Undo/Redo, Canvas Modes (Pan, Align, Correct), and View Controls with horizontal scroll protection preventing multi-line toolbar wrapping on 1080p viewports.
    - Added minimize/restore button (`#min-hud-btn`) to the floating `#discrepancy-hud`, collapsing the card into a sleek 1-line title bar.
    - Implemented global `Escape` key handling to dismiss all open modals, cancel active comparison overlays, or exit shot correction mode.
  - **Security & Link Hygiene**:
    - Added `rel="noopener noreferrer"` to all outbound target="_blank" links across all templates, mitigating tab-nabbing vulnerabilities.
    - Enriched interactive buttons and form inputs with descriptive `aria-label` attributes.


- **Full-Stack Codebase Hardening, Correctness & Error Resilience**:
  - **Server & Process Safety ([app.js](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/app.js))**:
    - Added `proc.on('error')` failure listeners to `spawn()` calls in `/api/discovery/process-session` and `/api/discovery/process-static-image`, guarding against uncaught Node.js server crashes if Python or virtual environment binaries are missing or misconfigured.
    - Fixed weapon name extraction regex/split in `/api/discovery/sessions` (`parts.slice(1, -2).join('_')`) to properly support multi-part weapon tags (e.g. `havoc_tc`, `p2020_akimbo`, `mozambique_akimbo`).
    - Converted synchronous blocking `fs.writeFileSync` in `POST /api/specs` to non-blocking async `await fs.promises.writeFile`.
    - Added strict parameter sanitization for CLI command-line arguments (`weaponTag`, `cleanHdr`, `cleanStrategy`, and positive numeric validation for `shots`, `rpm`, `multiplier`, `distance`, `zoom`, `fov`).
    - Added `isValidWeaponSpec` JSON schema validation for spec payloads with error logging and backup protection on save failures.
  - **Python Discovery Engine Robustness ([processing/recoil_discovery/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/))**:
    - [`tracker.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/tracker.py): Initialized `cx = w // 2` unconditionally before `roi_mask` check to prevent `UnboundLocalError`; moved `maximum_filter` to module top-level imports.
    - [`spec_manager.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/spec_manager.py): Added memory caching in `load_specs`; handled `common_len == 0` in `diff_weapon_spec` returning an `EMPTY_PATTERN` status without crashing.
    - [`aggregator.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/aggregator.py): Fixed `mean_recoil` returning `([0.0], [0.0])` on empty trials; synchronized `time_points` length to `max_len` in `weighted_merge_recoil`.
    - [`cli.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/cli.py): Enforced `MAX_LENGTH = 55` and sliced/padded coordinates strictly to 55 elements in `cmd_export_arduino` to match Arduino firmware memory layout.
    - [`pipeline.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/pipeline.py): Removed unreachable duplicate `elif in_game_dist and len(raw_x) >= 2:` branch; hoisted `tone_map_hdr_image` to module top level.
    - [`shot_detector.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/shot_detector.py): Added `min_rpm` sanity validation.
    - Added unit test coverage in `test_spec_manager.py` and `test_aggregator.py`, bringing suite to 30/30 passing tests.
  - **Client Math & State Engine ([client/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/))**:
    - [`point.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/point.ts): Swapped arguments in `Point.atan2()` to `Math.atan2(this.y, this.x)` conforming to standard mathematical convention; added docstrings and aliases `scale`, `scaleX`, `scaleY`.
    - [`storage.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/storage.ts): Set `attrUpdatesActive = true` before invoking `poke()` in `resumeAttrUpdates()` to prevent dropping initial updates.
    - [`stats.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/stats.ts): Wrapped `loadStats()` in `try/catch` to guard against JSON corruption in `localStorage`; eliminated duplicate push bug during legacy migration.
    - [`main.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/main.ts): Upgraded legacy origin migration redirect to HTTPS.
    - [`game.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/game.ts): Fixed `0 / 0 = NaN` stat corruption in `Shooting.finish()` when `hitIndex == -1`; guarded trail rendering when index out of bounds; renamed `displayTace()` typo to `displayTrace()`.
  - **UI Robustness & Security ([client/editor.ts](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts))**:
    - Guarded `update()` against empty point graphs (`pp.length === 0`), returning safe empty spec without throwing `TypeError: Cannot read properties of undefined (reading 'clone')`.
    - Added HTTP status verification (`!res.ok`) before calling `res.json()` on `/api/discovery/process-session` and `/api/discovery/process-static-image`, surfacing human-readable server error messages.
    - Added `escapeHtml()` utility to sanitize all dynamic weapon, mode, and filename variables before injecting into `innerHTML`.
    - Parallelized past session video and screenshot fetching with `Promise.all` over `session.samples`.

- **Removed Legacy Development Hiatus & End-of-Support Splash Notice**:
  - Removed outdated September 2024 development update notice (`#notify-splash`) and its associated state/watcher (`aShowDevUpdate`, `maybeShowDevUpdate`) from [`views/index.pug`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/index.pug) and [`client/game.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/game.ts).
  - Cleaned up obsolete splash styling rules in [`style.scss`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/style.scss).

- **Direct 1-Click Spec Saving & Stage Toolbar Save**:
  - Solved user workflow friction where the save button was tucked away in the left sidebar accordion.
  - Added dedicated `💾 Save Spec` (`#save-stage-spec-btn`) button to the canvas stage toolbar.
  - Added prominent 1-click `💾 Save Analyzed Pattern to specs.json` button directly inside both live session completion cards (`#session-process-status`) and batch screenshot completion cards (`#wall-file-status`).
  - Added global `Ctrl+S` / `Cmd+S` keyboard shortcut with transient "✅ Saved!" button animation, audio confirmation, and status messaging.

- **Spec Safety Verification Checkpoint & Dual Comparison Overlay**:
  - Implemented pre-save safety verification checkpoint (`#spec-checkpoint-modal`) to guard against saving corrupted, truncated, or noisy patterns to `specs.json`.
  - Automatically calculates discrepancies between the **Saved Baseline Spec** in `specs.json` and the **Candidate Pattern** (analyzed batch, accumulated result, or manually corrected points), detecting shot count truncations, high deflection drift, large single-shot outliers, and recoil direction inversions.
  - Added interactive dual comparison overlay on canvas via `#stage-preview-select` (`⚖️ Compare: Spec vs Candidate Overlay`), dedicated toolbar button `#compare-stage-btn`, and keyboard shortcut `O`.
  - Concurrently renders the saved baseline pattern in cyan (dashed trajectory + circles) and the candidate in orange (solid trajectory + circles), with color-coded discrepancy vector lines connecting corresponding shots ($<8\text{px}$ green, $8\text{--}20\text{px}$ amber, $>20\text{px}$ red with $\Delta\text{px}$ labels).
  - Added on-stage floating Discrepancy HUD (`#discrepancy-hud`) displaying real-time shot count comparison, mean delta, max outlier shot index, and alignment health status (`🟢 Consistent`, `🟡 Moderate Drift`, `🔴 Major Discrepancy Alert`).
  - Added inline Discrepancy Check badges and a 1-click `⚖️ Inspect Discrepancies` button inside both live session and batch screenshot analysis completion status cards.

- **Incremental Proportional Spec Accumulation vs Overwrite**:
  - Implemented mathematical proportional sample merging via `RecoilAggregator.weighted_merge_recoil` and updated the Python pipeline to weight new samples proportionally: $\text{Coord}_{\text{combined}}[i] = \frac{N \cdot \text{Coord}_{\text{old}}[i] + M \cdot \text{Coord}_{\text{new}}[i]}{N + M}$.
  - Added Spec Integration Mode selection in `#analysis-confirm-modal` with choices:
    - `➕ Proportional Accumulation (Refine Spec)`: Blends new captures proportionally with the existing spec based on sample history (e.g. 10 prior + 1 new = 10/11 prior + 1/11 new weight), reducing noise and increasing accuracy over time.
    - `🔄 Fresh Overwrite (New Baseline)`: Discards prior recordings to establish a fresh spec (ideal after an Apex Legends weapon balance patch).
  - Added `sample_count` tracking in `client/specs.json` and a sidebar sample counter `#spec-samples-info` with a 1-click reset button `↺` to reset sample count back to 1 after patches.
  - Added `🔬 New Batch Alone` option in the stage View dropdown (`#stage-preview-select`) to seamlessly compare newly captured batch samples against the accumulated canonical spec.

- **Recoil Editor Usability, Zoom-Adaptive Markers & Smart Trajectory Editing**:
  - **Zoom & Pan Preservation**: Guarded stage position and scale resets in `renderPointsOnImage`, `loadSampleScreenshotOnCanvas`, and overlay transitions in [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts). Zooming into specific wall decals is now preserved when toggling views (`spec`, `analyzed`, `trial-X`), clicking loaded images in the batch list, or clicking `🔄 Reload`.
  - **Zoom-Adaptive Pinpoint Decal Markers**: Marker circle radii, stroke widths, and trajectory lines scale inversely with canvas zoom ($r = 4.5 / s$, $w = 1.2 / s$). At high zoom levels (3x–8x), markers remain crisp ~4.5px pinpoint dots instead of bloating into giant circles, with translucent fills (`rgba(0, 229, 255, 0.22)`) and green shot 0 indicator so decals underneath remain clearly visible.
  - **Full Undo / Redo System (`↩ Undo`, `↪ Redo`)**: Added 50-level history stack tracking all marker additions, deletions, drags, and clears. Toolbar buttons `#undo-stage-btn` and `#redo-stage-btn` enable/disable dynamically, with global keyboard shortcuts (`Ctrl+Z`, `Ctrl+Y`, and `Ctrl+Shift+Z`) documented in the shortcuts modal.
  - **Smart Trajectory Insertion & Auto-Connecting Pattern Lines**: Adding a marker in [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts) calculates the nearest sequential trajectory segment ($P_i \to P_{i+1}$) or spray endpoint, automatically inserting the shot at its chronological index, re-indexing remaining points, and reconnecting lines $0 \to 1 \dots \to N-1$ seamlessly without requiring manual edge linking. Right-clicking a marker deletes it, re-indexes points, and rejoins lines automatically.
  - **Crowded Decal Hitbox Scaling & Elimination of Bold Click State**: Fixed circle hitboxes swallowing clicks in tight clusters by scaling `hitStrokeWidth` with zoom. Eliminated legacy `edgeStartName` bolding so left-clicking a marker never turns it bold.

  - Addressed why Havoc's multiplier was temporarily set to 1.0: the automated CV discovery pipeline extracts pure 1.0x mouse mickeys directly (deflection ending at $y = -538.5$).
  - In [`client/specs.json`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/specs.json), canonical weapon curves store coordinates scaled by the weapon's in-game engine sensitivity multiplier ($0.73$ for assault rifles/SMGs like R-99 and R-301, $0.75$–$0.85$ for marksman/shotguns).
  - Normalized Havoc (`havoc_tc`) back to `multiplier: 0.73` ($y$ ending at $-393.11$) so all 31 weapons adhere to the identical standard, while preserving unscaled `raw_1x_x` and `raw_1x_y` (ending at $-538.5$) for exact precision.
  - Re-exported [`arduino_mouse/src/recoil.inc`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/arduino_mouse/src/recoil.inc) to match.

- **HDR-to-SDR Color Tone-Mapping & Over-Exposure Correction**:
  - Solved washed-out, foggy, overblown screenshot and video colors caused by Windows HDR / Auto HDR clamping high dynamic range framebuffers into 8-bit SDR without monitor tone mapping (where mean luminance exceeded 193 out of 255).
  - Added dedicated HDR color profile dropdowns (`#capture-hdr-select` and `#static-hdr-select`) in both In-Game Live Studio and Saved Wall Screenshots calibration panels, featuring `☀️ HDR Fix (Natural)` (default), `☀️ HDR Fix (Vibrant)`, and `Standard (SDR)`.
  - Implemented high-performance 2D Canvas LUT-based tone mapping ($\gamma \approx 1.6$, exposure $0.85$, contrast $1.20$, and saturation boost $1.25$) on canvas screenshot snapping and background rendering in [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts), with preference persisted in `localStorage`.
  - Added real-time CSS filter (`brightness(0.85) contrast(1.22) saturate(1.25)`) to the live stream video preview (`#capture-preview-video`).
  - Added automated HDR tone mapping (`tone_map_hdr_image`) and `--hdr` CLI flag in [`processing/recoil_discovery/tracker.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/tracker.py), [`pipeline.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/pipeline.py), and [`cli.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/cli.py) so offline images and preview thumbnails restore crisp bullet contrast and natural colors automatically.

- **View Dropdown Synchronization & Non-Session Integration**:
  - Resolved an issue where the stage View dropdown (`#stage-preview-select`) failed to update when clicking between loaded screenshots in the batch list, or after clicking the reload button (`🔄 Reload`).
  - Added full dropdown support before and after analysis: when offline screenshots are loaded into the batch list prior to analysis, the dropdown lists all loaded images (`batch-0`, `batch-1`, etc.).
  - Ensured single-trial sessions are represented consistently with `trial-0` in `#stage-preview-select`, allowing seamless switching between canonical spec (`spec`) and detected decals (`trial-0`).
  - Clicking any batch thumbnail card or using stage navigation (`◀ Prev`, `Next ▶`, `[`, `]`) immediately updates `#stage-preview-select.value` to the active item.
  - Clicking `🔄 Reload` now preserves the active view (whether `trial-0`, `batch-X`, or `median`), updating canonical specs without forcibly resetting the user's inspection mode back to `spec`.

- **Fit & Center Pattern & User Correction Preservation**:
  - Fixed an issue where clicking `🎯 Fit & Center` (`#recenter-stage-btn`) behaved like a full reset: it was calling `renderSelectedOverlay()` which cleared all points on canvas and forcibly re-loaded the spec pattern, discarding manual corrections added via `🔧 Correct Shots`.
  - Removed overlay re-fetching from `fitAndCenterCanvas()` in [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts): `fitAndCenterCanvas()` now purely re-centers the stage and linearly rescales the existing Konva points on canvas. It preserves whatever pattern the user was actively inspecting (analyzed decals, spec overlay, or manual corrections) without altering or deleting points.

- **Automated FOV 104 Perspective Projection & Mickeys Derivation**:
  - Resolved the mathematical relationship between Source Engine recoil deflection (measured in mouse counts / mickeys) and on-screen bullet decal pixel spacing across different Fields of View (FOV).
  - Factored camera angular focal length into the projection layer: $\text{fovFactor} = \frac{1}{\tan(\text{FOV} / 2)}$. At in-game FOV 104°, $\tan(52^\circ) \approx 1.28$, meaning decals on screen are visually $\approx 22\%$ smaller in pixels than at default 90° FOV for identical mouse mickeys.
  - Generalised conversion formulas in [`processing/recoil_discovery/pipeline.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/pipeline.py) and [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts):
    $$\text{px\_to\_mouse} = \frac{3.36}{\text{zoom}} \times \frac{1080}{H} \times \tan\left(\frac{\text{FOV}}{2}\right)$$
    $$\text{mouse\_to\_px} = \frac{\text{zoom}}{3.36} \times \frac{H}{1080} \times \frac{1}{\tan(\text{FOV} / 2)}$$
  - Added dedicated In-Game FOV inputs (`#static-fov-input` and `#capture-fov-input`, default 104°) to both live and offline calibration panels, passing `--fov` through [`app.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/app.js) and [`processing/recoil_discovery/cli.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/cli.py). Visual scale overlay and mouse mickeys now calibrate 100% automatically without manual slider guesswork.

- **Pre-Analysis Reticle Alignment & Offline Screenshot Positioning**:
  - Resolved an issue where loading an offline screenshot prior to analysis placed the weapon recoil pattern too low (down in the weapon iron sights) upon reload.
  - Corrected anchor position in [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts) (`displayWeaponOnCanvas`): coordinates now anchor at the physical firing range target board crosshair ($X \approx 48.7\%, Y \approx 49.5\%$) matching the in-game ADS aim position before and after discovery.
  - Dynamically reads optic zoom via `getActiveOpticZoom()` and binds optic change events so selecting 1x, 2x, 3x, or 4x updates the visual overlay scale immediately.

- **Interactive Keyboard Shortcuts & Controls Reference (`⌨️ Shortcuts` / `?`)**:
  - Added a dedicated `⌨️ Shortcuts` button to the stage toolbar and wired global shortcut key `?` to open a full-featured cheatsheet modal.
  - Comprehensively documents all editor shortcuts: `M` (Sidebar toggle), `Space` / `✋ Pan Canvas` (Canvas panning), `[` and `]` (Batch screenshot navigation), `Mouse Wheel` (Zoom centered on cursor), `Left-Click` (Add bullet hole in Correction mode), `Right-Click` (Delete hole in Correction mode), and `✥ Move All` (Alignment drag).

- **Stage Visual Scale Fine-Tuner (`Scale: 100% ↺`)**:
  - Added a real-time visual scale slider (`80%` – `120%`) and reset button to the stage toolbar.
  - Allows players to fine-tune visual overlay sizing to compensate for in-game Field of View (FOV) differences (90° standard vs 110° competitive settings) without altering canonical mouse mickeys stored in specs.

- **Startup Ghost Pattern & Cache Purge**:
  - Eliminated duplicate ghost patterns and massive off-screen trajectories on startup by clearing obsolete `localStorage` keys (`editor:points`, `editor:imagedata`, `editor:edges`, `editor:anchors`).
  - Added responsive standalone canvas fitting so weapons displayed without a background image cleanly fit within 65% of viewport height without vertical clipping.

- **1:1 In-Game Recoil Scale & Editor Visualization Calibration**:
  - Resolved scale discrepancy where newly analyzed recording patterns produced coordinates roughly $3.36\times$ smaller than canonical in-game specs, while canonical specs appeared magnified over wall screenshots.
  - Formulated the exact geometric relationship between Source Engine in-game mouse mickeys ($0.022^\circ/\text{count}$) and decal pixels on a 1080p wall screenshot ($1\text{ decal pixel at 1080p 1x} \approx 3.36\text{ in-game mouse counts}$).
  - Updated [`processing/recoil_discovery/pipeline.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/pipeline.py) so newly discovered sprays automatically convert screenshot decal pixels into canonical in-game mouse counts matching the rest of the game specs.
  - Updated [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts) (`renderSelectedOverlay`, `displayWeaponOnCanvas`, and `syncSpecFromPoints`): canonical in-game specs are now scaled dynamically using `getMouseToPixelScale(imgHeight, zoom)` to match wall screenshot decals 1:1 on the canvas, while manual corrections convert cleanly back to true in-game mouse counts.
  - Restored Havoc Rifle (`havoc_tc`) in [`client/specs.json`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/specs.json) with authentic modern ground loot magazine capacities `[18, 21, 25, 29, 35]` (Base, L1, L2, L3, Corrupted L4) and full-scale canonical recoil trajectory ($y$ ending at $-538.7$, 672 RPM).


- **Shot Count Mismatch Detection & Manual Correction Mode**:
  - After analysis, the editor now compares detected bullet holes per trial against the expected magazine size (derived from the highest tier in the weapon's mag config). Any images where the algorithm found fewer shots than expected are immediately flagged.
  - Batch screenshot cards show an amber `⚠️` mismatch badge (e.g. `18/27 ⚠️`) with a tooltip explaining the deficit, making it obvious which images need attention at a glance.
  - The analysis status box now includes a warning panel when mismatches are detected, directing users to the correction mode.
  - The stage preview dropdown entries show `⚠️ (expected N)` next to individual trials that have fewer shots than the magazine size.
  - Added **🔧 Correct Shots** toggle button to the stage toolbar. When active, users can left-click on the canvas to manually add missing bullet holes at precise locations, and right-click existing points to remove incorrect detections. The spec auto-syncs after every edit.
  - Added a live **shot correction status bar** beneath the stage toolbar that shows `N/M shots` in real-time (green ✅ when matched, amber ⚠️ when deficit with count of missing shots, red ⚠️ when excess).
  - All new elements use cohesive amber/orange accent theming with subtle pulse animations for attention-drawing and smooth transitions.

- **Sidebar Footage & Image Previews Fit**:
  - Resolved an issue where video and screenshot previews inside the sidebar appeared massive, overflowed horizontally, or showed only a cropped fragment of the footage.
  - Corrected an SCSS nesting mismatch in [`views/editor.pug`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/editor.pug) and [`style.scss`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/style.scss): restored `.capture-studio-section` and broadened parent selectors to `#method-panel-live` and `.method-panel`, ensuring all sidebar media constraints apply reliably across all recording method tabs.
  - Constrained `.sample-media-row .media-col video, img` to `height: 95px; max-height: 95px; object-fit: contain; background: #000; display: block;` with column `min-width: 0; overflow: hidden;`. This allows spray video clips and companion wall decal screenshots to fit side-by-side inside the 380px sidebar, with 100% of the game window and decals visible without cropping.
  - Fixed thumbnail class name mismatch in `.batch-screenshots-list`: added styling for `img.batch-thumb` with fixed `width: 52px; height: 38px; object-fit: contain; flex-shrink: 0;` and `.batch-info` text clipping with ellipsis, eliminating horizontal blowout from unconstrained 2560px images in the offline tab.
  - Added `overflow-x: hidden;` to `#tools` and `.batch-screenshots-list`, guaranteeing zero horizontal scrollbars or container expansion.

- **Duplicate Screenshot & Clip Upload Prevention**:
  - Added strict duplicate prevention across all upload and import workflows in [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts):
    - **Disk File Upload** (`#wall-screenshot-file-input`): Inspects selected files against current batch screenshots by filename and base64 content. Omitted duplicates are tracked and reported with informative badges (`ℹ️ Added X screenshot(s) (Y duplicate(s) omitted)`).
    - **Server Screenshots Library** (`#load-saved-screenshot-btn`): Checks existing batch items by filename and source URL before fetching, blocking redundant downloads and alerting the user immediately.
    - **Live Studio Import** (`#import-clips-input`): Deduplicates imported video clips and companion wall images against `capturedSamples` and `batchScreenshots`.

- **1:1 Recoil Game Scale Calibration & True Muscle Memory Guarantee**:
  - Thoroughly investigated and addressed the scale discrepancy between captured decals and weapon specs upon reload.
  - Identified that legacy `havoc_tc` in [`client/specs.json`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/specs.json) originated from May 2021 before the Source engine $0.73$ multiplier and optic zoom calibrations were standardized, causing a vertical climb of $-538.5$ that blew up to $-1077$ px when magnified by $2.0\times$.
  - Re-calibrated `havoc_tc` in [`client/specs.json`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/specs.json) with `"multiplier": 0.73`, authentic 36-round energy mag capacities (24, 28, 32, 36), and accurate mouse-count coordinates extracted from real Firing Range captures.
  - Updated spec overlay math in [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts) (`renderSelectedOverlay` and `displayWeaponOnCanvas`): accurately converts mouse counts to screen pixels using $\text{pixels} = \left(\frac{\text{spec}}{\text{multiplier}}\right) \times \text{zoom}$.
  - The spec pattern now lands directly on top of the physical bullet decals on canvas with 1:1 precision, ensuring the recoil translates identically to in-game muscle memory.

- **Batch Multi-Screenshot Analysis & Fast Stage Carousel Navigation**:
  - Added support for analyzing multiple wall screenshots in a single batch. Users can select multiple images from disk or load saved screenshots directly from the server library.
  - Each screenshot is tracked in a dedicated batch manager card list with live status badges (`Ready`, `Analyzing...`, `N shots`), thumbnail previews, and remove controls.
  - Extended the backend pipeline with `process_images_session` in [`processing/recoil_discovery/pipeline.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/pipeline.py) and CLI `recoil_discovery.cli session` to batch-extract decals from each screenshot, measure shot counts, and calculate a unified median aggregated spec with automatic outlier rejection.
  - Added Stage Toolbar navigation controls (`◀ Prev` / `Next ▶`, indicator `🖼️ 1/N`) and keyboard shortcuts `[` and `]` to cycle through screenshots on canvas, inspect individual spray decals, and compare against the median pattern or canonical saved spec.

- **In-Game Live Studio - Past Sessions & Older Captures Loader**:
  - Added a session browser to the In-Game Live Studio to load older recorded sessions (e.g. from `processing/captures/session_*`) into sample cards with video preview, audio playback, and companion wall screenshots.
  - Added `GET /api/discovery/sessions` to scan and index past sessions with weapon, fire mode, timestamp, and media links.
  - Added `GET /api/discovery/screenshots` to index saved wall screenshots across both the server library and past session directories.
  - Added local video import (`#import-clips-input`) allowing users to import `.webm` / `.mp4` recordings and companion wall images from disk directly into sample cards.
  - Loaded past sessions can be reviewed, edited, re-snapped, or re-analyzed via `⚡ Analyze Sprays & Calculate Recoil`.

- **Reload Spec Loading & Overlay Distinction Fix**:
  - Solved an issue where, after analyzing an image, clicking `🔄 Reload` only reset the photo's predicted pattern and failed to reload the weapon's saved spec from `specs.json`.
  - Disentangled the `'spec'` key (canonical weapon spec from `specs.json`) from `'analyzed'` (detected decal points from the photo) in `populateStagePreviewDropdown()` and `renderSelectedOverlay()` in [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts).
  - Updated `displayWeaponOnCanvas` so clicking `🔄 Reload` or switching weapons in `#weapon-select` explicitly updates `activeSessionData.spec = w`, sets `stage-preview-select` to `'spec'`, and displays the canonical weapon spec from `specs.json` overlaid directly on the wall screenshot aligned with the initial shot impact (`origin`).
  - Added seamless toggling in `#stage-preview-select` between `📐 Saved Spec: <WEAPON> (<N> shots)` and `🎯 Detected Decals (<N> shots)`, allowing direct side-by-side visual comparison between in-game recoil specs and computer vision detections.
  - Enhanced `🗑 Clear Image` to cleanly reset `activeSessionData` and redraw the weapon pattern centered on canvas.

- **Analysis Confirmation Modal & Duplicate Capture Prevention**:
  - Added an interactive glassmorphic confirmation modal (`#analysis-confirm-modal`) prompted before analyzing any image or video recording session.
  - Enforces explicit confirmation and selection of the target **Weapon** and **Fire Mode**, preventing accidental tagging of sprays as the default `r99`.
  - Added a **Save capture to library** toggle (default: unchecked for offline screenshots loaded from existing video captures), eliminating duplicate files in `processing/captures/screenshots/`.
  - Updated backend API in [`app.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/app.js) to execute unsaved analysis inside OS temporary directories (`os.tmpdir()`) with immediate cleanup (`fs.unlinkSync`/`fs.rmSync`), ensuring zero disk pollution.

- **Dynamic Stage Sizing & Auto-Resize for Smaller Screens**:
  - Fixed issues where the screenshot or pattern did not fit on smaller laptop screens or when the 380px sidebar was open.
  - In [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts), updated `syncStageSize` to dynamically measure the `#stage-container` client dimensions minus toolbar height, preventing fixed-pixel canvas overflow.
  - Implemented debounced `ResizeObserver` on `#stage-container` and `window` resize listeners that automatically invoke `fitAndCenterCanvas`, proportionally resizing background wall screenshots and all bullet decal points to fit any viewport dynamically.
  - Centered weapon pattern display origin in [`displayWeaponOnCanvas`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts) relative to the visible stage area instead of total window width.

- **Clean UI: Recording Method Tabs & Collapsible Sidebar**:
  - Decluttered the editor interface in [`views/editor.pug`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/editor.pug) and [`style.scss`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/style.scss) by introducing segmented recording method tabs:
    - **🎥 In-Game Live Studio**: WebRTC screen share, gunfire audio trigger, and post-reload ADS screenshot capture.
    - **🖼️ Offline Screenshot**: Direct upload/analysis of saved wall screenshots without needing the game running.
    - **🎯 Manual / Legacy**: Color thresholding, auto-targets, and manual point connection.
  - Hides non-active methods and saves user's preferred tab in `localStorage`.
  - Added a collapsible sidebar menu toggle (`#toggle-sidebar-btn` / `[M]` keyboard shortcut) to hide the 380px tools panel and maximize canvas workspace, smoothly triggering canvas re-centering on collapse/expand.

- **Capture Naming Conventions (Weapon & Mode Tracking)**:
  - Updated session directory formatting in [`app.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/app.js) to `session_<weapon>_<mode>_<timestamp>` (e.g. `session_havoc_auto_1790712363072`).
  - Updated static screenshot upload formatting to `<weapon>_<mode>_<timestamp>_wall.jpg`.
  - Renamed previous untagged capture folders in `processing/captures/` to `session_havoc_auto_1790671079628` and `session_havoc_auto_1790712363072`.
  - Added a dedicated **Fire Mode** selector (`#weapon-mode-select`) in [`views/editor.pug`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/editor.pug) populated dynamically from weapon configuration in [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts), and passed `mode` in analysis requests.

- **Recoil Multiplier & Optic Zoom Calibration Engine**:
  - Documented Source Engine mouse sensitivity physics ($0.022^\circ$ per mouse count at sensitivity 1.0) and how the `multiplier` scalar converts screen pixels into mouse counts.
  - Clarified why 20-meter capture with a 2x Bruiser optic produces $2.0\times$ larger decals on screen: dividing raw pixels by optic zoom ($Z = 2.0$) normalizes coordinates to 1x equivalent pixels, maintaining compatibility with the canonical $0.73$ multiplier, while direct 2x calibration without normalization corresponds to $\text{multiplier} \approx 0.365$.

- **Responsive Canvas Viewport & Fit & Center Fix**:
  - Fixed an issue where clicking `🎯 Fit & Center` or loading wall screenshots pushed the background image to the far right of the canvas with a huge black void on the left.
  - In [`client/main.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/main.ts), updated Konva stage initialization to use the stage container's actual client dimensions instead of `window.screen.width`/`height`.
  - In [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts), implemented dynamic stage dimension synchronization (`syncStageSize`), registered `ResizeObserver` on `#stage` to automatically handle layout and window resize events, and completely overhauled `fitAndCenterCanvas` to accurately scale and center background wall images and bullet decal points within the visible stage viewport.
  - Ensured `loadSampleScreenshotOnCanvas` and `renderSelectedOverlay` always center content relative to the visible stage container.

- **Robust Plain Concrete Wall Extraction & Bottom Extent Calibration**:
  - Solved pipeline crash (`Mean of empty slice`, `cv::morphologyEx !_src.empty()`) in [`processing/recoil_discovery/tracker.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/tracker.py) when recording sprays against plain concrete walls or pillars without dark bordering girders: evaluated relative median intensity drops (`center_val - 35.0`) with minimum corridor margin fallback.
  - Extended the default vertical board scan limit from `0.52h` to `0.75h` (searching up to `0.85h`), preventing lower bullet decals from being cropped out on tall target boards and plain walls.

- **34-Hole Decal Detection, Cluster Peak Decomposition & Railing Traverse**:
  - Solved pattern truncation on tall or high-capacity sprays (e.g. Havoc 35-round magazine): updated dynamic board isolation in [`processing/recoil_discovery/tracker.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/tracker.py) so vertical scanning does not stop early on the middle horizontal railing divider, seamlessly capturing all bullet holes in both the upper white board and lower grey board.
  - Implemented local intensity peak decomposition (`maximum_filter`) on Black Top-Hat response to isolate individual bullet pits inside merged/touching decal clusters (such as Havoc's dense 13-round zig-zag hook).
  - Added detour-minimizing path insertion to weave unvisited side hooks into the primary vertical trajectory without leaving branches behind.
  - Added overlapping impact interpolation: when magazine capacity exceeds visible hole count (e.g. 34 visible holes for 35 rounds due to 1 direct overlapping hit), the system automatically detects the largest merged cluster and outputs the full magazine complement.
  - Suppressed horizontal railing seam artifacts while preserving bullet decals penetrating directly through the metal railing bands.

- **20-Meter Capture Distance Calibration & Optic Zoom Controls**:
  - Calibrated shooting distance standard to **20 meters** from the white target board in the Firing Range (with **2x HCOG Bruiser** optic), resolving bullet decal overlap issues at close ranges while maintaining crystal-clear decal separation and clean camera FOV.
  - Added dedicated **🎯 Distance** inputs (default: `20m`) to both the Live Auto-Capture Studio and the Offline Wall Screenshot Analysis Drawer in [`views/editor.pug`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/editor.pug) and [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts).
  - Paired 20-meter capture with standard **2x HCOG Bruiser** optic scaling (`zoom = 2.0`), auto-scaling raw pixels to 1x canonical game units.
  - Enhanced target board isolation in [`processing/recoil_discovery/tracker.py`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/tracker.py) with dynamic column/row median profiling, 5% inner safety margin to eliminate pillar seam shadows, and capped nearest-neighbor step relaxation (`1.5 * max_step`) preventing jumps across the frame.
  - Added 3-second audible countdown delay with Web Audio tones (440Hz tick / 880Hz chime) on `Re-snap Wall` to allow refocusing Apex and holding ADS.
  - Added full Stage Panning (Right-Click / Middle-Click / Spacebar / Pan tool toggle) and smooth mouse-wheel zoom centered on cursor in the editor canvas.
  - Replaced redundant sample Re-record button with direct `💾 Save Image` download button.
  - Added `🖼️ Analyze Saved Wall Screenshot` drawer for offline recoil extraction from static images.

- **Decoupled Video Cadence & Post-Reload ADS Wall Screenshot Decal Extraction**:
  - Decoupled the recording role: video and audio recordings are now dedicated to measuring RPM, shot timing cadence, and capturing weapon sound, while decal pattern extraction is performed on a crystal-clear screenshot taken when the player is re-aimed in ADS.
  - Added a configurable **Post-Firing Reload & Re-Aim Buffer** slider (`#reaim-buffer-slider`, 1.5s to 8.0s, default 4.5s) in [`views/editor.pug`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/editor.pug) so the player has ample time for the empty magazine reload animation to finish, right-click back into ADS, and steady the crosshair on the wall decals.
  - Added live countdown indicators (`#reaim-indicator`, `#reaim-status-badge`) and an instant **`📸 Snap Wall & Finish`** button (with `[Spacebar]` shortcut) allowing users to snap the screenshot the exact second they are aimed, without waiting out the countdown.
  - Upgraded sample card UI in [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts) to a side-by-side layout displaying both the spray video (with audio playback) and the ADS wall decal screenshot thumbnail, complete with a `📷 Re-snap Wall` button to instantly recapture the wall without refiring the weapon.
  - Updated backend pipeline ([`process_video_clip`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/pipeline.py)) and API in [`app.js`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/app.js) to automatically pair companion wall screenshots (`spray_XX_wall.jpg`) for high-resolution static decal extraction.
- **Visual Pattern Alignment & Wall Image Overlay**:
  - Overlaid the exact recorded settled frame directly beneath the extracted recoil pattern on the editor canvas (`#stage`), allowing direct visual inspection of how points line up with in-game bullet impact decals.
  - Added an interactive stage toolbar above the canvas with toggles for Wall Image visibility (`#toggle-bg-img`), opacity slider (`#bg-opacity-slider`), individual spray sample selector (`#stage-preview-select`), and quick inspection buttons (`👁️ Canvas`) directly on each recording card.
  - Added canvas navigation controls: **Mouse Wheel Zoom** (anchored to cursor), **Middle-Click / Alt-Drag Pan**, and a `🎯 Fit & Center` button to inspect impact clusters at close range.
  - Added `✥ Move All (Align)` mode allowing the user to drag any single bullet point and translate the entire 35-shot pattern simultaneously to align over the wall decals. Dragging individual points updates the weapon recoil coordinates in real-time, factoring in background scale and optic zoom calibration.
  - Added ROI spatial filtering and temporal differencing in `DecalTracker` to eliminate weapon viewmodel and HUD noise blobs on 1440p gameplay frames.
- **Dynamic Audio Source Switching & Output Device Change Detection**:
  - Solved loss of gunfire trigger detection when switching Windows playback devices (e.g. speakers to headphones, USB headsets, or external DACs).
  - Added an interactive **Audio Input** selector (`#audio-source-select`) in [`views/editor.pug`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/editor.pug) supporting System Audio loopback, Default Microphone, and all enumerated hardware inputs (Stereo Mix, Headset Mics, Line-In).
  - Added a `🔄 Reconnect` button to instantly re-bind or re-request audio without interrupting the running game window video stream.
  - Added `navigator.mediaDevices.ondevicechange` listener that detects Windows playback device switches, auto-resumes suspended `AudioContext` states, detects muted tracks, and displays a 1-click alert banner.
  - Updated `MediaRecorder` in [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts) to record video coupled with the actively selected audio input.
- **Post-Spray Settled Frame Decal Extraction & 5–8m Distance Calibration**:
  - Overcame in-game viewmodel, muzzle flash, gun smoke, and low-ammo HUD warning (`[G] RELOAD`) occlusion during active firing by introducing settled post-spray frame decal extraction ([`DecalTracker.extract_from_settled_frames`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/tracker.py)).
  - Seamlessly extracts all 35/35 shots from settled wall frames once firing ceases and the viewmodel relaxes, accurately capturing the genuine recoil trajectory across all recorded clips.
  - Forwarded `expected_shots` through session aggregation ([`process_clips_session`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/recoil_discovery/pipeline.py)) and backend API to prevent truncation.
  - Calibrated capture distance guideline from 10–15m down to **5–8 meters** in [`docs/capture.md`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/capture.md) and [`views/editor.pug`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/editor.pug), preventing bullet decal degradation from random bloom while keeping the full pattern in FOV.
- **Auto-Capture Studio Stabilization & Full-Size Inspection**:
  - **Audio Feedback Elimination**: Prevented preview video playback from triggering recursive ghost recordings by muting samples by default and pausing the gunfire listener during playback.
  - **Spray Duration & Silence Threshold**: Increased recording silence threshold from 450ms to 1200ms and added an 0.8s minimum duration filter, preventing premature cutoff and 1-shot micro-recordings.
  - **Resilient Discovery JSON Parsing**: Standardized Python pipeline analysis logs to `stderr` and added regex JSON extraction in `app.js` to eliminate `Failed to parse discovery output` errors.
  - **Enlarged Preview & Full-Size Inspection Modal**: Increased card video preview height to 160px and added a `🔍 Enlarge` button opening a full-size modal player to inspect decal clarity and mouse stability.
- **Recoil Editor Background Image Control**: Added a dedicated `🗑 Clear Image` button under the Legacy Pattern Extraction section in [`views/editor.pug`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/views/editor.pug) and updated [`client/editor.ts`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/editor.ts) to gracefully purge and clean up any persistent Base64 images stored in browser `localStorage` (`editor:imagedata`), preventing ghost images from sticking behind weapon patterns.
- **Shooting Styles & Semi-Automatic Trigger Mechanics**: Differentiated weapon shooting styles across the entire arsenal. Semi-automatic weapons and shotguns (Peacekeeper, Mastiff, Wingman, P2020, G7 Scout, 30-30 Repeater, Triple Take, Bocek, Charge Rifle, Longbow, Sentinel, Kraber) now require a click for each round. Mouse releases do not abort the trial, refire cooldown is enforced based on weapon RPM, and recoil kicks and smoothly recovers to resting center between pumps/shots.
- **Burst Fire & Recoil Reset Mechanics**: Upgraded burst weapons (Prowler, Hemlok, Nemesis) to fire authentic multi-round bursts (3-round for Hemlok, 4-round for Nemesis, 5-round for Prowler) with intra-burst cadence and an inter-burst pause where recoil smoothly recenters back to (0, 0). Holding the trigger autofires sequential bursts separated by cooldown and recoil recovery.
- **Segmented Pattern & Trace Visualizations**: Updated [`drawPattern()`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/game.ts) and [`TracePreview`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/game.ts) to display segmented burst clusters with subtle recovery lines, and radial per-shot kick vectors for single-fire weapons, eliminating confusing continuous lines across recovery pauses.
- **Interactive Fire Mode Selector (`#fire-mode-select`)**: Added dedicated fire mode buttons (`Auto`, `Burst`, `Single`) and keyboard shortcut `[B]` (Apex standard toggle fire mode key). Select-fire weapons like Prowler (Burst / Auto) and Hemlok (Burst / Single) can switch modes on the fly, updating sound, pattern visualization, and recoil dynamics in real time across English, Russian, and Simplified Chinese views.
- **Dynamic Magazine Tooltips (Ammo Per Mag Display)**: All magazine selectors and the fixed capacity badge now display real-time ammo counts directly in tooltips across all languages (e.g., `Level 3 (27 rounds)`, `Level 3 (23 rounds [-4])` when Corrupted Stock is equipped, `Standard Capacity (5 shells)` for Peacekeeper, and `Standard Capacity (4 shells [-1])` with Corrupted Stock).
- **Shotgun & Semi-Auto Audio System**: Fixed runaway machine-gun audio for shotguns and semi-automatic rifles. Synthesized dedicated, high-impact 44.1 kHz audio samples ([`shotgun_shot.wav`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/assets/audio/shotgun_shot.wav) and [`single_shot.wav`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/assets/audio/single_shot.wav)) and implemented synchronized per-shot playback in the firing engine. Peacekeeper now fires exactly 5 punchy shotgun blasts (or 4 with Corrupted Stock) matching its exact 5-shell capacity.
- **Complete 31-Weapon Arsenal on Web UI**: Expanded the weapon grid from 14 weapons to all 31 active weapons across all Apex weapon classes (Assault Rifles, SMGs, LMGs, Marksman, Snipers, Shotguns, and Pistols/Akimbos) with official vector SVG iconography, smooth scrollable sidebar navigation, and full 5-tier spec progressions in [`client/specs.json`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/specs.json) across English, Russian, and Simplified Chinese views.
- **Corrupted Stock Attachment**: Added the new Corrupted Stock attachment toggle (`.mod-corrupted_stock`) featuring a glowing mythic red outline next to the magazine selector. Reduces magazine capacity by **4 rounds** across the board for stock-equipped weapons, and by **1 shell** for single-shell shotguns (Peacekeeper, Mastiff, EVA-8, Mozambique). Automatically hidden for non-stock weapons (Wingman, RE-45, P2020, Akimbos, Bocek, Kraber). Fully wired into spray pattern preview, tracer, and live shooting trainer.
- **New Weapon Additions (Nemesis & Hemlok)**: Integrated Nemesis Burst AR (Energy 4-round burst, 582 RPM peak ramp, 20..36 rounds) and Hemlok Burst AR (Heavy 3-round burst, 384 RPM, 21..30 rounds) with dedicated weapon selector icons across English, Russian, and Simplified Chinese views.
- **Ground Loot & Corrupted (L4) Spec Sync**: Restored full 5-tier ground loot magazine progressions in [`client/specs.json`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/specs.json) (R-99: 18..33, R-301: 21..37, Flatline: 19..35, Volt: 20..32, Alternator: 18..32, Havoc: 18..35, CAR: 20..36, Spitfire: 35..50), extrapolating late-spray coordinate arrays up to max mag capacity.
- **Navigation & Mythic Glow**: Added direct top navigation link to Recoil Studio (`/editor`) on all language views and added a luminous mythic glow to the Corrupted Magazine (`.mag-4`) selector.
- **Live Ground Loot & Tier 4 (Corrupted) Wiki Dataset**: Scraped and parsed all 29 dedicated weapon subpages from wiki.gg. Clarified ground loot vs rotational Care Package status (R-99, Devotion, Alternator retain standard ground loot identities). Extracted all Tier 4 / Corrupted (Mythic Red) magazine capacities (HAVOC: 35, Flatline: 35, R-301: 37, Nemesis: 36, Alternator: 32, R-99: 33, Volt: 32, C.A.R.: 36, Wingman: 10, P2020: 15 / Akimbo: 30) and published comprehensive stats reference to [`docs/weapons-wiki-stats.md`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/weapons-wiki-stats.md).
- **Corrupted Magazine (Tier 4 / Red Magazine)**: Full support across all magazine selectors, weapon specs, editor UI, and English, Russian, and Chinese translations.
- **In-Game Auto-Capture Studio (`/editor`)**: Hands-free window capture studio for Apex Legends. Features an acoustic gunfire sensor to auto-trigger spray recording, embedded sample video player, 1-click sample discard, slot re-recording, and batch analysis.
- **Web UI Weapon Manager (`/editor`)**: Visual editor dashboard to quickly tune weapon RPM, multiplier, and magazine tiers with direct API saving and automated `.bak` backups.
- **Automated Video Discovery Engine**: Python pipeline in `processing/recoil_discovery` that automatically discovers rate of fire (RPM), shot count, and chronological bullet decals from video clips without manual lookup.
- **Weapon RPM Calibration**: Fully calibrated in-game firing rates across all weapons in `client/specs.json` (Volt: 720 RPM, Devotion TC: 900 RPM peak, Prowler: 800 RPM burst, RE-45: 780 RPM, Rampage: 300 RPM, CAR: 930 RPM).
- **Server Port Fallback**: Express server automatically falls back to port 3001 if port 3000 is in use by other background dev services.

# v240915

- Added splash screen about current state of the project;

- Updated recoils of Flatline and R99.

# v240907

First update since 2021!

- Added donation button for supporters;

- R301 recoils are updated (many others are still out of date!);

- using a YYMMDD as a version number now;

# v19

- C.A.R. recoils;

- updated crosshair to be easily distinguishable from hit markers;

- added scale: it's useful if your sensitivity is too high and pattern is very small. You can also set is proportional to 4:3 (e.g. 1.3 x 1).

# v18

Now shooting is interrupted when you release the mouse button. Score is computed for the bullets already shot and not recorded.

# v17

Simplified Chinese translation. Thank you, @SkywalkerJi!

# v16

Updates to L-STAR mag size after [evolution collection event](https://www.ea.com/en-gb/games/apex-legends/news/evolution-collection-event).

# v15

Recoils and weapons updates for the Season 10.

- Prowler is removed as it only has burst mode.

- Added mag levels for L-Star.

- Added special fixed mag for drop weapons (Spitfire and Alternator).

- Added Rampage and ad toggle for it's "Revved Up" mod.

# v14

- "Invert Y" setting.

# v13

- Russian locale.

- Fix: tooltips not being fully visible.

# v12 small updates

- Fixed a bug when moving target disappeared after switching back to the app from other tab.

- Added a note and AHK script on how to lower window sens if in-game sensitivity is very low.

- Added scrolling to the control panel if windows height is too small.

# v11 Moving target and UI

- Added "moving target" mode, stats are tracked separately for it. Speed is not taken in account as there are many variables to consider beside that.

- Updated UI controls to make mode selection easier.

- Added hints to many controls.

# v10 Firing area and spitfire mag size

- Added a dotted region that shows a good starting position for a spray. If region is too small user will see a warning.

- Updated mag size and audio for Spitfire with a purple mag.

- Now versions are just sequential numbers as I realized that the game is useful already and it's not clear what should be "v1.0".

# v0.9 Reworked simulation

- Added a new "stationary target" option. If unchecked then crosshair will be pinned to the initial position, the target and hit markers will move. That experience should feel closer to the game. Thank you [u/Fartikus](https://www.reddit.com/user/Fartikus) for the suggestion!

- Removed the "show pacer" option as "target" fulfills its purpose naturally. Statistic records with "hints" on and "pacer" off are dropped.

# v0.8 L-STAR patterns

- added L-STAR patterns. That completes the list!

# v0.7 scores graph

- Graph of best / median scores by day.

- Minor layout fixes.

# v0.6 updated spitfire and havoc patterns

- Updated spitfire and havoc patterns after the season 9 patch has landed. Difference in mean recoils is quite small. See https://www.reddit.com/r/apexlegends/comments/n50ps9/oc_changes_in_spitfire_and_havoc_recoils_in/.

# v0.5 all weapons

- All weapons are here! Havoc and Devotion have a Turbocharger. It does not affect their recoils, only makes them brrr faster.

- Rearranged weapons to match in-game order (AR, SMG, LMG, Pistols).

- Small style and performance improvements.

# v0.4 stats updates

- Fixed few issues with statistics storage.

- Added counter of "today tries" to the interface.

- Added Alternator (not verified in-game yet but should be very close).

# v0.3 slow-mode

- Added a "slow-mode": o. Statistics are not recorded for "slow-mode".

- Minor visual improvements and simple page for devices with width less than 900px.

# v0.2 Accurate pattern scale, scoring, performance, and more

[v.01 announce on reddit](https://www.reddit.com/r/apexlegends/comments/mosk0l/i_have_created_an_app_to_practice_recoils) got some attention to the app and users pointed out multiple improvement points.

- Improved the method to collect recoil patterns found that previous patterns were bigger by around 15%. I have also found, by trying to accurately compensate with different scopes and FOV from 70 to 110, that recoil is absolute and does not scale with ADS or FOV. So there is not need to introduce ADS and FOV settings. Confirmed that new patterns are *identical with the game*.

- Reworked scoring [old formula](https://www.desmos.com/calculator/ptb2ipcscr), [new formula](https://www.desmos.com/calculator/j7vjbzvuly). Now they are more forgiving for small errors.

- Removed attachments level selection. The reason is twofold: 1) It's generally recommended to practice with no attachments. 2) The difference between trails is mostly in vertical scale, not form ([r99 diff](./res/r99_diff.png), [flatline diff](./res/faltline_diff.png)). In-game better attachments decrease randomness; training patterns are averages so randomness is removed. Keeping that in mind, the effort to record and support different types of attachments seems redundant. Typically it takes me around 1h to collect and process ~10 trails for one weapon config. Oh yes, it also means that **new weapon types will be added soon**er than I initially planned!

- Improved performance and added FPS display.

- Removed the "Real trace" option that was used to pick the "raw" pattern. Mean one is much more useful for training.

- Added a custom "red dot" cursor. Disabled right mouse click on the area.

- Added weapon titles.

- Added FAQ page, including controller settings.

# v0.1 Initial version

First version with r99, r301, Flatline, and Volt x 4 possible attachment levels.