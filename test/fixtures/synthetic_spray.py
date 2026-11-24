"""
Writes a synthetic wall-spray clip for the integration tests: a white target board, one dark
decal per shot (6 shots, 100 ms apart at 60 fps, i.e. 600 RPM) and a muzzle-flash brightness
spike on every shot frame. Optionally also writes the last frame as a wall screenshot.

    python test/fixtures/synthetic_spray.py out.webm [wall.png]
"""

import sys

import cv2
import numpy as np

SHOT_FRAMES = (10, 16, 22, 28, 34, 40)


def write_clip(path, wall_path=None, n_frames=60, size=(320, 240)):
    w, h = size
    fourcc = cv2.VideoWriter_fourcc(*("VP80" if path.endswith(".webm") else "MJPG"))
    writer = cv2.VideoWriter(path, fourcc, 60.0, (w, h))
    points = [(160 + 6 * i, 160 - 14 * i) for i in range(len(SHOT_FRAMES))]
    last = None
    for f in range(n_frames):
        img = np.full((h, w, 3), 70, np.uint8)
        cv2.rectangle(img, (40, 20), (280, 220), (235, 235, 235), -1)
        for k, s in enumerate(SHOT_FRAMES):
            if f >= s:
                cv2.circle(img, points[k], 3, (25, 25, 25), -1)
        last = img.copy()
        if f in SHOT_FRAMES:
            img = cv2.add(img, np.full_like(img, 60))
        writer.write(img)
    writer.release()
    if wall_path:
        cv2.imwrite(wall_path, last)


if __name__ == "__main__":
    write_clip(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
