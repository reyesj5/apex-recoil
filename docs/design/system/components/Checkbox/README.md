# Checkbox

Checkboxes turn layers and options on or off where several can be on at once, such as the Studio's layers.

- 16 px (`sd-checkbox`): `inset` fill with a `field` line and `radius-key-inset` corners; checked, it fills with `volt` and shows a `volt-ink` check.
- In a layer row (`sd-check-row`): the checkbox, the name at 13 px 600, and the current value at the end in JetBrains Mono `text-secondary` (`80%`). A slider for the same layer sits below the row.
- The mockups draw the browser's own checkbox tinted volt; this one follows shadcn/ui's Checkbox with the token mapping.

Provide: the label, the state and, in a layer row, the value shown at the end.

In the app: shadcn/ui Checkbox.
