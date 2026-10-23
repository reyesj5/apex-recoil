# UI Migration Plan: React, Tailwind and shadcn/ui

*Decided 2026-10-22; not started. Replaces the "React is not used" decision of Phase 3 in [migration-plan.md](migration-plan.md). Track progress in [roadmap.md](roadmap.md) (M11). The new look, its tokens and the UI audit are in [ui-redesign.md](ui-redesign.md); references to the original project and their placeholders are in [ownership-register.md](ownership-register.md).*

## 1. Decision

The user interface is rebuilt as React 19 components styled only with Tailwind CSS 4, with shadcn/ui (on Radix primitives) for the standard controls. Vite 8, the Express API, SQLite, the job queue and the Python pipeline stay. The trainer and the editor are each rebuilt next to the current page and switched over once their end-to-end scenarios pass. At the end there are no pug templates, no hand-written CSS files and no third-party widgets with their own stylesheets.

Why:

- Tailwind's way of working (utilities in the markup, repetition handled by components) needs markup and state to live together. Today most of the UI is created and changed by imperative TypeScript, so utility classes would end up in string literals and `classList` calls.
- The component ecosystem built for Tailwind, shadcn/ui and Radix, is React-first.
- The rebuild also removes the three copies of the trainer page, the hand-made dialogs without focus handling, and about 400 kB (gzip) of scripts loaded on every page for one chart and a cookie banner.

## 2. Analysis

### 2.1 Current state (measured 2026-10-22)

| Area | Measurement | Consequence |
| --- | --- | --- |
| Client TypeScript | 8,629 lines: 398 element lookups by id or selector, 50 HTML-string injections, 40 `createElement`, 104 `classList` changes, 141 event listeners, 24 inline style writes | The DOM is kept in sync with state by hand. `game.ts` (1,817 lines) mixes game logic, canvas drawing and DOM updates |
| Templates | 1,973 lines of pug. The trainer exists three times (`index.pug`, `index-ru.pug`, `index-zh-CN.pug`); 223 of 340 lines are identical in all three | Every trainer change is made three times, and more translated strings are hard-coded in `game.ts` |
| CSS | 3,606 lines in `client/styles/` covering 53 ids and 248 classes | Styles depend on ids and on markup that TypeScript creates |
| Third-party UI | Plotly (1.1 MB, 370 kB gzip) plus `plot.js` for one chart; the tarteaucitron cookie banner (about 46 kB gzip with its CSS and services, 28 language files); Google Fonts | All load on every page, the editor included, as classic scripts ahead of the app bundle. The trainer downloads about 500 kB (gzip) of JavaScript, more than five times its own 89 kB, and Express sends it uncompressed: 1,644 kB on a cold load, with DOMContentLoaded at 990 ms on localhost |
| Widgets | 3 modal dialogs, segmented tabs, 36 `title` tooltips, custom selects and sliders | No focus trapping, keyboard patterns or ARIA roles beyond what was added by hand |
| Saved state | 37 settings in `localStorage` through the `Attribute` class in `client/storage.ts`, bound to inputs by element id; editor state in module variables with setters (`client/modules/editor/state.ts`) | Renaming an element id silently breaks a saved setting |
| Tests | No client tests (the server has 6 suites, 1,315 lines) | UI regressions are only found by hand |

### 2.2 What "everything in Tailwind, the Tailwind way" requires

Tailwind's guidance, together with the conventions of the component libraries built on it:

1. Style with utility classes in the markup.
2. Handle repetition with the components (or partials) of the rendering layer, not with CSS files or `@apply`.
3. Express state as attributes (`data-state`, `aria-selected`) and style it with variants, instead of toggling classes from scripts. Radix and shadcn/ui work this way.
4. Keep design decisions in theme tokens (`@theme`), not in hex values and one-off sizes.

The current setup already does 4, and does 1 for static markup. It cannot do 2 and 3 for most of the app, because the dynamic UI is built and changed from TypeScript with no component boundary. A component framework is the missing layer.

