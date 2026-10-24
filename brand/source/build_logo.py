"""Builds the logo SVGs in brand/ (and etc/favicon.svg) from the product name.

The wordmark is Chakra Petch Bold (SIL Open Font License 1.1, brand/source/OFL.txt) converted to
outlines, so the SVGs need no font. The mark (a downward chevron of five shot dots) does not depend
on the name; favicon PNG/ICO files only need regenerating when the mark changes.

Usage (from the repository root, needs fontTools):
    python brand/source/build_logo.py --name Spraydown --accent-from 5
--accent-from is the index of the first letter drawn in the accent color ("Spray" + "down").
"""
import argparse
import re
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

VOLT, INK, TEXT = '#C5F23A', '#0A0C0F', '#ECEFF3'
ROOT = Path(__file__).resolve().parents[2]
FONT = ROOT / 'brand' / 'source' / 'ChakraPetch-Bold.ttf'


def outline(text, size):
    """Glyph outlines at `size` (baseline at y=0) with the font's advances and GPOS pair kerning."""
    font = TTFont(FONT)
    scale = size / font['head'].unitsPerEm
    cmap, glyphs, hmtx = font.getBestCmap(), font.getGlyphSet(), font['hmtx']
    kern = {}
    for lookup in font['GPOS'].table.LookupList.Lookup if 'GPOS' in font else []:
        for st in lookup.SubTable:
            st = st.ExtSubTable if lookup.LookupType == 9 else st
            if lookup.LookupType not in (2, 9) or not hasattr(st, 'Format'):
                continue
            if st.Format == 1:
                for left, pairset in zip(st.Coverage.glyphs, st.PairSet):
                    for rec in pairset.PairValueRecord:
                        if rec.Value1 and getattr(rec.Value1, 'XAdvance', 0):
                            kern.setdefault((left, rec.SecondGlyph), rec.Value1.XAdvance)
            elif st.Format == 2:
                c1, c2 = st.ClassDef1.classDefs, st.ClassDef2.classDefs
                for left in st.Coverage.glyphs:
                    for right, cls in c2.items():
                        rec = st.Class1Record[c1.get(left, 0)].Class2Record[cls]
                        if rec.Value1 and getattr(rec.Value1, 'XAdvance', 0):
                            kern.setdefault((left, right), rec.Value1.XAdvance)
    names = [cmap[ord(ch)] for ch in text]
    x, out = 0.0, []
    for i, name in enumerate(names):
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))
        # two decimals are plenty at this size and drop floating-point noise such as 18.400000000000002
        out.append(re.sub(r'-?\d+\.\d+', lambda m: f'{float(m.group()):.2f}'.rstrip('0').rstrip('.'), pen.getCommands()))
        x += hmtx[name][0] * scale + (kern.get((name, names[i + 1]), 0) * scale if i + 1 < len(names) else 0)
    os2 = font['OS/2']
    return out, x, os2.sCapHeight * scale, os2.sTypoAscender * scale, os2.sTypoDescender * scale


def dots(k=1.0, fill=INK):
    rows = [(19.95, 4.6, [-16, 16]), (30.95, 5.2, [-8, 8]), (42.45, 6.2, [0])]
    return ''.join(f'<circle cx="{(32 + dx) * k:.2f}" cy="{y * k:.2f}" r="{r * k:.2f}" fill="{fill}"/>' for y, r, xs in rows for dx in xs)


def svg(view_box, title, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}" role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--name', required=True)
    ap.add_argument('--accent-from', type=int, default=None, help='index of the first accent-colored letter')
    args = ap.parse_args()
    name, cut = args.name, args.accent_from if args.accent_from is not None else len(args.name)
    paths, width, cap, asc, desc = outline(name, 100)
    first, second = ' '.join(paths[:cut]), ' '.join(paths[cut:])

    def words(fill1, fill2):
        return f'<path fill="{fill1}" d="{first}"/>' + (f'<path fill="{fill2}" d="{second}"/>' if second else '')

    s = 30 / cap  # wordmark cap height 30 next to a 64-unit mark
    lockup_w = 64 + 16 + width * s

    def lockup(square, dot, fill1, fill2):
        return svg(f'0 0 {lockup_w:.1f} 64', name, f'<rect width="64" height="64" rx="14" fill="{square}"/>{dots(fill=dot)}'
                   f'<g transform="translate(80 47) scale({s:.5f})">{words(fill1, fill2)}</g>')

    files = {
        ROOT / 'brand' / 'spraydown-mark.svg': svg('0 0 64 64', name, f'<rect width="64" height="64" rx="14" fill="{VOLT}"/>{dots()}'),
        ROOT / 'brand' / 'spraydown-mark-graphite.svg': svg('0 0 64 64', name, f'<rect width="64" height="64" rx="14" fill="{INK}"/>{dots(fill=VOLT)}'),
        ROOT / 'brand' / 'spraydown-mark-mono.svg': svg('0 0 64 64', name, dots(fill='currentColor')),
        ROOT / 'brand' / 'spraydown-logo.svg': lockup(VOLT, INK, TEXT, VOLT),
        ROOT / 'brand' / 'spraydown-logo-light.svg': lockup(INK, VOLT, INK, INK),
        ROOT / 'brand' / 'spraydown-wordmark.svg': svg(f'0 {-asc:.1f} {width:.1f} {asc - desc:.1f}', name, words(TEXT, VOLT)),
        ROOT / 'etc' / 'favicon.svg': svg('0 0 64 64', name, f'<rect width="64" height="64" rx="14" fill="{VOLT}"/>{dots()}'),
    }
    for path, text in files.items():
        path.write_text(text, encoding='utf-8', newline='\n')
        print(path.relative_to(ROOT))


if __name__ == '__main__':
    main()
