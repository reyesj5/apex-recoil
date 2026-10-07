"""
Unit tests for recoil_discovery.aggregator.
"""

import numpy as np
import pytest
from recoil_discovery.aggregator import RecoilAggregator


def test_median_delta_recoil_recovers_true_path():
    """
    Simulate 5 spray trials of a weapon:
    True base path + random gaussian spread on each shot.
    Assert that median_delta_recoil reconstructs the true pattern with low error.
    """
    np.random.seed(42)
    # True underlying path (e.g. 10 shots kicking up and drifting right)
    true_dx = [0, 5, 8, 12, 10, 4, -2, -5, -8, -10]
    true_dy = [0, -25, -30, -35, -20, -15, -10, -5, -2, -1]

    true_x = np.cumsum(true_dx)
    true_y = np.cumsum(true_dy)

    trials = []
    for _ in range(7):
        # Add random bullet bloom/jitter (std = 3.0 px)
        noise_x = np.random.normal(0, 3.0, size=len(true_x))
        noise_y = np.random.normal(0, 3.0, size=len(true_y))
        trials.append({
            "x": (true_x + noise_x).tolist(),
            "y": (true_y + noise_y).tolist()
        })

    mx, my, sx, sy = RecoilAggregator.median_delta_recoil(trials)

    assert len(mx) == len(true_x)
    assert len(my) == len(true_y)
    # Average error between recovered path and ground truth should be small (< 3 px)
    err_x = np.mean(np.abs(np.array(mx) - true_x))
    err_y = np.mean(np.abs(np.array(my) - true_y))
    assert err_x < 3.0
    assert err_y < 5.0


def test_convergence_evaluation():
    trials = [
        {"x": [0, 10, 20, 30], "y": [0, -20, -40, -60]},
        {"x": [0, 11, 19, 31], "y": [0, -21, -39, -59]},
        {"x": [0, 9, 21, 29], "y": [0, -19, -41, -61]},
    ]
    conv = RecoilAggregator.evaluate_convergence(trials)
    assert conv["convergence_score"] > 90.0
    assert len(conv["outlier_trials"]) == 0


def test_weighted_merge_recoil_proportional_weight():
    """
    Test proportional weighting:
    Existing spec built with 10 samples (x = [0, 100], y = [0, -100]).
    New sample built with 1 sample (x = [0, 111], y = [0, -89]).
    Merged spec should weight existing by 10/11 and new by 1/11.
    Expected shot 1 x: (10*100 + 1*111) / 11 = 1111 / 11 = 101.0
    Expected shot 1 y: (10*-100 + 1*-89) / 11 = -1089 / 11 = -99.0
    Total sample_count: 11
    """
    existing_spec = {
        "name": "r301",
        "x": [0.0, 100.0],
        "y": [0.0, -100.0],
        "raw_1x_x": [0.0, 136.99],
        "raw_1x_y": [0.0, -136.99],
        "sample_count": 10
    }
    new_spec = {
        "name": "r301",
        "x": [0.0, 111.0],
        "y": [0.0, -89.0],
        "raw_1x_x": [0.0, 152.05],
        "raw_1x_y": [0.0, -121.92]
    }

    merged = RecoilAggregator.weighted_merge_recoil(existing_spec, new_spec, existing_weight=10, new_weight=1)
    assert merged["sample_count"] == 11
    assert merged["x"][0] == 0.0
    assert merged["x"][1] == 101.0
    assert merged["y"][0] == 0.0
    assert merged["y"][1] == -99.0


def test_mean_recoil_empty():
    mx, my = RecoilAggregator.mean_recoil([])
    assert mx == []
    assert my == []
    mx2, my2 = RecoilAggregator.mean_recoil([{"x": [], "y": []}])
    assert mx2 == []
    assert my2 == []


def test_weighted_merge_recoil_syncs_time_points():
    existing_spec = {
        "name": "flatline",
        "rpm": 600,
        "x": [0, 5, 10, 15, 20],
        "y": [0, -10, -20, -30, -40],
        "time_points": [0, 100, 200, 300, 400],
        "sample_count": 5
    }
    new_spec = {
        "name": "flatline",
        "rpm": 600,
        "x": [0, 6, 12],
        "y": [0, -9, -21],
        "time_points": [0, 100, 200]
    }
    merged = RecoilAggregator.weighted_merge_recoil(existing_spec, new_spec, existing_weight=5, new_weight=1)
    assert len(merged["x"]) == 5
    assert len(merged["y"]) == 5
    assert len(merged["time_points"]) == 5
    assert merged["time_points"] == [0, 100, 200, 300, 400]


