"""
Unit tests for recoil_discovery.spec_manager.
"""

from pathlib import Path
import numpy as np
import pytest
from recoil_discovery.spec_manager import SpecManager


def test_load_specs():
    manager = SpecManager()
    specs = manager.load_specs()
    assert len(specs) >= 13
    r301 = manager.get_weapon_spec("r301")
    assert r301 is not None
    assert r301["rpm"] == 810
    assert len(r301["x"]) == 31


def test_diff_weapon_spec_unchanged():
    manager = SpecManager()
    r301 = manager.get_weapon_spec("r301")
    # Exact duplicate should report UNCHANGED
    diff = manager.diff_weapon_spec(r301)
    assert diff["status"] == "UNCHANGED"
    assert diff["mean_deviation"] == 0.0


def test_diff_weapon_spec_modified():
    manager = SpecManager()
    r301 = manager.get_weapon_spec("r301").copy()
    # Simulate a patch buff/nerf: increase vertical kick by 15px on late shots
    modified_y = list(r301["y"])
    for i in range(15, len(modified_y)):
        modified_y[i] -= 20.0
    r301["y"] = modified_y

    diff = manager.diff_weapon_spec(r301)
    assert diff["status"] == "UPDATED"
    assert diff["mean_deviation"] > 5.0
    assert "Recoil pattern modified" in diff["summary"]


def test_diff_new_weapon():
    manager = SpecManager()
    nemesis_spec = {
        "name": "nemesis",
        "rpm": 600,
        "x": [0, 5, 10],
        "y": [0, -10, -25]
    }
    diff = manager.diff_weapon_spec(nemesis_spec)
    assert diff["status"] == "NEW_WEAPON"
