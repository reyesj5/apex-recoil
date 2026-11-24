"""
Automated unit test for Shadow Parity Suite.
Verifies 100% mathematical parity across all 31 weapons between SQLite database and client/specs.json.

Runs against a throwaway database seeded from a copy of the real client/specs.json, so the
test never creates or modifies data/recoil.db.
"""

import json
import shutil
import pytest
from pathlib import Path
from recoil_discovery.shadow_parity import run_shadow_parity_check

REAL_SPECS = Path(__file__).resolve().parent.parent.parent / "client" / "specs.json"


@pytest.fixture
def specs_copy(tmp_path):
    dest = tmp_path / "specs.json"
    shutil.copyfile(REAL_SPECS, dest)
    return dest


def test_all_31_weapons_shadow_parity(tmp_path, specs_copy):
    report = run_shadow_parity_check(tolerance=1e-4, db_path=tmp_path / "recoil.db", specs_path=specs_copy)
    assert report["success"] is True, f"Shadow parity check failed! Report: {report}"
    assert report["total_weapons"] >= 31
    assert report["passed_weapons"] == report["total_weapons"]
    assert report["order_matches"] is True
    assert report["extra_in_database"] == []

    for w in report["weapons"]:
        assert w["passed"] is True, f"Weapon {w['weapon']} failed parity: {w['error']}"
        assert w["max_drift"] <= 1e-4, f"Weapon {w['weapon']} exceeded drift tolerance: {w['max_drift']}"


def test_shadow_parity_detects_and_imports_external_edits(tmp_path, specs_copy):
    db_path = tmp_path / "recoil.db"
    assert run_shadow_parity_check(db_path=db_path, specs_path=specs_copy)["success"] is True

    specs = json.loads(specs_copy.read_text(encoding="utf-8"))
    havoc = next(s for s in specs if s["name"] == "havoc_tc")
    havoc["raw_1x_x"][1] += 0.5          # a field outside x/y must still be compared
    specs_copy.write_text(json.dumps(specs, indent=2), encoding="utf-8")

    drift = run_shadow_parity_check(db_path=db_path, specs_path=specs_copy, sync=False)
    assert drift["success"] is False
    failed = {w["weapon"]: w["error"] for w in drift["weapons"] if not w["passed"]}
    assert list(failed) == ["havoc_tc"]
    assert "raw_1x_x" in failed["havoc_tc"]

    synced = run_shadow_parity_check(db_path=db_path, specs_path=specs_copy, sync=True)
    assert synced["sync"]["imported"] == 1
    assert synced["success"] is True
