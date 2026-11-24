# TopBar

The top bar carries the logo, the main navigation, search and the global settings; the Studio's version carries the weapon being edited and the save state.

- Trainer (`sd-topbar`): `inset` with an `outline` rule below, 12 px by 20 px padding, 16 px gaps. From the left: the logo (32 px high, linking home), the navigation (`Train`, `Patterns`, `Progress`), the search trigger, and on the right the language select and the `Help` and `Settings` icon buttons (36 px).
- Navigation items (`sd-nav__link`): 8 px by 12 px padding, `radius-control`, `text-secondary` at 500; the current page fills with `raised`, turns `text` at 600 and carries `aria-current="page"`.
- Search trigger (`sd-search`): 40 px, `panel` with a `divider` line, `radius-card`; a 16 px search icon, `Search weapons` in `text-muted` and the `Ctrl K` key. It opens the command palette.
- Studio (`sd-topbar--studio`): 10 px by 16 px padding, 12 px gaps. The logo (30 px) with the `Studio` tag, a 28 px `divider` rule, the weapon picker (art, `R-99`, `SMG · Auto · 1080 RPM`, a chevron), and on the right the save state badge, Undo, Redo and Keyboard shortcuts (34 px), and `Save spec` with `Ctrl S`.
- Status bar (`sd-statusbar`): the Studio's bottom line on `inset` with an `outline` rule above, 11 px `text-muted`: the weapon and scale on the left, the job queue and storage on the right.

Provide: the current page, the language, and in the Studio the weapon, the save state and the undo and redo availability.

In the app: our own header with shadcn/ui Button, Select and Command (Ctrl K).
