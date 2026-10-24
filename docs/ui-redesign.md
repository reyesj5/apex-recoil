# UI Redesign: Audit and New Design

*2026-10-22. The design that Phase 1 of the [UI migration plan](ui-migration-plan.md) implements. The mockups live on a private design canvas: https://claude.ai/artifact/3Uv9xgQocE1qqS2ohS2MQG (share it from the page's Share menu before sending the link to anyone). The design system built from this spec and the mockups (tokens, 26 components with live previews, the brand book and the logos) is a private Design System artifact: https://claude.ai/artifact/XK1KCFGz6tF9WzmKUykaFe. Claude reads both with the Artifact tool; agents that can't open them use the snapshot in [design/](design/README.md), with PNGs of every artboard and component preview, the brand book, the tokens and the component rules. Names, logo, links and IDs owned by the original project are placeholders; see the [ownership register](ownership-register.md).*

## 1. Audit of the current UI

Evidence: headless Chrome screenshots of the trainer and the editor at 1440×900, 1280×720 and 390×844, plus runtime measurements on the same build (2026-10-22).

### 1.1 Trainer

| # | Finding | Effect |
| --- | --- | --- |
| T1 | About 25 controls in a 315 px sidebar: abbreviations (`Mark`, `Snip`, `Pist`), a settings row that reads `5 Sensitivity 1 x 1 scale Invert Y`, and three sliders identified only by icons | Players have to guess what controls do; help exists only as hover tooltips |
| T2 | The weapon list gets whatever height is left: 3 rows at 900 px, 1 row (2 of 31 weapons) at 720 px | On a laptop, weapon choice turns into scrolling a two-tile window |
| T3 | The practice area fills most of the screen, but the pattern and score are drawn small in its middle; a debug `FPS: N` counter is shown to everyone | The main surface feels empty, and feedback after a run is a single number |
| T4 | Instructions and the statistics chart push the practice area down instead of overlaying it; the Plotly chart labels a single day with ticks like `23:59:59.9995` | Opening help or statistics moves the range; the chart is hard to read with few data points |
| T5 | Browser-blue underlined links, three different fonts (Inter, Arial in inputs, a monospace placeholder) and misaligned header links | The page looks unfinished next to a modern game UI |
| T6 | The footer is cut off at the bottom of the window; privacy links are about 8 px tall | Legal text is unreadable or invisible |
| T7 | The cookie banner (green, red and white buttons) covers the sidebar and footer on every page, the internal editor included | Off-brand, and it hides controls until dismissed |
| T8 | On a phone the page only says the screen must be wider than 768 px and links to the original project's Reddit post | Mobile visitors leave with nothing |
| T9 | Links to the original project everywhere: its GitHub FAQ and issues, release notes, privacy policies, Reddit post, YouTube video, and a PayPal donation button | Help, legal pages and donations point to someone else's project |

### 1.2 Recoil Editor

| # | Finding | Effect |
| --- | --- | --- |
| E1 | A different visual language from the trainer (slate and cyan against black and gold) | The two pages feel like separate products |
| E2 | The left sidebar mixes spec editing, three capture methods, capture settings, samples and saved sessions in one long scroll; one tab label is clipped (`Manual / Lega…`) | Hard to find things, and the clipped tab hides a mode |
| E3 | Two save buttons with different labels, `Save to specs.json` on the left and `Save Spec` on the right | Unclear whether they do the same thing |
| E4 | At 1280×720 both sidebars scroll and buttons wrap, leaving little canvas | Unusable on a laptop without collapsing panels |
| E5 | Canvas tools hide in the right panel; no zoom level is shown | Modes are easy to lose track of |

### 1.3 Across both pages

- **Accessibility:** dialogs do not trap focus; tooltips exist only as `title` attributes; several icon controls have no label; borders of form fields are about 1.3:1 against their background.
- **Load:** Plotly (1.1 MB), the tarteaucitron banner and Google Fonts load as classic scripts on every page, before the app bundle, and Express sends everything uncompressed.

### 1.4 Runtime baseline

Measured on localhost with headless Chrome. Load numbers are a cold cache; frame timing in headless Chrome only shows main-thread jank, not GPU behavior.

| Measurement | Trainer | Editor |
| --- | --- | --- |
| JavaScript transferred | 1,644 kB, uncompressed (Plotly 1,108, app chunk 286, tarteaucitron 248, chart helper 2) | 101 kB (other scripts cached) |
| DOMContentLoaded | 990 ms | 346 ms (warm cache) |
| Script / layout time during load | 212 ms / 164 ms (20 layouts, 46 style recalculations) | 76 ms / 99 ms |
| Elements in the page | 422 | 950 |
| Frame time during a scripted spray | p50 6.9 ms, p95 7.1 ms, max 7.3 ms, no long tasks | |

The game loop is already fast: the redesign keeps it out of React rendering. The load problems are third-party scripts and missing compression, both of which the migration removes.

