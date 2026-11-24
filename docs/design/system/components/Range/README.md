# Range

The practice range is the trainer's main surface: the weapon's pattern drawn faintly, the practice options floating on top, and nothing else competing for attention.

- Surface (`sd-range`): `inset` with a 1 px `range-dot` grid on a 24 px pitch, an `outline` line and `radius-panel` corners. It takes all the space between the side panels and never moves when they change.
- Toolbar (`sd-range__toolbar`): centered at the top, 14 px from the edges: the mode and result-style segmented controls (`sd-segmented--floating`) and the replay speed (`sd-toolbar-field`).
- Pattern: the path to follow, from the start point at the top down, as the aim must move while the gun climbs: the line in `pattern-ink` at 22 % opacity with its shots at 60 % (16 % and 35 % behind a run), and the start point as a 9 px `volt` ring with crosshair ticks.
- Instruction under the pattern: `lead` "Click and hold anywhere in the range to spray", then a 13 px `text-secondary` hint: "Follow the path with your aim as the gun climbs, and your shots stay on the start point."
- Bottom corners: the mouse settings chip on the left (`Sensitivity 5.0`, `ADS 1.0×`, `Invert Y off`, values in `text`, numbers in JetBrains Mono), the sound button on the right.
- After a run (Dots): where the aim was at each shot, in `volt` (line at 70 %, full-strength dots), over the faint path, a legend chip (`Pattern`, `Your shots`) in the bottom left, and the run result card in the top right.
- During a run nothing in the interface changes or animates; panels update when the run ends.

Provide: the pattern points and the start point; after a run, the shot points.

In the app: the game engine draws the canvas (Konva); React renders only the controls around it.
