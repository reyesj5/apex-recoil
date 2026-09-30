"""
High-level automated recoil discovery pipeline.
Orchestrates video extraction, angle calibration, statistical aggregation,
and weapon spec generation.
"""

import sys
import math
import base64
from collections import deque
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import cv2
import numpy as np

from .shot_detector import (
    auto_measure_shots_and_rpm,
    generate_ideal_time_points,
)
from .tracker import DecalTracker, tone_map_hdr_image
from .math_utils import scale_to_game_distances, angular_pixel_distance
from .aggregator import RecoilAggregator
from .spec_manager import SpecManager


class RecoilPipeline:
    """
    End-to-end pipeline for capturing, processing, and updating weapon recoil.
    """

    def __init__(self, specs_path: Optional[Path] = None):
        self.tracker = DecalTracker()
        self.spec_manager = SpecManager(specs_path=specs_path)

    def process_video_clip(
        self,
        video_path: Path,
        weapon_name: str,
        expected_shots: Optional[int] = None,
        rpm: Optional[float] = None,
        anchor_distance_override: Optional[float] = None,
        anchor_angles: Optional[Tuple[float, float, float, float]] = None,
        zoom: float = 1.0,
        wall_image_path: Optional[Path] = None,
        fov: float = 104.0,
        hdr: str = "auto"
    ) -> Dict[str, Any]:
        """
        Process a gameplay video clip of a wall spray.
        Automatically measures shot count and RPM from video transients if omitted.
        If wall_image_path is provided, extracts high-res bullet decals directly from the
        post-reload ADS screenshot while using the video for RPM and firing cadence.
        """
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise FileNotFoundError(f"Cannot open video file: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 60.0
        frames_gray = []
        brightness_deltas = []
        prev_gray = None
        recent_bgr_frames = deque(maxlen=25)

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            frames_gray.append(gray)
            recent_bgr_frames.append(frame)

            if prev_gray is not None:
                # Frame delta as a proxy for muzzle flash / screen kick
                delta = float(np.mean(cv2.absdiff(gray, prev_gray)))
                brightness_deltas.append(delta)
            else:
                brightness_deltas.append(0.0)
            prev_gray = gray

        cap.release()

        # 1. Automatically detect shot frames and RPM from video transients
        detected_shots, measured_rpm, shot_frames, time_points_ms = auto_measure_shots_and_rpm(
            brightness_deltas,
            fps=fps
        )

        final_rpm = rpm if (rpm is not None and rpm > 0) else measured_rpm
        if not final_rpm or final_rpm <= 0:
            final_rpm = 600.0

        if expected_shots and len(shot_frames) != expected_shots:
            # If user explicitly requested N shots, slice or pad
            if len(shot_frames) > expected_shots:
                shot_frames = shot_frames[:expected_shots]
                time_points_ms = time_points_ms[:expected_shots]

        print(f"[+] Video Analysis: Auto-measured {len(shot_frames)} shots at {final_rpm:.1f} RPM", file=sys.stderr)

        # 2. Extract bullet impact decals
        # In gameplay recordings, active firing frames are occluded by weapon viewmodels,
        # muzzle flash, and reload HUD indicators.
        # Prefer the dedicated static wall screenshot snapped in ADS after reload.
        target_points = expected_shots if expected_shots else len(shot_frames)
        raw_x: List[float] = []
        raw_y: List[float] = []
        meta: Dict[str, Any] = {"frame_points": [], "origin": [0.0, 0.0]}
        settled_bgr = None

        if wall_image_path is not None and Path(wall_image_path).exists():
            wall_img = cv2.imread(str(wall_image_path))
            if wall_img is not None:
                if hdr == "auto":
                    if len(wall_img.shape) == 3:
                        hsv = cv2.cvtColor(wall_img, cv2.COLOR_BGR2HSV)
                        if float(hsv[:, :, 2].mean()) > 155.0:
                            wall_img = tone_map_hdr_image(wall_img, "natural")
                elif hdr in ["natural", "vibrant", "hdr-standard", "hdr-vibrant"]:
                    wall_img = tone_map_hdr_image(wall_img, "natural" if "standard" in hdr else hdr)

                thresholds = [80, 70, 90, 60, 100, 50, 110] if target_points else [80]
                for th in thresholds:
                    rx, ry, m = self.tracker.extract_from_static_image(
                        wall_img,
                        expected_points=target_points,
                        threshold_val=th,
                        return_metadata=True,
                        hdr_mode="off"
                    )
                    if target_points and len(rx) == target_points:
                        raw_x, raw_y, meta = rx, ry, m
                        break
                    if len(rx) > len(raw_x):
                        raw_x, raw_y, meta = rx, ry, m
                if raw_x:
                    settled_bgr = wall_img
                    print(f"[+] Wall Screenshot Analysis: Extracted {len(raw_x)} decals from {Path(wall_image_path).name}", file=sys.stderr)

        # Fallback to settled frames at the end of the video if wall screenshot was not provided or had no decals
        if not raw_x and frames_gray:
            baseline_gray = frames_gray[3] if len(frames_gray) > 5 else None
            res = self.tracker.extract_from_settled_frames(
                frames_gray,
                target_points,
                baseline_frame=baseline_gray,
                return_metadata=True
            )
            raw_x, raw_y, meta = res
            settled_offset = meta.get("frame_index", -3)

            # Fallback to temporal video frame differencing if settled extraction did not find decals
            if not raw_x or (target_points and len(raw_x) < target_points * 0.5):
                alt_x, alt_y = self.tracker.extract_from_video_frames(frames_gray, shot_frames)
                if len(alt_x) > len(raw_x):
                    raw_x, raw_y = alt_x, alt_y
                    meta["frame_points"] = []
                    meta["origin"] = [0.0, 0.0]

            if recent_bgr_frames:
                recent_list = list(recent_bgr_frames)
                if abs(settled_offset) <= len(recent_list):
                    settled_bgr = recent_list[settled_offset]
                else:
                    settled_bgr = recent_list[-1]

        frame_data_url = ""
        frame_w = 0
        frame_h = 0
        scaled_frame_points = []
        scaled_origin = [0.0, 0.0]

        if settled_bgr is not None:
            if hdr == "auto":
                if len(settled_bgr.shape) == 3:
                    hsv = cv2.cvtColor(settled_bgr, cv2.COLOR_BGR2HSV)
                    if float(hsv[:, :, 2].mean()) > 155.0:
                        settled_bgr = tone_map_hdr_image(settled_bgr, "natural")
            elif hdr in ["natural", "vibrant", "hdr-standard", "hdr-vibrant"]:
                settled_bgr = tone_map_hdr_image(settled_bgr, "natural" if "standard" in hdr else hdr)

            orig_h, orig_w = settled_bgr.shape[:2]
            scale = 1.0
            if orig_w > 1920:
                scale = 1920.0 / orig_w
                preview_img = cv2.resize(settled_bgr, (1920, int(orig_h * scale)))
            else:
                preview_img = settled_bgr

            frame_w = preview_img.shape[1]
            frame_h = preview_img.shape[0]

            _, buffer = cv2.imencode(".jpg", preview_img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            img_b64 = base64.b64encode(buffer).decode("utf-8")
            frame_data_url = f"data:image/jpeg;base64,{img_b64}"

            scaled_frame_points = [
                [round(p[0] * scale, 1), round(p[1] * scale, 1)]
                for p in meta.get("frame_points", [])
            ]
            orig = meta.get("origin", [0.0, 0.0])
            scaled_origin = [round(orig[0] * scale, 1), round(orig[1] * scale, 1)]

        # 3. Scaling
        in_game_dist = None
        if anchor_angles:
            p_a, y_a, p_b, y_b = anchor_angles
            in_game_dist = angular_pixel_distance(p_a, y_a, p_b, y_b)
        elif anchor_distance_override:
            in_game_dist = anchor_distance_override

        if in_game_dist and len(raw_x) >= 2:
            # Anchor indices: first and last shot or extreme points
            ia = 0
            ib = int(np.argmax(np.abs(raw_y)))
            if ia != ib:
                scaled_x, scaled_y = scale_to_game_distances(raw_x, raw_y, [ia, ib], in_game_dist)
            else:
                scaled_x, scaled_y = raw_x, raw_y
        else:
            # Convert screenshot decal pixels to canonical in-game mouse units (at 1080p reference)
            # Reference calibration at FOV 90: 1 1080p 1x decal pixel = ~3.36 in-game mouse counts (mickeys)
            # Perspective projection: focal length scales with 1 / tan(fov / 2).
            # At 104 FOV, decals on screen are ~22% smaller, so each pixel represents more mouse deflection counts.
            z = zoom if (zoom and zoom > 0) else 1.0
            ref_h = orig_h if settled_bgr is not None else (frames_gray[0].shape[0] if frames_gray else 1080)
            fov_rad = math.radians(fov / 2.0)
            fov_factor = 1.0 / math.tan(fov_rad) if math.tan(fov_rad) > 0 else 1.0
            px_to_mouse = ((3.36 / z) * (1080.0 / ref_h) / fov_factor) if ref_h > 0 else ((3.36 / z) / fov_factor)
            scaled_x = [round(float(x * px_to_mouse), 2) for x in raw_x]
            scaled_y = [round(float(y * px_to_mouse), 2) for y in raw_y]

        time_points = generate_ideal_time_points(len(scaled_x), final_rpm)

        return {
            "weapon": weapon_name,
            "x": scaled_x,
            "y": scaled_y,
            "raw_x": raw_x,
            "raw_y": raw_y,
            "time_points": time_points,
            "rpm": final_rpm,
            "source_file": str(video_path),
            "frame_image": frame_data_url,
            "frame_points": scaled_frame_points,
            "origin": scaled_origin,
            "frame_width": frame_w,
            "frame_height": frame_h
        }

    def process_static_image(
        self,
        image_path: Path,
        weapon_name: str,
        expected_shots: int,
        rpm: float,
        anchor_distance: Optional[float] = None,
        zoom: float = 1.0,
        fov: float = 104.0,
        hdr: str = "auto"
    ) -> Dict[str, Any]:
        """
        Process a static screenshot of a wall pattern (e.g. assets/recoils/*.png).
        """
        img = cv2.imread(str(image_path))
        if img is None:
            raise FileNotFoundError(f"Cannot open image file: {image_path}")

        if hdr == "auto":
            if len(img.shape) == 3:
                hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
                if float(hsv[:, :, 2].mean()) > 155.0:
                    img = tone_map_hdr_image(img, "natural")
        elif hdr in ["natural", "vibrant", "hdr-standard", "hdr-vibrant"]:
            img = tone_map_hdr_image(img, "natural" if "standard" in hdr else hdr)

        raw_x, raw_y, meta = self.tracker.extract_from_static_image(
            img,
            expected_points=expected_shots,
            return_metadata=True,
            hdr_mode="off"
        )

        orig_h, orig_w = img.shape[:2]
        scale = 1.0
        if orig_w > 1920:
            scale = 1920.0 / orig_w
            preview_img = cv2.resize(img, (1920, int(orig_h * scale)))
        else:
            preview_img = img

        frame_w = preview_img.shape[1]
        frame_h = preview_img.shape[0]

        _, buffer = cv2.imencode(".jpg", preview_img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        img_b64 = base64.b64encode(buffer).decode("utf-8")
        frame_data_url = f"data:image/jpeg;base64,{img_b64}"

        scaled_frame_points = [
            [round(p[0] * scale, 1), round(p[1] * scale, 1)]
            for p in meta.get("frame_points", [])
        ]
        orig = meta.get("origin", [0.0, 0.0])
        scaled_origin = [round(orig[0] * scale, 1), round(orig[1] * scale, 1)]

        if anchor_distance and len(raw_x) >= 2:
            ia = 0
            ib = int(np.argmax(np.abs(raw_y)))
            scaled_x, scaled_y = scale_to_game_distances(raw_x, raw_y, [ia, ib], anchor_distance)
        else:
            # Convert screenshot decal pixels to canonical in-game mouse units (at 1080p reference)
            # Reference calibration at FOV 90: 1 1080p 1x decal pixel = ~3.36 in-game mouse counts (mickeys)
            # Perspective projection: focal length scales with 1 / tan(fov / 2).
            # At 104 FOV, decals on screen are ~22% smaller, so each pixel represents more mouse deflection counts.
            z = zoom if (zoom and zoom > 0) else 1.0
            fov_rad = math.radians(fov / 2.0)
            fov_factor = 1.0 / math.tan(fov_rad) if math.tan(fov_rad) > 0 else 1.0
            px_to_mouse = ((3.36 / z) * (1080.0 / orig_h) / fov_factor) if orig_h > 0 else ((3.36 / z) / fov_factor)
            scaled_x = [round(float(x * px_to_mouse), 2) for x in raw_x]
            scaled_y = [round(float(y * px_to_mouse), 2) for y in raw_y]

        time_points = generate_ideal_time_points(len(scaled_x), rpm)

        return {
            "weapon": weapon_name,
            "x": scaled_x,
            "y": scaled_y,
            "raw_x": raw_x,
            "raw_y": raw_y,
            "time_points": time_points,
            "rpm": rpm,
            "source_file": str(image_path),
            "frame_image": frame_data_url,
            "frame_points": scaled_frame_points,
            "origin": scaled_origin,
            "frame_width": frame_w,
            "frame_height": frame_h
        }

    def aggregate_and_build_spec(
        self,
        trials: List[Dict[str, Any]],
        weapon_name: str,
        rpm: float,
        multiplier: float = 0.73,
        merge_strategy: str = "overwrite",
        existing_spec: Optional[Dict[str, Any]] = None,
        existing_sample_count: int = 1
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Combine multiple trials using median delta recoil, evaluate convergence,
        and optionally merge proportionally with an existing weapon spec.
        Returns (spec_dict, convergence_metrics)
        """
        if not trials:
            raise ValueError("No trials to aggregate")

        mx, my, sx, sy = RecoilAggregator.median_delta_recoil(trials)
        convergence = RecoilAggregator.evaluate_convergence(trials)
        time_points = generate_ideal_time_points(len(mx), rpm)

        mult_x = [round(float(x * multiplier), 2) for x in mx]
        mult_y = [round(float(y * multiplier), 2) for y in my]

        batch_spec = {
            "name": weapon_name,
            "rpm": int(rpm),
            "multiplier": multiplier,
            "mags": [{"size": len(mx), "audio": f"{weapon_name}_{len(mx)}"}],
            "mods": {},
            "x": mult_x,
            "y": mult_y,
            "raw_1x_x": mx,
            "raw_1x_y": my,
            "time_points": time_points,
            "ping_points": [],
            "sample_count": len(trials)
        }

        if merge_strategy == "accumulate" and existing_spec and existing_spec.get("x") and len(mx) >= len(existing_spec["x"]) * 0.6:
            merged_spec = RecoilAggregator.weighted_merge_recoil(
                existing_spec=existing_spec,
                new_spec=batch_spec,
                existing_weight=existing_sample_count,
                new_weight=len(trials)
            )
            merged_spec["standalone_batch_spec"] = batch_spec
            merged_spec["existing_sample_count"] = existing_sample_count
            merged_spec["new_sample_count"] = len(trials)
            merged_spec["total_sample_count"] = existing_sample_count + len(trials)
            merged_spec["merge_strategy"] = "accumulate"
            if existing_spec.get("mags"):
                merged_spec["mags"] = existing_spec["mags"]
            return merged_spec, convergence
        else:
            batch_spec["standalone_batch_spec"] = batch_spec
            batch_spec["existing_sample_count"] = 0
            batch_spec["new_sample_count"] = len(trials)
            batch_spec["total_sample_count"] = len(trials)
            batch_spec["merge_strategy"] = "overwrite"
            return batch_spec, convergence

    def process_clips_session(
        self,
        clip_paths: List[Path],
        weapon_name: str,
        expected_shots: Optional[int] = None,
        rpm: Optional[float] = None,
        multiplier: float = 0.73,
        zoom: float = 1.0,
        fov: float = 104.0,
        hdr: str = "auto",
        merge_strategy: str = "overwrite",
        existing_sample_count: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Process a list of recorded spray video clips, extract individual recoil curves,
        measure RPM across all clips, and aggregate into a single high-precision weapon spec.
        """
        if not clip_paths:
            raise ValueError("No video clips provided")

        trials = []
        measured_rpms = []

        for p in clip_paths:
            wall_img_path = p.with_name(f"{p.stem}_wall.jpg")
            if not wall_img_path.exists():
                wall_img_path = p.with_name(f"{p.stem}_wall.png")

            trial = self.process_video_clip(
                video_path=p,
                weapon_name=weapon_name,
                expected_shots=expected_shots,
                rpm=rpm,
                zoom=zoom,
                wall_image_path=wall_img_path if wall_img_path.exists() else None,
                fov=fov,
                hdr=hdr
            )
            trials.append(trial)
            if trial.get("rpm"):
                measured_rpms.append(trial["rpm"])

        effective_rpm = rpm if (rpm and rpm > 0) else (float(np.median(measured_rpms)) if measured_rpms else 600.0)

        existing_spec = self.spec_manager.get_weapon_spec(weapon_name)
        actual_existing_count = 1
        if existing_spec:
            if existing_sample_count is not None and existing_sample_count > 0:
                actual_existing_count = existing_sample_count
            elif "sample_count" in existing_spec:
                actual_existing_count = int(existing_spec.get("sample_count", 1))

        spec, convergence = self.aggregate_and_build_spec(
            trials=trials,
            weapon_name=weapon_name,
            rpm=effective_rpm,
            multiplier=multiplier,
            merge_strategy=merge_strategy,
            existing_spec=existing_spec,
            existing_sample_count=actual_existing_count
        )

        best_trial = trials[0] if trials else {}
        for t in trials:
            if t.get("frame_image") and len(t.get("frame_points", [])) >= len(best_trial.get("frame_points", [])):
                best_trial = t

        return {
            "spec": spec,
            "convergence": convergence,
            "trials_count": len(trials),
            "measured_rpm": effective_rpm,
            "zoom": zoom,
            "fov": fov,
            "preview_image": best_trial.get("frame_image"),
            "preview_points": best_trial.get("frame_points", []),
            "preview_origin": best_trial.get("origin", [0, 0]),
            "frame_width": best_trial.get("frame_width", 0),
            "frame_height": best_trial.get("frame_height", 0),
            "individual_trials": [
                {
                    "source": Path(t.get("source_file", "")).name,
                    "shots": len(t.get("x", [])),
                    "x": t.get("x", []),
                    "y": t.get("y", []),
                    "raw_x": t.get("raw_x", []),
                    "raw_y": t.get("raw_y", []),
                    "frame_points": t.get("frame_points", []),
                    "origin": t.get("origin", [0, 0]),
                    "frame_image": t.get("frame_image"),
                    "frame_width": t.get("frame_width", 0),
                    "frame_height": t.get("frame_height", 0),
                    "rpm": t.get("rpm")
                }
                for t in trials
            ]
        }

    def process_images_session(
        self,
        image_paths: List[Path],
        weapon_name: str,
        expected_shots: int,
        rpm: float,
        multiplier: float = 0.73,
        zoom: float = 1.0,
        distance: float = 20.0,
        fov: float = 104.0,
        hdr: str = "auto",
        merge_strategy: str = "overwrite",
        existing_sample_count: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Process a list of wall screenshot images, extract individual decal patterns,
        and aggregate into a unified multi-spray spec.
        """
        trials = []
        for p in image_paths:
            trial = self.process_static_image(
                image_path=p,
                weapon_name=weapon_name,
                expected_shots=expected_shots,
                rpm=rpm,
                zoom=zoom,
                fov=fov,
                hdr=hdr
            )
            trials.append(trial)

        existing_spec = self.spec_manager.get_weapon_spec(weapon_name)
        actual_existing_count = 1
        if existing_spec:
            if existing_sample_count is not None and existing_sample_count > 0:
                actual_existing_count = existing_sample_count
            elif "sample_count" in existing_spec:
                actual_existing_count = int(existing_spec.get("sample_count", 1))

        spec, convergence = self.aggregate_and_build_spec(
            trials=trials,
            weapon_name=weapon_name,
            rpm=rpm,
            multiplier=multiplier,
            merge_strategy=merge_strategy,
            existing_spec=existing_spec,
            existing_sample_count=actual_existing_count
        )

        best_trial = trials[0] if trials else {}
        for t in trials:
            if t.get("frame_image") and len(t.get("frame_points", [])) >= len(best_trial.get("frame_points", [])):
                best_trial = t

        return {
            "spec": spec,
            "convergence": convergence,
            "trials_count": len(trials),
            "measured_rpm": rpm,
            "zoom": zoom,
            "fov": fov,
            "preview_image": best_trial.get("frame_image"),
            "preview_points": best_trial.get("frame_points", []),
            "preview_origin": best_trial.get("origin", [0, 0]),
            "frame_width": best_trial.get("frame_width", 0),
            "frame_height": best_trial.get("frame_height", 0),
            "individual_trials": [
                {
                    "source": Path(t.get("source_file", "")).name,
                    "shots": len(t.get("x", [])),
                    "x": t.get("x", []),
                    "y": t.get("y", []),
                    "raw_x": t.get("raw_x", []),
                    "raw_y": t.get("raw_y", []),
                    "frame_points": t.get("frame_points", []),
                    "origin": t.get("origin", [0, 0]),
                    "frame_image": t.get("frame_image"),
                    "frame_width": t.get("frame_width", 0),
                    "frame_height": t.get("frame_height", 0),
                    "rpm": rpm
                }
                for t in trials
            ]
        }

