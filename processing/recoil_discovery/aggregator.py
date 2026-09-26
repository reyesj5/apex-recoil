"""
Statistical aggregation module for multi-trial recoil patterns.
Combines multiple spray captures using median-delta integration to eliminate
random bullet spread/bloom and isolate the true deterministic recoil curve.
"""

from typing import List, Dict, Tuple, Any
import numpy as np
from .math_utils import rc_score


class RecoilAggregator:
    """
    Aggregates multiple spray trials of a weapon.
    """

    @staticmethod
    def median_delta_recoil(
        trials: List[Dict[str, Any]]
    ) -> Tuple[List[float], List[float], List[float], List[float]]:
        """
        Calculates the canonical recoil curve using median step deltas across trials.
        Returns:
            (median_x, median_y, std_x, std_y)
        """
        if not trials:
            return [], [], [], []

        # Find the common valid length across all trials
        min_len = min(len(t['x']) for t in trials)
        if min_len <= 1:
            return trials[0]['x'][:min_len], trials[0]['y'][:min_len], [0.0] * min_len, [0.0] * min_len

        mx = [0.0]
        my = [0.0]
        sx = [0.0]
        sy = [0.0]
        curr_x = 0.0
        curr_y = 0.0

        for i in range(1, min_len):
            dx_list = []
            dy_list = []
            for t in trials:
                dx_list.append(t['x'][i] - t['x'][i - 1])
                dy_list.append(t['y'][i] - t['y'][i - 1])

            med_dx = float(np.median(dx_list))
            med_dy = float(np.median(dy_list))

            curr_x += med_dx
            curr_y += med_dy

            mx.append(round(curr_x, 1))
            my.append(round(curr_y, 1))
            sx.append(round(float(np.std(dx_list)), 2))
            sy.append(round(float(np.std(dy_list)), 2))

        return mx, my, sx, sy

    @staticmethod
    def mean_recoil(
        trials: List[Dict[str, Any]]
    ) -> Tuple[List[float], List[float]]:
        """
        Calculates the mean recoil curve.
        """
        if not trials:
            return [], []
        min_len = min(len(t['x']) for t in trials)
        mx = [0.0]
        my = [0.0]
        for i in range(1, min_len):
            x_vals = [t['x'][i] for t in trials]
            y_vals = [t['y'][i] for t in trials]
            mx.append(round(float(np.mean(x_vals)), 1))
            my.append(round(float(np.mean(y_vals)), 1))
        return mx, my

    @staticmethod
    def evaluate_convergence(trials: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculates pairwise similarity scores between trials to evaluate convergence.
        Returns average score and identifies any outlier trials (< 80 score).
        """
        n = len(trials)
        if n < 2:
            return {"convergence_score": 100.0, "outlier_trials": []}

        matrix = np.zeros((n, n))
        for i in range(n):
            for j in range(i + 1, n):
                score = rc_score(trials[i], trials[j])
                matrix[i, j] = score
                matrix[j, i] = score

        avg_scores = [float(np.mean([matrix[i, j] for j in range(n) if i != j])) for i in range(n)]
        overall_score = float(np.mean(avg_scores))
        outliers = [idx for idx, s in enumerate(avg_scores) if s < 75.0]

        return {
            "convergence_score": round(overall_score, 1),
            "outlier_trials": outliers,
            "trial_scores": [round(s, 1) for s in avg_scores]
        }
