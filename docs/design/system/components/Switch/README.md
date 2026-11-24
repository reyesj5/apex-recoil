# Switch

A switch turns one option on or off at once, such as the corrupted stock.

- 36 × 20 px (`sd-switch`): the track is `field` when off and `volt` when on; the 16 px thumb is `ground`. The thumb slides in 150 ms, or jumps with reduced motion.
- The label sits on the left at `label` (13 px 600), the switch on the right, across the full row (`sd-toggle-row`); the whole row toggles.
- The mockups draw the browser's own checkbox at this size; this switch follows shadcn/ui's Switch with the token mapping (`primary` for on, `input` for off).

Use a switch for a setting that applies immediately. For an option inside a form that is saved later, use a checkbox.

Provide: the label and the state. The control is an `<input type="checkbox" role="switch">` inside its `<label>`.

In the app: shadcn/ui Switch.
