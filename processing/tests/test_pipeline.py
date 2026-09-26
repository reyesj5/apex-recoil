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