## 2. Design direction

**Graphite and volt**: a dark range with a single bright accent. Neutral graphite surfaces keep weapon art and the game's tier colors (grey, white, blue, purple, red) readable; the lime "volt" accent marks selection, primary actions and good results, and does not collide with any tier color.

Principles:

1. **The range comes first.** The practice area is the largest, calmest surface; options float over it in one toolbar, and nothing pushes it around.
2. **Plain words, visible help.** Full labels (`Marksman`, `Follow path`, `Sensitivity 5.0`), short instructions inside the range, and settings grouped in one dialog instead of hover tooltips.
3. **Feedback you can read.** After each run, a result card shows the score, the gap to today's median, and replay; the session panel keeps today's numbers and trend in view.
4. **One product.** Trainer and Studio share tokens, type and components; the Studio uses the denser variant.
5. **Fast by construction.** Prerendered pages, no third-party UI scripts, charts loaded on demand, and the game loop outside the UI framework.
6. **Accessible as drawn.** WCAG AA contrast for text and field borders, real buttons and labels, keyboard access everywhere, reduced motion respected.

## 3. Screens

| Screen | What changes |
| --- | --- |
| Trainer, ready | Top bar with navigation (Train, Patterns, Progress), weapon search (Ctrl K), language, help and settings. Loadout panel: selected weapon, class filter with full names and counts, a scrollable grid of all 31 weapons, magazine tiers with capacity and tier color, fire mode, corrupted stock. Range: floating toolbar (mode, result style, replay speed), the weapon's pattern as a faint preview, the instruction in the range itself, mouse settings in one chip. Session panel: last score, today's tries, median and best, all-time best, tips, legal footer |
| Trainer, after a run | The player's shots over the faint pattern, a result card (score, difference to today's median, magazine and mode, Replay, Next run), and today's trend line with the median |
| Progress | Its own page instead of a chart that pushes the range: totals, best and median per day with tries as bars, results per weapon, recent runs, CSV export. Data stays in the browser, and the page says so |
| Patterns (new) | Pattern library by weapon and magazine; on phones it is the whole experience (see below) |
| Phone | A pattern viewer instead of a dead end: weapon chips, the real pattern with a play button, magazine tiers, and a link to copy for practicing on a computer |
| Studio | Icon rail (Capture, Library, Sessions, Import); capture panel with full tab labels, setup, live recording steps and samples; canvas with a floating tool palette (select, pan, align, correct, fit) and zoom; inspector with spec, magazine sizes, layers and comparison; one Save with an unsaved-changes state, undo and redo in the top bar; status bar with queue and storage |
| Consent | A compact card with Reject and Accept given equal weight, shown only where analytics runs (the public trainer), never on the Studio |

Removed: the FPS counter, the Reddit and GitHub icons, Plotly, tarteaucitron, the three translated copies of the page, and every link to the original project except one credit line in the footer ("Based on apex-recoil by Mikhail Goncharov, Apache License 2.0"), next to the owner's copyright and the EA disclaimer.

## 4. Tokens

These replace the palette in `theme.json`; Phase 1 generates Tailwind `@theme` tokens and shadcn/ui's semantic tokens from them.

### 4.1 Color

| Token | Value | Use | Contrast |
| --- | --- | --- | --- |
| `ground` | `#0A0C0F` | Page background | |
| `inset` | `#0D1014` | Fields, the range | |
| `panel` | `#111419` | Sidebars, panels | |
| `card` | `#151920` | Cards inside panels | |
| `raised` | `#171B21` | Buttons, popovers, toasts | |
| `hover` | `#1F242C` | Hover and pressed states | |
| `divider` | `#262C35` | Separators only | |
| `field` | `#646D79` | Borders of inputs and selects | 3.5:1 on panel, 3.6:1 on inset |
| `text` | `#ECEFF3` | Primary text | 16:1 on panel |
| `text-secondary` | `#A7B0BC` | Secondary text | 8.4:1 on panel |
| `text-muted` | `#848E9B` | Labels, captions | 5.2:1 or more on every surface |
| `volt` | `#C5F23A` | Accent, primary actions, good results | 14.2:1 on panel |
| `volt-ink` | `#0A0C0F` | Text on volt | 15:1 |
| `target` | `#5AD2F4` | Paths and targets on canvases | 10.5:1 on panel |
| `warning` | `#FFB547` | Unsaved changes, attention | |
| `danger` | `#FF5A5F` | Errors, destructive actions | 6.0:1 on panel |
| `tier-base` / `tier-1` / `tier-2` / `tier-3` / `tier-corrupted` | `#8C96A3` / `#E7EBF0` / `#4C8DFF` / `#B26BFF` / `#FF4D5E` | Magazine tiers | 5.4:1 or more on card |

