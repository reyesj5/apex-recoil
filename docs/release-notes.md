# v260922

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