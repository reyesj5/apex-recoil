# StatTile

A stat tile shows one number with its label: today's tries, median and best in the session panel, the totals on the Progress page.

- Session tile (`sd-stat`): `card` fill, `outline-card` line, `radius-card` corners, 12 px padding. The label in `stat-label` (11 px uppercase, 0.08em, `text-muted`), the value 4 px below in `stat-value` (Chakra Petch 24 px 700). Tiles sit two across with 8 px gaps (`sd-stats`, a `<dl>`).
- A best score takes `volt` (`sd-stat__value--best`): the all-time best, and the last score when it is today's best.
- A value that doesn't exist yet (a median or best before the first run) is a thin en dash in `text-muted` (`sd-no-value`: Inter regular, since the display face's bold dash reads as a bar), never a zero. A summary tile without a value shows the same dash.
- Summary tile (`sd-summary`): for page totals on `panel` with an `outline` line, `radius-card-lg`, 16 px padding; the label in `small` `text-secondary`, the value in `summary-value` (34 px) with a note after it in `text-muted`: `253 last 30 days`, `+15 since the first week`.

Provide: the label, the value (or nothing yet) and whether it is a best.

In the app: our own `StatTile` on shadcn/ui Card.
