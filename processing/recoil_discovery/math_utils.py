"""
Mathematical and coordinate transformation utilities for Apex Legends recoil patterns.
Based on Source Engine viewangle geometry and mouse sensitivity scale factors.
"""

from typing import List, Tuple, Dict, Any, Union
import numpy as np


def gamea(pitch: float, yaw: float) -> List[float]:
    """
    Convert in-game angles (pitch, yaw in degrees) to radian coordinates.
    In Source engine / Apex Legends:
    Pitch is vertical (negative = looking up, positive = looking down).
    Yaw is horizontal (-180 to +180).
    """
    return [yaw / 180.0 * np.pi, (90.0 - pitch) / 180.0 * np.pi]


def vec(x: Union[List[float], Tuple[float, float], np.ndarray]) -> np.ndarray:
    """
    Compute 3D unit vector from radian coordinates [azimuth, polar_angle].
    """
    azimuth, polar = x[0], x[1]
    return np.array([
        np.cos(azimuth) * np.sin(polar),
        np.sin(azimuth) * np.sin(polar),
        np.cos(polar)
    ])


def vang(a: np.ndarray, b: np.ndarray) -> float:
    """
    Angle between two 3D vectors in degrees.
    Clamped to [-1.0, 1.0] to prevent floating point domain errors in arccos.
    """
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    dot = np.clip(np.dot(a, b) / (norm_a * norm_b), -1.0, 1.0)
    return float(np.arccos(dot) / np.pi * 180.0)


def angular_pixel_distance(pitch_a: float, yaw_a: float, pitch_b: float, yaw_b: float) -> float:
    """
    Calculate pixel/mouse count distance between two vectors defined by in-game angles
    (from +cl_showpos 1).
    0.022 is the Source Engine pitch/yaw sensitivity coefficient at sensitivity 1.0.
    """
    v_a = vec(gamea(pitch_a, yaw_a))
    v_b = vec(gamea(pitch_b, yaw_b))
    deg = vang(v_a, v_b)
    return float(deg / 0.022)


def vector_length(x: Union[float, np.ndarray], y: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """Calculate Euclidean 2D distance."""
    return np.sqrt(x * x + y * y)


def dist_score(x: Union[float, np.ndarray]) -> Union[float, np.ndarray]:
    """Gaussian distance similarity score (0 to 1)."""
    return np.exp(-0.0004 * np.power(x, 2))


def rc_score(r1: Dict[str, Any], r2: Dict[str, Any]) -> float:
    """
    Calculate convergence/similarity score between two recoil trajectories (0 to 100).
    Higher score indicates closer match.
    """
    x1, y1 = np.array(r1['x']), np.array(r1['y'])
    x2, y2 = np.array(r2['x']), np.array(r2['y'])
    min_len = min(len(x1), len(x2))
    if min_len == 0:
        return 0.0
    diff_d = vector_length(x1[:min_len] - x2[:min_len], y1[:min_len] - y2[:min_len])
    scores = dist_score(diff_d)
    return float(100.0 * np.mean(scores))


def scale_to_game_distances(
    x_coords: List[float],
    y_coords: List[float],
    anchor_indices: List[int],
    anchor_in_game_distance: float
) -> Tuple[List[float], List[float]]:
    """
    Scale raw pixel coordinates from image/video to canonical in-game mouse units.
    anchor_indices must contain at least 2 point indices whose distance is anchor_in_game_distance.
    """
    if len(anchor_indices) < 2:
        return x_coords, y_coords

    ia, ib = anchor_indices[0], anchor_indices[1]
    xa, ya = x_coords[ia], y_coords[ia]
    xb, yb = x_coords[ib], y_coords[ib]

    measured_px_dist = float(vector_length(xb - xa, yb - ya))
    if measured_px_dist == 0:
        return x_coords, y_coords

    scale = anchor_in_game_distance / measured_px_dist
    scaled_x = [round(float(x * scale), 2) for x in x_coords]
    scaled_y = [round(float(y * scale), 2) for y in y_coords]
    return scaled_x, scaled_y


def extend_array(lst: list, desired_length: int, fill_value: Any = 0) -> list:
    """Pads a list to desired length with a fill value."""
    return lst + [fill_value] * max(0, desired_length - len(lst))
