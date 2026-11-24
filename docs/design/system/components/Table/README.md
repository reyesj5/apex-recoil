# Table

A table lists records to scan and compare: recent runs on the Progress page.

- Inside a `panel` card with a 15 px heading (`Recent runs`); the table scrolls sideways in its own container on narrow screens. While it scrolls, the container takes keyboard focus (`tabindex="0"`) and is a region named like the table, so the arrow keys can scroll it.
- Header cells: 12 px at 500 in `text-muted`, 8 px by 10 px padding, a `hover` rule below.
- Body cells: 13 px in `text-secondary`, 10 px padding, a `raised` rule below each row. The key column (the weapon) is `text` at 600.
- Scores sit at the end, right-aligned, in `score-cell` (Chakra Petch 16 px 700); 85 and up in `volt`.
- Columns: `When`, `Weapon`, `Magazine`, `Mode`, `Score`. Times are relative where it helps: `Today 21:42`, `Yesterday 22:10`. Magazines read `Lv 2 · 28`.

Provide: the rows and the column headers (`<th scope="col">`).

In the app: shadcn/ui Table.
