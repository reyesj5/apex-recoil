"""
Computer Vision tracking module for Apex Legends bullet impact decals.
Supports:
1. Video-based temporal frame differencing with camera motion compensation.
2. Static screenshot blob detection and nearest-neighbor / momentum path sequencing.
"""

from typing import List, Tuple, Optional, Dict, Any
import cv2
import numpy as np


class DecalTracker:
    """
    Tracks bullet impact decals across video frames or in static screenshots.
    """

    def __init__(
        self,
        min_blob_area: int = 12,
        max_blob_area: int = 2500,
        diff_threshold: int = 25
    ):
        self.min_blob_area = min_blob_area
        self.max_blob_area = max_blob_area
        self.diff_threshold = diff_threshold

    def align_frames(
        self,
        reference_gray: np.ndarray,
        target_gray: np.ndarray
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """
        Estimate camera translation / homography and align target frame to reference.
        Returns: (aligned_target_frame, transformation_matrix)
        """
        # Fast translation estimation using phase correlation
        h, w = reference_gray.shape
        try:
            # Hann window to reduce edge effects
            shift, response = cv2.phaseCorrelate(
                reference_gray.astype(np.float32),
                target_gray.astype(np.float32)
            )
            dx, dy = shift[0], shift[1]
            # If shift is reasonable (< 50% frame dimensions), apply translation
            if abs(dx) < w * 0.5 and abs(dy) < h * 0.5 and response > 0.05:
                trans_mat = np.float32([[1, 0, -dx], [0, 1, -dy]])
                aligned = cv2.warpAffine(target_gray, trans_mat, (w, h), flags=cv2.INTER_LINEAR)
                return aligned, trans_mat
        except Exception:
            pass

        # Feature-based fallback (ORB)
        try:
            orb = cv2.ORB_create(nfeatures=500)
            kp1, des1 = orb.detectAndCompute(reference_gray, None)
            kp2, des2 = orb.detectAndCompute(target_gray, None)
            if des1 is not None and des2 is not None and len(kp1) >= 4 and len(kp2) >= 4:
                matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
                matches = matcher.match(des1, des2)
                matches = sorted(matches, key=lambda x: x.distance)[:50]
                if len(matches) >= 4:
                    src_pts = np.float32([kp2[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)
                    dst_pts = np.float32([kp1[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
                    h_mat, _ = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
                    if h_mat is not None:
                        aligned = cv2.warpPerspective(target_gray, h_mat, (w, h))
                        return aligned, h_mat
        except Exception:
            pass

        return target_gray, None

    def find_new_impact_centroid(
        self,
        prev_frame_gray: np.ndarray,
        curr_frame_gray: np.ndarray,
        roi_mask: Optional[np.ndarray] = None
    ) -> Optional[Tuple[float, float]]:
        """
        Detect newly appeared bullet hole between two consecutive aligned frames.
        Returns: (centroid_x, centroid_y) or None if no clear impact found.
        """
        diff = cv2.absdiff(curr_frame_gray, prev_frame_gray)
        if roi_mask is not None:
            diff = cv2.bitwise_and(diff, diff, mask=roi_mask)

        # Morphological smoothing to remove noise particles
        blurred = cv2.GaussianBlur(diff, (5, 5), 0)
        _, thresh = cv2.threshold(blurred, self.diff_threshold, 255, cv2.THRESH_BINARY)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)

        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        valid_candidates = []
        for c in contours:
            area = cv2.contourArea(c)
            if self.min_blob_area <= area <= self.max_blob_area:
                m = cv2.moments(c)
                if m['m00'] > 0:
                    cx = m['m10'] / m['m00']
                    cy = m['m01'] / m['m00']
                    valid_candidates.append((area, cx, cy))

        if not valid_candidates:
            return None

        # Pick candidate with most prominent change
        valid_candidates.sort(key=lambda x: x[0], reverse=True)
        return valid_candidates[0][1], valid_candidates[0][2]

    def extract_from_video_frames(
        self,
        frames_gray: List[np.ndarray],
        shot_frame_indices: List[int]
    ) -> Tuple[List[float], List[float]]:
        """
        Track bullet impacts sequentially across video frames at shot timestamps.
        Returns ordered coordinates (x_list, y_list) normalized to start at (0, 0).
        """
        if not frames_gray or not shot_frame_indices:
            return [], []

        ref_frame = frames_gray[0]
        detected_points: List[Tuple[float, float]] = []

        # Reference anchor before any shot
        prev_aligned = ref_frame

        for shot_idx, f_idx in enumerate(shot_frame_indices):
            if f_idx >= len(frames_gray):
                break
            curr_raw = frames_gray[f_idx]
            curr_aligned, _ = self.align_frames(ref_frame, curr_raw)

            # Detect new impact decal
            centroid = self.find_new_impact_centroid(prev_aligned, curr_aligned)
            if centroid is not None:
                detected_points.append(centroid)
            elif detected_points:
                # Fallback: estimate from previous momentum
                detected_points.append(detected_points[-1])
            else:
                h, w = ref_frame.shape
                detected_points.append((w / 2.0, h / 2.0))

            prev_aligned = curr_aligned

        if not detected_points:
            return [], []

        # Normalize relative to initial impact
        p0 = detected_points[0]
        # In specs.json: y is negative for upward movement
        norm_x = [round(float(p[0] - p0[0]), 2) for p in detected_points]
        norm_y = [round(float(p[1] - p0[1]), 2) for p in detected_points]
        return norm_x, norm_y

    def extract_from_static_image(
        self,
        image: np.ndarray,
        expected_points: int,
        threshold_val: int = 80
    ) -> Tuple[List[float], List[float]]:
        """
        Fallback extraction for static wall screenshots (e.g. assets/recoils/*.png).
        Uses connected component analysis + directional path sequencing.
        """
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()

        # Dark bullet holes on lighter wall -> invert
        _, thresh = cv2.threshold(gray, threshold_val, 255, cv2.THRESH_BINARY_INV)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)

        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        blobs: List[Tuple[float, float]] = []
        for c in contours:
            area = cv2.contourArea(c)
            if self.min_blob_area <= area <= self.max_blob_area:
                m = cv2.moments(c)
                if m['m00'] > 0:
                    blobs.append((m['m10'] / m['m00'], m['m01'] / m['m00']))

        if not blobs:
            return [], []

        # Order blobs: Start from the bottom-most blob (initial shot before upward kick)
        blobs.sort(key=lambda b: b[1], reverse=True)
        start_point = blobs[0]
        remaining = blobs[1:]
        path = [start_point]

        curr = start_point
        # Greedy directional nearest neighbor favoring upward momentum
        while remaining and len(path) < expected_points:
            best_idx = 0
            best_score = float('inf')
            for i, cand in enumerate(remaining):
                dx = cand[0] - curr[0]
                dy = cand[1] - curr[1]  # In image coords, dy < 0 is upward
                dist = np.sqrt(dx * dx + dy * dy)
                # Upward preference penalty if moving downward
                penalty = 1.0 if dy <= 5 else 2.5
                score = dist * penalty
                if score < best_score:
                    best_score = score
                    best_idx = i
            curr = remaining.pop(best_idx)
            path.append(curr)

        # Normalize relative to starting point
        p0 = path[0]
        norm_x = [round(float(p[0] - p0[0]), 2) for p in path]
        norm_y = [round(float(p[1] - p0[1]), 2) for p in path]
        return norm_x, norm_y
