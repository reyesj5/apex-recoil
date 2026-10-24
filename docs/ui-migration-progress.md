# UI Migration: Progress Report and Handoff

*Updated 2026-10-23. For any agent or person continuing the UI rebuild: read this first, then the [plan](ui-migration-plan.md) (phases and conventions) and the [redesign](ui-redesign.md) (the look). Keep this page current: when you finish a step, move it from section 6 to section 1 and note what the next agent must know.*

The work is on the `migration` branch: Phase 0 in `e0d2dec`, Phase 1 in `f0d389b`; `git status` shows anything since. The owner reviews, commits, pushes and opens pull requests; agents never do (see `AGENTS.md` and the owner's rules: one-sentence commit messages, no AI credit lines).

## Design references

- **Claude with the Artifact tool** works from the two artifacts, which are the source of truth: the design canvas (https://claude.ai/artifact/3Uv9xgQocE1qqS2ohS2MQG, seven artboards) and the Design System (https://claude.ai/artifact/XK1KCFGz6tF9WzmKUykaFe: tokens, brand book, 26 components). Read them with the Artifact tool, not WebFetch. After changing one, refresh the snapshot below with `scripts/export-design.mjs` ([how](design/README.md#refreshing-this-folder-claude-only)).
- **Every other agent** uses the snapshot in [design/](design/README.md): PNGs of the artboards and of every component preview, plus the brand book, the tokens, each component's rules and the artboards' markup. Treat it as read-only, and record design changes in this report instead.
- The Design System was synced with the app on 2026-10-23 (version 7): its `tokens.json` equals `client/styles/tokens.json`, and its rules include what building the components taught (radio groups, underlined links in text, keyboard access for scrolling tables).

## 1. Status

| Phase | Status |
| --- | --- |
| 0. Tooling and safety net | Done (2026-10-22) |
| 1. Design system and shared foundations | Done (2026-10-23); four layout components wait for the Studio (Phase 3) |
| 2. Trainer | In progress: the engine (2.1), the trainer and the Progress page at `/next` (2.2 without the desktop Patterns page, 2.3), a title and meta description per language (2.4), prerendering (2.5) and consent on the new pages (2.6) done on 2026-10-23; the privacy, FAQ and changelog pages (2.7) and the switch (2.8) are next |
| 3. Recoil Editor, 4. Server and build, 5. Removal and lock-in | Not started |

Phase 1 in detail:

| Item | Status | Where |
| --- | --- | --- |
| 1.1 shadcn/ui | Done | [components.json](../components.json): style `new-york`, Radix through `radix-ui`, lucide icons, aliases `@/components`, `@/lib`. The shadcn CLI 4.x writes `import { cn } from 'cn'`; Vite, Vitest and tsconfig resolve `cn` to our token-aware helper |
| 1.2 Tokens | Done | [client/styles/tokens.json](../client/styles/tokens.json) (copied from the Design System artifact) → generated `design-tokens.css` → [client/styles/app.css](../client/styles/app.css) |
| 1.3 Components | Done, 4 unstyled | 31 shadcn components in [client/components/ui/](../client/components/ui/), own components in [client/components/](../client/components/), shown in every state on the gallery at `/next/components`. Collapsible, form, sheet and sidebar are cleaned up but not styled or shown yet: they wait for the Studio shell and the spec form (Phase 3) |
| 1.4 Icons | Done | Lucide for every generic icon (the old pug and PNG icons map to Lucide names, section 3); the logo and the crosshair placeholder are our own SVG components in [icons.tsx](../client/components/icons.tsx). The redesign uses no game attachment art: magazine tiers are color bars and attachments are switches |
| 1.5 Storage | Done | [client/lib/storage/](../client/lib/storage/), tested against values recorded from the current app |
| 1.6 API | Done | [client/lib/api/](../client/lib/api/): zod schemas, TanStack Query hooks, uploads, `useJobEvents` |
| 1.7 Translations | Done | [client/locales/](../client/locales/) (en, ru, zh-CN) and [client/lib/i18n/](../client/lib/i18n/) |
| 1.8 Analytics | Done | [client/lib/analytics.ts](../client/lib/analytics.ts) |
| 1.9 Site values | Done | [client/lib/site.ts](../client/lib/site.ts) |

Phase 2 so far:

| Item | Status | Where |
| --- | --- | --- |
| 2.1 Engine | Done | [client/engine/](../client/engine/): weapons, pattern, run, target, score history and loadout, without a DOM. The current trainer (`client/game.ts`) runs on it, and recorded runs prove it scores exactly as before. The new range has its own Konva drawing and Howler sound ([client/trainer/range/](../client/trainer/range/)); the current page keeps its copy until 2.8. Pointer lock and controller input do not exist yet, so nothing moved for them |
| 2.2 Screens | The trainer and the Progress page at `/next` done; the desktop Patterns page waits on the owner | [client/trainer/](../client/trainer/): the top bar (weapon search with Ctrl K, language, the Studio, help, settings), the loadout panel, the range (the canvas, the pattern as SVG before a run, the floating options, the mouse settings chip, sound, the result card with Replay and Next run), the session panel with today's trend, tips and the legal footer, the consent banner, the settings and help dialogs, and the phone pattern viewer. The 12 recorded runs replay through it bit for bit (`e2e/trainer-next.spec.ts`). The Progress page ([progress/](../client/trainer/progress/)) sums up the history by day and by weapon over 7 days, 30 days or all time, charts it (Recharts, loaded after the page), lists the runs saved since the run log began and exports CSV |
| 2.3 State | Done | Settings in `useTrainerSettings` (the current keys, plus `game::ads` and `game::replay-speed`); this visit's runs and the open dialog in `useSession` ([session.ts](../client/trainer/session.ts)), set when the engine reports the end of a run. Nothing in React renders during a run |
| 2.4 Locales | Done | One component tree for en, ru and zh-CN: each page has its language's `lang`, title and meta description (`meta.description` for the trainer, `progress.description` for the Progress page), and loads only its own catalog besides English |
| 2.5 Prerendering | Done | `pnpm build` also builds [client/entries/prerender.tsx](../client/entries/prerender.tsx) for Node (`dist-ssr/prerender.mjs`), and [server/prerender.mjs](../server/prerender.mjs) renders each of the six pages into a complete HTML page with the server's `site.json` values: `app.js` renders a page on its first request and serves it from memory, `pnpm static` writes `static/next/.../index.html`. The browser hydrates the markup, then loads the stored settings and history. Without JavaScript the pages show their content (the weapons, the range's instructions, the Progress page's heading) |
| 2.6 Consent | Done | The banner on both new pages, with the values the server runs with (each page carries them in `<script id="site-json">`); the footer's Cookie settings and an address ending in `#cookies` reopen it; the Google tag loads only after Accept (`e2e/trainer-next.spec.ts`). The old pages keep tarteaucitron until 2.8 |

Phase 1's exit criteria are met except where noted: the 27 components in the gallery render in all their states (gallery, component tests, and full-page screenshots attached to the gallery scenarios), storage reads the values the current app writes, and the catalogs are complete (a test checks keys, placeholders and tags per locale).

## 2. Map of the new code

```
client/styles/tokens.json        design tokens: colors, radii, shadows, sizes, fonts, type styles (source of truth)
client/styles/design-tokens.css  GENERATED from tokens.json by vite.config.mjs (designTokensToTheme); never edit it,
                                 but commit it: lint and format read it before any build (like theme-tokens.css)
client/lib/cn-tables.ts          GENERATED with design-tokens.css: cn()'s merge tables (Tailwind's classes as
                                 tailwind-merge knows them, plus the token names), compiled at build time so pages
                                 don't download the compiler; commit it too. ESLint and Prettier skip it
client/styles/app.css            the new UI's only stylesheet: Tailwind, fonts, shadcn variables, base layer
client/lib/utils.ts              cn(): clsx + tailwind-merge (the `cn` package) on those tables
client/components/ui/            shadcn/ui components, edited to the design (buttons, toggles, dialogs, ...)
client/components/               own components: WeaponTile, TierOption, StatTile, ScoreCard, RunResult,
                                 ConsentBanner, InputWithUnit, icons
client/gallery/gallery.tsx       the component gallery (all components, all states)
client/entries/gallery.tsx       its entry; built as dist/gallery.js (styles: dist/app.css, shared by every new page)
views/next.pug                   minimal HTML shell for new pages: `entry` picks the bundle, `lang` the language;
                                 links app.css (from source with pnpm dev). The gallery always uses it, the trainer
                                 and the Progress page only with pnpm dev or without the prerender bundle
client/lib/site.ts               typed site.json with the ownership rules (unset links left out)
client/lib/storage/              persisted Zustand stores under the legacy localStorage keys
client/lib/analytics.ts          consent store and the Google tag with Consent Mode v2
client/lib/api/                  schemas, apiRequest, query hooks, submitAnalysis, watchJob/useJobEvents
client/lib/i18n/, client/locales/ i18next with typed keys; one JSON catalog per locale
e2e/gallery.spec.ts              3 scenarios: renders on the tokens, axe with every overlay open, phone width
docs/design/                     snapshot of the design artifacts for agents that can't open them (PNGs, rules, tokens)
scripts/export-design.mjs        refreshes docs/design/ from the artifacts' files (a Claude session downloads them)
client/engine/                   the trainer's engine, no DOM: weapons.ts (fire modes, magazines, attachments, sounds),
                                 pattern.ts (sensitivity scaling, hint path), run.ts (one spray: timing and scoring),
                                 target.ts, stats.ts (score history), loadout.ts (settings to a run's setup)
client/engine/recorded-runs.fixture.json  12 runs recorded from the current trainer; run.test.ts replays them
scripts/record-runs.mjs          records those runs again (until Phase 2.8 removes the current trainer)
client/stats.ts                  the current page's history storage around the engine's functions
client/trainer/                  the rebuilt trainer at /next: trainer-app.tsx (layout, keys, consent, dialogs on
                                 demand), top-bar, loadout-panel, range-panel (options, pattern, chip, result card),
                                 session-panel, legal-footer, dialogs.tsx (settings, help, weapon search; own chunk),
                                 phone-viewer; catalog.ts (weapons, classes, art, tiers), loadout.ts (the loadout as
                                 shown and run, the changes a player makes), history.ts (game::stats), session.ts,
                                 names.ts (names in the page's language), fields.tsx, hooks.ts, links.ts
client/trainer/range/            renderer.ts (Konva: runs, drawing and the mouse, step for step as Shooting in game.ts),
                                 sound.ts (Howler, loaded when sound is on), range-canvas.tsx (mounts the renderer,
                                 loaded after the page), pattern-preview.tsx (the path as SVG), colors.ts (tokens)
client/entries/trainer-next.tsx  its entry: reads <html lang>, loads that catalog, hydrates the prerendered TrainerApp
                                 (or renders it, when the page came from views/next.pug)
client/trainer/progress/         progress-app.tsx (the Progress page), score-chart.tsx (Recharts, its own chunk),
                                 progress-data.ts (days per setup to days, weapons, the summary and CSV; tested)
client/trainer/run-log.ts        game::runs, the saved runs with their times (from the 2.2 trainer on)
client/trainer/consent.tsx       the consent prompt and analytics start, shared by the new public pages
client/entries/progress-next.tsx the Progress page's entry
client/entries/prerender.tsx     the new pages for Node: render(page, locale, site, prefix) gives the markup, the title
                                 and the meta description; built as dist-ssr/prerender.mjs (not deployed)
server/prerender.mjs             the list of prerendered pages (path, page, language, entry) and renderPage(), the HTML
                                 page around the markup with the site values; app.js and scripts/build-static.mjs use it
e2e/progress-next.spec.ts        6 scenarios: empty state, a seeded history summed up and exported, a run saved in the
                                 trainer listed, Russian and Chinese, without JavaScript, the phone
e2e/trainer-next.spec.ts         24 scenarios: the current trainer's, axe with every overlay open, the phone, the pages
                                 without JavaScript, consent (and its sheet on a phone), and the 12 recorded runs
                                 replayed through the new range
```

`app.js` serves `/next/components` with `renderPage(..., 'next', title, false, { entry: 'gallery' })`. The trainer (`/next`, `/next/ru`, `/next/zh-CN`) and the Progress page (`/next/progress`, `/next/ru/progress`, `/next/zh-CN/progress`) are prerendered: each is rendered on its first request with this server's `site.json` values and served from memory with `Cache-Control: no-cache`. With `pnpm dev`, or a build without `dist-ssr/`, they fall back to the pug shell with `{ entry: 'trainer-next' | 'progress-next', lang }`, which loads `client/entries/<entry>.tsx` through Vite in dev. Hashed files under `dist/chunks` and `dist/assets` are cached as immutable.

## 3. Conventions to keep

**Tokens and classes**
- Change a color, radius, size or type style in `tokens.json` (and in the Design System artifact), never in `design-tokens.css`; `pnpm dev` or `pnpm build` regenerates it.
- Use token classes: `bg-panel`, `text-text-muted`, `border-outline-strong`, `rounded-card`, `shadow-float`, `h-control`, `size-touch`, `type-label`, `font-display`. Tailwind's default colors, radii and shadows are switched off, so a class like `bg-gray-800` fails the lint; the generic radius and shadow names shadcn uses (`rounded-md`, `shadow-lg`) are aliases of tokens.
- Spacing tokens sit on Tailwind's 4 px scale (`space-12` is `p-3`). Size tokens are spacing names (`h-control` is 38 px). Type styles are utilities (`type-score-xl`, `type-micro`).
- Font sizes come from the type scale: `type-*` for a whole style, or a size step `text-<px>` (`text-13`, `text-11`) when only the size is wanted. The generator makes one step per size the type styles use; there are no arbitrary sizes.
- shadcn's semantic names (`bg-background`, `text-muted-foreground`, `bg-popover`, `border-border`, `bg-primary`) are mapped onto the tokens in `app.css`. One exception: `bg-card` is the design system's card color (`#151920`); shadcn's Card uses `bg-panel`.
- Focus is one global 2 px volt outline with a 2 px offset (`:focus-visible` in `app.css`); don't add `ring-*` focus classes or `outline-none`.
- `dark:` classes never apply (the app has one dark theme); remove them from generated code.
- Arbitrary values only for true one-offs.
- Never build class names from strings; use a map of complete names (see `tierBar` in `tier-option.tsx`).

**Icons**
- Lucide (`lucide-react`) for every generic icon: 16 px in compact buttons, 18 px in 36 to 38 px icon buttons and tools, 20 px in the Studio rail, a 2 px stroke. Our own SVG components are only the logo (`SpraydownLogo`, `SpraydownDots`) and the crosshair placeholder for a weapon without art. Weapon art stays as images in `assets/images`.
- The old icons map to these Lucide names:

| Where | Old icon | Lucide |
| --- | --- | --- |
| Studio tools | select, pan, align, correct, fit | `MousePointer2`, `Hand`, `Move`, `CirclePlus`, `Maximize` |
| Studio rail | capture, library, sessions, import | `Video`, `Image`, `Folder`, `Download` |
| Studio top bar | save, undo, redo, shortcuts | `Save`, `Undo2`, `Redo2`, `Keyboard` |
| Rest of the editor | sidebar, panel-right, wall, compare, trash, reset, refresh, camera, bolt, check, close, minus, eye, shield, alert, chevron-left, chevron-right, clipboard, crosshair, tools, layers, sliders | `PanelLeft`, `PanelRight`, `Image`, `Scale`, `Trash2`, `RotateCcw`, `RefreshCw`, `Camera`, `Zap`, `Check`, `X`, `Minus`, `Eye`, `Shield`, `TriangleAlert`, `ChevronLeft`, `ChevronRight`, `Clipboard`, `Crosshair`, `Wrench`, `Layers`, `SlidersHorizontal` |
| Top bar | search, help, settings, Studio link, support | `Search`, `CircleHelp`, `SlidersHorizontal`, `Wrench`, `Heart` |
| Trainer | statistics chart (PNG), sound on and off (SVG), mouse settings, play | `ChartLine`, `Volume2` and `VolumeX`, `Mouse`, `Play` |

The target-speed and firing-speed PNGs, the flags and the GitHub and Reddit marks go away: the redesign names those settings in words and drops the social icons.

**Adding a shadcn component**
1. `pnpm dlx shadcn@latest add <name>`.
2. Undo the CLI's side effects: it may add `next-themes`, downgrade `recharts` or edit `app.css`. Check `git diff package.json client/styles/app.css`.
3. In the new file, remove `dark:` classes, `ring-[3px]` focus rings and `outline-none`, and restyle with token classes (compare the component's README in the Design System artifact, or in `docs/design/system/components/<Name>/`).
4. Add it to the gallery in every state, then run `pnpm build && pnpm exec playwright test e2e/gallery.spec.ts` (axe must find nothing).

**Accessibility (pages under `/next` have no axe baseline: zero violations)**
- Single-choice toggle groups are radio groups (`role="radio"`, `aria-checked`); query them as `radiogroup` and `radio` in tests.
- A Slider's `aria-label` goes on its thumbs (our Slider forwards it).
- Links inside running text are underlined; volt alone is not enough (`link-in-text-block`).
- A container that scrolls sideways must take focus while it scrolls (our Table does this; pass `aria-label`).
- Text on `volt-wash` needs `text-secondary` or brighter; `text-muted` is 4.2:1 there (a selected chip's count turns `text-secondary`).
- Name every dialog, popover and menu (`aria-label`, or a title).
- In scenarios, let an overlay finish fading in before axe checks it (`getAnimations()` and `finished`): mid-fade, its colors fail contrast.

**Storage** (`client/lib/storage`)
- Keys and formats never change: one key per value, strings as the current app writes them (`'true'`, `'3.5'`, `'r301'`, JSON for lists). Trainer keys start with `game::` (the old namespace `game:` plus a colon), the editor's with `editor:` or `editor_`.
- `createPersistedStore(fields)` reads once and writes each changed value at once. Values nobody changes are not written.
- The trainer's store (`useTrainerSettings`) is created with `deferLoad`: it starts with the defaults, which the prerendered pages show, and reads the stored values when `load()` runs after hydration (`useStoredSettings()` in each page). Until then `loaded` is false; the Progress page waits for it rather than showing its empty state.
- `game::stats` stays a JSON string; the engine's `parseStats` reads and upgrades it, and `addResult` adds a run (`client/engine/stats.ts`).
- [current-app.fixture.json](../client/lib/storage/current-app.fixture.json) was recorded from the current app in Chrome. Re-record it if the old app's storage changes before it is deleted.
- Settings and data the redesign adds take new keys (`game::ads`, `game::replay-speed`, `game::runs`). `currentTrainerFields` lists the keys the current trainer writes; the storage tests compare only those with the recording.

**Analytics** (`client/lib/analytics.ts`)
- Only the trainer imports it; the Studio never does. Without `gaMeasurementId` and `privacyUrl` in `site.json` it never asks and never loads anything.
- Each new public page calls `useAnalyticsStart()` ([consent.tsx](../client/trainer/consent.tsx)): after hydration it calls `start()` and, for an address ending in `#cookies`, `reopen()`. The banner (`ConsentPrompt`) shows while `asking` is true, only after hydration since the choice is stored on the device; the footer's Cookie settings calls `reopen()`.
- The choice is kept for 12 months in `localStorage` under `consent:analytics`. gtag.js only reads `arguments` objects, so keep the `gtag` helper as it is.

**API** (`client/lib/api`)
- Every response is checked with a zod schema. Objects are loose, so a spec saved back keeps fields the schema doesn't list.
- `submitAnalysis(path, params, uploads)` plans the upload, sends files straight to object storage when it can and falls back to multipart. File fields are `videos` and `screenshots` for sessions and `images` for screenshots; the server names files by field.
- `useJobEvents(id)` follows a job over Server-Sent Events and also polls `GET /api/discovery/jobs/:id` (a 404 means the server lost the job).

**Translations** (`client/lib/i18n`)
- Keys are typed from `en.json`; add a key to all three catalogs (the test fails otherwise). The catalogs hold only what the new pages show: the old pages' strings extracted in Phase 1 were dropped once the redesign had replaced them (2026-10-23), since every page downloads its catalog.
- A text with a count uses i18next's plural forms: `_one` and `_other` in English, plus `_few` and `_many` in Russian, only `_other` in Chinese. The test checks that each language has the forms `Intl.PluralRules` gives it.
- Links inside sentences are named tags (`<faq>FAQ</faq>`) that `<Trans components={{ faq: <TextLink href=... /> }}>` fills in. Never name a tag after an HTML void element (`link`, `br`, `img`, `input`...): Trans parses tags as HTML and leaves a void element's text outside it (a test checks).
- `createI18n(locale, catalog)` is synchronous once `loadCatalog(locale)` has the catalog, so a prerendered page and the browser's first render match. English is bundled as the fallback; Russian and Chinese load with their pages.

**Engine** (`client/engine`)
- No DOM, no clock, no Konva or Howler: the caller passes the time and the cursor. A `Run` starts at the first press (`new Run(setup, t, cursor, target, { onShot, onFinish })`), then takes `frame(t, cursor, target)` on every animation frame, `press(t, ...)` for a later press and `release(t)` when the trigger is let go. `run.recoil` is the latest frame's recoil to draw, `run.finishAt` the time a single or burst run ends by itself (schedule a frame then), and `run.result` the score.
- `runSetup(weapon, settings)` builds a run's setup from the stored settings; the current page and the new one set runs up the same way.
- Changing the timing or scoring means changing what players get: `run.test.ts` must still pass against the recorded runs. To record more cases, add them to `scripts/record-runs.mjs` while the current trainer exists.

**Trainer** (`client/trainer`)
- Change settings through `actions` in [loadout.ts](../client/trainer/loadout.ts), which write them the way the current trainer does: a new weapon keeps the fire mode if it has it (else takes its default), and the practice mode is two flags, `game::hint` and `game::moving-target`.
- React never renders during a run. The renderer marks the range with `data-running` (CSS hides the pattern, the result card and the warning), and reports the end; React then saves the score (only a full magazine at full speed counts, as before) and shows the card. Settings reach the renderer through `configure`; a run keeps those it started with.
- Runs use the effective sensitivity, sensitivity × ADS. `game::ads` is 1 unless the player sets it, so a stored sensitivity, which the current trainer asks players to enter as sensitivity × ADS, keeps its meaning.
- The pattern drawn is the path the aim follows (the start point minus the recoil), as on the current page: for normal Y it runs down from the start point, and Follow path moves the target ring along it. The mockups draw the climb instead (section 6).
- Budget: at most 200 kB (200,000 bytes, gzip) of JavaScript on first load, counted as the entry and its static imports, plus the catalog a Russian or Chinese page waits for. `pnpm test` checks it after `pnpm build` (`test/app_api.test.js`). Konva with the renderer, the dialogs, Howler, Recharts and the Russian and Chinese catalogs are chunks of their own. On 2026-10-23 the trainer loads 191.0 kB in English, 196.1 kB in Russian and 195.5 kB in Chinese; the Progress page 176.6 to 181.8 kB. A Radix primitive costs 2 to 5 kB, so check after adding one to the first load (the loadout grid scrolls natively for that reason).
- The Progress page reads `game::stats` (each setup's days) and `game::runs` (the run log). A day or weapon that mixes setups has no exact median, so medians weight each setup's median by its tries. Recent runs exist only for runs saved by the new trainer, and the table says so while it is empty.

**New pages**
- Serve new pages under `/next/...` until they replace the old ones. Each needs a route in `app.js`, an entry in `client/entries/` and in `build.rollupOptions.input` (`vite.config.mjs`), and an `@source` line in `app.css` if it lives in a new folder.
- Entries don't import `app.css`: `views/next.pug` and the prerendered pages link it (from source with `pnpm dev`, `dist/app.css` otherwise). A stylesheet imported by two entries lands in a shared chunk's CSS, named after that chunk.
- A prerendered page needs a line in `pages` ([server/prerender.mjs](../server/prerender.mjs)), its route in `app.js` and its component in [client/entries/prerender.tsx](../client/entries/prerender.tsx); its entry hydrates when `#root` has content and renders otherwise.
- The first render in the browser must match the prerender, so anything that only the browser knows comes after hydration: stored settings (`useStoredSettings()`), the stored consent (`useHydrated()`), media queries (`useMediaQuery()`, false on the server; the layouts themselves switch with CSS, so both are in the markup). React reports a mismatch as an error, which fails the scenarios.
- A Select shows its value as text inside `SelectValue` (`<SelectValue>{label}</SelectValue>`): Radix fills it in only in the browser, so without it the prerendered page shows an empty select.
- Site values reach the browser in `<script id="site-json">`, which [client/lib/site.ts](../client/lib/site.ts) reads before the bundled `site.json`: the prerender, the pug shell and the static build all write the values the server runs with (`setSite()` sets them for the prerender). Links between the pages go through `trainerHref()` and `progressHref()` ([links.ts](../client/trainer/links.ts)), whose path prefix (`/next` now, empty after the switch) comes from the server (`setPathPrefix()`) or the address.

## 4. Pitfalls already paid for

- **Environment**: Windows with Git Bash. Node 24.22.1 is the fnm default, but shells started before the switch still find Node 23; prefix commands with `export PATH="/c/Users/micro.VADER/AppData/Roaming/fnm/aliases/default:$PATH"` when `node --version` says 23. Use pnpm 12; npm refuses to run (`EBADDEVENGINES`).
- **jsdom and MSW**: a multipart (`FormData`) request fails inside MSW's handler lookup under jsdom and leaks to the network. Tests capture multipart requests at `fetch` instead (`captureMultipart` in `api.test.tsx`). Don't replace jsdom's `FormData` or `Blob` globally: Vitest 5 has its own conversion layer, and swapping the globals breaks it.
- **jsdom gaps**: no `ResizeObserver` (stubbed in `client/test/setup.ts` for Radix) and no `EventSource` (`watchJob` takes one as an option).
- **Radix prop types**: `Omit<ComponentProps<typeof ToggleGroup.Root>, 'type'>` loses `onValueChange`'s type. Use `Omit<Extract<..., { type: 'single' }>, 'type'>`.
- **Accessible names**: text in separate flex items joins without a space in jsdom; `WeaponTile` puts a space text node between the name and the fire rate.
- **Lint quirks**: the Tailwind lint checks every string inside `cn()` and any variable named `classes`, so keep variant names and data out of them. The React Compiler lint rejects `Math.random()` during render; use a `useState` initializer.
- **Recording with a fake clock**: after `page.clock.install()`, time still flows in real time until `page.clock.pauseAt()`; without the pause, the page reads times a millisecond off from the ones logged.
- **Chrome and Node differ in the last bit** of `Math.exp` and `Math.pow`, so the engine's scores match the browser's to 15 decimal places, not bit for bit; times, shot counts and stored scores match exactly.
- **Node has a global `localStorage`**: in scripts that hand functions to a page, declare only `window` and `document` (`/* global window, document */`).
- **A missing stylesheet passes unnoticed**: until Phase 4.1 every unknown path renders the trainer, so a page linking a CSS file that doesn't exist gets HTML with status 200 and shows unstyled. The trainer's scenarios check the body's background color.
- **Replaying recorded runs**: scores match bit for bit only when the spray happens at the same canvas coordinates; floating-point sums depend on where the spray is, not only on how the mouse moves. `e2e/trainer-next.spec.ts` presses where the recording pressed.
- **Escapes in files written by tools**: a `\uFEFF` typed into a file edit can arrive as the invisible character itself, which ESLint reports as irregular whitespace in a regular expression and lets pass in a string. Write such escapes through a script (`chr(92)` for the backslash), and Git Bash heredocs halve backslashes, so write scripts with a file tool.
- **Scripts**: `@axe-core/playwright` needs a page from `browser.newContext()`. The gallery has two buttons named "Delete sample", so scope lookups to a section (`getByRole('region', { name: /overlays/i })`).
- **Units**: until 2026-10-23 this report gave the first load in KiB (bytes / 1024) labeled kB, 2.3 % below the figure in kB: with the prerender in place, the Russian and Chinese trainer pages were at 201.6 and 201.0 kB (196.9 and 196.3 KiB). Compiling `cn()`'s tables at build time brought every new page down 5.6 kB, and the budget test measures in kB of 1000 bytes, the stricter reading.
- **The prerender build**: Vite names its files `.mjs`, since `package.json` doesn't declare ES modules. ESLint and Prettier must skip build output (`dist-ssr/`) and generated code (`client/lib/cn-tables.ts`, whose packed strings hold control characters). The footer's year is the server's (`suppressHydrationWarning`), and a test that needs the page without JavaScript uses Playwright's `javaScriptEnabled: false`.

## 5. Verification

Run the full protocol in `AGENTS.md` before reporting. Results on 2026-10-23 (Node 24.22.1, Windows), with all of the above in place:

| Gate | Result |
| --- | --- |
| `python -m pytest tests` (in `processing/`) | 43 passed |
| `python -m recoil_discovery.shadow_parity` | 31 weapons, 0.000000 drift |
| `python -m recoil_discovery.cli verify` | every weapon OK |
| `pnpm build` | passes: the client into `dist/`, the prerender into `dist-ssr/`. The gallery's entry is over 500 kB beside the chunks it shares, hence Vite's chunk-size warning. First loads (gzip, kB of 1000 bytes): the trainer 191.0 kB in English, 196.1 kB in Russian, 195.5 kB in Chinese; the Progress page 176.6 to 181.8 kB |
| `pnpm test` | 42 of 42, the first-load budget included |
| `pnpm test:unit` | 160 tests in 23 files: 40 for the engine, 20 for the trainer and the Progress page (catalog, loadout changes, history, the Progress figures, the run log), 3 for the prerender (every page and language in Node) |
| `pnpm test:e2e` | 58 of 58: 28 on the current pages (the Python discovery runs included), 24 on the rebuilt trainer (the 12 recorded runs, the pages without JavaScript and consent included) and 6 on the Progress page |
| `pnpm tsc` | no errors in either config |
| `pnpm lint` | no errors; the 352 warnings are all in legacy files, and the new code has none |
| `pnpm format:check` | clean |

Not run: `pnpm test:services` (Redis and S3), since no server code changed.

For 2.1, `scripts/record-runs.mjs` was also run against the build: the trainer running on the engine reproduced the 12 recorded runs exactly (events, shot times, scores, stored results). Since 2.2, `e2e/trainer-next.spec.ts` replays them through the new range on every run of the suite.

For the compiled `cn()` tables (2.5), the six prerendered pages and every element's classes on the gallery, the trainer and the Progress page in Chrome (desktop and phone) were captured before and after: identical. A differential run over 422,105 random combinations of the sources' class names and of classes on every token scale, with variants, merged them the same way with both.

Useful during UI work:
- `pnpm exec vitest run client/components client/lib`: component and library tests.
- `pnpm build && pnpm exec playwright test e2e/gallery.spec.ts`: the gallery, axe included; screenshots are attached to the report.
- `PORT=3220 node e2e/server.mjs` after `pnpm build`: the app on throwaway data, to look at `/next` and `/next/components` by hand.
- `pnpm build && pnpm exec playwright test e2e/trainer-next.spec.ts -g replays`: the 12 recorded runs through the new range (about 45 s).
- `pnpm build && node --test test/app_api.test.js`: the first-load budget, with the size per page and language when it fails.
- `pnpm exec vitest run client/entries`: the prerender in Node, quicker than a build when a page fails to render on the server.

## 6. Next steps, in order

**Design work still open** (none of it blocks the start of Phase 2)
1. **Design follow-ups** (roadmap, M11): settle the radius scale; add the mockups' extra colors to the token table in `ui-redesign.md`; fix or accept the three marks under 3:1; design Dialog, Alert dialog, Drawer, the Command palette, the error toast, a result below the median and the primary button's hover.
2. **The Rampage's thermite grenade**: built as proposed, a switch under Corrupted stock shown only for the Rampage (`game::mods` = `revved_up`). Add it to the Design System's Main artboard and the loadout rules.
3. **Unstyled components**: style collapsible, form, sheet and sidebar and add them to the gallery once the Studio shell and the spec form are designed (Phase 3).
4. **What the trainer added beyond the mockups** (bring the artifacts in line, or change the code):
   - The pattern runs down from the start point (the path the aim follows), while the Main, Result and Phone artboards draw it climbing from a start point at the bottom.
   - The top bar has the Studio link and, when `site.json` sets one, the support link as icon buttons (the icon mapping planned them; the mockup doesn't show them).
   - The settings dialog (mouse, practice, display, sound), the help dialog (steps and keys) and the weapon search are built from the components without designs; the Design System's building notes say how.
   - The ADS multiplier is a setting of its own (the mouse chip showed it).
   - A selected filter chip's count is `text-secondary` (the FilterChip rule says `text-muted`, 4.2:1 on volt-wash).
   - A run that isn't saved (released early, or below full speed) says so on the result card; the 56 px en dash before the first run reads as a bar.

**Phase 2, the trainer** (plan section 5)
1. **The Patterns page** on desktop, if the owner wants it in the first release; the phone viewer exists and `PatternPreview` draws any weapon's path.
2. **The privacy policy, FAQ and changelog as pages of the app** (2.7): `/privacy`, `/faq` and `/changelog` from the documents in `docs/`, prerendered like the trainer (a line in `pages`), so `site.json` can point to them.
3. **The switch** (2.8): serve the six pages at `/`, `/ru`, `/zh-CN`, `/progress`, `/ru/progress` and `/zh-CN/progress` (`renderPage` with the prefix `''` and `noindex: false`; the static build writes a folder per page), and delete the old pages and their files (the plan lists them). Then:
   - Rewrite section 4 of `docs/privacy-policy.md`: the choice moves from the `tarteaucitron` cookie to `consent:analytics` in local storage, for 12 months.
   - Once `site.json` has `siteUrl`, add `<link rel="canonical">` and `hreflang` alternates for the three languages to `renderPage`.
   - Consider `<link rel="modulepreload">` for the entry's chunks and the page's catalog in the prerendered head: today the browser discovers them one level at a time (read the hashed names from a Vite manifest).
   - Record the Lighthouse scores in CI (exit criteria).

## 7. Waiting on the owner

- The final name, logo, domain, GA4 measurement ID, privacy policy URL and support link (`site.json`; see the [ownership register](ownership-register.md)).
- Translation review:
  - **Shown in English on the ru and zh-CN pages, kept that way**: `legal.disclaimer` (the EA disclaimer).
  - **Written for the redesign (2.2 to 2.4), never reviewed**: every key under `topBar`, `search`, `loadout`, `tier`, `units`, `range`, `result`, `session`, `tips`, `legal`, `settingsDialog`, `help`, `consent`, `phone` and `progress`, plus `weapons.classLong` and `meta.description` (the old pages showed an English description in every language), in ru and zh-CN. The English `meta.description` and `progress.description` are new too.
  - **Changed on purpose**: English category chips use full words, as the design system specifies (the old page had "Mark", "Snip", "Shot", "Pist"), while Russian keeps its abbreviations.