### 2.3 Options

| Option | For | Against | Verdict |
| --- | --- | --- | --- |
| Keep pug and plain TypeScript; pug mixins, Basecoat classes, Alpine.js for behavior | Least churn; pages stay server-rendered | Keeps the imperative DOM code, which is the real maintenance cost; Basecoat and Alpine fit simple widgets, not the editor's state | Rejected |
| **React 19 + shadcn/ui** | Largest ecosystem; shadcn/ui is the reference Tailwind component system; official Konva bindings (react-konva 19); mature data, state and form libraries; React Compiler 1.0 removes manual memoization; best editor, test and AI-assistant support (this repo is largely maintained with agents) | The UI layer is rewritten; about 60 kB (gzip) of runtime, more than offset by dropping Plotly and tarteaucitron | **Chosen** |
| Svelte 5 + shadcn-svelte | Less code, smaller runtime | The shadcn port lags behind shadcn/ui; smaller ecosystem | Viable second choice |
| Vue 3 + shadcn-vue | Mature | Same trade-off as Svelte for this project | Not chosen |
| A meta-framework (Next.js, React Router framework mode, Astro) | Routing, prerendering and data loading built in | Two pages and an existing Express API don't need one; Next.js would also change hosting | Not now. Revisit React Router if pages multiply |

### 2.4 Cost

Most of the client TypeScript (the DOM parts of `game.ts` and `client/modules/editor/`), all 1,973 lines of pug and all 3,606 lines of CSS are replaced. Code without DOM access (recoil math, scoring, statistics, spec handling, API calls, analysis helpers) is moved with tests, not rewritten. Rough size: 6–8 weeks of focused work (section 8).

## 3. Target architecture

### 3.1 Stack

Versions are the current releases on 2026-10-22; pin exact versions when each is added.

| Concern | Choice | Replaces |
| --- | --- | --- |
| UI | React 19.3 with the React Compiler 1.0, through `@vitejs/plugin-react` 6 | pug templates, DOM code |
| Rendering | Vite 8 (as today). The trainer is prerendered to HTML per locale and hydrated; the editor renders in the browser | pug on the server and in `scripts/build-static.mjs` |
| Styling | Tailwind 4.3 with preflight; tokens generated from the design system's `client/styles/tokens.json` into `@theme` | `base.css`, `components.css`, `trainer.css`, `editor.css` |
| Components | shadcn/ui (style `new-york`, Radix through `radix-ui`), copied into `client/components/ui/` and owned there | hand-made dialogs, tabs, tooltips, sliders, selects |
| Variants, class merging | `class-variance-authority`, and the `cn` package (clsx and tailwind-merge in one, as shadcn/ui generates it) configured with the token names | `classList` toggles |
| Icons | `lucide-react`; the game icons from `views/mixins/icons.pug` and the PNG icons in `etc/` as SVG components | pug icon mixins, PNG icons |
| Canvas | Konva 10. The editor uses `react-konva` 19; the trainer's game engine stays imperative, mounted by a component | Konva 9 code mixed with DOM code |
| Charts | shadcn/ui Chart (Recharts 3), loaded when the chart opens | Plotly and `etc/plot.js` |
| Server data | TanStack Query 5, plus a hook for job progress (Server-Sent Events) | `fetch` calls spread over modules |
| Client state | Zustand 5, persisted under the existing `localStorage` keys | `Attribute` class, module variables with setters |
| Forms | React Hook Form 7 with zod 4 schemas | manual input wiring |
| Translations | i18next 26 + react-i18next 17, one JSON catalog per locale | three page copies plus strings in `game.ts` |
| Notifications | sonner | status text set by hand |
| Cookie consent | own banner component; Google tag with Consent Mode v2 | tarteaucitron |
| Fonts | self-hosted `@fontsource/chakra-petch`, `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono` | Google Fonts |
| Development server | Vite in middleware mode inside Express: hot reload, one origin | `vite build --watch` plus nodemon |
| Tests | Vitest 5, Testing Library and MSW for components; Playwright for end-to-end scenarios, screenshots and axe accessibility checks | none on the client |
| Lint, format | ESLint 10 with typescript-eslint, react-hooks, jsx-a11y and better-tailwindcss; Prettier with prettier-plugin-tailwindcss | none |
| TypeScript | 6.0: `target` ES2022, `moduleResolution` bundler, `jsx` react-jsx | 5.4 with `target` ES5 and CommonJS |
| Node | 24 LTS locally; CI on 22 and 24 (`engines`: `^22.22.2 \|\| >=24.15.0`, the range jsdom 30 and Vitest 5 support) | CI on 20 (end of life since April 2026) and 22 |

