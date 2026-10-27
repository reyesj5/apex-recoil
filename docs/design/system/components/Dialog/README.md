# Dialog

A dialog holds a task that needs the whole attention for a moment: settings, help, the keyboard shortcuts, the confirmation before an analysis, the check before saving a spec.

- Frame (`sd-dialog`): `raised` fill, an `outline-strong` line, `radius-panel` corners, 24 px padding, `shadow-float`, 16 px between blocks (`sd-dialog--roomy`: 20 px, for the trainer's settings and help). It is centered over a scrim of black at 50 % (`sd-scrim`), the one color outside the tokens.
- Widths: 448 px for settings and help, 512 px (`--lg`) for a confirmation with fields, 576 px (`--xl`) for the spec checkpoint, 768 px (`--wide`) for the shortcuts in two columns. On a small screen it keeps 16 px from each edge and scrolls inside.
- Head (`sd-dialog__head`): the title in `panel-title` (Chakra Petch 18 px, 700), like the Studio's panels, then the description in `text-muted` at 14 px: "Changes apply at once and stay in this browser." An icon before the title (18 px, `text-secondary`) only when it carries meaning, as the shield of `Check before saving`.
- Body: the dialog's sections open with a `section-label` (`MOUSE`, `PRACTICE`); fields, hints and switches are the same as in panels.
- Footer (`sd-dialog__footer`): on the right, `Cancel` as a secondary button, then the one primary action, which names what happens: `Analyze`, `Save spec`, `Add weapon`. A side action goes on the left as a ghost button (`sd-dialog__footer--split`): `Inspect on the canvas`. A dialog that only informs (help, shortcuts) closes with `Got it` or its close button.
- Close (`sd-dialog__close`): a 16 px x in the top right corner, `text` at 70 % opacity, full on hover. Escape and a click on the scrim close it too.

Provide: the title, the description, the content, and the actions. Use `role="dialog"` with `aria-labelledby` on the title and `aria-describedby` on the description; focus moves into the dialog, stays there, and goes back to the control that opened it.

In the app: shadcn/ui Dialog, with `type-panel-title` on its title.
