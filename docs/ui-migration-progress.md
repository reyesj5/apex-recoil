# UI Migration: Progress Report and Handoff

*Updated 2026-10-23. For any agent or person continuing the UI rebuild: read this first, then the [plan](ui-migration-plan.md) (phases and conventions) and the [redesign](ui-redesign.md) (the look). Keep this page current: when you finish a step, move it from section 6 to section 1 and note what the next agent must know.*

Phase 0 is committed (`e0d2dec`); Phase 1 is **uncommitted on the `migration` branch**. The owner reviews, commits, pushes and opens pull requests; agents never do (see `AGENTS.md` and the owner's rules: one-sentence commit messages, no AI credit lines).

## 1. Status

| Phase | Status |
| --- | --- |
| 0. Tooling and safety net | Done (2026-10-22) |
| 1. Design system and shared foundations | Nearly done (2026-10-23): everything except 1.4's game icons and syncing the Design System artifact |
| 2. Trainer | Next |
| 3. Recoil Editor, 4. Server and build, 5. Removal and lock-in | Not started |

Phase 1 in detail:

| Item | Status | Where |
| --- | --- | --- |
| 1.1 shadcn/ui | Done | [components.json](../components.json): style `new-york`, Radix through `radix-ui`, lucide icons, aliases `@/components`, `@/lib`. The shadcn CLI 4.x writes `import { cn } from 'cn'`; Vite, Vitest and tsconfig resolve `cn` to our token-aware helper |
| 1.2 Tokens | Done | [client/styles/tokens.json](../client/styles/tokens.json) (copied from the Design System artifact) → generated `design-tokens.css` → [client/styles/app.css](../client/styles/app.css) |
| 1.3 Components | Done, 4 unstyled | 31 shadcn components in [client/components/ui/](../client/components/ui/), own components in [client/components/](../client/components/), shown in every state on the gallery at `/next/components`. Collapsible, form, sheet and sidebar are cleaned up but not styled or shown yet: they wait for the Studio shell and the spec form (Phase 3) |
| 1.4 Icons | Partly | lucide-react for generic icons; the logo and the crosshair placeholder in [icons.tsx](../client/components/icons.tsx). Still to do: the game icons in `views/mixins/icons.pug` and the PNG icons in `etc/` |
| 1.5 Storage | Done | [client/lib/storage/](../client/lib/storage/), tested against values recorded from the current app |
| 1.6 API | Done | [client/lib/api/](../client/lib/api/): zod schemas, TanStack Query hooks, uploads, `useJobEvents` |
| 1.7 Translations | Done | [client/locales/](../client/locales/) (en, ru, zh-CN) and [client/lib/i18n/](../client/lib/i18n/) |
| 1.8 Analytics | Done | [client/lib/analytics.ts](../client/lib/analytics.ts) |
| 1.9 Site values | Done | [client/lib/site.ts](../client/lib/site.ts) |

Phase 1's exit criteria are met except where noted: the 27 components in the gallery render in all their states (gallery, component tests, and full-page screenshots attached to the gallery scenarios), storage reads the values the current app writes, and the catalogs are complete (a test checks keys, placeholders and tags per locale).

## 2. Map of the new code

```
client/styles/tokens.json        design tokens: colors, radii, shadows, sizes, fonts, type styles (source of truth)
client/styles/design-tokens.css  GENERATED from tokens.json by vite.config.mjs (designTokensToTheme); never edit it,
                                 but commit it: lint and format read it before any build (like theme-tokens.css)
client/styles/app.css            the new UI's only stylesheet: Tailwind, fonts, shadcn variables, base layer
client/lib/utils.ts              cn(): clsx + tailwind-merge (the `cn` package) taught the token names
client/components/ui/            shadcn/ui components, edited to the design (buttons, toggles, dialogs, ...)
client/components/               own components: WeaponTile, TierOption, StatTile, ScoreCard, RunResult,
                                 ConsentBanner, InputWithUnit, icons
client/gallery/gallery.tsx       the component gallery (all components, all states)
client/entries/gallery.tsx       its entry; built as dist/gallery.js and dist/gallery.css
views/next.pug                   minimal HTML shell for new pages (`entry` local picks the bundle)
client/lib/site.ts               typed site.json with the ownership rules (unset links left out)
client/lib/storage/              persisted Zustand stores under the legacy localStorage keys
client/lib/analytics.ts          consent store and the Google tag with Consent Mode v2
client/lib/api/                  schemas, apiRequest, query hooks, submitAnalysis, watchJob/useJobEvents
client/lib/i18n/, client/locales/ i18next with typed keys; one JSON catalog per locale
e2e/gallery.spec.ts              3 scenarios: renders on the tokens, axe with every overlay open, phone width
```

`app.js` serves `/next/components` with `renderPage(..., 'next', title, false, { entry: 'gallery' })`; in `pnpm dev` the shell loads `client/entries/<entry>.tsx` through Vite. Hashed files under `dist/chunks` and `dist/assets` are cached as immutable.

## 3. Conventions to keep

**Tokens and classes**
- Change a color, radius, size or type style in `tokens.json` (and in the Design System artifact), never in `design-tokens.css`; `pnpm dev` or `pnpm build` regenerates it.
- Use token classes: `bg-panel`, `text-text-muted`, `border-outline-strong`, `rounded-card`, `shadow-float`, `h-control`, `size-touch`, `type-label`, `font-display`. Tailwind's default colors, radii and shadows are switched off, so a class like `bg-gray-800` fails the lint; the generic radius and shadow names shadcn uses (`rounded-md`, `shadow-lg`) are aliases of tokens.
- Spacing tokens sit on Tailwind's 4 px scale (`space-12` is `p-3`). Size tokens are spacing names (`h-control` is 38 px). Type styles are utilities (`type-score-xl`, `type-micro`).
- shadcn's semantic names (`bg-background`, `text-muted-foreground`, `bg-popover`, `border-border`, `bg-primary`) are mapped onto the tokens in `app.css`. One exception: `bg-card` is the design system's card color (`#151920`); shadcn's Card uses `bg-panel`.
- Focus is one global 2 px volt outline with a 2 px offset (`:focus-visible` in `app.css`); don't add `ring-*` focus classes or `outline-none`.
- `dark:` classes never apply (the app has one dark theme); remove them from generated code.
- Arbitrary values only for true one-offs. `text-[13px]` and `text-[11px]` recur and should become tokens (section 6).
- Never build class names from strings; use a map of complete names (see `tierBar` in `tier-option.tsx`).

**Adding a shadcn component**
1. `pnpm dlx shadcn@latest add <name>`.
2. Undo the CLI's side effects: it may add `next-themes`, downgrade `recharts` or edit `app.css`. Check `git diff package.json client/styles/app.css`.
3. In the new file, remove `dark:` classes, `ring-[3px]` focus rings and `outline-none`, and restyle with token classes (compare the component's README in the Design System artifact).
4. Add it to the gallery in every state, then run `pnpm build && pnpm exec playwright test e2e/gallery.spec.ts` (axe must find nothing).

**Accessibility (pages under `/next` have no axe baseline: zero violations)**
- Single-choice toggle groups are radio groups (`role="radio"`, `aria-checked`); query them as `radiogroup` and `radio` in tests.
- A Slider's `aria-label` goes on its thumbs (our Slider forwards it).
- Links inside running text are underlined; volt alone is not enough (`link-in-text-block`).
- A container that scrolls sideways must take focus while it scrolls (our Table does this; pass `aria-label`).
- Text on `volt-wash` needs `text-secondary` or brighter; `text-muted` is 4.2:1 there.
- Name every dialog, popover and menu (`aria-label`, or a title).

**Storage** (`client/lib/storage`)
- Keys and formats never change: one key per value, strings as the current app writes them (`'true'`, `'3.5'`, `'r301'`, JSON for lists). Trainer keys start with `game::` (the old namespace `game:` plus a colon), the editor's with `editor:` or `editor_`.
- `createPersistedStore(fields)` reads once and writes each changed value at once. Values nobody changes are not written.
- `game::stats` stays a JSON string; the stats module (moving to `client/engine/` in Phase 2) parses and upgrades it.
- [current-app.fixture.json](../client/lib/storage/current-app.fixture.json) was recorded from the current app in Chrome. Re-record it if the old app's storage changes before it is deleted.

**Analytics** (`client/lib/analytics.ts`)
- Only the trainer imports it; the Studio never does. Without `gaMeasurementId` and `privacyUrl` in `site.json` it never asks and never loads anything.
- The trainer calls `useAnalytics.getState().start()` once at startup; the banner shows while `asking` is true; Cookie settings calls `reopen()`.
- The choice is kept for 12 months in `localStorage` under `consent:analytics`. gtag.js only reads `arguments` objects, so keep the `gtag` helper as it is.

**API** (`client/lib/api`)
- Every response is checked with a zod schema. Objects are loose, so a spec saved back keeps fields the schema doesn't list.
- `submitAnalysis(path, params, uploads)` plans the upload, sends files straight to object storage when it can and falls back to multipart. File fields are `videos` and `screenshots` for sessions and `images` for screenshots; the server names files by field.
- `useJobEvents(id)` follows a job over Server-Sent Events and also polls `GET /api/discovery/jobs/:id` (a 404 means the server lost the job).

**Translations** (`client/lib/i18n`)
- Keys are typed from `en.json`; add a key to all three catalogs (the test fails otherwise).
- Links inside sentences are named tags (`<faq>FAQ</faq>`) that `<Trans components={{ faq: <a href=... /> }}>` fills in.
- `createI18n(locale)` is synchronous, so a prerendered page and the browser's first render match.

**New pages**
- Serve new pages under `/next/...` until they replace the old ones. Each needs a route in `app.js`, an entry in `client/entries/` and in `build.rollupOptions.input` (`vite.config.mjs`), and an `@source` line in `app.css` if it lives in a new folder.

## 4. Pitfalls already paid for

- **Environment**: Windows with Git Bash. Node 24.22.1 is the fnm default, but shells started before the switch still find Node 23; prefix commands with `export PATH="/c/Users/micro.VADER/AppData/Roaming/fnm/aliases/default:$PATH"` when `node --version` says 23. Use pnpm 12; npm refuses to run (`EBADDEVENGINES`).
- **jsdom and MSW**: a multipart (`FormData`) request fails inside MSW's handler lookup under jsdom and leaks to the network. Tests capture multipart requests at `fetch` instead (`captureMultipart` in `api.test.tsx`). Don't replace jsdom's `FormData` or `Blob` globally: Vitest 5 has its own conversion layer, and swapping the globals breaks it.
- **jsdom gaps**: no `ResizeObserver` (stubbed in `client/test/setup.ts` for Radix) and no `EventSource` (`watchJob` takes one as an option).
- **Radix prop types**: `Omit<ComponentProps<typeof ToggleGroup.Root>, 'type'>` loses `onValueChange`'s type. Use `Omit<Extract<..., { type: 'single' }>, 'type'>`.
- **Accessible names**: text in separate flex items joins without a space in jsdom; `WeaponTile` puts a space text node between the name and the fire rate.
- **Lint quirks**: the Tailwind lint checks every string inside `cn()` and any variable named `classes`, so keep variant names and data out of them. The React Compiler lint rejects `Math.random()` during render; use a `useState` initializer.
- **Scripts**: `@axe-core/playwright` needs a page from `browser.newContext()`. The gallery has two buttons named "Delete sample", so scope lookups to a section (`getByRole('region', { name: /overlays/i })`).

## 5. Verification

Run the full protocol in `AGENTS.md` before reporting. Results on 2026-10-23 (Node 24.22.1, Windows), with all of the above in place:

| Gate | Result |
| --- | --- |
| `python -m pytest tests` (in `processing/`) | 43 passed |
| `python -m recoil_discovery.shadow_parity` | 31 weapons, 0.000000 drift |
| `python -m recoil_discovery.cli verify` | every weapon OK |
| `pnpm build` | passes; the gallery bundle is 1.05 MB (309 kB gzip), hence Vite's chunk-size warning |
| `pnpm test` | 41 of 41 |
| `pnpm test:unit` | 92 tests in 16 files |
| `pnpm test:e2e` | 28 of 28, the Python discovery runs included |
| `pnpm tsc` | no errors in either config |
| `pnpm lint` | no errors; the 370 warnings are all in legacy files, and the new code has none |
| `pnpm format:check` | clean |

Not run: `pnpm test:services` (Redis and S3), since no server code changed.

Useful during UI work:
- `pnpm exec vitest run client/components client/lib`: component and library tests.
- `pnpm build && pnpm exec playwright test e2e/gallery.spec.ts`: the gallery, axe included; screenshots are attached to the report.
- `PORT=3220 node e2e/server.mjs` after `pnpm build`: the app on throwaway data, to look at `/next/components` by hand.

## 6. Next steps, in order

**Finish Phase 1**
1. **1.4 Game icons**: turn the icons in `views/mixins/icons.pug` and the PNG icons in `etc/` that the redesign keeps into SVG components next to `icons.tsx`, shown in the gallery. Weapon art stays as images in `assets/images`.
2. **Sync the Design System artifact** (https://claude.ai/artifact/XK1KCFGz6tF9WzmKUykaFe; read it first, a newer version exists):
   - Font families in its `tokens.json`: "Chakra Petch", "Inter Variable", "JetBrains Mono Variable".
   - `building.md`: the `type-*` utilities, the `cn` alias, and `bg-card` versus shadcn's Card.
   - Component READMEs: underlined inline links (ConsentBanner); the selected tile's fire rate in `text-secondary` (WeaponTile); single-choice groups as radio groups rather than `aria-pressed` (SegmentedControl, FilterChip, TierOption, WeaponTile); scrolling touch chips in the component; the chart card's legend and 10-point gridlines; the table's focusable scroller.
3. **Design follow-ups** (roadmap, M11): settle the radius scale; add the mockups' extra colors to the token table in `ui-redesign.md`; fix or accept the three marks under 3:1; design Dialog, Alert dialog, Drawer, the Command palette, the error toast, a result below the median and the primary button's hover.
4. **Type sizes**: replace the recurring `text-[13px]` and `text-[11px]` with tokens or type styles, in `tokens.json` first.
5. **Unstyled components**: style collapsible, form, sheet and sidebar and add them to the gallery once the Studio shell and the spec form are designed (they can wait for Phase 3).

**Phase 2, the trainer** (plan section 5)
1. 2.1 Move the game engine out of `client/game.ts` into `client/engine/` with tests that compare scores and statistics with the current code on recorded runs; `point.ts` and `stats.ts` go there too.
2. Build the trainer at `/next` from the redesign's screens, with:
   - `useTrainerSettings` for the settings;
   - `useSpecs` inside a `QueryClientProvider` (`createQueryClient()`);
   - `createI18n(localeFromPath(location.pathname))`;
   - `ConsentBanner` with `useAnalytics`;
   - links from `site`.
   Use a new entry name (an entry called `trainer` already exists for the old page).
3. Keep the first load under 200 kB of JavaScript (gzip). The gallery bundle is 309 kB because it holds everything; lazy-load Recharts and the dialogs.
4. When the banner replaces tarteaucitron: rewrite the Phase 0 consent scenario (it reads the `tarteaucitron` cookie) and update section 4 of `docs/privacy-policy.md` (the choice is now `consent:analytics` in local storage, for 12 months).
5. Prerendering per locale (2.5), then switch the pages and delete the old ones (2.8).

## 7. Waiting on the owner

- The final name, logo, domain, GA4 measurement ID, privacy policy URL and support link (`site.json`; see the [ownership register](ownership-register.md)).
- Translation review:
  - **Shown in English on the current ru and zh-CN pages, kept that way**: `footer.privacy`, `footer.cookies`, `footer.disclaimer`, `footer.disclaimerShort`, `footer.version`, `footer.whatsNew` and `meta.description`.
  - **Written during extraction, never on a page before**: `settings.scaleX`, `settings.scaleY`, `settings.invertYHint` and `settings.muteLabel` (ru and zh-CN), and `mobile.faq` (ru).
  - **Changed on purpose**: English category chips use full words, as the design system specifies (the old page had "Mark", "Snip", "Shot", "Pist"), while Russian keeps its abbreviations. The phone notice's width is now a `{{minWidth}}` value, since the ru and zh-CN pages said 900 px while the layout switches at 768 px.
