"""
Command-line interface for Apex Legends Recoil Discovery.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Optional, Tuple
from tabulate import tabulate

from .pipeline import RecoilPipeline
from .spec_manager import SpecManager
from .math_utils import extend_array


def cmd_verify(args):
    """Verify integrity and schema of client/specs.json."""
    manager = SpecManager()
    specs = manager.load_specs()
    print(f"\n[+] Loaded {len(specs)} weapons from: {manager.specs_path}")

    table = []
    has_errors = False
    for s in specs:
        name = s.get("name", "UNKNOWN")
        rpm = s.get("rpm", 0)
        len_x = len(s.get("x", []))
        len_y = len(s.get("y", []))
        len_t = len(s.get("time_points", []))
        mags = s.get("mags", [])
        max_mag = mags[-1]["size"] if mags else 0

        valid = (len_x == len_y == len_t) and (len_x >= max_mag)
        status = "OK" if valid else "MISMATCH"
        if not valid:
            has_errors = True

        table.append([name, rpm, len_x, len_y, len_t, max_mag, status])

    print(tabulate(table, headers=["Weapon", "RPM", "Len X", "Len Y", "Len T", "Max Mag", "Status"], tablefmt="grid"))
    if has_errors:
        print("\n[!] Warning: Detected dimension mismatches in specs.json!")
        sys.exit(1)
    else:
        print("\n[+] All weapons in specs.json passed schema verification!")


def cmd_diff(args):
    """Compare a new spec JSON file against current client/specs.json."""
    manager = SpecManager()
    with open(args.input, "r", encoding="utf-8") as f:
        new_spec = json.load(f)

    if isinstance(new_spec, list):
        for s in new_spec:
            report = manager.diff_weapon_spec(s)
            _print_diff_report(report)
            if args.plot:
                plot_file = manager.plot_diff(report, s)
                print(f"[+] Saved diff plot to: {plot_file}")
    else:
        report = manager.diff_weapon_spec(new_spec)
        _print_diff_report(report)
        if args.plot:
            plot_file = manager.plot_diff(report, new_spec)
            print(f"[+] Saved diff plot to: {plot_file}")


def _print_diff_report(report: dict):
    print("\n" + "=" * 60)
    print(f"PATCH DIFF REPORT: {report['weapon'].upper()}")
    print("=" * 60)
    print(f"Status:         {report['status']}")
    print(f"Summary:        {report['summary']}")
    if "mean_deviation" in report:
        print(f"Mean Deviation: {report['mean_deviation']} px")
        print(f"Max Deviation:  {report['max_deviation']} px (Shot #{report['max_dev_shot'] + 1})")
        print(f"Shots Count:    Pre-patch: {report['old_shots']} | Post-patch: {report['new_shots']}")
    print("=" * 60)


def resolve_weapon_params(manager: SpecManager, weapon_name: str, shots_arg: Optional[int], rpm_arg: Optional[float]) -> Tuple[int, float]:
    """Auto-resolve shots and rpm from specs.json if omitted by user."""
    spec = manager.get_weapon_spec(weapon_name)
    resolved_shots = shots_arg
    if resolved_shots is None:
        if spec and spec.get("mags"):
            resolved_shots = spec["mags"][-1]["size"]
        elif spec and spec.get("x"):
            resolved_shots = len(spec["x"])
        else:
            resolved_shots = 30

    resolved_rpm = rpm_arg
    if resolved_rpm is None:
        if spec and spec.get("rpm", 0) > 0:
            resolved_rpm = float(spec["rpm"])
        else:
            resolved_rpm = 600.0

    return resolved_shots, resolved_rpm


def cmd_process(args):
    """Process a single video clip or image."""
    pipeline = RecoilPipeline()
    path = Path(args.input)
    if not path.exists():
        if getattr(args, "json", False):
            print(json.dumps({"success": False, "error": f"File not found: {path}"}))
            sys.exit(1)
        print(f"[!] File not found: {path}")
        sys.exit(1)

    shots, rpm = resolve_weapon_params(pipeline.spec_manager, args.weapon, args.shots, args.rpm)
    multiplier = getattr(args, "multiplier", 0.73) or 0.73
    zoom = getattr(args, "zoom", 1.0) or 1.0
    fov = getattr(args, "fov", 104.0) or 104.0
    distance = getattr(args, "distance", 20.0) or 20.0
    anchor_dist = getattr(args, "anchor_distance", None)
    hdr = getattr(args, "hdr", "auto") or "auto"

    if path.suffix.lower() in [".mp4", ".mkv", ".avi", ".mov", ".webm"]:
        trial = pipeline.process_video_clip(
            path,
            weapon_name=args.weapon,
            expected_shots=shots,
            rpm=rpm,
            anchor_distance_override=anchor_dist,
            zoom=zoom,
            fov=fov,
            hdr=hdr
        )
    else:
        trial = pipeline.process_static_image(
            path,
            weapon_name=args.weapon,
            expected_shots=shots,
            rpm=rpm,
            anchor_distance=anchor_dist,
            zoom=zoom,
            fov=fov,
            hdr=hdr
        )

    if getattr(args, "json", False):
        raw_x = trial.get("raw_x", trial.get("x", []))
        raw_y = trial.get("raw_y", trial.get("y", []))
        mult_x = [round(float(x * multiplier), 2) for x in trial.get("x", [])]
        mult_y = [round(float(y * multiplier), 2) for y in trial.get("y", [])]
        spec = {
            "name": args.weapon,
            "multiplier": multiplier,
            "x": mult_x,
            "y": mult_y,
            "raw_1x_x": trial.get("x", []),
            "raw_1x_y": trial.get("y", []),
            "rpm": trial.get("rpm", rpm),
            "time_points": trial.get("time_points", [])
        }
        res = {
            "success": True,
            "weapon": args.weapon,
            "spec": spec,
            "distance": distance,
            "zoom": zoom,
            "fov": fov,
            "trials_count": 1,
            "measured_rpm": trial.get("rpm", rpm),
            "preview_image": trial.get("frame_image"),
            "preview_points": trial.get("frame_points", []),
            "preview_origin": trial.get("origin", [0, 0]),
            "frame_width": trial.get("frame_width", 0),
            "frame_height": trial.get("frame_height", 0),
            "individual_trials": [
                {
                    "source": Path(trial.get("source_file", "")).name,
                    "shots": len(trial.get("x", [])),
                    "x": mult_x,
                    "y": mult_y,
                    "raw_x": raw_x,
                    "raw_y": raw_y,
                    "frame_points": trial.get("frame_points", []),
                    "origin": trial.get("origin", [0, 0]),
                    "frame_image": trial.get("frame_image"),
                    "frame_width": trial.get("frame_width", 0),
                    "frame_height": trial.get("frame_height", 0),
                    "rpm": trial.get("rpm", rpm)
                }
            ]
        }
        print(json.dumps(res))
        return

    out_file = Path(args.output or f"{args.weapon}_trial.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(trial, f, indent=4)
    print(f"[+] Saved trial extraction to: {out_file}")
    print(f"[+] Extracted {len(trial['x'])} shots.")


def cmd_session(args):
    """Process a directory of recorded session clips and output clean JSON for the Web UI."""
    pipeline = RecoilPipeline()
    directory = Path(args.dir)
    if not directory.is_dir():
        print(json.dumps({"success": False, "error": f"Directory not found: {directory}"}))
        sys.exit(1)

    video_exts = [".mp4", ".webm", ".mkv", ".avi"]
    image_exts = [".png", ".jpg", ".jpeg"]
    video_files = sorted([f for f in directory.iterdir() if f.suffix.lower() in video_exts])
    image_files = sorted([f for f in directory.iterdir() if f.suffix.lower() in image_exts and not f.stem.endswith("_wall")])
    if not image_files:
        image_files = sorted([f for f in directory.iterdir() if f.suffix.lower() in image_exts])

    if not video_files and not image_files:
        print(json.dumps({"success": False, "error": f"No video clips or images found in {directory}"}))
        sys.exit(1)

    shots, rpm = resolve_weapon_params(pipeline.spec_manager, args.weapon, args.shots, args.rpm)
    multiplier = args.multiplier if getattr(args, "multiplier", None) is not None else 0.73
    zoom = getattr(args, "zoom", 1.0) or 1.0
    fov = getattr(args, "fov", 104.0) or 104.0
    distance = getattr(args, "distance", 20.0) or 20.0
    hdr = getattr(args, "hdr", "auto") or "auto"

    strategy = getattr(args, "strategy", "accumulate") or "accumulate"
    existing_samples = getattr(args, "existing_samples", None)

    try:
        if video_files:
            result = pipeline.process_clips_session(
                clip_paths=video_files,
                weapon_name=args.weapon,
                expected_shots=shots,
                rpm=rpm,
                multiplier=multiplier,
                zoom=zoom,
                fov=fov,
                hdr=hdr,
                merge_strategy=strategy,
                existing_sample_count=existing_samples
            )
        else:
            result = pipeline.process_images_session(
                image_paths=image_files,
                weapon_name=args.weapon,
                expected_shots=shots,
                rpm=rpm,
                multiplier=multiplier,
                zoom=zoom,
                distance=distance,
                fov=fov,
                hdr=hdr,
                merge_strategy=strategy,
                existing_sample_count=existing_samples
            )
        diff_report = pipeline.spec_manager.diff_weapon_spec(result["spec"])
        result["diff_report"] = diff_report
        result["distance"] = distance
        result["zoom"] = zoom
        result["fov"] = fov
        result["success"] = True
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


def cmd_batch(args):
    """Process a directory of recordings/images and aggregate them."""
    pipeline = RecoilPipeline()
    directory = Path(args.dir)
    if not directory.is_dir():
        print(f"[!] Not a directory: {directory}")
        sys.exit(1)

    shots, rpm = resolve_weapon_params(pipeline.spec_manager, args.weapon, args.shots, args.rpm)
    print(f"[+] Weapon: {args.weapon} | Target Shots: {shots} | RPM: {rpm}")

    supported_exts = [".png", ".jpg", ".jpeg", ".mp4", ".mkv", ".avi", ".webm"]
    files = sorted([f for f in directory.iterdir() if f.suffix.lower() in supported_exts])
    if not files:
        print(f"[!] No supported media files found in {directory}")
        sys.exit(1)

    print(f"[+] Found {len(files)} files in {directory}. Processing...")
    trials = []
    zoom = getattr(args, "zoom", 1.0) or 1.0
    fov = getattr(args, "fov", 104.0) or 104.0
    hdr = getattr(args, "hdr", "auto") or "auto"
    for f in files:
        try:
            if f.suffix.lower() in [".mp4", ".mkv", ".avi", ".webm"]:
                t = pipeline.process_video_clip(f, args.weapon, shots, rpm, args.distance, zoom=zoom, fov=fov, hdr=hdr)
            else:
                t = pipeline.process_static_image(f, args.weapon, shots, rpm, args.distance, zoom=zoom, fov=fov, hdr=hdr)
            trials.append(t)
            print(f"    - Processed {f.name}: {len(t['x'])} shots")
        except Exception as e:
            print(f"    [!] Error processing {f.name}: {e}")

    if not trials:
        print("[!] No trials successfully processed.")
        sys.exit(1)

    spec, conv = pipeline.aggregate_and_build_spec(trials, args.weapon, rpm)
    print(f"\n[+] Multi-trial Convergence Score: {conv['convergence_score']} / 100")
    if conv['outlier_trials']:
        print(f"[!] Outlier trials flagged: {conv['outlier_trials']}")

    # Compare with current spec
    diff_report = pipeline.spec_manager.diff_weapon_spec(spec)
    _print_diff_report(diff_report)

    if args.plot:
        plot_file = pipeline.spec_manager.plot_diff(diff_report, spec)
        print(f"[+] Saved patch diff visualization to: {plot_file}")

    if args.update:
        pipeline.spec_manager.update_or_add_weapon_spec(spec)
        print(f"[+] Successfully updated {args.weapon} in client/specs.json!")

    out_file = Path(args.output or f"{args.weapon}_aggregated_spec.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=4)
    print(f"[+] Saved aggregated spec to: {out_file}")


def cmd_export_arduino(args):
    """Regenerate arduino_mouse/src/recoil.inc from client/specs.json."""
    manager = SpecManager()
    specs = manager.load_specs()
    out_path = Path(__file__).resolve().parent.parent.parent / "arduino_mouse" / "src" / "recoil.inc"

    msize = max([o["mags"][-1]["size"] for o in specs])
    rcount = len(specs)

    lines = [
        f"const int RECOILS_LENGTH = {rcount};",
        'const String names[] = {"' + '","'.join(x["name"] for x in specs) + '"};',
        "const int sizes[] = {" + ",".join(str(x["mags"][-1]["size"]) for x in specs) + "};",
        "const PROGMEM float XDATA[] = {" + ",".join(",".join(str(x) for x in extend_array(o["x"], msize, 0)) for o in specs) + "};",
        "const PROGMEM float YDATA[] = {" + ",".join(",".join(str(x) for x in extend_array(o["y"], msize, 0)) for o in specs) + "};",
        "const PROGMEM float TDATA[] = {" + ",".join(",".join(str(x) for x in extend_array(o["time_points"], msize, 0)) for o in specs) + "};",
    ]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"[+] Successfully generated Arduino table: {out_path} ({rcount} recoils, max length {msize})")


def main():
    parser = argparse.ArgumentParser(description="Apex Legends Automated Recoil Discovery CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # verify
    subparsers.add_parser("verify", help="Verify integrity of client/specs.json")

    # diff
    p_diff = subparsers.add_parser("diff", help="Diff a new recoil spec against current specs.json")
    p_diff.add_argument("--input", "-i", required=True, help="Path to new spec JSON file")
    p_diff.add_argument("--plot", "-p", action="store_true", help="Generate visual diff plot")

    # process
    p_proc = subparsers.add_parser("process", help="Process a single video clip or image")
    p_proc.add_argument("--input", "-i", required=True, help="Input video or image file")
    p_proc.add_argument("--weapon", "-w", required=True, help="Weapon name (e.g. r301, flatline)")
    p_proc.add_argument("--shots", "-s", type=int, default=None, help="Expected number of shots / mag size (default: auto from specs.json)")
    p_proc.add_argument("--rpm", "-r", type=float, default=None, help="Weapon rounds per minute / RPM (default: auto from specs.json)")
    p_proc.add_argument("--distance", "-d", type=float, default=20.0, help="Shooting distance in meters (default: 20m)")
    p_proc.add_argument("--anchor-distance", type=float, default=None, help="In-game anchor distance in mouse units")
    p_proc.add_argument("--zoom", "-z", type=float, default=1.0, help="Optic zoom multiplier (e.g. 2.0 for 2x Bruiser, 3.0 for 3x)")
    p_proc.add_argument("--fov", type=float, default=104.0, help="Field of View in degrees (default: 104.0)")
    p_proc.add_argument("--hdr", default="auto", choices=["auto", "natural", "vibrant", "off", "hdr-standard", "hdr-vibrant"], help="Tone-mapping mode for HDR captures")
    p_proc.add_argument("--multiplier", "-m", type=float, default=0.73, help="Recoil multiplier")
    p_proc.add_argument("--json", action="store_true", help="Output Web UI compatible JSON to stdout")
    p_proc.add_argument("--output", "-o", help="Output JSON path")

    # batch
    p_batch = subparsers.add_parser("batch", help="Batch process directory of trials, aggregate, and diff")
    p_batch.add_argument("--dir", required=True, help="Directory containing recordings or images")
    p_batch.add_argument("--weapon", "-w", required=True, help="Weapon name")
    p_batch.add_argument("--shots", "-s", type=int, default=None, help="Expected number of shots (default: auto from specs.json)")
    p_batch.add_argument("--rpm", "-r", type=float, default=None, help="Weapon rounds per minute (default: auto from specs.json)")
    p_batch.add_argument("--distance", "-d", type=float, default=20.0, help="Shooting distance in meters (default: 20m)")
    p_batch.add_argument("--zoom", "-z", type=float, default=1.0, help="Optic zoom multiplier (e.g. 2.0 for 2x Bruiser, 3.0 for 3x)")
    p_batch.add_argument("--fov", type=float, default=104.0, help="Field of View in degrees (default: 104.0)")
    p_batch.add_argument("--hdr", default="auto", choices=["auto", "natural", "vibrant", "off", "hdr-standard", "hdr-vibrant"], help="Tone-mapping mode for HDR captures")
    p_batch.add_argument("--plot", "-p", action="store_true", help="Generate visual diff plot")
    p_batch.add_argument("--update", "-u", action="store_true", help="Update client/specs.json directly")
    p_batch.add_argument("--output", "-o", help="Output JSON path")

    # session (clean JSON for Web UI)
    p_session = subparsers.add_parser("session", help="Process recorded clips session and output JSON")
    p_session.add_argument("--dir", required=True, help="Directory containing session video clips")
    p_session.add_argument("--weapon", "-w", required=True, help="Weapon name")
    p_session.add_argument("--shots", "-s", type=int, default=None, help="Expected shots")
    p_session.add_argument("--rpm", "-r", type=float, default=None, help="Weapon RPM")
    p_session.add_argument("--distance", "-d", type=float, default=20.0, help="Shooting distance in meters (default: 20m)")
    p_session.add_argument("--multiplier", "-m", type=float, default=0.73, help="Recoil multiplier")
    p_session.add_argument("--zoom", "-z", type=float, default=1.0, help="Optic zoom multiplier (e.g. 2.0 for 2x Bruiser, 3.0 for 3x)")
    p_session.add_argument("--fov", type=float, default=104.0, help="Field of View in degrees (default: 104.0)")
    p_session.add_argument("--hdr", default="auto", choices=["auto", "natural", "vibrant", "off", "hdr-standard", "hdr-vibrant"], help="Tone-mapping mode for HDR captures")
    p_session.add_argument("--strategy", choices=["accumulate", "overwrite"], default="accumulate", help="Spec integration strategy: accumulate (proportional sample weight) or overwrite")
    p_session.add_argument("--existing-samples", type=int, default=None, help="Prior sample count for existing spec (default: read from specs.json or 1)")

    # export-arduino
    subparsers.add_parser("export-arduino", help="Export client/specs.json to arduino_mouse/src/recoil.inc")

    args = parser.parse_args()

    if args.command == "verify":
        cmd_verify(args)
    elif args.command == "diff":
        cmd_diff(args)
    elif args.command == "process":
        cmd_process(args)
    elif args.command == "batch":
        cmd_batch(args)
    elif args.command == "session":
        cmd_session(args)
    elif args.command == "export-arduino":
        cmd_export_arduino(args)


if __name__ == "__main__":
    main()
