"""
Shadow Parity Validation Suite.
Compares active weapon specifications between SQLite database and client/specs.json,
verifying coordinate parity, array lengths, RPM, and multipliers across all 31 weapons.

Beyond coordinates, every field of every spec (mods, ping_points, raw_1x_*, absent
multipliers, ...) and the weapon order must match, since client/specs.json is exported
from the database.
"""

import sys
import json
import math
import argparse
from pathlib import Path
from typing import Dict, Any, List, Optional
from recoil_discovery.db import DatabaseManager
from recoil_discovery.spec_manager import SpecManager


def _differing_keys(a: Dict[str, Any], b: Dict[str, Any]) -> List[str]:
    return sorted(k for k in set(a) | set(b) if a.get(k, None) != b.get(k, None) or (k in a) != (k in b))


def run_shadow_parity_check(
    tolerance: float = 1e-4,
    db_path: Optional[Path] = None,
    specs_path: Optional[Path] = None,
    sync: bool = True,
    min_weapons: int = 31
) -> Dict[str, Any]:
    """
    Run comprehensive parity comparison between SQLite store and client/specs.json.

    Args:
        tolerance: Maximum acceptable floating point coordinate difference.
        db_path / specs_path: Override the database and specs.json locations.
        sync: Import edits made to specs.json outside the database first (what the
            Node.js server does before every read and write).
        min_weapons: Minimum number of weapons expected in specs.json.

    Returns:
        Dictionary containing summary statistics, per-weapon results, and pass/fail boolean.
    """
    db_mgr = DatabaseManager(db_path=db_path, specs_path=specs_path)
    spec_mgr = SpecManager(specs_path=db_mgr.specs_path)

    sync_result = db_mgr.sync_from_specs_json() if sync else None
    json_specs = spec_mgr.load_specs(reload=True)
    db_specs = db_mgr.get_all_active_specs()

    json_map = {s["name"]: s for s in json_specs}
    db_map = {s["name"]: s for s in db_specs}

    results = []
    total_weapons = len(json_map)
    passed_weapons = 0

    for name, j_spec in json_map.items():
        if name not in db_map:
            results.append({
                "weapon": name,
                "passed": False,
                "error": f"Missing in database",
                "max_drift": float("inf")
            })
            continue

        d_spec = db_map[name]
        weapon_passed = True
        error_msg = None
        max_drift = 0.0

        # 1. RPM & Multiplier parity (an absent multiplier must stay absent)
        if abs(j_spec.get("rpm", 0) - d_spec.get("rpm", 0)) > 1e-3:
            weapon_passed = False
            error_msg = f"RPM mismatch: JSON={j_spec.get('rpm')}, DB={d_spec.get('rpm')}"

        j_mult = j_spec.get("multiplier")
        d_mult = d_spec.get("multiplier")
        if (j_mult is None) != (d_mult is None) or (j_mult is not None and abs(j_mult - d_mult) > 1e-3):
            weapon_passed = False
            error_msg = f"Multiplier mismatch: JSON={j_mult}, DB={d_mult}"

        # 2. Array length parity
        jx, jy = j_spec.get("x", []), j_spec.get("y", [])
        dx, dy = d_spec.get("x", []), d_spec.get("y", [])

        if len(jx) != len(dx) or len(jy) != len(dy):
            weapon_passed = False
            error_msg = f"Length mismatch: JSON=({len(jx)},{len(jy)}), DB=({len(dx)},{len(dy)})"

        # 3. Coordinate parity
        if weapon_passed:
            for i in range(len(jx)):
                dx_diff = abs(jx[i] - dx[i])
                dy_diff = abs(jy[i] - dy[i])
                drift = math.hypot(dx_diff, dy_diff)
                if drift > max_drift:
                    max_drift = drift
                if drift > tolerance:
                    weapon_passed = False
                    error_msg = f"Coordinate drift at index {i}: drift={drift:.6f} > tol={tolerance}"
                    break

        # 4. Full document parity (mods, mags, time_points, ping_points, raw_1x_*, ...)
        if weapon_passed and j_spec != d_spec:
            weapon_passed = False
            error_msg = f"Field mismatch: {', '.join(_differing_keys(j_spec, d_spec))}"

        if weapon_passed:
            passed_weapons += 1

        results.append({
            "weapon": name,
            "passed": weapon_passed,
            "error": error_msg,
            "max_drift": max_drift,
            "shot_count": len(jx)
        })

    extra_in_db = [n for n in db_map if n not in json_map]
    order_matches = [s["name"] for s in db_specs if s["name"] in json_map] == [s["name"] for s in json_specs]

    all_passed = (passed_weapons == total_weapons) and total_weapons >= min_weapons \
        and not extra_in_db and order_matches

    return {
        "success": all_passed,
        "total_weapons": total_weapons,
        "passed_weapons": passed_weapons,
        "tolerance": tolerance,
        "extra_in_database": extra_in_db,
        "order_matches": order_matches,
        "sync": sync_result,
        "weapons": results
    }


def main(argv: Optional[List[str]] = None):
    parser = argparse.ArgumentParser(description="Verify that the SQLite spec store matches client/specs.json")
    parser.add_argument("--no-sync", action="store_true",
                        help="Do not import edits made to specs.json first; only report drift")
    parser.add_argument("--tolerance", type=float, default=1e-4, help="Coordinate drift tolerance")
    args = parser.parse_args(argv)

    report = run_shadow_parity_check(tolerance=args.tolerance, sync=not args.no_sync)
    print(f"\n=======================================================")
    print(f"      APEX RECOIL SUITE: SHADOW PARITY REPORT          ")
    print(f"=======================================================")
    if report["sync"] is not None:
        s = report["sync"]
        synced = "already in sync" if s.get("skipped") else f"imported {s['imported']} change(s), deactivated {s['removed']}"
        print(f"specs.json Sync       : {synced}")
    print(f"Total Weapons Checked : {report['total_weapons']}")
    print(f"Passing Weapons       : {report['passed_weapons']}/{report['total_weapons']}")
    print(f"Weapon Order Matches  : {'yes' if report['order_matches'] else 'NO'}")
    if report["extra_in_database"]:
        print(f"Active Only in DB     : {', '.join(report['extra_in_database'])}")
    print(f"Coordinate Tolerance  : {report['tolerance']}")
    print(f"Status                : {'PASSED (100% PARITY)' if report['success'] else 'FAILED'}")
    print(f"-------------------------------------------------------")

    for w in sorted(report["weapons"], key=lambda x: x["weapon"]):
        status = "OK" if w["passed"] else f"FAIL ({w['error']})"
        drift = f"{w['max_drift']:.6f}" if w["max_drift"] != float("inf") else "N/A"
        print(f"  {w['weapon']:<20} Shots: {w.get('shot_count', 0):<3} Max Drift: {drift:<10} [{status}]")

    print(f"=======================================================\n")
    sys.exit(0 if report["success"] else 1)


if __name__ == "__main__":
    main()
