# Select

Selects pick one option from a longer list: optic, color correction, compared pattern, language, replay speed.

- Field select (`sd-select`): the same frame as an input (38 px, `inset`, `field` line, `radius-control-lg`), 8 px side padding; Studio size `sd-select--sm` (34 px, `radius-control`).
- Quiet select (`sd-select--quiet`): the top bar's language picker, 36 px on `panel` with a `divider` line and `radius-control` corners. Its label is visually hidden.
- Toolbar select (`sd-toolbar-field` with `sd-select--bare`): a label and a borderless select inside one 38 px chip on the range: `Replay 1×`, `Weapon All weapons`.
- Options name what they are in full: `2× HCOG Bruiser (standard at 20 m)`, `HDR fix (natural)`, `Median of samples`. Language options are written in their own language: `English`, `Русский`, `中文`.

Provide: a label (visible, or visually hidden in the top bar), the options and the selected one.

In the app: shadcn/ui Select.