TypeScript 7 waits until typescript-eslint supports it (it currently requires TypeScript below 6.1). ESLint 9 is no longer supported, so the project runs ESLint 10; eslint-plugin-jsx-a11y 6.10 declares ESLint up to 9 but works with 10 (checked 2026-10-22, and the lint job would show a break).

### 3.2 Layout of `client/`

```
client/
  entries/         trainer.tsx, editor.tsx (hydrate or mount), prerender.tsx (renders the trainer per locale)
  trainer/         TrainerApp and its components: settings, weapon grid, score, statistics
  editor/          EditorApp, panels/, canvas/, capture/
  engine/          the trainer's game engine (Konva, game loop, scoring, audio), no React
  components/ui/   shadcn/ui components (generated once, then edited here)
  components/      shared app components: WeaponTile, LanguageSwitcher, ConsentBanner, ...
  lib/             api/ (zod schemas, query hooks), storage/, i18n/, analytics/, utils.ts (cn)
  locales/         en.json, ru.json, zh-CN.json
  styles/app.css   the only stylesheet: Tailwind import, tokens, fonts, custom variants
```

### 3.3 Conventions

1. Style with utilities in JSX and solve repetition with components. No `@apply`, and no CSS files besides `app.css`.
2. Colors, radii, fonts and recurring sizes are theme tokens from `client/styles/tokens.json` (the design system). shadcn's semantic tokens (`background`, `primary`, `muted`, `destructive`, `border`, `ring`, `chart-1`, ...) map onto the Apex palette. No hex values in components; arbitrary values such as `w-[315px]` only for true one-offs.
3. Component variants with `cva`, conditional classes with `cn()`. Never assemble class names from strings (`bg-${color}`); use a map of complete class names, so Tailwind finds them.
4. Show state through attributes: Radix's `data-state`, `aria-*`, and our own `data-*` (`data-selected`, `data-penalty`), styled with variants such as `data-[selected]:bg-active`.
5. Interactive widgets use Radix primitives (focus handling, keyboard support, ARIA). Focus shows as one global volt outline (`:focus-visible` in `app.css`); contrast stays at WCAG AA or better.
6. Mobile first; the current 768 px boundary becomes a theme breakpoint.
7. prettier-plugin-tailwindcss orders classes; unknown or conflicting classes are lint errors.
8. The canvas cannot use classes, so Konva takes its colors from the same tokens (imported from `tokens.json`).
9. shadcn/ui components live in the repo and are edited freely; `pnpm dlx shadcn@latest add` and `diff` bring in upstream changes.
10. Dark theme by default, with tokens arranged so that a light theme can be added later.

## 4. How the migration runs

- **Side by side.** Each page is rebuilt next to the current one under a preview route, switched once its scenarios pass, and the old code is deleted in the same change. Old and new UI never share a page, so the old CSS never meets preflight.
- **Behavior, not pixels.** The look changes on purpose. Parity is checked with Playwright scenarios written against today's app first (Phase 0). They assert on data, such as saved settings, API requests and scores, rather than on markup, so the same assertions run against the new UI.
- **Players keep their data.** The same `localStorage` keys (`namespace:name`) and value formats, the same API, and the same static deploy files (`index.html`, `index-ru.html`, `index-zh-CN.html`, `editor.html`).
- **Logic moves with tests.** Code without DOM access moves into plain modules with Vitest tests, which compare the new modules with the current implementation on recorded inputs.
- **Every phase ends green**: lint, typecheck, build, unit and end-to-end tests, the static build and the Python gates.

