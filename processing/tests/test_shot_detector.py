"""
Unit tests for recoil_discovery.shot_detector.
"""

import numpy as np
import pytest
from recoil_discovery.shot_detector import (
    auto_measure_shots_and_rpm,
    generate_ideal_time_points,
    detect_shot_timestamps_from_signal,
)


def test_auto_measure_shots_and_rpm_synthetic_800rpm():
    """
    Simulate a 60 FPS video with 25 shots fired at 800 RPM.
    800 RPM -> 60 / 800 = 0.075s interval -> at 60 FPS: 4.5 frames per shot.
    """
    fps = 60.0
    target_rpm = 800.0
    interval_frames = fps * (60.0 / target_rpm)  # 4.5 frames
    total_shots = 25

    total_frames = int(total_shots * interval_frames) + 20
    signal = np.zeros(total_frames)

    for i in range(total_shots):
        frame_idx = int(round(10 + i * interval_frames))
        if frame_idx < total_frames:
            signal[frame_idx] = 1.0  # Spikes representing muzzle flash

    shots, measured_rpm, shot_frames, time_points = auto_measure_shots_and_rpm(signal.tolist(), fps=fps)

    assert shots == total_shots
    assert np.isclose(measured_rpm, target_rpm, atol=25.0)  # within ~3% of target RPM
    assert len(shot_frames) == total_shots
    assert len(time_points) == total_shots
    assert time_points[0] == 0


def test_auto_measure_shots_and_rpm_synthetic_600rpm():
    """
    Simulate 600 RPM (Flatline fire rate) at 60 FPS:
    600 RPM -> 60 / 600 = 0.1s -> 6 frames per shot.
    """
    fps = 60.0
    target_rpm = 600.0
    interval_frames = 6
    total_shots = 20

    total_frames = total_shots * interval_frames + 20
    signal = np.zeros(total_frames)

    for i in range(total_shots):
        signal[10 + i * interval_frames] = 1.0

    shots, measured_rpm, shot_frames, time_points = auto_measure_shots_and_rpm(signal.tolist(), fps=fps)

    assert shots == total_shots
    assert np.isclose(measured_rpm, target_rpm, atol=10.0)


def test_generate_ideal_time_points():
    pts = generate_ideal_time_points(mag_size=5, rpm=600.0)
    # 600 RPM -> 100ms per shot
    assert pts == [0, 100, 200, 300, 400]
