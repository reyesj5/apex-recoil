"""
High-level automated recoil discovery pipeline.
Orchestrates video extraction, angle calibration, statistical aggregation,
and weapon spec generation.
"""

from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import cv2
import numpy as np

from .shot_detector import (
    auto_measure_shots_and_rpm,
    generate_ideal_time_points,
)
from .tracker import DecalTracker
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
        anchor_angles: Optional[Tuple[float, float, float, float]] = None
    ) -> Dict[str, Any]:
        """
        Process a gameplay video clip of a wall spray.
        Automatically measures shot count and RPM from video transients if omitted.
        """
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise FileNotFoundError(f"Cannot open video file: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 60.0
        frames_gray = []
        brightness_deltas = []
        prev_gray = None

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            frames_gray.append(gray)

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

        print(f"[+] Video Analysis: Auto-measured {len(shot_frames)} shots at {final_rpm:.1f} RPM")

        # 2. Track bullet impact decals across detected frames
        raw_x, raw_y = self.tracker.extract_from_video_frames(frames_gray, shot_frames)

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
            scaled_x, scaled_y = raw_x, raw_y

        time_points = generate_ideal_time_points(len(scaled_x), final_rpm)

        return {
            "weapon": weapon_name,
            "x": scaled_x,
            "y": scaled_y,
            "time_points": time_points,
            "rpm": final_rpm,
            "source_file": str(video_path)
        }

    def process_static_image(
        self,
        image_path: Path,
        weapon_name: str,
        expected_shots: int,
        rpm: float,
        anchor_distance: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Process a static screenshot of a wall pattern (e.g. assets/recoils/*.png).
        """
        img = cv2.imread(str(image_path))
        if img is None:
            raise FileNotFoundError(f"Cannot open image file: {image_path}")

        raw_x, raw_y = self.tracker.extract_from_static_image(img, expected_points=expected_shots)

        if anchor_distance and len(raw_x) >= 2:
            ia = 0
            ib = int(np.argmax(np.abs(raw_y)))
            scaled_x, scaled_y = scale_to_game_distances(raw_x, raw_y, [ia, ib], anchor_distance)
        else:
            scaled_x, scaled_y = raw_x, raw_y

        time_points = generate_ideal_time_points(len(scaled_x), rpm)

        return {
            "weapon": weapon_name,
            "x": scaled_x,
            "y": scaled_y,
            "time_points": time_points,
            "rpm": rpm,
            "source_file": str(image_path)
        }

    def aggregate_and_build_spec(
        self,
        trials: List[Dict[str, Any]],
        weapon_name: str,
        rpm: float,
        multiplier: float = 0.73
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        Combine multiple trials using median delta recoil, evaluate convergence,
        and build spec object ready for client/specs.json.
        Returns (spec_dict, convergence_metrics)
        """
        if not trials:
            raise ValueError("No trials to aggregate")

        mx, my, sx, sy = RecoilAggregator.median_delta_recoil(trials)
        convergence = RecoilAggregator.evaluate_convergence(trials)
        time_points = generate_ideal_time_points(len(mx), rpm)

        spec = {
            "name": weapon_name,
            "rpm": int(rpm),
            "multiplier": multiplier,
            "mags": [{"size": len(mx), "audio": f"{weapon_name}_{len(mx)}"}],
            "mods": {},
            "x": mx,
            "y": my,
            "time_points": time_points,
            "ping_points": []
        }

        return spec, convergence

    def process_clips_session(
        self,
        clip_paths: List[Path],
        weapon_name: str,
        rpm: Optional[float] = None,
        multiplier: float = 0.73
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
            trial = self.process_video_clip(
                video_path=p,
                weapon_name=weapon_name,
                rpm=rpm
            )
            trials.append(trial)
            if trial.get("rpm"):
                measured_rpms.append(trial["rpm"])

        effective_rpm = rpm if (rpm and rpm > 0) else (float(np.median(measured_rpms)) if measured_rpms else 600.0)

        spec, convergence = self.aggregate_and_build_spec(
            trials=trials,
            weapon_name=weapon_name,
            rpm=effective_rpm,
            multiplier=multiplier
        )

        return {
            "spec": spec,
            "convergence": convergence,
            "trials_count": len(trials),
            "measured_rpm": effective_rpm,
            "individual_trials": [
                {
                    "source": Path(t.get("source_file", "")).name,
                    "shots": len(t.get("x", [])),
                    "x": t.get("x", []),
                    "y": t.get("y", []),
                    "rpm": t.get("rpm")
                }
                for t in trials
            ]
        }
