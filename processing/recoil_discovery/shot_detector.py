"""
Shot cadence and timing detection module.
Extracts shot timestamps, rate of fire (RPM), and time_points from audio transients
and/or visual recoil kicks in video frames.
"""

from typing import List, Tuple, Optional
import numpy as np
from scipy.signal import find_peaks


def detect_shot_timestamps_from_signal(
    signal: np.ndarray,
    sample_rate: float,
    min_interval_sec: float = 0.04,  # Fastest Apex weapon ~1200 RPM -> ~0.05s
    prominence_factor: float = 0.3
) -> Tuple[List[int], float]:
    """
    Detect shot timestamps from an 1D energy signal (e.g. audio envelope or muzzle flash intensity).
    Returns:
      (time_points_ms, estimated_rpm)
      time_points_ms: millisecond offsets relative to first shot [0, t1, t2, ...]
    """
    if len(signal) == 0:
        return [], 0.0

    # Normalize signal to [0, 1]
    sig_min, sig_max = np.min(signal), np.max(signal)
    if sig_max - sig_min > 1e-6:
        norm_sig = (signal - sig_min) / (sig_max - sig_min)
    else:
        norm_sig = signal

    min_distance = max(1, int(min_interval_sec * sample_rate))
    peaks, properties = find_peaks(
        norm_sig,
        distance=min_distance,
        prominence=prominence_factor
    )

    if len(peaks) == 0:
        return [], 0.0

    peak_times_sec = peaks / sample_rate
    first_shot_sec = peak_times_sec[0]
    time_points_ms = [int(round((t - first_shot_sec) * 1000.0)) for t in peak_times_sec]

    if len(time_points_ms) > 1:
        intervals_sec = np.diff(peak_times_sec)
        median_interval = float(np.median(intervals_sec))
        estimated_rpm = 60.0 / median_interval if median_interval > 0 else 0.0
    else:
        estimated_rpm = 0.0

    return time_points_ms, round(estimated_rpm, 1)


def generate_ideal_time_points(mag_size: int, rpm: float) -> List[int]:
    """
    Generate ideal, theoretical time_points array for a weapon given magazine size and RPM.
    Matches the schema in client/specs.json.
    """
    if rpm <= 0 or mag_size <= 0:
        return [0] * mag_size
    interval_ms = 60000.0 / rpm
    return [int(round(i * interval_ms)) for i in range(mag_size)]


def auto_measure_shots_and_rpm(
    brightness_or_diff_series: List[float],
    fps: float,
    min_rpm: float = 300.0,
    max_rpm: float = 1300.0
) -> Tuple[int, float, List[int], List[int]]:
    """
    Automatically detect the number of shots, RPM, shot frame indices, and time_points
    from a video's visual brightness or delta series without requiring prior knowledge of RPM or mag size.
    Returns:
        (detected_shots, measured_rpm, shot_frame_indices, time_points_ms)
    """
    arr = np.array(brightness_or_diff_series)
    if len(arr) < 2:
        return 0, 0.0, [], []

    min_dist_frames = max(1, int(fps * (60.0 / max_rpm) * 0.70))
    norm_arr = (arr - np.min(arr)) / (np.ptp(arr) + 1e-6)

    # Adaptive prominence thresholding: find the most stable peak cluster
    best_peaks = []
    best_prominence = 0.2
    for p in np.linspace(0.15, 0.45, 10):
        test_peaks, _ = find_peaks(norm_arr, distance=min_dist_frames, prominence=p)
        if len(test_peaks) >= 10:  # Valid weapon spray usually at least 10-15 shots
            best_peaks = test_peaks
            best_prominence = p
            break

    if len(best_peaks) == 0:
        # Fallback to lower threshold
        best_peaks, _ = find_peaks(norm_arr, distance=min_dist_frames, prominence=0.1)

    if len(best_peaks) < 2:
        return len(best_peaks), 0.0, [int(p) for p in best_peaks], [0] * len(best_peaks)

    # Calculate intervals
    frame_intervals = np.diff(best_peaks)
    median_frame_interval = float(np.median(frame_intervals))
    median_sec = median_frame_interval / fps
    measured_rpm = round(60.0 / median_sec, 1) if median_sec > 0 else 0.0

    first_peak = best_peaks[0]
    time_points_ms = [int(round((p - first_peak) / fps * 1000.0)) for p in best_peaks]
    shot_frames = [int(p) for p in best_peaks]

    return len(best_peaks), measured_rpm, shot_frames, time_points_ms

