"""
Unit tests for recoil_discovery.spec_manager.
"""

import json
from pathlib import Path
import numpy as np
import pytest
from recoil_discovery import cli
from recoil_discovery.spec_manager import SpecManager, has_unknown_shots, read_installed_patch, spec_marks_valid

SPEC_MARKS_CASES = json.loads(
    (Path(__file__).resolve().parents[2] / "shared" / "spec-marks.cases.json").read_text(encoding="utf-8")
)["cases"]


@pytest.mark.parametrize("case", SPEC_MARKS_CASES, ids=[c["name"] for c in SPEC_MARKS_CASES])
def test_spec_marks_shared_cases(case):
    """C8: the same cases shared/api.ts and client/studio/model/spec.ts are held to."""
    assert spec_marks_valid(case["spec"]) is case["valid"]
    if case["valid"]:
        assert has_unknown_shots(case["spec"]) is case["unknown"]


def test_a_measured_pattern_takes_back_the_check(tmp_path):
    """A check vouches for the numbers it saw: new ones aren't checked until someone checks them."""
    path = _specs_file(tmp_path, {"name": "r99", "x": [0, 1], "y": [0, 1], "checked_patch": "v1"})
    SpecManager(specs_path=path).update_or_add_weapon_spec({"name": "r99", "x": [0, 5], "y": [0, 5]})
    assert json.loads(path.read_text(encoding="utf-8"))[0]["checked_patch"] is None


def test_an_update_that_says_it_was_checked_stays_checked(tmp_path):
    path = _specs_file(tmp_path, {"name": "r99", "x": [0, 1], "y": [0, 1], "checked_patch": "v1"})
    update = {"name": "r99", "x": [0, 5], "y": [0, 5], "checked_patch": "v2"}
    SpecManager(specs_path=path).update_or_add_weapon_spec(update)
    assert json.loads(path.read_text(encoding="utf-8"))[0]["checked_patch"] == "v2"


def test_an_update_without_a_pattern_keeps_the_check(tmp_path):
    path = _specs_file(tmp_path, {"name": "r99", "x": [0, 1], "y": [0, 1], "checked_patch": "v1"})
    SpecManager(specs_path=path).update_or_add_weapon_spec({"name": "r99", "rpm": 170})
    assert json.loads(path.read_text(encoding="utf-8"))[0]["checked_patch"] == "v1"


@pytest.fixture
def project(tmp_path, monkeypatch):
    """Throwaway specs, a patch file beside them and an installed game, with the CLI pointed at them."""
    specs = [
        {"name": "r99", "x": [0], "y": [0], "checked_patch": "v1"},
        {"name": "r301", "x": [0], "y": [0], "checked_patch": "v2"},
        {"name": "volt", "x": [0], "y": [0]},
    ]
    path = tmp_path / "specs.json"
    path.write_text(json.dumps(specs), encoding="utf-8")
    patch = tmp_path / "patch.json"
    patch.write_text(json.dumps({"_readme": "kept", "current": "v1"}, indent=2) + "\n", encoding="utf-8")
    game = tmp_path / "game"
    game.mkdir()
    (game / "gameversion.txt").write_text("v2\r\n", encoding="utf-8")
    monkeypatch.setattr(cli, "SpecManager", lambda: SpecManager(specs_path=path))
    return {"patch": patch, "game": game}


def _run_cli(monkeypatch, *args):
    monkeypatch.setattr("sys.argv", ["cli", *args])
    cli.main()


def test_reads_the_patch_of_the_installed_game(tmp_path):
    (tmp_path / "gameversion.txt").write_text("v3.0.4.24\n", encoding="utf-8")
    assert read_installed_patch(tmp_path) == "v3.0.4.24"


def test_a_folder_without_a_game_is_refused_by_name(tmp_path):
    with pytest.raises(FileNotFoundError, match="gameversion.txt"):
        read_installed_patch(tmp_path)


def test_patch_reports_a_new_patch_without_changing_anything(project, monkeypatch, capsys):
    before = project["patch"].read_text(encoding="utf-8")
    with pytest.raises(SystemExit) as stopped:
        _run_cli(monkeypatch, "patch", "--game", str(project["game"]))
    assert stopped.value.code == 1
    out = capsys.readouterr().out
    assert "v2" in out and "v1" in out and "--apply" in out
    assert project["patch"].read_text(encoding="utf-8") == before