## 5. Phases

### Phase 0: Tooling and safety net

- [x] 0.1 React 19 and `@vitejs/plugin-react` 6 with the React Compiler; TypeScript 6.0 with a modern `tsconfig` (ES2022, bundler resolution, `@/` alias for `client/`) and separate configs for browser and Node code (`tsconfig.json`, `tsconfig.node.json`; `pnpm tsc` checks both).
- [x] 0.2 ESLint 10 (flat config) and Prettier with the plugins above; `pnpm lint`, `pnpm format` and `pnpm format:check`; both in CI. Legacy code gets warnings, not errors, until its rewrite.
- [x] 0.3 Node 24 LTS locally (fnm); `engines.node` in `package.json`; CI matrix on Node 22 and 24. Node 24.22.1 is installed next to 23.10, which stays the default until the owner switches.
- [x] 0.4 Development server: Express hosts Vite in middleware mode for hot reload; nodemon restarts only on server changes. `pnpm dev` runs `bin/www --dev`, which listens on this computer only because Vite also serves project files.
- [x] 0.5 Vitest with Testing Library and MSW. Playwright with an isolated app fixture: a temporary database, specs and captures, like the scratch runner used for the Tailwind migration (`e2e/server.mjs`; a test fails on any page error, console error or failed request).
- [x] 0.6 Scenarios against the current app, built from the scripted sessions used for the Tailwind migration (25 in `e2e/`, including axe checks that allow nothing beyond the current pages' baseline):
  - Trainer: weapon search, categories, fire modes, magazines and attachments; settings survive a reload (exact `localStorage` values); a scripted run produces a score and history; the statistics chart opens; `/ru` and `/zh-CN`; the phone notice; consent deny and accept, with no Google tag requests before consent.
  - Editor: specs load; editing and saving a spec (API request and history); loading a saved session; upload and analysis with progress and result (end to end, with Python); the screenshot library; calibration and overlay controls; layout preferences persist; the three dialogs.
- [x] 0.7 Upgrade Konva 9 to 10 on the current code (check its migration notes), covered by the scenarios. They found one break: Konva 10 caches at the device pixel ratio, which broke the legacy threshold tools on high-density screens; the editor caches that image at ratio 1 again.
- [x] 0.8 Compression and caching: brotli or gzip for text responses in Express (and on the static host), immutable caching for hashed assets, revalidation for HTML. The analysis event streams stay uncompressed so progress arrives as it happens; the static host settings are in `docs/playbooks.md`.
- [x] 0.9 Ownership register applied to the current pages (2026-10-22): the original author's Google Analytics ID, PayPal link, privacy policies and links are gone; pages read owner values from `site.json`, with placeholders.

Exit: the scenarios pass on the current app and in CI. Met locally on 2026-10-22 (25/25 on Node 23 and 24); CI runs them from the next push.

### Phase 1: Design system and shared foundations

The design system is the one in [ui-redesign.md](ui-redesign.md) (sections 4 and 5), drawn on the design canvas and kept in the Design System artifact (https://claude.ai/artifact/XK1KCFGz6tF9WzmKUykaFe). Progress, conventions and next steps: [ui-migration-progress.md](ui-migration-progress.md).

- [x] 1.1 `pnpm dlx shadcn@latest init` (style `new-york`, CSS variables); `components.json`. The CLI (4.x) writes components that import `cn` from the `cn` package; Vite, Vitest and tsconfig point that name at our helper, which knows the token names.
- [x] 1.2 Tokens: the design system's `tokens.json`, copied to `client/styles/tokens.json`, replaces the palette. The generator in `vite.config.mjs` turns it into Tailwind `@theme` tokens (colors, radii, shadows, sizes, fonts) and `type-*` utilities, and `client/styles/app.css` maps shadcn's semantic tokens and the chart colors onto them (mapping in ui-redesign.md 4.1). `app.css` has `@import "tailwindcss"` (preflight on), the tokens and self-hosted Chakra Petch, Inter and JetBrains Mono. The old pages keep `theme.json` and `tailwind.css` until they are deleted.
- [x] 1.3 Components: button (primary, secondary, ghost, destructive, icon), input, label, select, slider, switch, checkbox, toggle, toggle-group, tabs, dialog, alert-dialog, drawer, tooltip, popover, dropdown-menu, command (weapon search), card, badge, separator, scroll-area, progress, skeleton, table, collapsible, sidebar, sonner, form, chart; own `WeaponTile`, `TierOption`, `StatTile`, `ScoreCard` and `ConsentBanner`. They are shown in all their states on a gallery at `/next/components`, covered by component tests and three scenarios (axe with no violations, every overlay open, phone width). Collapsible, form, sheet and sidebar are not styled or shown yet; they wait for the Studio shell.
- [ ] 1.4 Icons: `lucide-react` for generic icons and the placeholder crosshair mark are done; the game icons and the PNG icons still have to become SVG components.
- [x] 1.5 `lib/storage`: Zustand stores that read and write each value under its existing key and in its existing format, tested against values recorded from the current app.
- [x] 1.6 `lib/api`: zod schemas and TanStack Query hooks for specs, history, sessions, screenshots, uploads and jobs; `useJobEvents` for progress over Server-Sent Events, with polling as the fallback.
- [x] 1.7 `lib/i18n`: catalogs extracted from the three trainer templates and the strings in `game.ts`; typed keys; a test that every locale has every key, with the same placeholders and tags.
- [x] 1.8 `lib/analytics`: consent state and the Google tag with Consent Mode v2, denied by default and loaded only after consent, using the owner's GA4 ID from `site.json` (no ID or no privacy policy, no analytics); never loaded on the Studio. The choice is kept for 12 months.
- [x] 1.9 `lib/site.ts`: typed access to `site.json` (name, owner, site URL, links, analytics ID), which the current pages already use, with the rules of the [ownership register](ownership-register.md): unset links hidden, analytics only with an ID and a privacy policy.

Exit: every component renders in all its states (component tests and screenshots), storage reads values written by the current app, catalogs are complete. Met on 2026-10-23, except for 1.4's game icons and the four components that wait for the Studio.

### Phase 2: Trainer

- [ ] 2.1 Engine: split `game.ts` into `client/engine/` (stage, game loop, pattern playback, scoring, audio, pointer lock, controller support) with an event API; move `point.ts` and `stats.ts` there. Tests compare scores and statistics with the current code on recorded runs.
- [ ] 2.2 Screens from the redesign: the ready state (top bar with search, language, help and settings; loadout panel with class filter, weapon grid, magazine tiers, fire mode and corrupted stock; the range with its floating toolbar, pattern preview and mouse settings chip; session panel); the result card after a run with replay; the Progress page (replacing the inline chart, with per-weapon results, recent runs and CSV export); the Patterns page and the phone pattern viewer; the settings dialog; the footer; the consent banner.
- [ ] 2.3 State: settings in a persisted store; the state of a run comes from engine events.
- [ ] 2.4 One component tree for all locales, with the `lang` attribute, title and meta tags set per locale.
- [ ] 2.5 Prerendering: a Vite SSR build renders the trainer for each locale into `index.html`, `index-ru.html` and `index-zh-CN.html`, which the browser hydrates. Express and `scripts/build-static.mjs` serve and copy these files.
- [ ] 2.6 The `#cookies` link opens the consent settings; the Google tag loads only with consent.
- [ ] 2.7 Privacy policy, FAQ and changelog become pages of the app (`/privacy`, `/faq`, `/changelog`, from the documents in `docs/`), so `site.json` can point to them; `ConsentBanner` replaces tarteaucitron. The footer keeps the owner's copyright, the one-line credit to apex-recoil and the EA disclaimer.
- [ ] 2.8 Preview at `/next` until the scenarios pass, then switch and delete `views/index*.pug`, `client/styles/trainer.css`, the trainer parts of `game.ts` and `client/storage.ts`, `etc/plot.js`, `etc/plotly-cartesian.min.js`, `etc/tarteaucitron/`, `etc/tarteaucitron_init.js`, `etc/reddit.png` and the Google Fonts links.

Exit: the scenarios pass; at most 200 kB (gzip) of JavaScript on first load (about 500 kB today); no axe violations; Lighthouse performance and accessibility scores of 90 or more, recorded in CI.

### Phase 3: Recoil Editor

- [ ] 3.1 Logic out of `client/modules/editor/`: calibration math, overlay geometry, spec diff and merge, shaping of analysis results, and the capture sequence as a typed reducer, each with tests.
- [ ] 3.2 Store: Zustand slices replace `state.ts` (active session, background image scale and offset, optic zoom, expected shots, batch index). Layout preferences and the `editor:*` drawing data persist under their current keys.
- [ ] 3.3 Shell from the redesign: icon rail (Capture, Library, Sessions, Import); capture panel; canvas with a floating tool palette and zoom; inspector (spec, magazine sizes, layers, compare); one Save with an unsaved-changes state, plus undo and redo, in the top bar; status bar (job queue, storage); keyboard shortcuts as a hook; shortcuts dialog. No analytics and no consent banner in the Studio.
- [ ] 3.4 Canvas with react-konva: a background layer (scale, offset); points, anchors and edges with dragging; overlay patterns (opacity, visibility); calibration tools. Separate layers and memoized shapes keep dragging smooth at 144 Hz, checked with a recorded drag scenario.
- [ ] 3.5 Panels, in this order: weapon manager (spec form with React Hook Form and zod, save, history, checkpoint dialog); sessions; screenshot library; analysis confirmation, job progress and results, with the discrepancy inspector; overlays; calibration; and last the capture studio (recording method tabs, screen capture, MediaRecorder, live and automatic modes, uploads with presigned URLs and the server fallback, HUD).
- [ ] 3.6 Preview at `/editor/next` until the scenarios pass, then switch and delete `views/editor.pug`, `views/layout.pug`, `views/mixins/`, `client/styles/{base,components,editor}.css`, `client/modules/editor/`, `client/editor.ts` and the rest of `client/storage.ts`.
- [ ] 3.7 A written manual check for screen capture and recording, which headless browsers cannot automate.

Exit: the scenarios pass, including upload, analysis and result; the manual capture check passes.

### Phase 4: Server and build

Independent of Phases 2 and 3, except 4.1, which follows them.

- [ ] 4.1 Remove pug and the view engine: Express serves the built HTML, and the error page becomes static HTML styled with Tailwind. Unknown paths return 404; today every unknown path renders the trainer, missing `.css` and `.js` files included.
- [ ] 4.2 Split `app.js` (1,003 lines) into an app factory and routers (specs; discovery uploads, sessions, screenshots and analysis; jobs; captures), plus error and upload middleware.
- [ ] 4.3 Express 5 (route syntax changes, such as `'/*splat'` for the catch-all) and multer 2 (the current 1.4.5-lts.1 is deprecated and has known vulnerabilities).
- [ ] 4.4 Server code in TypeScript, run directly by Node (type stripping, so erasable syntax only) and checked by tsc. The zod schemas from `lib/api` move to `shared/` and validate requests on the server.
- [ ] 4.5 One test runner (Vitest) for server and client, or keep `node:test` for the server; decide at the start of the phase.

Exit: the 41 default and 14 service tests pass, with the API behaving as before.

### Phase 5: Removal and lock-in

- [ ] 5.1 Delete what is left: the old `tailwind.css` entry and `theme-tokens.css` (replaced by the tokens in `app.css`), the legacy `bundle.js` router, `scripts/style-snapshot.mjs` (replaced by Playwright screenshots), and the dependencies `pug`, `ts-assert-exists`, `hotkeys-js` (if replaced) and unused `@types/*`.
- [ ] 5.2 Guards in CI: no CSS files besides `app.css`, no hex colors in components, Tailwind lint rules as errors, and a release build fails while site placeholders remain.
- [ ] 5.3 The remaining ownership register items (9 to 18): README and docs, deploy target, contribution terms, package and project names, release history.
- [ ] 5.4 Docs: README (stack and scripts); AGENTS.md (new gates: lint, unit and end-to-end tests; adding shadcn components; Tailwind rules); contributing (Styles rewritten); capture.md (editor UI); roadmap and release notes.

## 6. What goes away

| Removed | Size | Replaced by |
| --- | --- | --- |
| `views/*.pug` | 1,973 lines | React components and prerendered HTML |
| `client/styles/` except the new `app.css` | 3,606 lines | utilities in components |
| DOM code in `game.ts` and `client/modules/editor/` | most of the 8,629 lines of client TypeScript | components and hooks; logic kept in modules |
| Plotly and `plot.js` | 370 kB (gzip) on every page | Recharts, loaded when the chart opens |
| tarteaucitron | about 46 kB (gzip), its own CSS, 28 language files | consent banner with Consent Mode v2 |
| Google Fonts | requests to Google on every page | self-hosted fonts |
| `pug`, `ts-assert-exists` (`npm-run-all` went in Phase 0) | dependencies | (none needed) |

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Screen capture and recording cannot run in headless tests | Port them last, with the capture logic in a tested reducer and a written manual check |
| Editor canvas performance with react-konva | Separate layers, memoized shapes, a recorded drag scenario; imperative Konva for hot paths if needed |
| Players lose settings or score history | The storage layer is tested against values written by the current app; scenarios check the keys after a reload |
| Search ranking and first paint of the trainer | Prerendered HTML per locale, meta tags, Lighthouse in CI |
| Redesign churn | Tokens and components are settled in Phase 1; pages keep today's structure (sidebar and stage) unless changed on purpose |
| Tooling majors not yet supported (TypeScript 7) | Stay on TypeScript 6.0 until typescript-eslint supports 7; ESLint 10 runs jsx-a11y outside its declared range, watched by the lint job |
| Konva 10 changes | Upgraded and tested in Phase 0, before the rewrite (the scenarios caught the high-density cache change) |

## 8. Order and size

The estimates are rough and assume focused work by one person.

| Phase | Size | Rough effort |
| --- | :---: | --- |
| 0. Tooling and safety net | M | 3–4 days |
| 1. Design system | M | 3–4 days |
| 2. Trainer | L | 1.5–2 weeks |
| 3. Editor | XL | 2.5–3 weeks |
| 4. Server and build | M | 4–5 days, can overlap with 2 and 3 |
| 5. Removal and lock-in | S | 1–2 days |

## 9. Decisions

Made by the owner on 2026-10-22:

1. **Look**: a new design and identity of the app's own, not the current palette and not an existing design system. Specified in [ui-redesign.md](ui-redesign.md).
2. **Analytics**: Google Analytics stays, behind consent, under the owner's own GA4 property (the current ID belongs to the original author).
3. **Unknown URLs**: return 404 instead of showing the trainer.
4. **The original project**: every mention and link goes, with placeholders until the owner's values exist; the license and copyright notices stay ([ownership-register.md](ownership-register.md)).
5. **Component catalog**: Storybook is not planned; component tests and screenshots cover the same ground.

Still open: the final name, logo and domain; the GA4 measurement ID; the privacy policy; a support link, if any; whether the Patterns page ships with the first release.
