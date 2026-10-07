import os

weapon_svg_steps = {
    'wingman': 799,
    'peacekeeper': 801,
    'mastiff': 803,
    'eva8': 805,
    'mozambique': 807,
    'mozambique_akimbo': 809,
    'p2020': 811,
    'p2020_akimbo': 813,
    'g7_scout': 815,
    'triple_take': 817,
    '3030_repeater': 819,
    'longbow': 821,
    'charge_rifle': 823,
    'sentinel': 825,
    'kraber': 827,
    'bocek': 829
}

steps_base = r'C:\Users\micro.VADER\.gemini\antigravity-ide\brain\f0790f3b-c131-4107-8262-e6dcd9e65ef8\.system_generated\steps'
root_dir = os.path.join(os.path.dirname(__file__), '..')

for wid, step in weapon_svg_steps.items():
    step_file = os.path.join(steps_base, str(step), 'content.md')
    if not os.path.exists(step_file):
        print(f"[-] Missing step {step} for {wid}")
        continue
        
    with open(step_file, 'r', encoding='utf-8') as f:
        content = f.read()

    svg_start = content.find('<?xml')
    if svg_start == -1:
        svg_start = content.find('<svg')
    if svg_start == -1:
        print(f"[-] No SVG tag in step {step} for {wid}")
        continue
        
    svg_content = content[svg_start:].strip()

    # Stylize as bright/white weapon silhouette on transparent background
    svg_content = svg_content.replace('fill:#000000', 'fill:#dfdfdf')
    svg_content = svg_content.replace('fill="#000000"', 'fill="#dfdfdf"')

    for d in ['assets/images', 'public/images', 'static/images']:
        target_dir = os.path.join(root_dir, d)
        os.makedirs(target_dir, exist_ok=True)
        out_path = os.path.join(target_dir, f"{wid}.svg")
        with open(out_path, 'w', encoding='utf-8') as out:
            out.write(svg_content)

    print(f"[+] Extracted {wid}.svg")

print("All weapon SVGs extracted successfully!")
