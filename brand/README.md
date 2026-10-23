# Spraydown brand

*2026-10-22. "Spraydown" is the working name until the owner decides ([ownership register](../docs/ownership-register.md)); the colors and type come from the [UI redesign](../docs/ui-redesign.md).*

## The mark

Five shot dots in a downward chevron, growing toward the point: a spray pulled down into one point. It is drawn on a 64-unit grid on a rounded square (radius 14). Below 24 px use the 16-px drawing (`source/favicon-16.svg`, larger dots on a 16 grid), which the 16 px favicon is rendered from.

## Files

| File | Use |
| --- | --- |
| `spraydown-logo.svg` | Logo on dark backgrounds: mark plus wordmark, "down" in volt |
| `spraydown-logo-light.svg` | Logo on light backgrounds: graphite mark, graphite wordmark |
| `spraydown-wordmark.svg` | Wordmark alone, on dark backgrounds |
| `spraydown-mark.svg` | Mark and app icon: volt square, graphite dots |
| `spraydown-mark-graphite.svg` | Mark on light backgrounds: graphite square, volt dots |
| `spraydown-mark-mono.svg` | Dots only in `currentColor`, for one-color use |

Served icons in `etc/`: `favicon.svg`, `favicon.ico` (16, 32 and 48 px), `favicon-16x16.png`, `favicon-32x32.png` and `apple-touch-icon.png` (180 px, full bleed, since iOS rounds the corners itself).

## Rules

- Keep clear space of at least half the mark's height around the logo.
- Minimum sizes: the mark at 16 px, the logo at 120 px wide.
- Colors: volt `#C5F23A`, ink `#0A0C0F`, text `#ECEFF3`. On light backgrounds use the light versions; volt text on white is not legible.
- Do not stretch, rotate or outline the logo, recolor single dots, or set the wordmark in another font.

## Type and regeneration

The wordmark is Chakra Petch Bold (SIL Open Font License 1.1, see `source/OFL.txt`) converted to outlines, with the font's own kerning; the SVGs need no font. When the name changes, rebuild the SVGs and `etc/favicon.svg` (requires fontTools):

```bash
python brand/source/build_logo.py --name Spraydown --accent-from 5
```

`--accent-from` is the index of the first letter in volt. The mark does not depend on the name, so the PNG and ICO favicons only need re-rendering when the mark changes.
