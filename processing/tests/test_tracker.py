"""
Unit tests for recoil_discovery.tracker.
"""

import cv2
import numpy as np
import pytest
from recoil_discovery.tracker import DecalTracker


def test_find_new_impact_centroid():
    tracker = DecalTracker(diff_threshold=20)
    h, w = 300, 300

    # Frame 1: blank gray wall
    f1 = np.full((h, w), 200, dtype=np.uint8)

    # Frame 2: wall with a new bullet hole at (120, 160) with radius 5
    f2 = f1.copy()
    cv2.circle(f2, (120, 160), 6, 40, -1)

    centroid = tracker.find_new_impact_centroid(f1, f2)
    assert centroid is not None
    cx, cy = centroid
    assert np.isclose(cx, 120, atol=1.0)
    assert np.isclose(cy, 160, atol=1.0)


def test_extract_from_video_frames_sequential():
    tracker = DecalTracker(diff_threshold=20)
    h, w = 400, 400

    # Ground truth positions (drifting right and kicking up)
    true_positions = [
        (200, 300),  # shot 0
        (205, 270),  # shot 1
        (212, 235),  # shot 2
        (220, 195),  # shot 3
        (225, 150),  # shot 4
    ]

    frames = []
    base_frame = np.full((h, w), 180, dtype=np.uint8)
    frames.append(base_frame.copy())

    curr_frame = base_frame.copy()
    for pos in true_positions:
        cv2.circle(curr_frame, pos, 5, 30, -1)
        frames.append(curr_frame.copy())

    # Shot frames indices: 1, 2, 3, 4, 5
    shot_indices = [1, 2, 3, 4, 5]
    x_coords, y_coords = tracker.extract_from_video_frames(frames, shot_indices)

    assert len(x_coords) == len(true_positions)
    assert len(y_coords) == len(true_positions)

    # First point should be (0, 0)
    assert x_coords[0] == 0.0
    assert y_coords[0] == 0.0

    # Test that relative movements match ground truth
    p0 = true_positions[0]
    for i in range(1, len(true_positions)):
        expected_x = true_positions[i][0] - p0[0]
        expected_y = true_positions[i][1] - p0[1]  # negative for upward kick
        assert np.isclose(x_coords[i], expected_x, atol=1.5)
        assert np.isclose(y_coords[i], expected_y, atol=1.5)


def test_extract_from_static_image():
    tracker = DecalTracker()
    h, w = 400, 400
    img = np.full((h, w), 220, dtype=np.uint8)

    # 4 bullet holes kicking upward
    positions = [(200, 300), (205, 250), (210, 200), (215, 150)]
    for pos in positions:
        cv2.circle(img, pos, 6, 20, -1)

    x, y = tracker.extract_from_static_image(img, expected_points=4, threshold_val=100)
    assert len(x) == 4
    assert len(y) == 4
    assert x[0] == 0.0
    assert y[0] == 0.0
    # Y should move negatively (upward in specs convention)
    assert y[-1] < 0
