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


def test_extract_from_settled_frames():
    tracker = DecalTracker()
    h, w = 400, 400

    # Create synthetic series of frames where the last frames contain settled bullet holes
    blank_frame = np.full((h, w), 220, dtype=np.uint8)
    settled_frame = blank_frame.copy()

    # 5 bullet holes
    positions = [(200, 320), (205, 270), (212, 220), (220, 170), (228, 120)]
    for pos in positions:
        cv2.circle(settled_frame, pos, 6, 20, -1)

    frames = [blank_frame.copy() for _ in range(10)] + [settled_frame.copy() for _ in range(10)]

    x, y = tracker.extract_from_settled_frames(frames, expected_points=5)
    assert len(x) == 5
    assert len(y) == 5
    assert x[0] == 0.0
    assert y[0] == 0.0
    assert y[-1] < 0


def test_extract_gameplay_target_board_with_dark_pillars():
    """Verify that gameplay target board isolation and Black Top-Hat ignore dark pillars and gun models."""
    tracker = DecalTracker()
    h, w = 720, 1280
    frame = np.full((h, w), 50, dtype=np.uint8) # Dark scene / pillars

    # Bright target board in center
    frame[150:520, 480:800] = 190

    # Bullet decals on the target board
    true_positions = [
        (640, 460),
        (638, 420),
        (642, 380),
        (645, 340),
        (641, 300),
    ]
    for pos in true_positions:
        cv2.circle(frame, pos, 5, 25, -1)

    x, y, meta = tracker.extract_from_static_image(frame, expected_points=5, return_metadata=True)
    assert len(x) == 5
    assert len(y) == 5
    # First point near (640, 460)
    origin = meta["origin"]
    assert np.isclose(origin[0], 640, atol=2.0)
    assert np.isclose(origin[1], 460, atol=2.0)
    assert y[-1] < 0


def test_extract_target_board_20m_with_pillar_seam_noise():
    """Verify that 20m target board isolation rejects pillar seam artifacts and distant noise."""
    tracker = DecalTracker()
    h, w = 1080, 1920
    frame = np.full((h, w), 50, dtype=np.uint8)

    # Wide target board in center at 20m
    frame[160:800, 600:1320] = 185

    # Bullet pattern in center of board
    true_positions = [
        (960, 650),
        (958, 610),
        (962, 570),
        (965, 530),
        (960, 490),
    ]
    for pos in true_positions:
        cv2.circle(frame, pos, 6, 25, -1)

    # Artificial shadow / screw artifact right at the pillar boundary seam
    cv2.circle(frame, (605, 500), 10, 20, -1)
    cv2.circle(frame, (1315, 480), 8, 20, -1)

    x, y, meta = tracker.extract_from_static_image(frame, expected_points=5, return_metadata=True)
    assert len(x) == 5
    assert len(y) == 5
    # Origin should be the first shot at (960, 650)
    origin = meta["origin"]
    assert np.isclose(origin[0], 960, atol=3.0)
    assert np.isclose(origin[1], 650, atol=3.0)
    # Ensure neither pillar seam artifact at x=605 or x=1315 was included in the path
    frame_points = meta["frame_points"]
    for pt in frame_points:
        assert pt[0] > 700 and pt[0] < 1200


def test_tone_map_hdr_image():
    from recoil_discovery.tracker import tone_map_hdr_image

    # Over-bright HDR image (mean brightness > 200)
    overbright = np.full((100, 100, 3), 220, dtype=np.uint8)
    # Add a dark decal
    cv2.circle(overbright, (50, 50), 10, (30, 30, 30), -1)

    natural = tone_map_hdr_image(overbright, mode="natural")
    vibrant = tone_map_hdr_image(overbright, mode="vibrant")
    off = tone_map_hdr_image(overbright, mode="off")

    assert natural.shape == overbright.shape
    assert natural.mean() < overbright.mean()
    assert vibrant.mean() < natural.mean()
    assert np.array_equal(off, overbright)

    # Test grayscale
    gray_overbright = np.full((100, 100), 220, dtype=np.uint8)
    gray_tm = tone_map_hdr_image(gray_overbright, mode="natural")
    assert gray_tm.mean() < gray_overbright.mean()



