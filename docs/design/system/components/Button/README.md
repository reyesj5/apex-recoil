# Button

Buttons start actions: one primary per area, the rest secondary or ghost.

- **Primary** (`sd-btn sd-btn--primary`): `volt` fill, `volt-ink` text at 700. The one main action of a panel, card or dialog: `Save spec`, `Next run`, `Accept`, `Connect game window`.
- **Secondary** (`--secondary`): `raised` fill with an `outline-strong` line: `Open progress`, `Replay`, `Export CSV`, `Copy link`, and `Cancel` beside a dialog's primary action.
- **Ghost** (`--ghost`): no fill, `text-secondary`: side actions and ways out inside panels: `Clear`, `Refresh`, `Inspect on the canvas`.
- **Destructive** (`--danger`): `danger-wash` fill, `danger-line` outline (3.2:1 on panel), `danger` text: `Delete sample`. Confirm before acting.
- **Icon** (`--icon`): `panel` fill, `divider` outline, `text-secondary` icon at 18 px. Always give it an `aria-label` (`Help`, `Settings`, `Mute sounds`).

Sizes: 38 px by default (`size-control`, `radius-control-lg`); `--compact` 36 px in the top bar; `--sm` 34 px in the Studio (`radius-control`); `--lg` 40 px for link buttons in panels (`radius-card`); `--touch` 44 px on phones. A keyboard hint inside a primary button uses `sd-kbd sd-kbd--inset`.

States: hover fills secondary, ghost and icon buttons with `hover`, and brings ghost and icon text up to `text`. Primary hover uses `volt-bright`, the link hover color. The preview's last row draws each hover (`is-hover`). A disabled icon button keeps its frame and turns its icon `icon-disabled` (Redo with nothing to redo). Focus is the 2 px `volt` ring.

Provide: a sentence-case label that starts with a verb, or an icon with an `aria-label`. A button that navigates is a real `<a href>` with the button classes.

In the app: shadcn/ui Button, variants `default` (primary), `secondary`, `ghost`, `destructive`, and size `icon`.
