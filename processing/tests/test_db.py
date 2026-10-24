"""
Unit tests for Python DatabaseManager (SQLite persistence & versioning).
"""

import json
import pytest
from pathlib import Path
from recoil_discovery.db import DatabaseManager


def test_python_db_initialization_and_seeding(tmp_path):
    # Create mock specs.json
    mock_specs = [
        {
            "name": "r301",
            "rpm": 810.0,
            "multiplier": 0.73,
            "sample_count": 1,
            "mags": [18, 20, 25, 28, 24],
            "x": [0.0, 1.2, 2.5],
            "y": [0.0, -10.5, -20.2],
            "time_points": [0, 74, 148]
        },
        {
            "name": "flatline",
            "rpm": 600.0,
            "multiplier": 0.73,
            "sample_count": 2,
            "mags": [20, 25, 28, 30, 26],
            "x": [0.0, -3.1, -5.2],
            "y": [0.0, -12.0, -22.5],
            "time_points": [0, 100, 200]
        }
    ]
    specs_file = tmp_path / "specs.json"
    specs_file.write_text(json.dumps(mock_specs), encoding="utf-8")

    db_path = tmp_path / "test.db"
    db_mgr = DatabaseManager(db_path=db_path, specs_path=specs_file)

    active_specs = db_mgr.get_all_active_specs()
    assert len(active_specs) == 2
    names = [s["name"] for s in active_specs]
    assert "r301" in names
    assert "flatline" in names

    r301 = db_mgr.get_active_spec("r301")
    assert r301 is not None
    assert r301["rpm"] == 810.0
    assert r301["version"] == 1


def test_python_db_versioned_spec_update(tmp_path):
    mock_specs = [
        {
            "name": "r301",
            "rpm": 810.0,
            "multiplier": 0.73,
            "sample_count": 1,
            "mags": [18, 20, 25, 28, 24],
            "x": [0.0, 1.0],
            "y": [0.0, -10.0],
            "time_points": [0, 74]
        }
    ]
    specs_file = tmp_path / "specs.json"
    specs_file.write_text(json.dumps(mock_specs), encoding="utf-8")

    db_path = tmp_path / "test.db"
    db_mgr = DatabaseManager(db_path=db_path, specs_path=specs_file)

    # Save update
    updated_spec = {
        "name": "r301",
        "rpm": 815.0,
        "multiplier": 0.73,
        "sample_count": 5,
        "mags": [18, 20, 25, 28, 24],
        "x": [0.0, 1.5],
        "y": [0.0, -10.8],
        "time_points": [0, 74]
    }
    res = db_mgr.save_weapon_spec(updated_spec, author="pytest", notes="Fine tune")
    assert res["success"] is True
    assert res["version"] == 2

    active = db_mgr.get_active_spec("r301")
    assert active["version"] == 2
    assert active["rpm"] == 815.0
    assert active["sample_count"] == 5

    # Check specs.json exported with updated values
    with open(specs_file, "r", encoding="utf-8") as f:
        exported = json.load(f)
    assert len(exported) == 1
    assert exported[0]["rpm"] == 815.0


REAL_SPECS = Path(__file__).resolve().parent.parent.parent / "client" / "specs.json"


@pytest.fixture
def real_specs_copy(tmp_path):
    dest = tmp_path / "specs.json"
    dest.write_bytes(REAL_SPECS.read_bytes())
    return dest


def test_python_db_round_trips_real_specs_byte_for_byte(tmp_path, real_specs_copy):
    original = real_specs_copy.read_bytes()
    db_mgr = DatabaseManager(db_path=tmp_path / "test.db", specs_path=real_specs_copy)

    assert db_mgr.get_all_active_specs() == json.loads(original.decode("utf-8"))
    db_mgr.export_specs_to_json()
    assert real_specs_copy.read_bytes() == original


def test_python_db_save_merges_and_keeps_other_weapons_untouched(tmp_path, real_specs_copy):
    original = real_specs_copy.read_bytes().decode("utf-8")
    db_mgr = DatabaseManager(db_path=tmp_path / "test.db", specs_path=real_specs_copy)
    havoc = db_mgr.get_active_spec("havoc_tc")

    res = db_mgr.save_weapon_spec({"name": "havoc_tc", "rpm": havoc["rpm"] + 5}, author="pytest")
    assert res["version"] == havoc["version"] + 1

    after = real_specs_copy.read_bytes().decode("utf-8")
    saved = next(s for s in json.loads(after) if s["name"] == "havoc_tc")
    assert saved["rpm"] == havoc["rpm"] + 5
    assert saved["raw_1x_x"] == havoc["raw_1x_x"]
    assert saved["mods"] == havoc["mods"]
    assert saved["ping_points"] == havoc["ping_points"]

    def other_blocks(text):
        return [b for b in text.replace("\r\n", "\n").split("\n  {") if '"havoc_tc"' not in b]
    assert other_blocks(after) == other_blocks(original)

    unchanged = db_mgr.save_weapon_spec({"name": "havoc_tc", "rpm": havoc["rpm"] + 5})
    assert unchanged.get("unchanged") is True


def test_python_db_imports_external_edits_before_saving(tmp_path, real_specs_copy):
    db_mgr = DatabaseManager(db_path=tmp_path / "test.db", specs_path=real_specs_copy)

    specs = json.loads(real_specs_copy.read_text(encoding="utf-8"))
    next(s for s in specs if s["name"] == "volt")["rpm"] = 777
    real_specs_copy.write_text(json.dumps(specs, indent=4), encoding="utf-8")

    db_mgr.save_weapon_spec({"name": "r99", "rpm": 1090}, author="pytest")
    written = json.loads(real_specs_copy.read_text(encoding="utf-8"))
    assert next(s for s in written if s["name"] == "volt")["rpm"] == 777
    assert next(s for s in written if s["name"] == "r99")["rpm"] == 1090


def test_python_db_migrates_legacy_schema(tmp_path, real_specs_copy):
    import sqlite3
    db_path = tmp_path / "legacy.db"
    conn = sqlite3.connect(str(db_path))
    conn.executescript("""
        CREATE TABLE weapons (name TEXT PRIMARY KEY, display_name TEXT, category TEXT,
            default_rpm REAL NOT NULL, multiplier REAL NOT NULL DEFAULT 0.73,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE weapon_specs (id INTEGER PRIMARY KEY AUTOINCREMENT, weapon_name TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1, rpm REAL NOT NULL, multiplier REAL NOT NULL,
            sample_count INTEGER NOT NULL DEFAULT 1, mags TEXT NOT NULL, x TEXT NOT NULL, y TEXT NOT NULL,
            time_points TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
            author TEXT, notes TEXT);
    """)
    conn.close()

    db_mgr = DatabaseManager(db_path=db_path, specs_path=real_specs_copy)
    with db_mgr._connect() as conn:
        spec_cols = {r["name"] for r in conn.execute("PRAGMA table_info(weapon_specs)")}
        weapon_cols = {r["name"] for r in conn.execute("PRAGMA table_info(weapons)")}
        tables = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"mods", "ping_points", "spec_json"} <= spec_cols
    assert "sort_order" in weapon_cols
    assert "meta" in tables
    assert db_mgr.get_all_active_specs() == json.loads(real_specs_copy.read_text(encoding="utf-8"))
