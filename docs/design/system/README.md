Spraydown is a recoil trainer for Apex Legends with a Studio for capturing and editing weapon patterns. Its look is **graphite and volt**: a dark range with one bright accent. Graphite surfaces keep weapon art and the game's tier colors readable; volt marks selection, the main action and good results, and collides with no tier color. Trainer and Studio share the tokens, type and components; the Studio uses the denser sizes.

## Principles

1. **The range comes first.** The practice range is the largest, calmest surface. Options float over it in one toolbar, and nothing pushes it around.
2. **Plain words, visible help.** Full labels, short instructions inside the range, settings grouped in one place instead of hover-only hints.
3. **Feedback you can read.** After each run a result card shows the score, the gap to today's median and the way to replay.
4. **One product.** The same parts everywhere; the Studio only gets denser.
5. **Fast by construction.** Nothing in the interface animates or re-renders during a run.
6. **Accessible as drawn.** AA contrast for text and field borders, real buttons and labels, keyboard access everywhere, reduced motion respected.

## Content

- Name things in full: `Marksman`, `Follow path`, `Still target`, `Moving target`, `Sensitivity 5.0`. Weapon names are written the way the game writes them: `R-301`, `C.A.R.`, `HAVOC`, `L-STAR`, `30-30 Repeater`.
- Use sentence case for labels, buttons and headings: `Save spec`, `Open progress`, `Next run`, `Copy link`, `Score per day`. Start buttons with a verb.
- Put the instruction where the action happens: "Click and hold anywhere in the range to spray." "Follow the path with your aim as the gun climbs, and your shots stay on the start point."
- Speak to the player as "you": "Your first run today shows up here." Use "we" only for the product's own practices, as in the consent text: "We use Google Analytics cookies to see how the trainer is used. Nothing is tracked unless you accept."
- Empty states say what will appear and how: "Recorded sprays appear here. Analyze them together to build a median pattern."
- Give numbers their units, set in `mono`: `1080 RPM`, `20 m`, `104°`, `56 ms`, `1.0×`, `28 rounds`. Scores are out of 100: `87 / 100`.
- Name magazine tiers `Base`, `Lv 1`, `Lv 2`, `Lv 3` and `Corrupted`; a weapon with one magazine says `Standard`.
- Status words are short and stateful: `Unsaved changes`, `Connected`, `Not connected`, `Trigger idle`, `Job queue: idle`.
- Say plainly where data lives: "Stored in this browser only. Clearing site data removes it."
- No emoji anywhere in the interface; icons come from the icon set below.

## Color

- Build depth with the surface ladder, darkest first: `ground` (page), `inset` (fields, the range, the top bar, segmented tracks), `panel` (sidebars and anything floating over the range), `card` (cards and tiles inside panels), `raised` (secondary buttons, chips, popovers, toasts), `hover` (hover and pressed). The Studio canvas uses `canvas`.
- Outline surfaces with 1 px lines that match their level: `outline` around panels and the range, `outline-card` around cards and tiles, `outline-strong` around raised controls and overlays, `divider` around chips, icon buttons and toolbar groups. These lines are decorative; a control never relies on them alone. Inputs and selects take `field`, which holds 3:1 on every surface it sits on.
- Set text in `text`, secondary text in `text-secondary`, labels and captions in `text-muted`, and running text inside compact overlays in `text-soft`. `text-muted` holds 4.5:1 down to `hover`; do not put it on anything lighter.
- Spend `volt` only on: the primary button, the selected segment, the active tool, selection outlines with `volt-wash` behind them, links (underlined inside running text, `volt-bright` on hover), focus rings, the player's shots and good results (all-time best, table scores from 85 up). Text on a volt fill is `volt-ink`. Never use volt for decoration or large areas.
- Use `target` for paths and targets on canvases, `pattern-ink` (faint) for the weapon's pattern, and `range-dot` or `canvas-dot` for the dot grids. These colors stay on canvases.
- Use `warning` with `warning-wash` for unsaved changes and attention, `danger` with `danger-wash` and `danger-line` for errors and destructive actions. Each status also carries a word.
- Reserve `tier-base`, `tier-1`, `tier-2`, `tier-3` and `tier-corrupted` for magazine tiers, drawn as a 3 px bar. They are never interface accents.
- `chart-bar` stands only 1.4:1 off `panel`; whenever it carries data, give the same numbers in text as well.

## Type

