# Input

Inputs take typed values: a search filter, distances, fire rates and multipliers.

- Field (`sd-input`): 38 px (`size-control`), `inset` fill, a `field` line (3:1 or more on every surface), `radius-control-lg` corners, 12 px side padding, 14 px `text`; placeholders in `text-muted`.
- With a unit (`sd-input-unit`): the number in JetBrains Mono, the unit after it in `text-muted`: `20 m`, `104 °`, `1080 RPM`. The frame takes the focus ring.
- Plain numbers without a unit use `sd-input--number` (JetBrains Mono).
- Studio size (`--sm`): 34 px, `radius-control`, 10 px padding, 13 px text.
- The label sits above the field in `small` `text-secondary`, 6 px away (`sd-field`); two short fields share a row (`sd-fields-2`).

Provide: a visible label (or a visually hidden one for a search field whose placeholder says what it does), the value, and for numbers the unit and the allowed range.

In the app: shadcn/ui Input; an input with a unit is our own wrapper around it.
