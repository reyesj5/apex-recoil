"""
Spec management and patch diffing module.
Handles reading, validating, comparing, and updating weapon specifications
in client/specs.json and client/raw_recoils.json.
"""

import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import numpy as np


class SpecManager:
    """
    Manages loading, updating, and diffing weapon recoil specifications.
    """

    def __init__(self, specs_path: Optional[Path] = None, raw_recoils_path: Optional[Path] = None):
        base_dir = Path(__file__).resolve().parent.parent.parent
        self.specs_path = specs_path or (base_dir / "client" / "specs.json")
        self.raw_recoils_path = raw_recoils_path or (base_dir / "client" / "raw_recoils.json")

    def load_specs(self) -> List[Dict[str, Any]]:
        """Load all weapon specifications from client/specs.json."""
        with open(self.specs_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def save_specs(self, specs: List[Dict[str, Any]]) -> None:
        """Write weapon specifications back to client/specs.json formatted cleanly."""
        with open(self.specs_path, 'w', encoding='utf-8') as f:
            json.dump(specs, f, indent=4)

    def get_weapon_spec(self, weapon_name: str) -> Optional[Dict[str, Any]]:
        """Retrieve spec for a specific weapon name with alias normalization."""
        specs = self.load_specs()
        for w in specs:
            if w.get('name') == weapon_name:
                return w
        aliases = {
            'havoc': 'havoc_tc',
            'devotion': 'devotion_tc',
            '3030': '3030_repeater',
            'repeater': '3030_repeater',
            'g7': 'g7_scout',
            'scout': 'g7_scout',
            'pk': 'peacekeeper',
        }
        target = aliases.get(weapon_name.lower().strip())
        if target:
            for w in specs:
                if w.get('name') == target:
                    return w
        return None

    def diff_weapon_spec(
        self,
        new_spec: Dict[str, Any],
        weapon_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Compare newly discovered recoil spec against the current spec in client/specs.json.
        Returns a detailed diff report with per-shot deviation and patch change flags.
        """
        name = weapon_name or new_spec.get('name')
        old_spec = self.get_weapon_spec(name)

        if not old_spec:
            return {
                "status": "NEW_WEAPON",
                "weapon": name,
                "message": f"Weapon '{name}' does not exist in specs.json. This is a brand new weapon!",
                "shots_count": len(new_spec.get('x', []))
            }

        old_x, old_y = np.array(old_spec['x']), np.array(old_spec['y'])
        new_x, new_y = np.array(new_spec['x']), np.array(new_spec['y'])

        len_old, len_new = len(old_x), len(new_x)
        common_len = min(len_old, len_new)

        dx = new_x[:common_len] - old_x[:common_len]
        dy = new_y[:common_len] - old_y[:common_len]
        dist_diff = np.sqrt(dx * dx + dy * dy)
        mean_deviation = float(np.mean(dist_diff))
        max_deviation = float(np.max(dist_diff))
        max_dev_shot = int(np.argmax(dist_diff))

        # Check RPM change
        old_rpm = old_spec.get('rpm', 0)
        new_rpm = new_spec.get('rpm', old_rpm)
        rpm_changed = abs(new_rpm - old_rpm) > 5

        # Check magazine size change
        old_max_mag = old_spec['mags'][-1]['size'] if old_spec.get('mags') else len_old
        new_max_mag = new_spec['mags'][-1]['size'] if new_spec.get('mags') else len_new

        # Classify change significance
        # In Apex coordinate space, mean deviation > 6-8 mouse units indicates a recoil rebalance
        if mean_deviation < 4.0 and len_old == len_new and not rpm_changed:
            status = "UNCHANGED"
            summary = f"No significant recoil change detected (mean deviation: {mean_deviation:.1f} px)."
        else:
            status = "UPDATED"
            changes = []
            if mean_deviation >= 4.0:
                changes.append(f"Recoil pattern modified (mean deviation: {mean_deviation:.1f} px, peak: {max_deviation:.1f} px at shot #{max_dev_shot + 1})")
            if len_old != len_new:
                changes.append(f"Shot count changed from {len_old} to {len_new}")
            if rpm_changed:
                changes.append(f"Rate of fire changed from {old_rpm} to {new_rpm} RPM")
            if old_max_mag != new_max_mag:
                changes.append(f"Max magazine size changed from {old_max_mag} to {new_max_mag}")
            summary = "; ".join(changes)

        return {
            "status": status,
            "weapon": name,
            "summary": summary,
            "mean_deviation": round(mean_deviation, 2),
            "max_deviation": round(max_deviation, 2),
            "max_dev_shot": max_dev_shot,
            "old_shots": len_old,
            "new_shots": len_new,
            "per_shot_distance_delta": [round(float(d), 2) for d in dist_diff],
            "per_shot_dx": [round(float(v), 2) for v in dx],
            "per_shot_dy": [round(float(v), 2) for v in dy]
        }

    def update_or_add_weapon_spec(
        self,
        new_spec: Dict[str, Any],
        backup: bool = True
    ) -> None:
        """
        Update an existing weapon spec or append a new weapon to client/specs.json.
        """
        specs = self.load_specs()
        name = new_spec['name']
        found = False

        if backup:
            backup_path = self.specs_path.with_suffix(".json.bak")
            with open(backup_path, 'w', encoding='utf-8') as f:
                json.dump(specs, f, indent=4)

        for i, w in enumerate(specs):
            if w.get('name') == name:
                # Merge spec fields, preserving existing audio and metadata if omitted in new_spec
                for k, v in new_spec.items():
                    w[k] = v
                found = True
                break

        if not found:
            specs.append(new_spec)

        self.save_specs(specs)

    def append_raw_recoil(self, raw_entry: Dict[str, Any]) -> None:
        """Append a newly captured raw trial to client/raw_recoils.json."""
        raws = []
        if self.raw_recoils_path.exists():
            with open(self.raw_recoils_path, 'r', encoding='utf-8') as f:
                raws = json.load(f)
        raws.append(raw_entry)
        with open(self.raw_recoils_path, 'w', encoding='utf-8') as f:
            json.dump(raws, f, indent=4)

    def plot_diff(
        self,
        diff_report: Dict[str, Any],
        new_spec: Dict[str, Any],
        output_path: Optional[Path] = None
    ) -> Path:
        """
        Generate a visual patch diff comparison plot.
        """
        import matplotlib.pyplot as plt

        name = diff_report['weapon']
        old_spec = self.get_weapon_spec(name)

        fig, (ax_pattern, ax_delta) = plt.subplots(1, 2, figsize=(14, 7))
        fig.suptitle(f"Apex Legends Recoil Patch Diff: {name.upper()}", fontsize=16, fontweight='bold')

        # Pattern Overlay
        if old_spec:
            ax_pattern.plot(old_spec['x'], old_spec['y'], 'r--', marker='o', label='Current Spec (Pre-patch)', alpha=0.7)
            # Label start and end
            ax_pattern.scatter(old_spec['x'][0], old_spec['y'][0], color='red', s=80)
            ax_pattern.scatter(old_spec['x'][-1], old_spec['y'][-1], color='darkred', s=80)

        ax_pattern.plot(new_spec['x'], new_spec['y'], 'b-', marker='s', label='Discovered Spec (Post-patch)', linewidth=2)
        ax_pattern.scatter(new_spec['x'][0], new_spec['y'][0], color='blue', s=80)
        ax_pattern.scatter(new_spec['x'][-1], new_spec['y'][-1], color='darkblue', s=80)

        ax_pattern.set_title("Recoil Path Overlay (Mouse Movement)")
        ax_pattern.set_xlabel("Horizontal Offset (Mouse Units)")
        ax_pattern.set_ylabel("Vertical Offset (Inverted Kick)")
        ax_pattern.grid(True, linestyle=':', alpha=0.6)
        ax_pattern.legend(loc='best')
        ax_pattern.invert_yaxis()

        # Per-shot distance delta
        deltas = diff_report.get('per_shot_distance_delta', [])
        shots = list(range(1, len(deltas) + 1))
        ax_delta.bar(shots, deltas, color='orange', alpha=0.8, edgecolor='black')
        ax_delta.axhline(4.0, color='gray', linestyle='--', label='Rebalance Threshold (4px)')
        ax_delta.set_title("Per-Shot Spatial Deviation")
        ax_delta.set_xlabel("Shot Number")
        ax_delta.set_ylabel("Deviation (px / mouse units)")
        ax_delta.grid(True, linestyle=':', alpha=0.6)
        ax_delta.legend(loc='best')

        plt.tight_layout()
        save_file = output_path or Path(f"diff_{name}.png")
        plt.savefig(save_file, dpi=150)
        plt.close(fig)
        return save_file
