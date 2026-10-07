"""
Sync Ground Loot & Corrupted (L4) Magazine Specifications in client/specs.json
Restores full ground loot mag progressions across all core weapons,
extrapolates coordinate arrays for terminal Corrupted L4 shots,
and introduces Nemesis Burst AR & Hemlok Burst AR.
"""

import json
import os
import numpy as np


def generate_burst_recoil(burst_size: int, total_shots: int, rpm: float, climb_per_shot: float, drift_per_burst: float):
    """Generate realistic burst weapon recoil and time intervals."""
    x = [0.0]
    y = [0.0]
    time_points = [0]
    
    dt_burst = round(60000.0 / (rpm * 1.6), 1)  # High fire rate inside the burst
    inter_burst_pause = round(dt_burst * 2.2, 1) # Recovery pause between bursts
    
    curr_t = 0
    curr_x = 0.0
    curr_y = 0.0
    
    for i in range(1, total_shots):
        burst_idx = i % burst_size
        if burst_idx == 0:
            # End of previous burst, inter-burst recovery
            curr_t += inter_burst_pause
            # Slight recovery dip down
            curr_y += climb_per_shot * 0.4
            curr_x += np.random.uniform(-1.0, 1.0)
        else:
            curr_t += dt_burst
            curr_y -= climb_per_shot * np.random.uniform(0.85, 1.15)
            # Lateral drift inside burst
            curr_x += drift_per_burst * (1 if (i // burst_size) % 2 == 0 else -1) + np.random.uniform(-0.8, 0.8)
            
        time_points.append(int(round(curr_t)))
        x.append(round(curr_x, 1))
        y.append(round(curr_y, 1))
        
    return x, y, time_points


def extrapolate_late_spray(x: list, y: list, time_points: list, rpm: float, target_length: int):
    """
    Extrapolate coordinates for late-spray / Corrupted L4 shots based on
    terminal oscillation and vertical plateau physics.
    """
    if len(x) >= target_length:
        return x[:target_length], y[:target_length], time_points[:target_length]
        
    dt = 60000.0 / rpm
    ext_x = list(x)
    ext_y = list(y)
    ext_t = list(time_points)
    
    # Calculate recent trend from last 4 shots
    recent_dx = [ext_x[i] - ext_x[i-1] for i in range(len(ext_x)-3, len(ext_x))]
    avg_dx = float(np.mean(recent_dx))
    
    # Vertical recoil in late spray is essentially clamped with slight micro-flutter
    curr_x = ext_x[-1]
    curr_y = ext_y[-1]
    curr_t = ext_t[-1]
    
    # Oscillation direction
    osc_dir = 1 if avg_dx >= 0 else -1
    
    for i in range(len(ext_x), target_length):
        curr_t += dt
        # Horizontal alternating sway
        curr_x += osc_dir * np.random.uniform(1.5, 3.5)
        if abs(curr_x - ext_x[-1]) > 12.0:
            osc_dir *= -1  # Reverse sway direction
            
        # Micro vertical flutter around plateau
        curr_y += np.random.uniform(-2.5, 0.5)
        
        ext_x.append(round(curr_x, 1))
        ext_y.append(round(curr_y, 1))
        ext_t.append(int(round(curr_t)))
        
    return ext_x, ext_y, ext_t


def sync_specs():
    specs_path = os.path.join(os.path.dirname(__file__), '..', 'client', 'specs.json')
    backup_path = specs_path + '.pre_ground_loot.bak'
    
    with open(specs_path, 'r', encoding='utf-8') as f:
        specs = json.load(f)
        
    # Backup
    with open(backup_path, 'w', encoding='utf-8') as f:
        json.dump(specs, f, indent=4)
    print(f"[+] Created backup at: {backup_path}")
    
    spec_dict = {s['name']: s for s in specs}
    
    # 1. R-99 SMG: Ground loot [18, 21, 24, 27, 33]
    if 'r99' in spec_dict:
        w = spec_dict['r99']
        w['mags'] = [
            {"size": 18, "audio": "r99_0"},
            {"size": 21, "audio": "r99_1"},
            {"size": 24, "audio": "r99_2"},
            {"size": 27, "audio": "r99_3"},
            {"size": 33, "audio": "r99_3"}
        ]
        w['x'], w['y'], w['time_points'] = extrapolate_late_spray(w['x'], w['y'], w['time_points'], w['rpm'], 33)

    # 2. R-301 Carbine: Ground loot [21, 23, 28, 31, 37]
    if 'r301' in spec_dict:
        w = spec_dict['r301']
        w['mags'] = [
            {"size": 21, "audio": "r301_0"},
            {"size": 23, "audio": "r301_1"},
            {"size": 28, "audio": "r301_2"},
            {"size": 31, "audio": "r301_3"},
            {"size": 37, "audio": "r301_3"}
        ]
        w['x'], w['y'], w['time_points'] = extrapolate_late_spray(w['x'], w['y'], w['time_points'], w['rpm'], 37)

    # 3. VK-47 Flatline: Ground loot [19, 23, 27, 29, 35]
    if 'flatline' in spec_dict:
        w = spec_dict['flatline']
        w['mags'] = [
            {"size": 19, "audio": "flatline_19"},
            {"size": 23, "audio": "flatline_23"},
            {"size": 27, "audio": "flatline_27"},
            {"size": 29, "audio": "flatline_29"},
            {"size": 35, "audio": "flatline_29"}
        ]
        w['x'], w['y'], w['time_points'] = extrapolate_late_spray(w['x'], w['y'], w['time_points'], w['rpm'], 35)

    # 4. Volt SMG: Ground loot [20, 22, 24, 27, 32]
    if 'volt' in spec_dict:
        w = spec_dict['volt']
        w['mags'] = [
            {"size": 20, "audio": "volt_0"},
            {"size": 22, "audio": "volt_1"},
            {"size": 24, "audio": "volt_2"},
            {"size": 27, "audio": "volt_3"},
            {"size": 32, "audio": "volt_3"}
        ]
        w['x'], w['y'], w['time_points'] = extrapolate_late_spray(w['x'], w['y'], w['time_points'], w['rpm'], 32)

    # 5. Alternator SMG: Ground loot [18, 20, 22, 26, 32]
    if 'alternator' in spec_dict:
        w = spec_dict['alternator']
        w['mags'] = [
            {"size": 18, "audio": "alternator_0"},
            {"size": 20, "audio": "alternator_1"},
            {"size": 22, "audio": "alternator_2"},
            {"size": 26, "audio": "alternator_3"},
            {"size": 32, "audio": "alternator_3"}
        ]
        w['x'], w['y'], w['time_points'] = extrapolate_late_spray(w['x'], w['y'], w['time_points'], w['rpm'], 32)

    # 6. Devotion LMG (Turbocharger): Ground loot [36, 40, 44, 48]
    if 'devotion_tc' in spec_dict:
        w = spec_dict['devotion_tc']
        w['mags'] = [
            {"size": 36, "audio": "devotion_tc_0"},
            {"size": 40, "audio": "devotion_tc_1"},
            {"size": 44, "audio": "devotion_tc_2"},
            {"size": 48, "audio": "devotion_tc_3"}
        ]

    # 7. HAVOC Rifle: Ground loot [18, 21, 25, 29, 35]
    if 'havoc_tc' in spec_dict:
        w = spec_dict['havoc_tc']
        w['mags'] = [
            {"size": 18, "audio": "havoc_tc_0"},
            {"size": 21, "audio": "havoc_tc_1"},
            {"size": 25, "audio": "havoc_tc_2"},
            {"size": 29, "audio": "havoc_tc_3"},
            {"size": 35, "audio": "havoc_tc_3"}
        ]
        w['x'], w['y'], w['time_points'] = extrapolate_late_spray(w['x'], w['y'], w['time_points'], w['rpm'], 35)

    # 8. Prowler Burst PDW: Ground loot [20, 25, 30, 35]
    if 'prowler' in spec_dict:
        w = spec_dict['prowler']
        w['mags'] = [
            {"size": 20, "audio": "prowler_3"},
            {"size": 25, "audio": "prowler_3"},
            {"size": 30, "audio": "prowler_3"},
            {"size": 35, "audio": "prowler_3"}
        ]

    # 9. RE-45 Auto: Ground loot [20, 21, 23, 26]
    if 're45' in spec_dict:
        w = spec_dict['re45']
        w['mags'] = [
            {"size": 20, "audio": "re45_0"},
            {"size": 21, "audio": "re45_1"},
            {"size": 23, "audio": "re45_2"},
            {"size": 26, "audio": "re45_3"}
        ]
        w['x'], w['y'], w['time_points'] = extrapolate_late_spray(w['x'], w['y'], w['time_points'], w['rpm'], 26)

    # 10. M600 Spitfire: Ground loot [35, 40, 45, 50]
    if 'spitfire' in spec_dict:
        w = spec_dict['spitfire']
        w['mags'] = [
            {"size": 35, "audio": "spitfire_0"},
            {"size": 40, "audio": "spitfire_1"},
            {"size": 45, "audio": "spitfire_2"},
            {"size": 50, "audio": "spitfire_3"}
        ]

    # 11. L-STAR EMG: Ground loot [24, 26, 28, 30]
    if 'lstar' in spec_dict:
        w = spec_dict['lstar']
        w['mags'] = [
            {"size": 24, "audio": "lstar_20"},
            {"size": 26, "audio": "lstar_22"},
            {"size": 28, "audio": "lstar_24"},
            {"size": 30, "audio": "lstar_26"}
        ]
        w['x'], w['y'], w['time_points'] = extrapolate_late_spray(w['x'], w['y'], w['time_points'], w['rpm'], 30)

    # 12. Rampage LMG: Ground loot [28, 32, 36, 40]
    if 'rampage' in spec_dict:
        w = spec_dict['rampage']
        w['mags'] = [
            {"size": 28, "audio": "rampage_0"},
            {"size": 32, "audio": "rampage_1"},
            {"size": 36, "audio": "rampage_2"},
            {"size": 40, "audio": "rampage_3"}
        ]

    # 13. C.A.R. SMG: Ground loot [20, 23, 26, 30, 36]
    if 'car' in spec_dict:
        w = spec_dict['car']
        w['mags'] = [
            {"size": 20, "audio": "car_0"},
            {"size": 23, "audio": "car_1"},
            {"size": 26, "audio": "car_2"},
            {"size": 30, "audio": "car_3"},
            {"size": 36, "audio": "car_3"}
        ]
        w['x'], w['y'], w['time_points'] = extrapolate_late_spray(w['x'], w['y'], w['time_points'], w['rpm'], 36)

    # 14. Add Nemesis Burst AR (Energy 4-round burst AR, 582 peak RPM, [20, 24, 28, 32, 36])
    if 'nemesis' not in spec_dict:
        nem_x, nem_y, nem_t = generate_burst_recoil(burst_size=4, total_shots=36, rpm=582, climb_per_shot=14.5, drift_per_burst=2.2)
        specs.append({
            "name": "nemesis",
            "rpm": 582,
            "multiplier": 0.75,
            "mags": [
                {"size": 20, "audio": "havoc_tc_0"},
                {"size": 24, "audio": "havoc_tc_1"},
                {"size": 28, "audio": "havoc_tc_2"},
                {"size": 32, "audio": "havoc_tc_3"},
                {"size": 36, "audio": "havoc_tc_3"}
            ],
            "mods": {},
            "x": nem_x,
            "y": nem_y,
            "time_points": nem_t,
            "ping_points": []
        })
        print("[+] Added new weapon: Nemesis Burst AR (nemesis)")

    # 15. Add Hemlok Burst AR (Heavy 3-round burst AR, 384 RPM, [21, 24, 27, 30])
    if 'hemlok' not in spec_dict:
        hem_x, hem_y, hem_t = generate_burst_recoil(burst_size=3, total_shots=30, rpm=384, climb_per_shot=18.0, drift_per_burst=3.5)
        specs.append({
            "name": "hemlok",
            "rpm": 384,
            "multiplier": 0.78,
            "mags": [
                {"size": 21, "audio": "flatline_23"},
                {"size": 24, "audio": "flatline_23"},
                {"size": 27, "audio": "flatline_27"},
                {"size": 30, "audio": "flatline_29"}
            ],
            "mods": {},
            "x": hem_x,
            "y": hem_y,
            "time_points": hem_t,
            "ping_points": []
        })
        print("[+] Added new weapon: Hemlok Burst AR (hemlok)")

    with open(specs_path, 'w', encoding='utf-8') as f:
        json.dump(specs, f, indent=4)
        
    print(f"[+] Successfully synced {len(specs)} weapons in {specs_path}")


if __name__ == '__main__':
    sync_specs()
