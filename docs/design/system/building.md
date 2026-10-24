# Building with Tailwind and shadcn/ui

The app is built with React 19, Tailwind 4 and shadcn/ui (style `new-york`, Radix). The component previews here are plain HTML on `components/bundle.css` so that any token change shows at once. The app keeps a copy of `tokens.json` (`client/styles/tokens.json`) from which its build generates the Tailwind theme, and maps shadcn/ui's semantic variables onto the same tokens.

## Tokens in Tailwind

- Colors, radii, shadows and sizes become theme variables under their own names: `bg-panel`, `text-text-muted`, `border-outline-card`, `rounded-card-lg`, `shadow-float`. Tailwind's default colors, radii and shadows are switched off, so only these exist; the generic names shadcn/ui uses (`rounded-md`, `shadow-lg`) are aliases of tokens.
- Sizes are spacing values named without their prefix: `h-control` (38 px), `size-icon`, `h-touch`, `h-tile`.
- Spacing steps sit on Tailwind's 4 px scale: `space-12` is `p-3`, `space-14` is `p-3.5`, `space-18` is `p-4.5`.
- The fonts are `font-display`, `font-sans` and `font-mono`. The app hosts them itself (Chakra Petch 600 and 700; Inter and JetBrains Mono as variable fonts), hence "Inter Variable" and "JetBrains Mono Variable" at the head of the stacks.
- Each type style becomes a utility named `type-<style>`: `type-score-xl`, `type-section-label`, `type-stat-label`; a style whose usage says uppercase gets it. Each size in the type scale is also a font-size step, `text-<px>` (`text-13`, `text-11`), for text that takes a size without a whole style. Arbitrary sizes are not used.
- Class names merge with the `cn` package (clsx and tailwind-merge in one), configured with these names, so a later `h-touch` replaces `h-control`. shadcn/ui components import it as `cn` from "cn".

## shadcn/ui variables

| shadcn/ui variable | Token |
| --- | --- |
| `background`, `foreground` | `ground`, `text` |
| `card`, `card-foreground` | `panel`, `text` |
| `popover`, `popover-foreground` | `raised`, `text` |
| `primary`, `primary-foreground` | `volt`, `volt-ink` |
| `secondary`, `secondary-foreground` | `raised`, `text` |
| `muted`, `muted-foreground` | `hover`, `text-muted` |
| `accent`, `accent-foreground` | `hover`, `text` |
| `destructive` | `danger` |
| `border` | `divider` |
| `input` | `field` |
| `ring` | Not used: focus is one global 2 px `volt` outline with a 2 px offset (`:focus-visible`) |
| `chart-1` to `chart-5` | `volt`, `text-secondary`, `target`, `warning`, `tier-3` |

shadcn/ui's `card` is the `panel` surface; this system's `card` token is the darker surface for cards inside panels. In the app, Tailwind's `bg-card` is this system's `card`, and shadcn/ui's Card component uses `bg-panel`.

## Components

| Need | Build it from |
| --- | --- |
| Actions | shadcn/ui Button: primary, secondary, ghost, destructive, icon |
| Modes, result style, period, fire mode | Toggle group, segmented |
| Weapon class filter | Toggle group styled as chips, with counts |
| Weapon grid | Scroll area and a `WeaponTile` of our own |
| Magazine tiers | Toggle group and a `TierOption` of our own |
| Fields | Input, input with a unit, Select, Switch, Checkbox, Slider |
| Studio capture methods | Tabs |
| Search everywhere | Command, opened with Ctrl K |
| Help on controls | Tooltip with the keyboard key |
| Confirmations, shortcuts, the spec checkpoint | Dialog, Alert dialog |
| Settings | Dialog on desktop, Drawer on phones |
| Saved, failed, undo | Sonner toasts |
| Job progress | Progress and a toast |
| Numbers | Card and our own `StatTile` and `ScoreCard` |
| Charts | Chart (Recharts), loaded when needed |
| Recent runs | Table |
| Studio navigation | Sidebar as an icon rail |
| Cookie consent | Our own `ConsentBanner` on Card |

A choice of one (segmented controls, chips, weapon tiles, magazine tiers) is a Radix toggle group of type single, which is a radio group: each option has `role="radio"` and `aria-checked`, and the arrow keys move between options.

Dialog, Alert dialog, Drawer, Command and the error toast are not designed yet. Until they are, build them from shadcn/ui on the variables above: the `raised` surface with an `outline-strong` line, `radius-panel` corners and `shadow-float`.
