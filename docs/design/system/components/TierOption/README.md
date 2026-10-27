# TierOption

A tier option picks the magazine to train with, showing its tier color, capacity and name.

- Option (`sd-tier`): a 3 px bar in the tier color, the capacity in `readout` (JetBrains Mono 15 px 600), the tier name in `micro` (10 px) `text-secondary`. `card` fill, `divider` line, `radius-control-lg` corners, padding 8 px 4 px 7 px.
- Tier colors only on the bar: `tier-base`, `tier-1`, `tier-2`, `tier-3`, `tier-corrupted` (`sd-tier--1`, `--2`, `--3`, `--corrupted`).
- Selected: a `volt` line over `volt-wash`. Hover fills with `hover`.
- One option per magazine the weapon has, in a grid with 6 px gaps (`sd-tiers`; set the column count to the number of options). A weapon with one magazine shows one `Standard` option with the `tier-base` bar.
- The group's heading says the result: `Magazine` with `28 rounds` on the right in `text-muted`. With the corrupted stock on, capacities drop by 4 (1 for shotguns).
- On phones options are 48 px without names (`sd-tier--touch`).
- In the Studio inspector the sizes are editable (`sd-tier-edit`): the bar over a 32 px number field (`size-tab`, `field` line, `radius-segment`), the name below.

Provide: the weapon's capacities in tier order and the selected tier. The options form a radio group (`role="radiogroup"`): each is a `<button role="radio">` with `aria-checked` and an accessible name that includes the tier (`Level 2 magazine, 28 rounds`).

In the app: shadcn/ui Toggle group with our own `TierOption` items.