shadcn/ui mapping: `background` ground, `card` panel, `popover` raised, `primary` volt with `primary-foreground` volt-ink, `secondary` raised, `muted` hover with text-muted, `accent` hover, `destructive` danger, `border` divider, `input` field, `ring` volt, `chart-1` volt, `chart-2` text-secondary, `chart-3` target, `chart-4` warning, `chart-5` tier-3.

### 4.2 Type

| Family | Weights | Use |
| --- | --- | --- |
| Chakra Petch | 600, 700 | Scores (72 and 56 px), weapon names (22 px), page titles in display contexts, section labels (12 px, uppercase, 0.14em tracking) |
| Inter | 400 to 700 | Interface: page titles 32 px, lead 16 px, body 14 px, labels 13 px semibold, small 12 px, legal 11 px |
| JetBrains Mono | 500, 600 | Numbers in fields and readouts, keyboard keys |

All three are self-hosted as WOFF2 and preloaded. Inter and JetBrains Mono cover Cyrillic; Chakra Petch does not, so in the Russian locale display text falls back to Inter semibold with the same sizes (Exo 2 is a display face with Cyrillic, if the fallback looks too plain). The Chinese locale uses system fonts for Chinese text.

### 4.3 Space, shape, motion

- Spacing scale 4, 8, 12, 16, 24, 32 px; panels use 16 px padding, cards 12 to 16 px.
- Radius 6 (small), 8 (controls), 10 (cards), 14 (panels), pill (chips).
- Motion 150 ms ease-out for hover and press, 200 ms for panels and dialogs, none with `prefers-reduced-motion`. Nothing in the interface animates during a run.

## 5. Components

| Need | Component (shadcn/ui unless noted) |
| --- | --- |
| Actions | Button: primary, secondary, ghost, destructive, icon |
| Modes, result style, period, fire mode | Toggle group (segmented) |
| Weapon class filter | Toggle group styled as pills, with counts |
| Weapon grid | Scroll area + own `WeaponTile` |
| Magazine tiers | Toggle group + own `TierOption` (tier color bar, capacity, name) |
| Fields | Input, input with unit, Select, Switch, Checkbox, Slider |
| Studio capture methods | Tabs |
| Search everywhere | Command (Ctrl K) |
| Help on controls | Tooltip with keyboard key |
| Confirmations, shortcuts, spec checkpoint | Dialog, Alert dialog |
| Settings | Dialog on desktop, Drawer on phones |
| Saved, failed, undo | Sonner toasts |
| Job progress | Progress + toast |
| Numbers | Card, own `StatTile` and `ScoreCard` |
| Charts | Chart (Recharts), loaded on demand |
| Recent runs | Table |
| Studio navigation | Sidebar (icon rail) |
| Cookie consent | Own `ConsentBanner` on Card |

## 6. Performance budgets

| Budget | Target | Baseline |
| --- | --- | --- |
| JavaScript on first load of the trainer | 200 kB or less, gzip | 1,644 kB uncompressed (about 500 kB gzip) |
| Compression | Brotli or gzip for all text responses, from Express and the static host | None from Express |
| Caching | Hashed asset names, `Cache-Control: immutable`; HTML revalidated | Fixed names for route bundles |
| DOMContentLoaded, trainer, desktop broadband | under 500 ms | 990 ms on localhost |
| Largest Contentful Paint | under 1.5 s | not measured |
| Layout shift | about 0 | panels push the range |
| Frame time during a run | p95 8 ms or less (144 Hz), no long tasks | p95 7.1 ms |
| UI renders during a run | none; panels update when the run ends | the DOM is updated during play |

Rules: the game engine owns the canvas and talks to React through events; stores are read with selectors so a run never re-renders the panels; charts, dialogs and the Studio's capture code load on demand; no third-party script loads before consent, and none loads in the Studio.

## 7. Accessibility rules

- Text contrast 4.5:1 or better and field borders 3:1 or better (section 4.1).
- Every control is a real button, input or link with a visible label or an `aria-label`; state is shown with `aria-pressed`, `aria-selected` and `aria-current`, not color alone.
- Dialogs trap focus and restore it; every action has a keyboard path, and the shortcuts dialog lists them.
- Touch targets of 44 px or more on phones.
- `prefers-reduced-motion` turns off interface animation.
- Automated axe checks (WCAG 2.1 A and AA) in the Playwright scenarios. Since Phase 0 they fail on anything beyond the current pages' baseline (`e2e/accessibility.spec.ts`); the rebuilt pages must have no violations.

## 8. Open items for the owner

- Final name and domain. "Spraydown" is a placeholder name with its own logo: five shots in a downward chevron and a Chakra Petch wordmark, with "down" in volt (files and usage rules in `brand/README.md`). The domain is `[SITE URL]`.
- Your Google Analytics 4 measurement ID and your privacy policy, both required before the new trainer goes live with analytics.
- Support or donation link, if any (`supportUrl` in `site.json`; the original author's link is gone).
- Whether the Patterns page and the phone pattern viewer ship with the first release or later.
