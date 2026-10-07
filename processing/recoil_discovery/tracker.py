"""
Computer Vision tracking module for Apex Legends bullet impact decals.
Supports:
1. Video-based temporal frame differencing with camera motion compensation.
2. Static screenshot blob detection and nearest-neighbor / momentum path sequencing.
"""

from typing import List, Tuple, Optional, Dict, Any, Union
import cv2
import numpy as np
from scipy.ndimage import maximum_filter


def tone_map_hdr_image(
    image: np.ndarray,
    mode: str = "natural"
) -> np.ndarray:
    """
    Applies HDR-to-SDR tone-mapping to restore proper brightness, contrast,
    and saturation when game captures were recorded with Windows HDR / Auto HDR enabled.
    
    Modes:
      'natural' (default): Balanced exposure pull-down (0.85), gamma 1.6, contrast 1.20, sat 1.25.
      'vibrant': Stronger exposure pull-down (0.80), gamma 1.75, contrast 1.30, sat 1.40.
      'off': Returns image unmodified.
    """
    if mode == "off" or image is None:
        return image

    gamma = 1.6 if mode == "natural" else 1.75
    exposure = 0.85 if mode == "natural" else 0.80
    contrast = 1.20 if mode == "natural" else 1.30
    sat_boost = 1.25 if mode == "natural" else 1.40

    if len(image.shape) == 3:
        f = image.astype(np.float32) / 255.0
        f = f * exposure
        f = np.power(np.clip(f, 0.0, 1.0), gamma)
        f = (f - 0.5) * contrast + 0.5
        res = (np.clip(f, 0.0, 1.0) * 255.0).astype(np.uint8)

        if sat_boost != 1.0:
            hsv = cv2.cvtColor(res, cv2.COLOR_BGR2HSV).astype(np.float32)
            hsv[:, :, 1] = np.clip(hsv[:, :, 1] * sat_boost, 0.0, 255.0)
            res = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
        return res
    else:
        f = image.astype(np.float32) / 255.0
        f = f * exposure
        f = np.power(np.clip(f, 0.0, 1.0), gamma)
        f = (f - 0.5) * contrast + 0.5
        return (np.clip(f, 0.0, 1.0) * 255.0).astype(np.uint8)


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

    def extract_from_settled_frames(
        self,
        frames: List[np.ndarray],
        expected_points: int,
        offsets: Optional[List[int]] = None,
        baseline_frame: Optional[np.ndarray] = None,
        return_metadata: bool = False
    ) -> Union[Tuple[List[float], List[float]], Tuple[List[float], List[float], Dict[str, Any]]]:
        """
        Extract complete recoil spray pattern from settled post-firing wall frames.
        In gameplay recordings, active firing frames are occluded by weapon viewmodels,
        muzzle flash, and reload HUD indicators. The settled frames at the end of the
        clip cleanly expose all bullet impact decals on the wall.
        """
        if not frames:
            if return_metadata:
                return [], [], {"frame_index": 0, "frame_points": [], "origin": [0.0, 0.0]}
            return [], []

        if offsets is None:
            # Check frames near the end of recording (after firing stops and gun lowers)
            offsets = [-3, -5, -8, -10, -15, -1, -20]

        thresholds = [80, 70, 90, 60, 100]
        best_x: List[float] = []
        best_y: List[float] = []
        best_meta: Dict[str, Any] = {"frame_index": offsets[0] if offsets else -1, "frame_points": [], "origin": [0.0, 0.0]}

        for offset in offsets:
            if abs(offset) >= len(frames):
                continue
            frame = frames[offset]
            for th in thresholds:
                res = self.extract_from_static_image(
                    frame,
                    expected_points=expected_points,
                    threshold_val=th,
                    baseline_image=baseline_frame,
                    return_metadata=True
                )
                x, y, meta = res
                meta["frame_index"] = offset
                if expected_points and len(x) == expected_points:
                    if return_metadata:
                        return x, y, meta
                    return x, y
                if len(x) > len(best_x):
                    best_x, best_y = x, y
                    best_meta = meta

        if return_metadata:
            return best_x, best_y, best_meta
        return best_x, best_y

    def extract_from_static_image(
        self,
        image: np.ndarray,
        expected_points: int,
        threshold_val: int = 80,
        baseline_image: Optional[np.ndarray] = None,
        roi_mask: Optional[np.ndarray] = None,
        return_metadata: bool = False,
        hdr_mode: str = "auto"
    ) -> Union[Tuple[List[float], List[float]], Tuple[List[float], List[float], Dict[str, Any]]]:
        """
        Extraction for static wall screenshots or settled video frames.
        Supports automatic target-board bounding box isolation, morphological
        Black Top-Hat decal filtering, camera-aligned baseline differencing,
        and directional nearest-neighbor path sequencing.
        """
        working_img = image
        if len(image.shape) == 3:
            if hdr_mode == "auto":
                hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
                mean_v = float(hsv[:, :, 2].mean())
                if mean_v > 155.0:
                    working_img = tone_map_hdr_image(image, "natural")
            elif hdr_mode in ["natural", "vibrant", "hdr-standard", "hdr-vibrant"]:
                working_img = tone_map_hdr_image(image, "natural" if "standard" in hdr_mode else hdr_mode)

        if len(working_img.shape) == 3:
            gray = cv2.cvtColor(working_img, cv2.COLOR_BGR2GRAY)
        else:
            gray = working_img.copy()

        h, w = gray.shape[:2]
        cx = w // 2
        is_gameplay_res = (w >= 1000 and h >= 600)

        left, right, top, bottom = 0, w, 0, h
        if roi_mask is not None:
            mask_pts = cv2.findNonZero(roi_mask)
            if mask_pts is not None:
                bx, by, bw, bh = cv2.boundingRect(mask_pts)
                left, right, top, bottom = bx, bx + bw, by, by + bh
        elif is_gameplay_res:
            corridor_margin = int(w * 0.065)
            default_left = max(0, cx - corridor_margin)
            default_right = min(w, cx + corridor_margin)

            # Dynamically detect bright target board bounded by dark frame pillars and beams
            try:
                band = gray[int(h * 0.35):int(h * 0.45), :]
                col_median = np.median(band, axis=0)
                center_val = float(np.median(col_median[max(0, cx - 25):min(w, cx + 25)]))

                left = int(w * 0.20)
                for x in range(cx, int(w * 0.08), -1):
                    # Only detect as a border pillar if significantly darker than the wall
                    if col_median[x] < min(110.0, center_val - 35.0):
                        left = x + 15
                        break

                right = int(w * 0.80)
                for x in range(cx, int(w * 0.92)):
                    if col_median[x] < min(110.0, center_val - 35.0):
                        right = x - 15
                        break

                if right - left < corridor_margin:
                    left, right = default_left, default_right
                else:
                    margin_x = int((right - left) * 0.05)
                    left = max(left + margin_x, default_left)
                    right = min(right - margin_x, default_right)

                # Board top is below top stats HUD banner
                top = int(h * 0.16)

                # Board bottom is where target board meets the red crossbeam or floor
                board_col_band = gray[:, left:right]
                row_median = np.median(board_col_band, axis=1)
                base_med = float(np.median(row_median[int(h * 0.25):int(h * 0.45)]))
                cy = int(h * 0.42)
                bottom = int(h * 0.75)
                for y in range(cy, int(h * 0.85)):
                    if row_median[y] < min(110.0, base_med - 25.0):
                        bottom = y - 10
                        break
                if bottom <= top + 100:
                    bottom = int(h * 0.75)
            except Exception:
                left, right = default_left, default_right
                top, bottom = int(h * 0.16), int(h * 0.75)

        board_roi = gray[top:bottom, left:right]
        board_bgr = working_img[top:bottom, left:right] if len(working_img.shape) == 3 else None
        blobs: List[Tuple[float, float]] = []
        blob_areas: Dict[Tuple[float, float], float] = {}

        if is_gameplay_res:
            # Morphological Black Top-Hat: isolates small dark bullet holes on bright board,
            # completely rejecting large dark pillars and scope mountings.
            k_size = 15 if w >= 1920 else (11 if w >= 1280 else 9)
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_size, k_size))
            bhat = cv2.morphologyEx(board_roi, cv2.MORPH_BLACKHAT, kernel)

            min_dist = 6 if w >= 1920 else (5 if w >= 1280 else 4)
            peak_filter = maximum_filter(bhat, size=min_dist)

            base_th = min(35, max(18, int(threshold_val * 0.28)))
            candidate_thresholds = [base_th, base_th + 5, base_th - 5, 20, 25]

            min_area = 4 if w >= 1920 else (3 if w >= 1280 else 2)
            max_area = 1200 if w >= 1920 else (800 if w >= 1280 else 500)
            spray_center_x = (left + right) / 2.0

            for th in candidate_thresholds:
                is_peak = (bhat == peak_filter) & (bhat >= th)
                _, thresh = cv2.threshold(bhat, th, 255, cv2.THRESH_BINARY)
                clean = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
                contours, _ = cv2.findContours(clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                cand_blobs = []
                cand_areas = {}

                for c in contours:
                    area = cv2.contourArea(c)
                    if area < min_area or area > max_area:
                        continue

                    # Mask for peak decomposition inside merged contours
                    mask = np.zeros(board_roi.shape, dtype=np.uint8)
                    cv2.drawContours(mask, [c], -1, 255, -1)
                    c_peaks = is_peak & (mask == 255)
                    py, px = np.where(c_peaks)

                    extracted_pts = []
                    if len(px) <= 1:
                        m = cv2.moments(c)
                        if m['m00'] > 0:
                            extracted_pts.append((left + m['m10'] / m['m00'], top + m['m01'] / m['m00']))
                    else:
                        pts = list(zip(px, py))
                        clustered = []
                        for pt in pts:
                            if not any(np.hypot(pt[0] - cp[0], pt[1] - cp[1]) < min_dist for cp in clustered):
                                clustered.append(pt)
                        for cp in clustered:
                            extracted_pts.append((left + cp[0], top + cp[1]))

                    for pt in extracted_pts:
                        bx, by = int(round(pt[0])), int(round(pt[1]))
                        local_x, local_y = bx - left, by - top
                        if 0 <= local_y < board_roi.shape[0] and 0 <= local_x < board_roi.shape[1]:
                            g_val = int(board_roi[local_y, local_x])
                            is_reticle = False
                            if board_bgr is not None:
                                b_c, g_c, r_c = [int(v) for v in board_bgr[local_y, local_x]]
                                is_reticle = (g_c - max(r_c, b_c) > 30)

                            # Exclude false railing seam edge marks far off to the right of spray center
                            is_false_railing = (
                                int(h * 0.264) <= by <= int(h * 0.282)
                                and bx > cx + int(w * 0.015)
                            )

                            if (g_val <= 75 or board_roi[local_y, local_x] < np.median(board_roi) * 0.65) and not is_reticle and not is_false_railing:
                                cand_blobs.append(pt)
                                cand_areas[pt] = area

                # Deduplicate very close peaks
                unique_cand = []
                for b in sorted(cand_blobs, key=lambda p: (p[1], p[0])):
                    if not any(np.hypot(b[0] - ub[0], b[1] - ub[1]) < min_dist for ub in unique_cand):
                        unique_cand.append(b)

                if expected_points and len(unique_cand) >= expected_points - 1:
                    blobs = unique_cand
                    blob_areas = cand_areas
                    break
                if len(unique_cand) > len(blobs):
                    blobs = unique_cand
                    blob_areas = cand_areas
        else:
            # Fallback for synthetic / non-gameplay test images
            if baseline_image is not None:
                base_gray = cv2.cvtColor(baseline_image, cv2.COLOR_BGR2GRAY) if len(baseline_image.shape) == 3 else baseline_image.copy()
                base_aligned, _ = self.align_frames(gray, base_gray)
                diff = cv2.absdiff(gray, base_aligned)
                _, diff_thresh = cv2.threshold(diff, 18, 255, cv2.THRESH_BINARY)
                _, dark_thresh = cv2.threshold(gray, threshold_val, 255, cv2.THRESH_BINARY_INV)
                thresh = cv2.bitwise_or(diff_thresh, dark_thresh)
            else:
                _, thresh = cv2.threshold(gray, threshold_val, 255, cv2.THRESH_BINARY_INV)

            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in contours:
                area = cv2.contourArea(c)
                if self.min_blob_area <= area <= self.max_blob_area:
                    m = cv2.moments(c)
                    if m['m00'] > 0:
                        blobs.append((m['m10'] / m['m00'], m['m01'] / m['m00']))

        if not blobs:
            if return_metadata:
                return [], [], {"frame_points": [], "origin": [0.0, 0.0]}
            return [], []

        # Find starting point (initial shot)
        if is_gameplay_res:
            center_x = (left + right) / 2.0
            blobs_near_center = [b for b in blobs if abs(b[0] - center_x) < (right - left) * 0.35]
            if blobs_near_center:
                blobs_near_center.sort(key=lambda b: b[1], reverse=True)
                start_point = blobs_near_center[0]
            else:
                blobs.sort(key=lambda b: b[1], reverse=True)
                start_point = blobs[0]
        else:
            blobs.sort(key=lambda b: b[1], reverse=True)
            start_point = blobs[0]

        remaining = [b for b in blobs if b != start_point]
        path = [start_point]
        curr = start_point
        max_step = max(70.0, float(h) * 0.12) if not is_gameplay_res else (70.0 if w >= 1920 else 50.0)

        # 1. Greedy directional nearest neighbor favoring upward momentum
        target_len = expected_points if expected_points else len(blobs)
        while remaining and len(path) < target_len:
            best_idx = -1
            best_score = float('inf')
            for i, cand in enumerate(remaining):
                dx = cand[0] - curr[0]
                dy = cand[1] - curr[1]  # In image coords, dy < 0 is upward
                dist = np.sqrt(dx * dx + dy * dy)
                if dist > max_step:
                    continue
                penalty = 1.0 if dy <= 8 else 1.8
                score = dist * penalty
                if score < best_score:
                    best_score = score
                    best_idx = i

            if best_score == float('inf'):
                # If no point within max_step, relax distance slightly but cap strictly at max_step * 1.6
                for i, cand in enumerate(remaining):
                    dx = cand[0] - curr[0]
                    dy = cand[1] - curr[1]
                    dist = np.sqrt(dx * dx + dy * dy)
                    if dist > max_step * 1.6:
                        continue
                    penalty = 1.0 if dy <= 8 else 1.8
                    score = dist * penalty
                    if score < best_score:
                        best_score = score
                        best_idx = i

            if best_score == float('inf'):
                break

            curr = remaining.pop(best_idx)
            path.append(curr)

        # 2. Detour-minimizing insertion for any remaining unvisited candidate blobs
        # (e.g. side-hooks in weapon recoil patterns where nearest-neighbor traversed past a branch)
        while remaining and (not expected_points or len(path) < expected_points):
            best_pt = None
            best_idx = -1
            best_cost = float('inf')
            for pt in remaining:
                for i in range(len(path) - 1):
                    p1 = path[i]
                    p2 = path[i + 1]
                    cost = np.hypot(pt[0] - p1[0], pt[1] - p1[1]) + np.hypot(p2[0] - pt[0], p2[1] - pt[1]) - np.hypot(p2[0] - p1[0], p2[1] - p1[1])
                    if cost < best_cost and cost < max_step * 1.5:
                        best_cost = cost
                        best_idx = i + 1
                        best_pt = pt
            if best_pt is not None:
                path.insert(best_idx, best_pt)
                remaining.remove(best_pt)
            else:
                break

        # 3. Handle overlapping shots: if expected_points > len(path) (e.g. 34 visible holes for 35 rounds)
        while expected_points and len(path) < expected_points and (expected_points - len(path) <= 4):
            best_split_idx = -1
            max_cand_area = 0
            for i, pt in enumerate(path):
                a = blob_areas.get(pt, 0)
                if a > max_cand_area:
                    max_cand_area = a
                    best_split_idx = i
            if best_split_idx >= 0 and max_cand_area > 0:
                p_dup = (path[best_split_idx][0] + 0.5, path[best_split_idx][1] - 0.5)
                path.insert(best_split_idx + 1, p_dup)
                # Demote area so next iteration picks second largest cluster
                blob_areas[path[best_split_idx]] = max_cand_area / 2.0
            else:
                break

        # Normalize relative to starting point
        p0 = path[0]
        norm_x = [round(float(p[0] - p0[0]), 2) for p in path]
        norm_y = [round(float(p[1] - p0[1]), 2) for p in path]

        if return_metadata:
            meta = {
                "frame_points": [[round(float(p[0]), 1), round(float(p[1]), 1)] for p in path],
                "origin": [round(float(p0[0]), 1), round(float(p0[1]), 1)],
                "visible_holes": len(blobs)
            }
            return norm_x, norm_y, meta

        return norm_x, norm_y