def test_patch_apply_makes_the_game_patch_current_and_says_what_it_hides(project, monkeypatch, capsys):
    _run_cli(monkeypatch, "patch", "--game", str(project["game"]), "--apply")
    saved = json.loads(project["patch"].read_text(encoding="utf-8"))
    assert saved == {"_readme": "kept", "current": "v2"}
    out = capsys.readouterr().out
    # r301 was checked against v2 already, so one of the three shows
    assert "1 of 3" in out


def test_patch_says_when_it_is_up_to_date(project, monkeypatch, capsys):
    (project["game"] / "gameversion.txt").write_text("v1\n", encoding="utf-8")
    _run_cli(monkeypatch, "patch", "--game", str(project["game"]))
    out = capsys.readouterr().out
    assert "up to date" in out.lower()
    assert "1 of 3" in out


def test_verify_refuses_a_mark_the_spec_cannot_have(project, monkeypatch, tmp_path):
    bad = {"name": "r99", "rpm": 1, "x": [0], "y": [0], "time_points": [0], "mags": [], "known_shots": 5}
    path = tmp_path / "specs.json"
    path.write_text(json.dumps([bad]), encoding="utf-8")
    with pytest.raises(SystemExit) as stopped:
        _run_cli(monkeypatch, "verify")
    assert stopped.value.code == 1


def _specs_file(tmp_path, spec):
    path = tmp_path / "specs.json"
    path.write_text(json.dumps([spec]), encoding="utf-8")
    return path


def test_a_measured_pattern_counts_every_shot_as_real(tmp_path):
    """C8: the marker clears with the new count, since a save keeps what it isn't sent."""
    path = _specs_file(tmp_path, {"name": "wingman", "x": [0, 1], "y": [0, 1], "known_shots": 0})
    SpecManager(specs_path=path).update_or_add_weapon_spec({"name": "wingman", "x": [0, 5, 6], "y": [0, 5, 6]})
    assert json.loads(path.read_text(encoding="utf-8"))[0]["known_shots"] == 3


def test_a_measured_pattern_adds_no_count_to_a_spec_without_one(tmp_path):
    path = _specs_file(tmp_path, {"name": "r99", "x": [0, 1], "y": [0, 1]})
    SpecManager(specs_path=path).update_or_add_weapon_spec({"name": "r99", "x": [0, 5, 6], "y": [0, 5, 6]})
    assert "known_shots" not in json.loads(path.read_text(encoding="utf-8"))[0]


def test_a_spec_update_without_a_pattern_keeps_the_count(tmp_path):
    path = _specs_file(tmp_path, {"name": "wingman", "x": [0, 1], "y": [0, 1], "known_shots": 0})
    SpecManager(specs_path=path).update_or_add_weapon_spec({"name": "wingman", "rpm": 170})
    assert json.loads(path.read_text(encoding="utf-8"))[0]["known_shots"] == 0


def test_load_specs():
    manager = SpecManager()
    specs = manager.load_specs()
    assert len(specs) >= 15
    r301 = manager.get_weapon_spec("r301")
    assert r301 is not None
    assert r301["rpm"] == 810
    assert len(r301["x"]) >= 31
    havoc = manager.get_weapon_spec("havoc")
    assert havoc is not None
    assert havoc["name"] == "havoc_tc"


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
    new_spec = {
        "name": "bocek_bow",
        "rpm": 600,
        "x": [0, 5, 10],
        "y": [0, -10, -25]
    }
    diff = manager.diff_weapon_spec(new_spec)
    assert diff["status"] == "NEW_WEAPON"


def test_diff_weapon_spec_empty():
    manager = SpecManager()
    empty_spec = {
        "name": "r301",
        "rpm": 810,
        "x": [],
        "y": []
    }
    diff = manager.diff_weapon_spec(empty_spec)
    assert diff["status"] == "EMPTY_PATTERN"
    assert diff["mean_deviation"] == 0.0


def test_atomic_save_specs(tmp_path):
    specs_file = tmp_path / "specs.json"
    manager = SpecManager(specs_path=specs_file)
    test_specs = [{"name": "test_smg", "rpm": 900, "x": [0, 1], "y": [0, -5], "time_points": [0, 66]}]
    manager.save_specs(test_specs)

    assert specs_file.exists()
    loaded = manager.load_specs(reload=True)
    assert len(loaded) == 1
    assert loaded[0]["name"] == "test_smg"
    # Ensure no leftover .tmp files
    tmp_files = list(tmp_path.glob("*.tmp.*"))
    assert len(tmp_files) == 0

