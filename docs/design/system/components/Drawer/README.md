# Drawer

On a phone, what a desktop puts in a dialog slides up from the bottom in a drawer: settings, a longer choice.

- Sheet (`sd-drawer`): `raised` fill, an `outline-strong` line along the top, `radius-sheet` top corners, `shadow-sheet`, 16 px side padding, 16 px between blocks. At most 80 % of the screen's height; longer content scrolls inside.
- A handle (`sd-drawer__handle`) at the top: 40 by 4 px, `outline-strong`, `radius-pill`. It shows that the sheet drags down to close; Escape and a tap on the scrim above close it too.
- Head: the title in `panel-title` and the description in `text-muted`, centered.
- Controls at `size-touch` (44 px): fields (`sd-input--touch`), switches in 44 px rows, and a full-width primary button at the end (`Done`).

Provide: the title, the description, the content, and the closing action. The drawer is a dialog (`role="dialog"`, labelled by its title), with the same focus handling.

In the app: shadcn/ui Drawer (Vaul), with `shadow-sheet` when it comes from the bottom.
