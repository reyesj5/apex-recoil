import os

def extract_nemesis():
    src_file = r'C:\Users\micro.VADER\.gemini\antigravity-ide\brain\f0790f3b-c131-4107-8262-e6dcd9e65ef8\.system_generated\steps\663\content.md'
    with open(src_file, 'r', encoding='utf-8') as f:
        content = f.read()

    svg_start = content.find('<?xml')
    if svg_start == -1:
        svg_start = content.find('<svg')
    svg_content = content[svg_start:].strip()

    # Stylize as bright/white weapon silhouette on transparent background
    svg_content = svg_content.replace('fill:#000000', 'fill:#dfdfdf')
    svg_content = svg_content.replace('fill="#000000"', 'fill="#dfdfdf"')

    root_dir = os.path.join(os.path.dirname(__file__), '..')
    for d in ['assets/images', 'public/images', 'static/images']:
        target_dir = os.path.join(root_dir, d)
        os.makedirs(target_dir, exist_ok=True)
        out_path = os.path.join(target_dir, 'nemesis.svg')
        with open(out_path, 'w', encoding='utf-8') as out:
            out.write(svg_content)
        print(f"[+] Wrote {out_path}")

if __name__ == '__main__':
    extract_nemesis()