- Three families: `display` (Chakra Petch 600 and 700) for scores, weapon names, page titles and section labels; `sans` (Inter 400 to 700) for the interface; `mono` (JetBrains Mono 500 and 600) for numbers in fields and readouts and for keyboard keys.
- Scores: `score-xl` on the run result card, `score-lg` in the session panel, `stat-value` in stat tiles, `summary-value` for Progress totals, `score-cell` in tables.
- Panels open with a `section-label` (uppercase, text-muted). Cards and page sections take `heading` or `label` titles. Dialogs, alert dialogs and drawers open with a `panel-title`, as the Studio's panels do.
- Interface text is `body`, controls `label` or `chip`, captions and meta lines `small`, stat tile labels `stat-label` (uppercase), the legal footer and status bar `legal`, tier names and rail labels `micro`.
- Chakra Petch has no Cyrillic: in Russian, display text falls back to Inter semibold at the same sizes. Chinese text uses system fonts.

## Space, shape and depth

- Space on the core steps `space-4`, `space-8`, `space-12`, `space-16`, `space-24`, `space-32`; the in-between steps (`space-2` to `space-20`) are for the specific places their notes name. Panels pad `space-16` with `space-14` between blocks; cards pad `space-12` to `space-16`; pages pad `space-20` at the sides.
- Round by role: `radius-panel` for panels and the range, `radius-card-lg` for cards inside panels, `radius-card` for tiles and toolbar groups, `radius-control-lg` for 38 px controls, `radius-control` for 34 to 36 px controls, `radius-segment` for segment items, `radius-pill` for chips and badges, `radius-sheet` on phones.
- Heights: `size-control` (38) for buttons and fields, `size-control-sm` (34) in the Studio, `size-icon` (36) for icon buttons, `size-segment` (30) for chips and segments, `size-touch` (44) for every control on phones.
- Shadows are only for things that float over other content: `shadow-toast`, `shadow-float` (the run result, dialogs and the command palette) and `shadow-sheet` (phone sheets and drawers). Panels and cards have none.
- A dialog, alert dialog, command palette or drawer dims the page under a scrim of black at 50 %, the one color outside the tokens.

## States and motion

- Hover fills with `hover` and brings text up to `text`. Pressed uses the same fill.
- Selected chips, tiles and tier options get a `volt` outline over `volt-wash`. Selected segments and the active tool fill with `volt` and `volt-ink` text. In the neutral segmented control (fire mode) and Studio tabs the selected item fills with `divider` and its text turns `text`.
- The current page in the top navigation fills with `raised`; in the Studio rail with `hover`.
- Focus is a 2 px `volt` outline with a 2 px offset, on every focusable element.
- Disabled icons take `icon-disabled`.
- Motion: 150 ms ease-out for hover and press, 200 ms for panels and dialogs, none when the system asks for reduced motion. Nothing in the interface animates during a run.

## Layout

- Trainer: a top bar on `inset`, the loadout panel on the left (300 to 340 px), the range in the middle taking every remaining pixel, the session panel on the right (260 to 320 px). The practice options float at the top of the range; mouse settings and sound sit in its bottom corners.
- Studio: an icon rail (64 px), the capture panel (300 to 340 px), the canvas, the inspector (280 to 320 px) and a status bar.
- Phones get a pattern viewer instead of the trainer: 44 px controls, `radius-sheet` sections and a bottom-sheet consent.

## Iconography

- Use Lucide icons: 24 px grid, 2 px stroke, round caps and joins, drawn in `currentColor`. Sizes: 16 px in compact buttons and the search trigger, 18 px in 36 to 38 px icon buttons and tools, 20 px in the Studio rail, 12 to 14 px inside pills and toasts (with a 2.5 to 3 px stroke).
- Every icon-only button has a text label (`aria-label`) and, for tools, a tooltip naming the shortcut.
- A weapon without art shows the crosshair placeholder in `icon-disabled`.

## Logo

- The mark is five shot dots in a downward chevron, growing toward the point: a spray pulled down into one point. The logo files are in the Logos group.
- On dark surfaces use the volt version; on light backgrounds use the light versions, since volt text on white is not legible.
- Keep clear space of at least half the mark's height around the logo. Minimum sizes: the mark at 16 px (below 24 px use the 16 px drawing), the logo at 120 px wide.
- Do not stretch, rotate or outline the logo, recolor single dots, or set the wordmark in another font. In the interface the logo is 32 px high in the top bar.

## Accessibility

- Text holds 4.5:1 and field borders 3:1 on their surfaces (each token's note lists its ratios).
- Every control is a real button, input or link with a visible label or an `aria-label`. State is exposed with `aria-checked` for a choice of one (segmented controls, chips, weapon tiles and magazine tiers are radio groups), `aria-pressed` for a toggle on its own (a tool), `aria-selected` for tabs and `aria-current` for the current page; never by color alone.
- A link inside running text is underlined: its color alone does not set it apart. A slider's name goes on its thumb, which carries the slider role. A region that scrolls sideways, such as a wide table, takes keyboard focus while it scrolls.
- Dialogs trap focus and give it back; every action has a keyboard path, and the shortcuts dialog lists them.
- Touch targets are 44 px or more on phones.
