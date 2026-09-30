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


