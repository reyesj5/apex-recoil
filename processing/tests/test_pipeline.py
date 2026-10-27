"""
Unit tests for recoil_discovery.pipeline.
"""

from pathlib import Path
import json
import pytest
from unittest.mock import patch, MagicMock
from recoil_discovery.pipeline import RecoilPipeline


def test_aggregate_and_build_spec():
    pipeline = RecoilPipeline()
    trials = [
        {"x": [0, 5, 10, 15], "y": [0, -20, -40, -60]},
        {"x": [0, 6, 9, 14], "y": [0, -19, -41, -59]},
        {"x": [0, 4, 11, 16], "y": [0, -21, -39, -61]},
    ]
    spec, conv = pipeline.aggregate_and_build_spec(
        trials=trials,
        weapon_name="test_gun",
        rpm=600.0,
        multiplier=0.73
    )

    assert spec["name"] == "test_gun"
    assert spec["rpm"] == 600
    assert spec["multiplier"] == 0.73
    assert len(spec["x"]) == 4
    assert len(spec["y"]) == 4
    assert len(spec["time_points"]) == 4
    assert spec["time_points"] == [0, 100, 200, 300]
    assert conv["convergence_score"] > 80.0


def test_process_clips_session():
    pipeline = RecoilPipeline()

    mock_trial_1 = {"weapon": "r301", "x": [0, 5, 10], "y": [0, -20, -40], "rpm": 810.0, "source_file": "clip1.webm"}
    mock_trial_2 = {"weapon": "r301", "x": [0, 6, 9], "y": [0, -19, -41], "rpm": 810.0, "source_file": "clip2.webm"}

    with patch.object(pipeline, "process_video_clip", side_effect=[mock_trial_1, mock_trial_2]):
        result = pipeline.process_clips_session(
            clip_paths=[Path("clip1.webm"), Path("clip2.webm")],
            weapon_name="r301",
            rpm=None
        )

        assert result["trials_count"] == 2
        assert result["measured_rpm"] == 810.0
        assert result["spec"]["name"] == "r301"
        assert len(result["spec"]["x"]) == 3
        assert len(result["individual_trials"]) == 2


def test_process_clips_session_with_wall_screenshot(tmp_path):
    pipeline = RecoilPipeline()
    clip_path = tmp_path / "spray_01.webm"
    wall_path = tmp_path / "spray_01_wall.jpg"
    clip_path.touch()
    wall_path.touch()

    mock_trial = {
        "weapon": "havoc_tc",
        "x": [0, 2, 4],
        "y": [0, -10, -20],
        "rpm": 672.0,
        "source_file": str(clip_path),
        "frame_image": "data:image/jpeg;base64,abc",
        "frame_points": [[100, 100], [102, 90], [104, 80]],
        "origin": [100.0, 100.0]
    }

    with patch.object(pipeline, "process_video_clip", return_value=mock_trial) as mock_process:
        result = pipeline.process_clips_session(
            clip_paths=[clip_path],
            weapon_name="havoc_tc",
            expected_shots=3
        )

        assert result["trials_count"] == 1
        assert result["spec"]["name"] == "havoc_tc"
        assert mock_process.call_count == 1
        kwargs = mock_process.call_args.kwargs
        assert kwargs.get("wall_image_path") == wall_path


def test_process_images_session(tmp_path):
    pipeline = RecoilPipeline()
    img1 = tmp_path / "img1.jpg"
    img2 = tmp_path / "img2.jpg"
    img1.touch()
    img2.touch()

    mock_trial_1 = {
        "weapon": "havoc",
        "x": [0, 2, 4],
        "y": [0, -10, -20],
        "raw_x": [0, 4, 8],
        "raw_y": [0, -20, -40],
        "rpm": 672.0,
        "source_file": str(img1),
        "frame_image": "data:image/jpeg;base64,img1",
        "frame_points": [[100, 100], [104, 80], [108, 60]],
        "origin": [100.0, 100.0]
    }
    mock_trial_2 = {
        "weapon": "havoc",
        "x": [0, 2.5, 3.8],
        "y": [0, -11, -19],
        "raw_x": [0, 5, 7.6],
        "raw_y": [0, -22, -38],
        "rpm": 672.0,
        "source_file": str(img2),
        "frame_image": "data:image/jpeg;base64,img2",
        "frame_points": [[100, 100], [105, 78], [107.6, 62]],
        "origin": [100.0, 100.0]
    }

    with patch.object(pipeline, "process_static_image", side_effect=[mock_trial_1, mock_trial_2]):
        result = pipeline.process_images_session(
            image_paths=[img1, img2],
            weapon_name="havoc",
            expected_shots=3,
            rpm=672.0
        )

        assert result["trials_count"] == 2
        assert result["spec"]["name"] == "havoc"
        assert len(result["spec"]["x"]) == 3
        assert len(result["individual_trials"]) == 2
        assert result["individual_trials"][0]["source"] == "img1.jpg"
        assert result["individual_trials"][1]["source"] == "img2.jpg"


