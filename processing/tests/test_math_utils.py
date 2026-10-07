"""
Unit tests for recoil_discovery.math_utils.
"""

import numpy as np
import pytest
from recoil_discovery.math_utils import (
    gamea,
    vec,
    vang,
    angular_pixel_distance,
    vector_length,
    scale_to_game_distances,
    rc_score,
)


def test_vec_unit_length():
    rad = gamea(-15.0, 120.0)
    v = vec(rad)
    assert np.isclose(np.linalg.norm(v), 1.0, atol=1e-5)


def test_vang():
    v1 = np.array([1.0, 0.0, 0.0])
    v2 = np.array([0.0, 1.0, 0.0])
    assert np.isclose(vang(v1, v2), 90.0, atol=1e-5)
    assert np.isclose(vang(v1, v1), 0.0, atol=1e-5)


def test_angular_pixel_distance_ground_truth():
    """
    Test against exact outputs from processing/recoils.ipynb:
    print(np.round(points(-3.16, 134.51, -13.95, 134.77), 2)) -> 490.59
    print(np.round(points(-16.09, -167.97, -5.71, -169.34), 2)) -> 475.75
    print(np.round(points(-18.22, -173.22, -6.04, -174.02), 2)) -> 554.77
    """
    d1 = angular_pixel_distance(-3.16, 134.51, -13.95, 134.77)
    assert round(d1, 2) == 490.59

    d2 = angular_pixel_distance(-16.09, -167.97, -5.71, -169.34)
    assert round(d2, 2) == 475.75

    d3 = angular_pixel_distance(-18.22, -173.22, -6.04, -174.02)
    assert round(d3, 2) == 554.77


def test_scale_to_game_distances():
    raw_x = [0.0, 10.0, 20.0, 50.0]
    raw_y = [0.0, -10.0, -30.0, -100.0]
    # Anchors between shot 0 and shot 3: raw distance ~ sqrt(50^2 + 100^2) = 111.803
    anchor_dist = 223.61  # exactly 2x
    scaled_x, scaled_y = scale_to_game_distances(raw_x, raw_y, [0, 3], anchor_dist)
    assert np.isclose(scaled_x[1], 20.0, atol=0.2)
    assert np.isclose(scaled_y[3], -200.0, atol=0.2)


def test_rc_score():
    r1 = {"x": [0, 10, 20], "y": [0, -15, -30]}
    # Perfect match should be 100
    assert np.isclose(rc_score(r1, r1), 100.0, atol=0.1)

    # Completely deviated match should be significantly lower (shot 0 matches at origin, subsequent deviate)
    r2 = {"x": [0, 100, 200], "y": [0, 150, 300]}
    assert rc_score(r1, r2) <= 35.0
