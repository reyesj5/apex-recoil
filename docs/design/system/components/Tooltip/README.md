# Tooltip

A tooltip names an icon-only control and its keyboard key; it never holds information found nowhere else.

- `text` fill with `ground` text (17:1), 12 px at 600, `radius-control` corners, 6 px by 10 px padding.
- The key follows the label in JetBrains Mono (`sd-tooltip__key`): `Align whole spray A`.
- Show it on hover and on keyboard focus, after a short delay; hide it on Escape.

Use it for the Studio tools, the top bar icon buttons and the range controls. Settings and instructions belong in the interface itself, not in tooltips.

Provide: the control's name and, if it has one, its key.

In the app: shadcn/ui Tooltip with the `popover` variables overridden to `text` and `ground`.
