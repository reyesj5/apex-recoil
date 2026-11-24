# ToolPalette

The tool palette floats over the Studio canvas and holds the editing tools; the zoom control sits in the opposite corner.

- Palette (`sd-tools`): a vertical toolbar 16 px from the canvas's top left, `panel` with a `divider` line, `radius-card-lg`, 4 px padding and gaps.
- Tools (`sd-tool`): 36 px squares (`size-icon`), `radius-control`, 18 px icons in `text-secondary`. The active tool fills with `volt` and `volt-ink`; one tool is active at a time.
- Tools and keys: `Select and move shots` V, `Pan` H (or hold Space), `Align whole spray` A, `Correct shots: add or remove holes` C, `Fit and center` F. Each shows a tooltip with its key.
- Zoom (`sd-zoom`): 16 px from the bottom right; `−` and `+` buttons (30 px, `radius-segment`), the level in JetBrains Mono 12 px, and `Fit` on a `hover` fill.
- Canvas (`sd-canvas`): `canvas` with a 1 px `canvas-dot` grid on a 20 px pitch; the wall frame is `wall` with a `divider` line and `radius-card-lg`. The pattern is drawn in `volt`; the start point in `target`.

Provide: the tools, the active one, and the zoom level. The palette is a `role="toolbar"` with `aria-orientation="vertical"`, and each tool a `<button>` with `aria-pressed`.

In the app: our own palette with shadcn/ui Toggle group and Tooltip; the canvas itself is react-konva.
