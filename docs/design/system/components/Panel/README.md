# Panel

Panels hold a page's side columns (Loadout, Session, Capture, Inspector); cards group related content inside them.

- Panel (`sd-panel`): `panel` fill, `outline` line, `radius-panel` corners, 16 px padding, 14 px between blocks. It opens with a header row (`sd-panel__head`): a `section-label` on the left (`Session`) and a short aside on the right in `small` `text-muted` (`Today`, `31 weapons`).
- Card (`sd-card`): `card` fill, `outline-card` line, `radius-card-lg`, 14 px padding; a 13 px 600 title and 12 px `text-secondary` text at 1.5 line height. Example: "Before you start" with its two tips and links.
- Empty well (`sd-empty`): a dashed `outline-strong` line, `radius-card`, 12 px `text-muted` centered text that says what will appear: "Your runs from today appear here as a trend."
- Legal footer (`sd-footer`): at the bottom of the session panel, above an `outline` rule, 11 px `text-muted` at 1.5 line height, links in `text-secondary`: `Privacy`, `Cookie settings`, `FAQ`, `Changelog`, then the copyright, the credit line and the EA disclaimer.
- Studio panels sit flush against each other with `outline` rules instead of gaps and corners, and open with a `panel-title` (18 px).

Provide: the header label and aside, and the content. Use `<aside>` with an `aria-label` for side panels and `<section>` with a heading for cards.

In the app: shadcn/ui Card (whose `card` variable is the `panel` token).
