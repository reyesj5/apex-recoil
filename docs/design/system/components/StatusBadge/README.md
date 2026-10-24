# StatusBadge

A status badge shows a state that lasts: unsaved changes, the capture connection, the trigger; the delta pill shows how a run compares.

- Badge (`sd-badge`): a pill 26 px high (`size-badge`, `radius-pill`) with a 6 px dot and a short label at 12 px.
  - Warning (`--warning`): `warning-wash` fill, `warning` text and dot at 600: `Unsaved changes`.
  - Positive (`--positive`): `volt-wash` fill, `volt` text and dot at 600: `Connected`.
  - Neutral: `hover` fill, `text-secondary` text, a `text-muted` dot: `Trigger idle`, `Not connected`.
- Sizes: `--lg` 30 px in the Studio top bar; `--sm` (11 px, 2 px by 8 px padding) inside Studio sections.
- Delta pill (`sd-delta`): `volt-wash` with `volt` text and an up arrow, followed by plain words: `↑ 9 above today's median`. A result below the median is not designed yet.
- Tag (`sd-tag`): an `outline-strong` pill with uppercase `tag` text (`Studio`), for naming a product area, not a state.

Every status pairs color with words; the dot alone means nothing.

Provide: the state and its label. Live states (connection, trigger) are announced with `role="status"`.

In the app: our own `StatusBadge` on shadcn/ui Badge.
