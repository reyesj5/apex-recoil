# Kbd

A keyboard key, shown wherever a shortcut exists: in the search trigger, tooltips, buttons and the shortcuts dialog.

- Default (`sd-kbd`): `key` style (JetBrains Mono 11 px), `text-secondary`, an `outline-strong` line, `radius-key` corners, 2 px by 6 px padding. `sd-kbd--lg` pads 3 px by 7 px when the key stands alone.
- Inside a primary button (`sd-kbd--inset`): no line, `volt-ink-wash` fill, 10 px, `radius-key-inset` corners: `Save spec Ctrl S`.

Write keys the way the keyboard labels them, with modifiers first and a space between: `Ctrl K`, `Ctrl S`, `Space`, `Shift A`. Single-letter tool keys are capitals: `A`, `V`, `C`.

Provide: the key text, inside a `<kbd>`.
