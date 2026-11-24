# CommandPalette

The command palette finds a weapon by name from anywhere in the trainer: `Ctrl K` or the search field in the top bar opens it.

- Frame (`sd-command`): the Dialog's surface (`raised`, `outline-strong`, `radius-panel`, `shadow-float`) at 512 px, without padding, over the same scrim.
- Search row (`sd-command__input`): 48 px tall, a 20 px search icon at 50 % opacity, the input at 14 px with the placeholder `Search weapons` in `text-muted`, a `divider` line below.
- List (`sd-command__list`): at most 300 px, then it scrolls. Every weapon class is a group with its heading in 12 px 500 `text-muted` (`Assault rifle`, `SMG`), in the loadout's order.
- Item (`sd-command__item`): 44 px (12 px by 8 px padding), the weapon name at 14 px 500, its fire rate on the right in 12 px `text-muted` (`810 RPM`), `radius-sm` corners. The item under the arrow keys or the pointer fills with `hover`; Enter picks it and closes the palette.
- Nothing found: "No weapon matches." in `text-secondary`, centered.

Provide: the items with their group and meta, and the pick handler. The list is a `listbox` of `option`s, the input names it with `aria-label`; the palette is a dialog titled "Search weapons" for screen readers.

In the app: shadcn/ui Command (cmdk) in its dialog.
