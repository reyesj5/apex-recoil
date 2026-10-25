# SegmentedControl

A segmented control picks one of two to four options that change the view or the practice at once: mode, result style, period, fire mode.

- **Volt** (`sd-segmented`): items 30 px high (`size-segment`), 12 px labels at 600 in `text-secondary`; the selected item fills with `volt` and `volt-ink` text. Track: `inset` with a `divider` line, 3 px padding, 2 px between items, `radius-card` corners, items `radius-segment`. Over the range or a panel header use `sd-segmented--floating` (`panel` track).
- **Neutral** (`sd-segmented--neutral`): for settings that sit beside other volt accents, such as fire mode in the loadout. Items are 28 px (`size-segment-sm`, `radius-sm`); the selected item fills with `divider`, takes a 1 px `field` outline (3.6:1 on the track, where the fill stands only 1.4:1) and its text turns `text`.

Labels are full words: `Follow path`, `Still target`, `Moving target`; `Target`, `Dots`, `Lines`; `7 days`, `30 days`, `All time`; `Auto`, `Burst`, `Single`. For more than four options, or options that need a description, use a select instead.

Provide: a group label (`aria-label` or a visible label with `aria-labelledby`), the options and the selected one. The control is a radio group (`role="radiogroup"`): each item is a `<button role="radio">` with `aria-checked`, and the arrow keys move between items.

In the app: shadcn/ui Toggle group, `type="single"`.