def test_pipeline_proportional_accumulation():
    pipeline = RecoilPipeline()
    existing_spec = {
        "name": "flatline",
        "rpm": 600,
        "multiplier": 0.73,
        "x": [0.0, 10.0, 20.0],
        "y": [0.0, -10.0, -20.0],
        "raw_1x_x": [0.0, 10.0, 20.0],
        "raw_1x_y": [0.0, -10.0, -20.0],
        "time_points": [0, 100, 200],
        "sample_count": 9
    }

    # New single trial
    new_trials = [
        {"x": [0.0, 21.0, 31.0], "y": [0.0, -21.0, -31.0]}
    ]

    merged_spec, conv = pipeline.aggregate_and_build_spec(
        trials=new_trials,
        weapon_name="flatline",
        rpm=600.0,
        multiplier=1.0,
        merge_strategy="accumulate",
        existing_spec=existing_spec,
        existing_sample_count=9
    )

    # 9 prior samples + 1 new trial = 10 total samples
    assert merged_spec["sample_count"] == 10
    assert merged_spec["total_sample_count"] == 10
    assert merged_spec["merge_strategy"] == "accumulate"

    # Shot 1: (9 * 10.0 + 1 * 21.0) / 10 = (90 + 21) / 10 = 11.1
    assert round(merged_spec["x"][1], 2) == 11.1
    # Verify JSON serializability (no circular reference)
    dumped = json.dumps(merged_spec)
    assert dumped is not None


def test_pipeline_overwrite_json_serializable():
    pipeline = RecoilPipeline()
    new_trials = [
        {"x": [0.0, 21.0, 31.0], "y": [0.0, -21.0, -31.0]},
        {"x": [0.0, 22.0, 30.0], "y": [0.0, -20.0, -32.0]}
    ]

    spec, conv = pipeline.aggregate_and_build_spec(
        trials=new_trials,
        weapon_name="havoc_tc",
        rpm=672.0,
        multiplier=0.73,
        merge_strategy="overwrite"
    )

    assert spec["merge_strategy"] == "overwrite"
    assert spec["sample_count"] == 2
    assert "standalone_batch_spec" in spec
    # Crucial test: must not raise ValueError: Circular reference detected
    dumped = json.dumps(spec)
    parsed = json.loads(dumped)
    assert parsed["name"] == "havoc_tc"
    assert parsed["standalone_batch_spec"]["name"] == "havoc_tc"





# --- process_video_clip: frame-streaming decoder ---------------------------------------

import cv2
import numpy as np
from recoil_discovery.shot_detector import auto_measure_shots_and_rpm

SHOT_FRAMES = (10, 16, 22, 28, 34, 40)


def _write_spray_video(path, n_frames=60, occlude_from=None, size=(320, 240)):
    """Synthetic wall spray: white target board, one dark decal per shot, muzzle flash on shot frames."""
    w, h = size
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), 60.0, (w, h))
    points = [(160 + 6 * i, 160 - 14 * i) for i in range(len(SHOT_FRAMES))]
    for f in range(n_frames):
        img = np.full((h, w, 3), 70, np.uint8)
        cv2.rectangle(img, (40, 20), (280, 220), (235, 235, 235), -1)
        for k, s in enumerate(SHOT_FRAMES):
            if f >= s:
                cv2.circle(img, points[k], 3, (25, 25, 25), -1)
        if occlude_from is not None and f >= occlude_from:
            # Viewmodel / reload HUD covering the wall at the end of the clip
            cv2.rectangle(img, (30, 10), (290, 230), (90, 90, 90), -1)
        if f in SHOT_FRAMES:
            img = cv2.add(img, np.full_like(img, 60))
        writer.write(img)
    writer.release()


def _reference_raw_points(pipeline, video_path):
    """The pre-streaming decoder: keep every gray frame in memory, then extract."""
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 60.0
    frames_gray, deltas, prev = [], [], None
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        frames_gray.append(gray)
        deltas.append(float(np.mean(cv2.absdiff(gray, prev))) if prev is not None else 0.0)
        prev = gray
    cap.release()

    _, _, shot_frames, _ = auto_measure_shots_and_rpm(deltas, fps=fps)
    target_points = len(shot_frames)
    baseline = frames_gray[3] if len(frames_gray) > 5 else None
    raw_x, raw_y, _ = pipeline.tracker.extract_from_settled_frames(
        frames_gray, target_points, baseline_frame=baseline, return_metadata=True
    )
    if not raw_x or (target_points and len(raw_x) < target_points * 0.5):
        alt_x, alt_y = pipeline.tracker.extract_from_video_frames(frames_gray, shot_frames)
        if len(alt_x) > len(raw_x):
            raw_x, raw_y = alt_x, alt_y
    return raw_x, raw_y


def test_process_video_clip_streaming_matches_full_decode(tmp_path):
    video = tmp_path / "spray.avi"
    _write_spray_video(video)
    pipeline = RecoilPipeline()

    result = pipeline.process_video_clip(video, "r301")
    ref_x, ref_y = _reference_raw_points(pipeline, video)

    assert result["raw_x"] == [0.0, 6.0, 12.0, 18.0, 24.0, 30.0]
    assert result["raw_y"] == [0.0, -14.0, -28.0, -42.0, -56.0, -70.0]
    assert (result["raw_x"], result["raw_y"]) == (ref_x, ref_y)
    assert result["rpm"] == pytest.approx(600.0)


def test_process_video_clip_differencing_fallback_matches_full_decode(tmp_path):
    video = tmp_path / "occluded_spray.avi"
    _write_spray_video(video, occlude_from=45)
    pipeline = RecoilPipeline()

    result = pipeline.process_video_clip(video, "r301")
    ref_x, ref_y = _reference_raw_points(pipeline, video)

    # The occluder appearing is itself a frame transient, so it may count as an extra shot
    assert len(result["raw_x"]) >= len(SHOT_FRAMES)
    assert result["frame_points"] == []  # came from temporal differencing, not settled frames
    assert (result["raw_x"], result["raw_y"]) == (ref_x, ref_y)


def test_process_video_clip_without_decodable_frames(tmp_path):
    video = tmp_path / "empty.avi"
    writer = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*"MJPG"), 60.0, (64, 48))
    writer.release()

    result = RecoilPipeline().process_video_clip(video, "r301")
    assert result["x"] == [] and result["y"] == []
    assert result["frame_image"] == ""
