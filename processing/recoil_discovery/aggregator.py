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

    @staticmethod
    def weighted_merge_recoil(
        existing_spec: Dict[str, Any],
        new_spec: Dict[str, Any],
        existing_weight: int = 1,
        new_weight: int = 1
    ) -> Dict[str, Any]:
        """
        Combines an existing canonical recoil spec with a newly analyzed spec,
        weighting each coordinate proportionally:
            combined = (existing_weight * old + new_weight * new) / (existing_weight + new_weight)
        
        Args:
            existing_spec: Dict containing existing 'x', 'y', optional 'raw_1x_x', 'raw_1x_y'
            new_spec: Dict containing new 'x', 'y', 'raw_1x_x', 'raw_1x_y'
            existing_weight: Number of historical trials the existing spec represents (e.g. 10)
            new_weight: Number of new trials analyzed in this batch (e.g. 1)

        Returns:
            Merged spec dict with updated coordinates and 'sample_count'
        """
        if not existing_spec or not existing_spec.get('x'):
            merged = dict(new_spec) if new_spec else {}
            merged['sample_count'] = new_weight
            return merged

        if not new_spec or not new_spec.get('x'):
            merged = dict(existing_spec)
            merged['sample_count'] = existing_weight
            return merged

        w_old = float(existing_weight)
        w_new = float(new_weight)
        w_total = w_old + w_new

        old_x, old_y = existing_spec['x'], existing_spec['y']
        new_x, new_y = new_spec['x'], new_spec['y']
        max_len = max(len(old_x), len(new_x))

        merged_x = []
        merged_y = []

        for i in range(max_len):
            if i < len(old_x) and i < len(new_x):
                val_x = (w_old * old_x[i] + w_new * new_x[i]) / w_total
                val_y = (w_old * old_y[i] + w_new * new_y[i]) / w_total
            elif i < len(old_x):
                val_x = old_x[i]
                val_y = old_y[i]
            else:
                val_x = new_x[i]
                val_y = new_y[i]
            merged_x.append(round(float(val_x), 2))
            merged_y.append(round(float(val_y), 2))

        merged = dict(new_spec)
        merged['x'] = merged_x
        merged['y'] = merged_y
        merged['sample_count'] = int(w_total)

        # Merge raw_1x coordinates if present
        if 'raw_1x_x' in existing_spec and 'raw_1x_x' in new_spec:
            old_rx, old_ry = existing_spec['raw_1x_x'], existing_spec['raw_1x_y']
            new_rx, new_ry = new_spec['raw_1x_x'], new_spec['raw_1x_y']
            max_rlen = max(len(old_rx), len(new_rx))
            merged_rx = []
            merged_ry = []
            for i in range(max_rlen):
                if i < len(old_rx) and i < len(new_rx):
                    rx = (w_old * old_rx[i] + w_new * new_rx[i]) / w_total
                    ry = (w_old * old_ry[i] + w_new * new_ry[i]) / w_total
                elif i < len(old_rx):
                    rx = old_rx[i]
                    ry = old_ry[i]
                else:
                    rx = new_rx[i]
                    ry = new_ry[i]
                merged_rx.append(round(float(rx), 2))
                merged_ry.append(round(float(ry), 2))
            merged['raw_1x_x'] = merged_rx
            merged['raw_1x_y'] = merged_ry

        return merged
