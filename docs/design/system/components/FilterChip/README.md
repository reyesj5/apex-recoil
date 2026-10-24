# FilterChip

Filter chips narrow a list to one class, showing how many items each class holds.

- Pills 30 px high (`size-segment`, `radius-pill`) with a `divider` line on `raised`; 12 px labels at 600 in `text-secondary`, the count in `text-muted` at 500 after the label.
- Selected: a `volt` line over `volt-wash`, label in `text`.
- Classes and counts come from the data: `All 31`, `AR 5`, `SMG 5`, `LMG 4`, `Marksman 4`, `Sniper 4`, `Shotgun 5`, `Pistol 4`.
- On phones chips are 44 px (`sd-chip--touch`) and scroll sideways in one row (`sd-chips--scroll`), as the weapon picker of the pattern viewer.

Provide: a group label, the options with their counts, and the selected one. The chips form a radio group (`role="radiogroup"`): each chip is a `<button role="radio">` with `aria-checked`, and the arrow keys move between them. The touch chips scroll sideways inside the component, inset so the focus outline is not clipped.

In the app: shadcn/ui Toggle group styled as chips.
