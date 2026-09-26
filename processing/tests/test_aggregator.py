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
