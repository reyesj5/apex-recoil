# WeaponTile

A weapon tile picks the weapon to train with from the loadout grid; the selected weapon's card sits above the grid.

- Tile (`sd-weapon-tile`): 92 px high (`size-tile`; 76 px without the RPM line), `card` fill, `outline-card` line, `radius-card` corners. Weapon art 34 px high, the name at 13 px 600 in `text`, the fire rate at 11 px in `text-muted` (`810 RPM`).
- Selected: a `volt` line over `volt-wash`, where the fire rate turns `text-secondary` (`text-muted` is 4.2:1 on `volt-wash`). Hover fills with `hover`.
- Weapons without art show the crosshair placeholder in `icon-disabled`.
- Grid: two columns with 8 px gaps (`sd-weapon-grid`), scrolling inside the loadout panel.
- Selected weapon (`sd-weapon-card`): `card` with `outline-card`, `radius-card-lg`, 12 px padding; art in a 112 × 56 box, the name in `weapon-name` (22 px), the class and fire rate below in `small` `text-secondary`: `Assault rifle · 810 RPM`.

Provide: the weapon's name as the game writes it, its art (or nothing, for the placeholder), its fire rate, and whether it is selected. The grid is a radio group (`role="radiogroup"`): each tile is a `<button role="radio">` with `aria-checked`, and the arrow keys move between tiles; the art is decorative (`alt=""`) because the name is in the tile.

In the app: our own `WeaponTile` inside a shadcn/ui Scroll area.
