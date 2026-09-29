import json
import os

def generate_markdown():
    detailed_path = os.path.join(os.path.dirname(__file__), 'data', 'wiki_weapons_detailed.json')
    master_path = os.path.join(os.path.dirname(__file__), 'data', 'wiki_weapons.json')
    specs_path = os.path.join(os.path.dirname(__file__), '..', 'client', 'specs.json')
    docs_path = os.path.join(os.path.dirname(__file__), '..', 'docs', 'weapons-wiki-stats.md')

    with open(detailed_path, 'r', encoding='utf-8') as f:
        detailed = json.load(f)

    master_map = {}
    if os.path.exists(master_path):
        with open(master_path, 'r', encoding='utf-8') as f:
            for w in json.load(f):
                master_map[w['name']] = w

    with open(specs_path, 'r', encoding='utf-8') as f:
        specs = json.load(f)

    spec_map = {s['name']: s for s in specs}

    lines = []
    lines.append("# Apex Legends Weapons Reference & Live Wiki Ground Loot Stats")
    lines.append("")
    lines.append("Source: [The Apex Legends Wiki (wiki.gg)](https://apexlegends.wiki.gg/wiki/Weapon)")
    lines.append("")
    lines.append("This document compiles live patch stats, magazine tier progressions (Base through **Tier 4 / Corrupted**), fire rates (RPM), tactical & full reload times, damage profiles, and weapon classes across all 29 weapon subpages currently in Apex Legends. It also compares live ground loot values against [`client/specs.json`](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/client/specs.json).")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 📦 Ground Loot vs. Care Package Rotations")
    lines.append("")
    lines.append("> [!IMPORTANT]")
    lines.append("> In Apex Legends, seasonal Care Package / Supply Drop shifts are rotational. Weapons that enter the Care Package (e.g. R-99, Devotion, Wingman, Alternator, EVA-8) retain their foundational ground loot balance, attachment slots, and magazine progressions across standard Battle Royale and Mixtape rotations. When scraping weapon statistics, querying each weapon's dedicated page surfaces the ground loot base stats alongside extended magazine tiers.")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 🔴 Tier 4 / Corrupted (Mythic Red) Extended Magazines")
    lines.append("")
    lines.append("Corrupted / Tier 4 extended magazines (`L4`) represent the highest tier magazine capacity available in Apex Legends. Individual weapon pages document the following Tier 4 capacities:")
    lines.append("")
    lines.append("| Weapon | Category | Base | Level 1 (White) | Level 2 (Blue) | Level 3 (Purple/Gold) | Level 4 / Corrupted (Red) |")
    lines.append("| :--- | :---: | :---: | :---: | :---: | :---: | :---: |")

    corrupted_weapons = [w for w in detailed.values() if w.get('has_l4')]
    for w in corrupted_weapons:
        m = w.get('mag_tiers', {})
        b = m.get('base', '-')
        l1 = m.get('level_1', '-')
        l2 = m.get('level_2', '-')
        l3 = m.get('level_3', '-')
        l4 = m.get('level_4_corrupted', '-')
        lines.append(f"| [{w['name']}]({w['url']}) | {w['category']} | {b} | {l1} | {l2} | {l3} | **{l4}** |")

    lines.append("")
    lines.append("*(Note: For Akimbo P2020, magazine capacities double: 18 / 20 / 22 / 24 / **30**).*")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 📊 Comprehensive Ground Loot Weapon Stats Table")
    lines.append("")
    lines.append("| Weapon | Class | Ammo | Fire Mode | RPM | DPS | Body Dmg | Mag Progression (Base / L1 / L2 / L3 / L4) | Proj Speed | Trainer Status |")
    lines.append("| :--- | :---: | :--- | :--- | :---: | :---: | :---: | :--- | :---: | :---: |")

    for wid, w in detailed.items():
        m_list = "/".join(str(x) for x in w.get('mag_list', []))
        trainer_status = f"`{wid}` ✅" if wid in spec_map else "❌ Not Added"
        
        master_entry = master_map.get(w['name'], {})
        master_dmg = master_entry.get('damage', {})
        modes = w.get('fire_mode') or ", ".join(master_entry.get('modes', [])) or "Auto"
        
        w_body = w.get('damage', {}).get('body')
        body_dmg = w_body if (w_body and w_body != '-') else master_dmg.get('body', '-')
        
        w_head = w.get('damage', {}).get('head')
        head_dmg = w_head if (w_head and w_head != '-') else master_dmg.get('head', '-')
        
        w_legs = w.get('damage', {}).get('legs')
        legs_dmg = w_legs if (w_legs and w_legs != '-') else master_dmg.get('legs', '-')
        
        proj_speed = w.get('projectile_speed') or master_entry.get('projectile_speed', '-')
        rpm_val = w.get('rpm') or master_entry.get('rpm', '-')
        dps_val = w.get('dps') or master_entry.get('dps', '-')

        lines.append(f"| [{w['name']}]({w['url']}) | {w['category']} | {w['ammo']} | {modes} | {rpm_val} | {dps_val} | {body_dmg} | {m_list} | {proj_speed} | {trainer_status} |")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 🔍 Live Ground Loot Discrepancies vs `client/specs.json`")
    lines.append("")
    lines.append("Comparing our active recoil specifications in `client/specs.json` against live wiki ground loot data reveals key discrepancies where previous versions configured weapons with crate-locked capacities or outdated magazine sizes:")
    lines.append("")

    for wid, w in detailed.items():
        if wid in spec_map:
            s = spec_map[wid]
            spec_mags = [m['size'] for m in s.get('mags', [])]
            wiki_mags = w.get('mag_list', [])
            spec_rpm = s.get('rpm')
            wiki_rpm = w.get('rpm')

            diffs = []
            if spec_mags != wiki_mags:
                diffs.append(f"- **Magazine Progression:** Trainer has `{spec_mags}` vs Live Ground Loot `{wiki_mags}`")
            try:
                if wiki_rpm and float(spec_rpm) != float(wiki_rpm):
                    diffs.append(f"- **RPM:** Trainer has `{spec_rpm}` vs Live Ground Loot `{wiki_rpm}`")
            except (ValueError, TypeError):
                pass

            if diffs:
                lines.append(f"### {w['name']} (`{wid}`)")
                for d in diffs:
                    lines.append(d)
                if w.get('has_l4'):
                    lines.append(f"- **Tier 4 Corrupted Mag:** Supported on live (`{w['mag_tiers'].get('level_4_corrupted')}` rounds); trainer currently supports up to `{spec_mags[-1]}`.")
                lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## ⏱️ Technical Reload & Handling Times")
    lines.append("")
    lines.append("| Weapon | Tactical Reload (Base / L1 / L2 / L3 / L4) | Full Reload (Base / L1 / L2 / L3 / L4) |")
    lines.append("| :--- | :--- | :--- |")

    for wid, w in detailed.items():
        tac = w.get('tac_reload', '-') or '-'
        full = w.get('full_reload', '-') or '-'
        lines.append(f"| [{w['name']}]({w['url']}) | {tac} | {full} |")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 🎯 Damage Modifiers Reference")
    lines.append("")
    lines.append("| Weapon | Headshot | Body | Legs / Fortified |")
    lines.append("| :--- | :---: | :---: | :---: |")

    for wid, w in detailed.items():
        dmg = w.get('damage', {})
        master_entry = master_map.get(w['name'], {})
        master_dmg = master_entry.get('damage', {})
        w_head = dmg.get('head')
        head = w_head if (w_head and w_head != '-') else master_dmg.get('head', '-')
        w_body = dmg.get('body')
        body = w_body if (w_body and w_body != '-') else master_dmg.get('body', '-')
        w_legs = dmg.get('legs')
        legs = w_legs if (w_legs and w_legs != '-') else master_dmg.get('legs', '-')
        lines.append(f"| [{w['name']}]({w['url']}) | {head} | {body} | {legs} |")

    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 🛠️ Recoil Discovery & Spec Architecture Notes")
    lines.append("")
    lines.append("1. **Coordinate Extension for Tier 4 Magazines:**")
    lines.append("   - Recoil patterns in `client/specs.json` store coordinate arrays `x`, `y`, and `time_points` indexed by shot count.")
    lines.append("   - When expanding magazine sizes to include Corrupted L4 (e.g. R-99 to 33, R-301 to 37, Flatline to 35), coordinate vectors must be populated for those additional shots (e.g. shots 31..33 for R-99) using `recoil_discovery` capture or pattern stabilization to satisfy schema verification (`len_x >= max_mag`).")
    lines.append("2. **Care Package vs Ground Loot Dual-Specs:**")
    lines.append("   - If both crate and ground loot variations are needed, weapons can offer a mode toggle or separate spec IDs (e.g. `r99_crate` vs `r99`).")
    lines.append("3. **Akimbo Weapon Recoil:**")
    lines.append("   - P2020 Akimbo and Mozambique Akimbo double fire capacity and alter fire rates. They should be modeled as separate weapon entries with distinct timing intervals.")
    lines.append("")

    with open(docs_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(lines))

    print(f"Successfully generated {docs_path}")

if __name__ == '__main__':
    generate_markdown()
