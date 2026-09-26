"""
Apex Legends Automated Recoil Discovery Package.
"""

from .math_utils import (
    gamea,
    vec,
    vang,
    angular_pixel_distance,
    vector_length,
    rc_score,
    scale_to_game_distances,
)
from .shot_detector import detect_shot_timestamps_from_signal, generate_ideal_time_points
from .tracker import DecalTracker
from .ocr_calibrator import AngleCalibrator
from .aggregator import RecoilAggregator
from .spec_manager import SpecManager
from .pipeline import RecoilPipeline

__all__ = [
    "gamea",
    "vec",
    "vang",
    "angular_pixel_distance",
    "vector_length",
    "rc_score",
    "scale_to_game_distances",
    "detect_shot_timestamps_from_signal",
    "generate_ideal_time_points",
    "DecalTracker",
    "AngleCalibrator",
    "RecoilAggregator",
    "SpecManager",
    "RecoilPipeline",
]
