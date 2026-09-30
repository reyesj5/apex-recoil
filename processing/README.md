# Apex Recoil Discovery Engine

Automated computer vision and acoustic signal processing engine for discovering, measuring, and aggregating weapon recoil patterns in [Apex Legends](https://www.ea.com/games/apex-legends).

---

## Architecture Overview

```
processing/
├── recoil_discovery/
│   ├── math_utils.py       # Source engine angular scaling (0.022 deg/count), rc_score, array ops
│   ├── shot_detector.py    # Auto-measurement of RPM and shot count from audio/visual transients
│   ├── tracker.py          # Camera homography stabilization & chronological decal differencing
│   ├── ocr_calibrator.py   # +cl_showpos 1 HUD angle extraction & angular pixel calibration
│   ├── aggregator.py       # Multi-spray median-delta integration, proportional accumulation & outlier detection
│   ├── spec_manager.py     # Schema verification, patch diff reporting & matplotlib visualization
│   ├── pipeline.py         # End-to-end orchestrator for video clips, images, and sessions
│   └── cli.py              # Unified CLI interface
├── tests/                  # 27 automated unit tests (pytest)
├── requirements.txt        # Python dependency manifest
└── Pipfile                 # Pipenv environment definition
```

---

## Coordinate System Conventions

In `client/specs.json`, recoil patterns are represented in mouse displacement units at in-game sensitivity `1.0`:
* **Horizontal Kick ($x$):** Positive values indicate the weapon pulls right (counter-movement: move mouse left).
* **Vertical Kick ($y$):** Negative values indicate the weapon climbs upward (counter-movement: pull mouse downward).
* **Angular Sensitivity Constant:** Source Engine standard $0.022^\circ$ per mouse count:
  $$\text{Angle (degrees)} = \text{pixels} \times \text{multiplier} \times 0.022^\circ$$
* **Firing Cadence:** Rate of fire is stored as `rpm` and converted into exact millisecond timestamps:
  $$\Delta t_{\text{ms}} = \frac{60000}{\text{rpm}}, \quad \text{time\_points}[i] = \text{round}(i \times \Delta t_{\text{ms}})$$

---

## CLI Reference

Run commands from the `processing/` directory:

### 1. Verify Schema Integrity
Verifies array lengths, mag size bounds, and consistency in `client/specs.json`:
```bash
python -m recoil_discovery.cli verify
```

### 2. Process a Single Video Clip
Analyzes a video clip of a wall spray, auto-measures RPM and shot count, tracks decals, and exports a JSON trial:
```bash
python -m recoil_discovery.cli process --input spray_01.webm --weapon r301
```

### 3. Batch Aggregation & Patch Diff
Processes multiple spray recordings, computes median-delta trajectory, evaluates convergence, and prints a patch diff report:
```bash
python -m recoil_discovery.cli batch --dir ./recordings/r301/ --weapon r301 --plot
```
To commit the aggregated pattern directly to `client/specs.json`:
```bash
python -m recoil_discovery.cli batch --dir ./recordings/r301/ --weapon r301 --update
```

### 4. Web UI Session Integration & Proportional Accumulation
Called automatically by the Express backend (`POST /api/discovery/process-session` and `POST /api/discovery/process-images`):
```bash
# Proportional accumulation (merges into existing spec weighted by sample count)
python -m recoil_discovery.cli session --dir ./captures/session_123/ --weapon r301 --strategy accumulate --existing-samples 5

# Overwrite strategy (replaces existing pattern completely, ideal post-balance-patch)
python -m recoil_discovery.cli session --dir ./captures/session_123/ --weapon r301 --strategy overwrite
```

### 5. Diff Analysis
Compares a newly generated spec JSON against current game specs:
```bash
python -m recoil_discovery.cli diff --input new_spec.json --plot
```

### 6. Export to Arduino Mouse
Regenerates `arduino_mouse/src/recoil.inc` from `client/specs.json`:
```bash
python -m recoil_discovery.cli export-arduino
```

---

## Running Tests

All mathematical conversions, signal detection, decal tracking, and pipeline aggregation are covered by unit tests:
```bash
python -m pytest tests
```
