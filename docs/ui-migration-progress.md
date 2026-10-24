# UI Migration: Progress Report and Handoff

*Updated 2026-10-24. For any agent or person continuing the UI rebuild: read this first, then the [plan](ui-migration-plan.md) (phases and conventions) and the [redesign](ui-redesign.md) (the look). Keep this page current: when you finish a step, move it from section 6 to section 1 and note what the next agent must know.*

The work is on the `migration` branch: Phase 0 in `e0d2dec`, Phase 1 in `f0d389b`, Phase 2.1 to 2.6 (without the Patterns page) in `cc696b1`; `git status` shows anything since. The owner reviews, commits, pushes and opens pull requests; agents never do (see `AGENTS.md` and the owner's rules: one-sentence commit messages, no AI credit lines).

## Design references

- **Claude with the Artifact tool** works from the two artifacts, which are the source of truth: the design canvas (https://claude.ai/artifact/3Uv9xgQocE1qqS2ohS2MQG, fourteen artboards) and the Design System (https://claude.ai/artifact/XK1KCFGz6tF9WzmKUykaFe: tokens, brand book, 30 components). Read them with the Artifact tool, not WebFetch. After changing one, refresh the snapshot below with `scripts/export-design.mjs` ([how](design/README.md#refreshing-this-folder-claude-only)).
- **Every other agent** uses the snapshot in [design/](design/README.md): PNGs of the artboards and of every component preview, plus the brand book, the tokens, each component's rules and the artboards' markup. Treat it as read-only, and record design changes in this report instead.
- On 2026-10-24 the canvas (version 20) gained artboards for every screen the app has, and the Design System (version 12) designed what the mockups left out: Dialog, AlertDialog, Drawer, CommandPalette, the error toast, the danger badge, a run below the median and each button on hover. The app follows them (section 3), the Design System's `tokens.json` equals `client/styles/tokens.json`, and its rules include what building the components taught (radio groups, underlined links in text, keyboard access for scrolling tables).

## 1. Status

| Phase | Status |
| --- | --- |
| 0. Tooling and safety net | Done (2026-10-22) |
| 1. Design system and shared foundations | Done (2026-10-23); the four layout components no page needed (collapsible, form, sheet, sidebar) were deleted in Phase 5 |
| 2. Trainer | Done (2026-10-24), but for one exit check: the engine (2.1), the trainer, the Progress page (2.2, 2.3), a title and meta description per language (2.4), prerendering (2.5) and consent (2.6) on 2026-10-23; the Patterns page, the translation review, the privacy policy, FAQ and changelog as pages (2.7) and the switch (2.8) on 2026-10-24. The new pages serve `/`, `/ru` and `/zh-CN` now, and the old trainer is deleted. Lighthouse runs in CI from the next push: its scores are the one exit criterion not yet recorded |
| 3. Recoil Editor | Done (2026-10-24), but for the manual capture check (3.7), which needs a person with the game: the Studio replaces the Recoil Editor at `/editor`, and the editor's templates, code and styles are deleted |
| 4. Server and build | Done (2026-10-24): no pug (the Studio's and the gallery's shells and the error page come from `server/prerender.ts`), Express 5 and multer 2, and the server in TypeScript that Node runs directly, split into an app factory and routers, reading requests through the schemas in `shared/` |
| 5. Removal and lock-in | Done (2026-10-24): the unused dependencies and components deleted, the UI's conventions and a release's placeholders checked (`pnpm lint`, `pnpm release`), every hand-written file under Prettier, and the ownership register up to date. Left for the owner: the values and the final name |

Phase 1 in detail:

| Item | Status | Where |
| --- | --- | --- |
| 1.1 shadcn/ui | Done | [components.json](../components.json): style `new-york`, Radix through `radix-ui`, lucide icons, aliases `@/components`, `@/lib`. The shadcn CLI 4.x writes `import { cn } from 'cn'`; Vite, Vitest and tsconfig resolve `cn` to our token-aware helper |
| 1.2 Tokens | Done | [client/styles/tokens.json](../client/styles/tokens.json) (copied from the Design System artifact) → generated `design-tokens.css` → [client/styles/app.css](../client/styles/app.css) |
| 1.3 Components | Done | 27 shadcn components in [client/components/ui/](../client/components/ui/), own components in [client/components/](../client/components/), shown in every state on the gallery at `/next/components`. Collapsible, form, sheet and sidebar, which no page needed, were deleted in Phase 5; the shadcn CLI adds one back (section 3) |
| 1.4 Icons | Done | Lucide for every generic icon (the old pug and PNG icons map to Lucide names, section 3); the logo and the crosshair placeholder are our own SVG components in [icons.tsx](../client/components/icons.tsx). The redesign uses no game attachment art: magazine tiers are color bars and attachments are switches |
| 1.5 Storage | Done | [client/lib/storage/](../client/lib/storage/), tested against values recorded from the current app |
| 1.6 API | Done | [client/lib/api/](../client/lib/api/): zod schemas, TanStack Query hooks, uploads, `useJobEvents` |
| 1.7 Translations | Done | [client/locales/](../client/locales/) (en, ru, zh-CN) and [client/lib/i18n/](../client/lib/i18n/) |
| 1.8 Analytics | Done | [client/lib/analytics.ts](../client/lib/analytics.ts) |
| 1.9 Site values | Done | [client/lib/site.ts](../client/lib/site.ts) |

Phase 2 so far:

| Item | Status | Where |
| --- | --- | --- |
| 2.1 Engine | Done | [client/engine/](../client/engine/): weapons, pattern, run, target, score history and loadout, without a DOM. The previous trainer (`client/game.ts`, deleted in 2.8) ran on it, and runs recorded from it prove the engine scores exactly as before. The range has its own Konva drawing and Howler sound ([client/trainer/range/](../client/trainer/range/)). Pointer lock and controller input do not exist yet, so nothing moved for them |
| 2.2 Screens | Done: the trainer, the Patterns page and the Progress page | [client/trainer/](../client/trainer/): the top bar (weapon search with Ctrl K, language, the Studio, help, settings), the loadout panel, the range (the canvas, the pattern as SVG before a run, the floating options, the mouse settings chip, sound, the result card with Replay and Next run), the session panel with today's trend, tips and the legal footer, the consent banner, the settings and help dialogs, and the phone pattern viewer. The 12 recorded runs replay through it bit for bit (`e2e/trainer.spec.ts`). The Progress page ([progress/](../client/trainer/progress/)) sums up the history by day and by weapon over 7 days, 30 days or all time, charts it (Recharts, loaded after the page), lists the runs saved since the run log began and exports CSV. The Patterns page ([patterns/](../client/trainer/patterns/), 2026-10-24; the owner wanted it in the first release, and no artboard exists for it) shows every weapon's pattern in a library filtered by class, all at one scale, and the selected weapon's large with Play spray, its magazines and fire modes, and a link to practice it; phones get the pattern viewer there too |
| 2.3 State | Done | Settings in `useTrainerSettings` (the current keys, plus `game::ads` and `game::replay-speed`); this visit's runs and the open dialog in `useSession` ([session.ts](../client/trainer/session.ts)), set when the engine reports the end of a run. Nothing in React renders during a run |
| 2.4 Locales | Done | One component tree for en, ru and zh-CN: each page has its language's `lang`, title and meta description (`meta.description` for the trainer, `patterns.description` and `progress.description` for the other two), and loads only its own catalog besides English |
| 2.5 Prerendering | Done | `pnpm build` also builds [client/entries/prerender.tsx](../client/entries/prerender.tsx) for Node (`dist-ssr/prerender.mjs`), and [server/prerender.mjs](../server/prerender.mjs) renders each of the nine pages into a complete HTML page with the server's `site.json` values: `app.js` renders the pages when it starts and serves them from memory, `pnpm static` writes a folder per page (`static/ru/patterns/index.html`). The browser hydrates the markup, then loads the stored settings and history. Without JavaScript the pages show their content (the weapons, the range's instructions, the Progress page's heading) |
| 2.6 Consent | Done | The banner on every page, with the values the server runs with (each page carries them in `<script id="site-json">`); the footer's Cookie settings and an address ending in `#cookies` reopen it; the Google tag loads only after Accept (`e2e/trainer.spec.ts`). tarteaucitron went with the old pages in 2.8 |
| 2.7 Documents | Done | `docs/privacy-policy.md`, `docs/faq.md` and a new players' changelog, `docs/changelog.md`, at `/privacy`, `/faq` and `/changelog`: converted to HTML at build time ([scripts/markdown-plugin.mjs](../scripts/markdown-plugin.mjs)), in English, between the top bar and the legal footer ([doc-app.tsx](../client/trainer/docs/doc-app.tsx)). `site.json` can point `privacyUrl`, `faqUrl` and `changelogUrl` to them once their placeholders are filled. The original project's release history moved to `docs/history/` |
| 2.8 Switch | Done | The pages serve `/`, `/ru` and `/zh-CN` with `/patterns` and `/progress` after each; `/next/...` redirects there (301), except the gallery at `/next/components`. Unknown addresses get a 404 page (owner decision 3, ahead of 4.1). Deleted: the trainer templates, `trainer.css`, `game.ts`, `stats.ts`, `trainer_main.ts`, the legacy `bundle.js` router, Plotly, tarteaucitron, the old trainer's images and icons, the Google Fonts links (the Recoil Editor self-hosts its fonts too) and `scripts/record-runs.mjs`. The static build keeps `index-ru.html` and `index-zh-CN.html` for servers set up for them |

Phase 3, the Studio (the Recoil Editor rebuilt, 2026-10-24):

| Item | Status | Where |
| --- | --- | --- |
| 3.1 Logic | Done | [client/studio/model/](../client/studio/model/), without a DOM: specs (the pattern shot by shot, magazines, shot times, imports), calibration (the optic and measured scales, the decals of a session), the discrepancy report, placement (where a pattern sits on a screenshot or in its own units, the comparison, fitting and zoom), pattern editing (where an added shot goes, anchors, the version 2 export), undo history, the Manual tab's decal finder, the capture sequence as a reducer, analyses (requests and results) and the session. Tested: the calibration and report against the Recoil Editor's results recorded on 2026-10-24 (`editor-parity.fixture.json`, cases in `parity.cases.ts`), the decal finder and the color correction against ports of their originals |
| 3.2 Store | Done | [store.ts](../client/studio/store.ts) (Zustand): the specs as saved and the drafts, undo, the session, the screenshots and sprays, what the canvas shows, the dialogs. The settings that last are `useEditorSettings` under the Recoil Editor's keys, plus new keys for the capture setup and the trigger ([lib/storage/editor.ts](../client/lib/storage/editor.ts)) |
| 3.3 Shell | Done | [studio-app.tsx](../client/studio/studio-app.tsx) from the Studio artboard: the top bar (weapon picker, unsaved changes, undo, redo, shortcuts, Save spec), the icon rail (Capture, Library, Sessions, Import), the side panel, the canvas, the inspector and the status bar (job queue, storage); keys in [use-shortcuts.ts](../client/studio/use-shortcuts.ts); dialogs in [dialogs.tsx](../client/studio/dialogs.tsx). No analytics and no consent banner |
| 3.4 Canvas | Done | [canvas/](../client/studio/canvas/) (react-konva): the screenshot, the pattern with its shots and anchors, the read-only patterns, the comparison; the tool palette, the spray navigator, the status pill and the zoom. Dragging a shot or the whole spray measured on 2026-10-24: frames of 8 ms (the browser's own rate), at most 16 ms, 32 ms once at 4× CPU slowdown |
| 3.5 Panels | Done | [panels/](../client/studio/panels/): the Live tab ([use-live-capture.ts](../client/studio/panels/use-live-capture.ts) on the reducer), Screenshots, Manual, the library, the sessions with clip import, the discovery JSON import, and the analysis' progress and result ([analysis-status.tsx](../client/studio/panels/analysis-status.tsx)); the spec form and the layers in [inspector.tsx](../client/studio/inspector.tsx) |
| 3.6 Switch | Done | The Studio serves `/editor` (`/editor/next` redirects there). Deleted: `views/editor.pug`, `views/mixins/`, `client/modules/`, `client/editor.ts`, `editor_main.ts`, `bootstrap.ts`, `stage.ts`, `storage.ts`, `utils.ts`, `client/styles/{base,components,editor,tailwind,theme-tokens}.css`, `theme.json` (and its Vite plugin), `scripts/style-snapshot.mjs`, `e2e/editor.spec.ts` and the editor's axe baseline (`e2e/accessibility.spec.ts`). `views/layout.pug` stays for the error page until 4.1, on `app.css` |
| 3.7 Manual check | Written, not run | [studio-capture-check.md](studio-capture-check.md): the live capture by hand (screen sharing, the gunfire sensor, recording, the samples, an analysis). It needs a person with the game; nobody has run it yet |

Phase 4, the server (2026-10-24):

| Item | Status | Where |
| --- | --- | --- |
| 4.1 No pug | Done | The Studio and the gallery get a bare shell from `renderShell`, and a failed request gets the error page, prerendered like the 404 page (`error` in [prerender.ts](../server/prerender.ts)), with the error's status and, in development, the error under it; anything but a browser gets plain text. `views/` and `pug` are gone, and `pnpm static` writes `editor.html` from the same shell |
| 4.2 Routers | Done | `app.js` became [server/app.ts](../server/app.ts), whose `createApp()` builds the app around a database, capture storage, job queue, upload folder and site values (the environment's unless given, so the tests and the end-to-end server pass throwaway ones), and [server/routes/](../server/routes/): specs, discovery (uploads, analyses, the session and screenshot lists, the status), jobs, captures and pages. Upload staging is [uploads.ts](../server/uploads.ts) and the error handler [errors.ts](../server/errors.ts); `bin/www` became [main.ts](../server/main.ts) |
| 4.3 Express 5, multer 2 | Done | Express 5.3 (named wildcards: `'/{*path}'`, and `'/*key'`, whose key arrives as decoded segments), multer 2.5 (2.4 and older have a denial of service), morgan 1.12 (log injection fixed). `cookie-parser`, `debug` and `http-errors` are gone, and `pnpm-workspace.yaml` pins node-gyp's `undici` past two advisories |
| 4.4 TypeScript | Done | Every server module, the worker and the Node tests are TypeScript that Node runs as it is (type stripping: `"type": "module"`, imports name the `.ts` file, erasable syntax only), checked by `tsconfig.server.json` in `pnpm tsc`. The API's schemas moved to [shared/api.ts](../shared/api.ts) (`client/lib/api/schemas.ts` re-exports them), the routes' responses are typed with them, and [shared/requests.ts](../shared/requests.ts) reads requests as leniently as the API always did. The status endpoint names the queue it runs on (`jobQueue.kind`) |
| 4.5 Test runner | Decided: `node:test` stays for the server | It runs the TypeScript tests without tooling of its own, each file in its own process, and the Redis and S3 suites skip themselves without their services. Vitest stays with the client, where it has jsdom, MSW and Vite's resolution |

Phase 5, removal and lock-in (2026-10-24):

| Item | Status | Where |
| --- | --- | --- |
| 5.1 Leftovers | Done | Deleted: the four shadcn components nothing used (collapsible, form, sheet, sidebar, with the `use-mobile` hook), and the dependencies nothing imported (`hotkeys-js`, `json-diff`, `stats-lite` and their types, `ts-assert-exists`, `tslib`, `react-hook-form`, `@hookform/resolvers`). Pug, the old stylesheets, `bundle.js` and `style-snapshot.mjs` went in Phases 2 to 4. `esbuild` stays: it is Vite's optional peer |
| 5.2 Guards | Done | `pnpm lint` runs [scripts/check-conventions.mjs](../scripts/check-conventions.mjs) after ESLint: `app.css` is the only stylesheet (with the generated `design-tokens.css`), without `@apply`, and the client has no hex colors and no `dark:` classes. The Tailwind lint's correctness rules and `no-deprecated-classes`, `no-duplicate-classes` and `no-unnecessary-whitespace` are errors (section 4 says why two others aren't). `pnpm release` runs [scripts/check-release.mjs](../scripts/check-release.mjs), which fails while placeholders remain, and CI runs it for a version tag (`v*`). Prettier formats the scripts, `vite.config.mjs` and `app.css` too now; `tokens.json` stays exactly as the Design System artifact has it |
| 5.3 Ownership | Done, but for what waits on the owner | The register's items 14 (the header logo) and 16 (the release history) are done. Item 18 (identifiers with `apex`) waits for the final name, item 19 (the game's art and sounds) for the owner's review before launch, and the values for the owner: `node scripts/check-release.mjs` lists the 47 placeholders. The original's notice is on the 24 files that hold its code (the register lists them) |
| 5.4 Docs | Done | README (the stack, `pnpm release`), AGENTS.md and contributing (the checks, the server), the roadmap and the release notes. `capture.md` and contributing's Styles section were rewritten with the Studio (Phase 3) |

Phase 1's exit criteria are met except where noted: the 27 components in the gallery render in all their states (gallery, component tests, and full-page screenshots attached to the gallery scenarios), storage reads the values the current app writes, and the catalogs are complete (a test checks keys, placeholders and tags per locale).

## 2. Map of the new code

```
client/styles/tokens.json        design tokens: colors, radii, shadows, sizes, fonts, type styles (source of truth)
client/styles/design-tokens.css  GENERATED from tokens.json by vite.config.mjs (designTokensToTheme); never edit it,
                                 but commit it: lint and format read it before any build (like theme-tokens.css)
client/lib/cn-tables.ts          GENERATED with design-tokens.css: cn()'s merge tables (Tailwind's classes as
                                 tailwind-merge knows them, plus the token names), compiled at build time so pages
                                 don't download the compiler; commit it too. ESLint and Prettier skip it
client/styles/app.css            the new UI's only stylesheet: Tailwind, fonts, shadcn variables, base layer, and the
                                 typography plugin (prose) for the documents
client/lib/utils.ts              cn(): clsx + tailwind-merge (the `cn` package) on those tables
client/components/ui/            shadcn/ui components, edited to the design (buttons, toggles, dialogs, ...)
client/components/               own components: WeaponTile, TierOption, StatTile, ScoreCard, RunResult,
                                 ConsentBanner, InputWithUnit, icons
client/gallery/gallery.tsx       the component gallery (all components, all states), at /next/components
client/studio/                   the Studio at /editor (Phase 3): studio-app.tsx (the shell, the rail, the side
                                 panel, the status bar), top-bar.tsx (weapon picker, undo, Save spec), inspector.tsx,
                                 dialogs.tsx, store.ts (Zustand: specs and drafts, undo, session, screenshots, sprays,
                                 view), editing.ts (placement and the edits, from the store), actions.ts (save with
                                 the checkpoint, analyses and their jobs, sessions, imports; the query client),
                                 use-shortcuts.ts, media.ts (color correction, frames, data URLs), names.ts, fields.tsx
client/studio/model/             the Studio's logic without a DOM, tested (section 1, 3.1)
client/studio/canvas/            studio-canvas.tsx (react-konva), overlays.tsx (tools, zoom, status pill, sprays,
                                 the comparison's figures), use-frame-image.ts (the screenshot, the Manual tab's
                                 threshold and targets)
client/studio/panels/            capture-panel.tsx (Live, Screenshots, Manual and the setup), live-tab.tsx and
                                 use-live-capture.ts, screenshots-tab.tsx, manual-tab.tsx, other-panels.tsx (library,
                                 sessions, import), analysis-status.tsx
client/trainer/weapon-list.ts    the weapons' classes and art, shared by the trainer's catalog and the Studio
client/lib/site.ts               typed site.json with the ownership rules (unset links left out)
client/lib/storage/              persisted Zustand stores under the legacy localStorage keys
client/lib/analytics.ts          consent store and the Google tag with Consent Mode v2
client/lib/api/                  apiRequest, query hooks, submitAnalysis, watchJob/useJobEvents; schemas.ts
                                 re-exports shared/api.ts
client/lib/i18n/, client/locales/ i18next with typed keys; one JSON catalog per locale
client/engine/                   the trainer's engine, no DOM: weapons.ts (fire modes, magazines, attachments, sounds),
                                 pattern.ts (sensitivity scaling, hint path), run.ts (one spray: timing and scoring),
                                 target.ts, stats.ts (score history), loadout.ts (settings to a run's setup)
client/engine/recorded-runs.fixture.json  12 runs recorded from the previous trainer; run.test.ts and
                                 e2e/trainer.spec.ts replay them (the recorder went with that trainer)
client/trainer/                  the trainer: trainer-app.tsx (layout, keys, consent, dialogs on demand), top-bar,
                                 loadout-panel, range-panel (options, pattern, chip, result card), session-panel,
                                 legal-footer, dialogs.tsx (settings, help, weapon search; own chunk), phone-viewer;
                                 catalog.ts (weapons, classes, art, tiers), loadout.ts (the loadout as shown and run,
                                 the changes a player makes, weaponSetup for any weapon), history.ts (game::stats),
                                 session.ts, names.ts (names in the page's language), weapon-meta.tsx ("Assault rifle ·
                                 810 RPM"), fields.tsx, hooks.ts, links.ts, consent.tsx (the consent prompt and
                                 analytics start), run-log.ts (game::runs), pattern-frame.ts (one frame for every
                                 pattern view), play-spray.ts (Play spray, shared with the phone)
client/trainer/range/            renderer.ts (Konva: runs, drawing and the mouse, step for step as the previous
                                 trainer's Shooting), sound.ts (Howler, loaded when sound is on), range-canvas.tsx
                                 (mounts the renderer, loaded after the page), pattern-preview.tsx (the path as SVG,
                                 in a frame of its own or a shared one), colors.ts (tokens)
client/trainer/patterns/         patterns-app.tsx (the Patterns page and the selected pattern's panel),
                                 pattern-library.tsx (every weapon's pattern as a card, filtered by class)
client/trainer/progress/         progress-app.tsx (the Progress page), score-chart.tsx (Recharts, its own chunk),
                                 progress-data.ts (days per setup to days, weapons, the summary and CSV; tested)
client/trainer/docs/doc-app.tsx  the documents of docs/ as pages (privacy policy, FAQ, changelog; prose on the
                                 tokens) and the 404 page
client/markdown.d.ts             the type of `docs/*.md?html` imports
scripts/markdown-plugin.mjs      the Vite plugin behind them: Markdown to HTML at build time (marked), the title,
                                 the `<!-- description: -->` comment, heading ids, tables that take focus
client/entries/                  one entry per page: trainer.tsx, patterns.tsx, progress.tsx, docs.tsx (the
                                 documents and the 404 page, named by #root's data-page), gallery.tsx, studio.tsx
                                 (built on its own, `vite build --mode studio`); each page's entry reads
                                 <html lang>, loads that catalog, and hydrates the prerendered page (or renders it
                                 in a bare shell). prerender.tsx: the pages for Node, render(page, locale, site)
                                 gives the markup, the title and the description
shared/api.ts                    the API's shapes (zod): the browser checks every response with them, and the
                                 server's routes are typed with them
shared/requests.ts               what the server accepts, read as leniently as the API always did: form fields as
                                 text, a setting it can't use as the discovery CLI's default, a spec update with
                                 only a name and a pattern
server/app.ts                    createApp(): static files, /captures, the API's routers, the pages and the error
                                 handler, around the database, storage, job queue and site values it is given
server/main.ts                   the HTTP server (pnpm start, pnpm dev with --dev): .env, the port and its fallback
server/routes/                   specs.ts, discovery.ts (uploads, analyses, the session and screenshot lists, the
                                 status), jobs.ts, captures.ts, pages.ts (the prerendered pages, the shells, the old
                                 addresses' redirects, the 404 and error pages, Vite with pnpm dev)
server/prerender.ts              the pages (address, page, language, entry, a fallback title), pageAt(), notFound,
                                 serverError, the shells (Studio, gallery), renderShell(), and renderPage(): the HTML
                                 page around the markup, with the site values and the first paint's font preloads;
                                 routes/pages.ts and scripts/build-static.mjs use it
server/uploads.ts                upload staging: multer, old clients' base64, direct uploads and their signed grants,
                                 file names; analysis-params.ts turns an analysis' settings into the CLI's arguments
server/errors.ts, site.ts        the error handler (JSON for the API, the error page, plain text); site.json and the
                                 repository's root
server/db.ts, storage.ts, jobs.ts, job-queue.ts, bull-queue.ts, job-processor.ts, analysis-runner.ts, worker.ts
                                 the spec database, capture storage and analysis jobs, as they were in JavaScript;
                                 jobs.ts has the interface both queues implement (AnalysisQueue)
test/*.test.ts                   the Node tests (node:test): the database, the queues, storage, request parsing, the
                                 API and the built bundles; bull-queue, app-scaled and S3 storage need the services
docs/changelog.md                the players' changelog (/changelog); docs/release-notes.md stays the developers'
docs/history/                    the release history of apex-recoil, the project this one is based on
lighthouserc.json, lighthouserc.mobile.json  the Lighthouse CI runs (the `lighthouse` job in ci.yml)
e2e/trainer.spec.ts              24 scenarios: the previous trainer's, axe with every overlay open, the phone, the
                                 pages without JavaScript, consent (and its sheet on a phone), and the 12 recorded
                                 runs replayed through the range
e2e/patterns.spec.ts             6 scenarios: the library and the selected pattern (axe, one frame, class filter),
                                 magazines, fire modes and Play spray under a paused clock, the link to the trainer,
                                 Russian and Chinese, without JavaScript, the phone
e2e/progress.spec.ts             6 scenarios: empty state, a seeded history summed up and exported, a run saved in the
                                 trainer listed, Russian and Chinese, without JavaScript, the phone
e2e/docs.spec.ts                 5 scenarios: the three documents (axe, anchors), their links and consent, the 404
                                 page, without JavaScript, a wide table on a phone
e2e/gallery.spec.ts              3 scenarios: renders on the tokens, axe with every overlay open, phone width
e2e/studio.spec.ts               14 scenarios: the Recoil Editor's (specs, edits with undo, saves and their
                                 versions, the checkpoint, the shortcuts, the layout kept, the scale and layers, the
                                 Manual tab at two pixel ratios), saves that change only what was edited, axe with the
                                 picker, sections and comparison open, and three with the Python pipeline (a clip, the
                                 saved session, a screenshot kept in the library)
docs/studio-capture-check.md     the live capture's check by hand (3.7)
scripts/check-conventions.mjs    the UI's conventions that ESLint doesn't check (pnpm lint): one stylesheet, no
                                 @apply, no hex colors or dark: classes in the client
scripts/check-release.mjs        fails while placeholders remain (pnpm release, CI for a version tag)
docs/design/                     snapshot of the design artifacts for agents that can't open them (PNGs, rules, tokens)
scripts/export-design.mjs        refreshes docs/design/ from the artifacts' files (a Claude session downloads them)
```

[server/routes/pages.ts](../server/routes/pages.ts) serves the pages of `server/prerender.ts` (`/`, `/ru`, `/zh-CN`, each with `/patterns` and `/progress`, and `/privacy`, `/faq`, `/changelog`): each is rendered once with this server's `site.json` values, all of them when the server starts, and served from memory with `Cache-Control: no-cache`. With `pnpm dev`, or a build without `dist-ssr/`, they render in the browser in a bare shell instead. `/next/...` answers with a permanent redirect to the page's own address (the previews), except `/next/components`, the gallery. An unknown address gets the 404 page when a browser asks for HTML, and a bare 404 otherwise (a missing script, an API path); a request that fails gets the error page, with its status. `/editor` is the Studio, in its shell (`/editor/next`, its preview's address, redirects there). Hashed files under `dist/chunks` and `dist/assets` are cached as immutable.

## 3. Conventions to keep

**Tokens and classes**
- Change a color, radius, size or type style in `tokens.json` (and in the Design System artifact), never in `design-tokens.css`; `pnpm dev` or `pnpm build` regenerates it.
- Use token classes: `bg-panel`, `text-text-muted`, `border-outline-strong`, `rounded-card`, `shadow-float`, `h-control`, `size-touch`, `type-label`, `font-display`. Tailwind's default colors, radii and shadows are switched off, so a class like `bg-gray-800` fails the lint; the generic radius and shadow names shadcn uses (`rounded-md`, `shadow-lg`) are aliases of tokens.
- Spacing tokens sit on Tailwind's 4 px scale (`space-12` is `p-3`). Size tokens are spacing names (`h-control` is 38 px). Type styles are utilities (`type-score-xl`, `type-micro`).
- Font sizes come from the type scale: `type-*` for a whole style, or a size step `text-<px>` (`text-13`, `text-11`) when only the size is wanted. The generator makes one step per size the type styles use; there are no arbitrary sizes.
- shadcn's semantic names (`bg-background`, `text-muted-foreground`, `bg-popover`, `border-border`, `bg-primary`) are mapped onto the tokens in `app.css`. One exception: `bg-card` is the design system's card color (`#151920`); shadcn's Card uses `bg-panel`.
- The titles of overlays (Dialog, Alert dialog, Drawer) are `type-panel-title`, as the Studio's panel titles; shadcn's `text-lg` is off the type scale. A dialog's Cancel is a secondary button, and the one primary action names what happens.
- Focus is one global 2 px volt outline with a 2 px offset (`:focus-visible` in `app.css`); don't add `ring-*` focus classes or `outline-none`.
- `dark:` classes never apply (the app has one dark theme); remove them from generated code.
- Arbitrary values only for true one-offs.
- `pnpm lint` fails on a stylesheet besides `app.css` (and the generated `design-tokens.css`), on `@apply`, and on a hex color or a `dark:` class in the client ([scripts/check-conventions.mjs](../scripts/check-conventions.mjs)); a canvas takes its colors from the tokens.
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
- The result card's score is volt, or neutral below today's median (`RunResult`'s `below`): volt marks good results. The owner approved this on 2026-10-24.
- React never renders during a run. The renderer marks the range with `data-running` (CSS hides the pattern, the result card and the warning), and reports the end; React then saves the score (only a full magazine at full speed counts, as before) and shows the card. Settings reach the renderer through `configure`; a run keeps those it started with.
- Runs use the effective sensitivity, sensitivity × ADS. `game::ads` is 1 unless the player sets it, so a stored sensitivity, which the current trainer asks players to enter as sensitivity × ADS, keeps its meaning.
- The pattern drawn is the path the aim follows (the start point minus the recoil), as on the current page: for normal Y it runs down from the start point, and Follow path moves the target ring along it. The mockups draw the climb instead (section 6).
- The pattern views (the Patterns page's library and its selected pattern, the phone's viewer) draw every weapon in one frame, `usePatternFrame()` ([pattern-frame.ts](../client/trainer/pattern-frame.ts)), computed from all the weapons with the stored magazine, fire mode and sensitivity: they share a scale and their start points line up, so a short burst stays small next to a long spray. The range keeps its own scale (the screen's).
- Budget: at most 200 kB (200,000 bytes, gzip) of JavaScript on first load, counted as the entry and its static imports, plus the catalog a Russian or Chinese page waits for. `pnpm test` checks it after `pnpm build` (`test/app_api.test.js`). Konva with the renderer, the dialogs, Howler, Recharts and the Russian and Chinese catalogs are chunks of their own. On 2026-10-24 the trainer loads 189.0 kB in English, 194.3 kB in Russian and 193.6 kB in Chinese; the Patterns page 172.2 to 177.4 kB; the Progress page 172.5 to 177.7 kB. A Radix primitive costs 2 to 5 kB, so check after adding one to the first load (the loadout grid scrolls natively for that reason). A new page costs the others too: shared code splits into more chunks (section 4).
- The Progress page reads `game::stats` (each setup's days) and `game::runs` (the run log). A day or weapon that mixes setups has no exact median, so medians weight each setup's median by its tries. Recent runs exist only for runs saved by the new trainer, and the table says so while it is empty.

**Pages**
- A page is a line in `pages` ([server/prerender.ts](../server/prerender.ts): address, page, language, entry, and the title the bare shell takes), its component in [client/entries/prerender.tsx](../client/entries/prerender.tsx), an entry in `client/entries/` and in `build.rollupOptions.input` (`vite.config.mjs`), and an `@source` line in `app.css` if it lives in a new folder. The server serves every address in `pages` by itself; a page that renders in the browser only is a line in `shells`. The entry hydrates when `#root` has content and renders otherwise.
- A document for players goes in `docs/` as Markdown, with a `<!-- description: ... -->` comment on its first line, and becomes a page through `docs` in [doc-app.tsx](../client/trainer/docs/doc-app.tsx) (import it as `*.md?html`). Links to other documents keep only their text unless their page exists; such pages are English only.
- Entries don't import `app.css`: the prerendered pages and the shells link it (from source with `pnpm dev`, `dist/app.css` otherwise). A stylesheet imported by two entries lands in a shared chunk's CSS, named after that chunk.
- The first render in the browser must match the prerender, so anything that only the browser knows comes after hydration: stored settings (`useStoredSettings()`), the stored consent (`useHydrated()`), media queries (`useMediaQuery()`, false on the server; the layouts themselves switch with CSS, so both are in the markup). React reports a mismatch as an error, which fails the scenarios.
- A page with two layouts (the trainer, the Patterns page) puts each in its own `<Suspense>` boundary: React then hydrates them separately, and on a phone the hidden desktop layout no longer makes one long task (the trainer's blocking time at 4× CPU went from 488 to 136 ms).
- An image in a long list takes `loading="lazy"`: React 19 adds a `<link rel="preload">` to the prerendered head for every other image (the weapon grid preloaded 31).
- The first paint's fonts are preloaded by `renderPage` (Inter, Chakra Petch 600 and 700; Inter's Cyrillic on Russian pages), looked up in the built assets by name; without them the text moves when they arrive (layout shift 0.10 on the Progress page).
- A Select shows its value as text inside `SelectValue` (`<SelectValue>{label}</SelectValue>`): Radix fills it in only in the browser, so without it the prerendered page shows an empty select.
- Site values reach the browser in `<script id="site-json">`, which [client/lib/site.ts](../client/lib/site.ts) reads before the bundled `site.json`: the prerender, the shells and the static build all write the values the server runs with (`setSite()` sets them for the prerender). Links between the pages go through `trainerHref()`, `patternsHref()` and `progressHref()` ([links.ts](../client/trainer/links.ts)).
- The app's own pages (an address starting with `/`, such as `privacyUrl: "/privacy"`) open in place from the footer; other sites open in a new tab.

**Studio** (`client/studio`)
- The specs come from the API (`useSpecs`) and are copied into the store as `saved`. An edit makes a draft of that weapon (`editSpec` for the inspector's fields, `applyShots` for the canvas), Save sends the draft (`actions.ts`), and `markSaved` makes it the saved spec. A spec changes only where it was edited: a magazine keeps its sound (`withMagazineSize`), the shot times keep their timing (`fitTimePoints`, `retime`), and shots that didn't move keep their exact values (`measureShots`).
- The canvas works in the screenshot's pixels, or in the spec's own units without one. `placementOf` ([editing.ts](../client/studio/editing.ts)) places a spec from the store (the frame's size, the session's decals, the optic settings, the Align offset): shot 0 at the origin, the others at the scale the decals measure, else the optic's. Edits come back through the same placement, so they go through `editing.ts` (`addShotsAt`, `moveShotTo`, `removeShotAt`, `toggleAnchorAt`), which records undo (the pattern, its times, its anchors and its offset). When an edit moves shot 0, the offset follows it so the pattern stays where it was drawn.
- An analysis' result is checked with `analysisResult` ([model/session.ts](../client/studio/model/session.ts)) and applied with `applyAnalysis`: the weapon's draft takes the measured pattern (its magazines, multiplier and attachments stay) and the session keeps the saved spec, the candidate and each spray's frame. A result without shots changes nothing.
- The live capture's sequence is the reducer in [model/capture.ts](../client/studio/model/capture.ts). `use-live-capture.ts` runs the media and lives with the Studio through a context, so switching tabs or sections doesn't stop a recording; it takes frames from a video element of its own, and the meter updates through `subscribeLevel` without React renders.
- The Studio is in English: names come from the English catalog ([names.ts](../client/studio/names.ts)) and strings are written in the components.
- It builds on its own (`vite build --mode studio`, in `pnpm build` and `pnpm static`): a page sharing chunks with the trainer splits theirs further, and the Studio cost the trainer 3.2 kB that way.
- Konva shapes carry names the scenarios count through `window.Konva.stages[0]`: `.shot`, `.background`, `.auto-target`, `.decal`, `.saved`, `.candidate`, `.stray`.

**Server** (`server/`, `shared/`)
- Node runs the TypeScript itself, so nothing is compiled: imports name the `.ts` file, type-only imports say `import type`, and only erasable syntax works (no enums, namespaces, parameter properties or `import =`). `tsconfig.server.json` checks the server, `shared/` and the tests. `pnpm start` is `node server/main.ts`; `pnpm dev` restarts it through nodemon when `server/` or `shared/` changes (`execMap` runs `.ts` with node, not ts-node).
- `createApp(options)` builds the app around what it is given. Modules read the environment when an object is made (`new DatabaseService()`, `new AssetStorageService()`, `createJobQueue()`), never when they load, so a test passes its own and needs no environment variables.
- A route reads its body through a schema of [shared/requests.ts](../shared/requests.ts) and answers with the shapes of [shared/api.ts](../shared/api.ts) (`satisfies`). Keep requests as lenient as they were (a form sends text, a setting the server can't use falls back to the CLI's default) and keep the error messages, which clients and tests read.
- Save a spec as it was sent: a parsed copy lists the schema's keys first, and `specs.json` keeps a new weapon's keys in the order they came.
- The routes use a job queue only through `AnalysisQueue` ([jobs.ts](../server/jobs.ts)), which `JobQueue` and `BullJobQueue` implement; `kind` and `runsLocally` say where jobs wait and whether their inputs can stay on this machine's disk.
- The Node tests use `node:test` in TypeScript (`pnpm test`, 50); the Redis and S3 suites skip themselves without `TEST_REDIS_URL` and `TEST_S3_ENDPOINT` (`pnpm test:services`, 64).

## 4. Pitfalls already paid for

- **Refs in a hook's result**: the React Compiler's lint (`react-hooks/refs`) treats every property of an object that holds a ref as a ref, so reading any of them during render fails. `useLiveCapture` hands out a subscription (`subscribeLevel`) instead of the meter's refs.
- **ESLint's React rules only apply to `.tsx` files**: an `eslint-disable` comment naming a `react-hooks/...` rule in a `.ts` file is an error, since the rule isn't defined there.
- **Specs hold -0**: JSON's `-0` parses to -0, which `toEqual` tells apart from 0. Compare what gets saved (`JSON.stringify` writes 0).
- **An analysis that finds no shots** reports an empty pattern with a magazine of 0 shots: the Studio's result schema accepts it, and the API's spec schema would not.
- **Radix Tabs unmount the hidden tabs**, so state that must outlive a tab (the live capture) lives above it.
- **Axe on an overlay**: wait for `document.getAnimations()` to finish first (the Studio's `violations` helper does); a popover checked mid-fade fails contrast.
- **Narrow cards**: the Studio's side panel is 340 px, so two cards side by side keep 130 px inside each. Until 2026-10-24 the Library's "Add to Screenshots" ran out of its button on both sides and its date wrapped, unseen because no test or screenshot had screenshots on the server. Look at a populated panel: `PORT=3220 node e2e/server.mjs`, then put images in its `captures/screenshots` folder (in the system temp folder, `spraydown-e2e-3220`).
- **The pipeline names a file's stage with its count** (`processing_clip_1_of_2`, `processing_image_2_of_3`) and repeats it in the details; `describeProgress` adds the details' count only to a stage without one.
- **Design canvas artboards** (for Claude): a `{{hole}}` in an SVG geometry attribute (`points`, `d`, `cx`) is parsed before the runtime fills it and logs an error, and a hole inside a `<textarea>` shows "[object Object]". Write such values into the file when building it, and draw a filled field as a styled element.

- **Environment**: Windows with Git Bash. Node 24.22.1 is the fnm default, but shells started before the switch still find Node 23; prefix commands with `export PATH="/c/Users/micro.VADER/AppData/Roaming/fnm/aliases/default:$PATH"` when `node --version` says 23. Use pnpm 12; npm refuses to run (`EBADDEVENGINES`).
- **jsdom and MSW**: a multipart (`FormData`) request fails inside MSW's handler lookup under jsdom and leaks to the network. Tests capture multipart requests at `fetch` instead (`captureMultipart` in `api.test.tsx`). Don't replace jsdom's `FormData` or `Blob` globally: Vitest 5 has its own conversion layer, and swapping the globals breaks it.
- **jsdom gaps**: no `ResizeObserver` (stubbed in `client/test/setup.ts` for Radix) and no `EventSource` (`watchJob` takes one as an option).
- **Radix prop types**: `Omit<ComponentProps<typeof ToggleGroup.Root>, 'type'>` loses `onValueChange`'s type. Use `Omit<Extract<..., { type: 'single' }>, 'type'>`.
- **Accessible names**: text in separate flex items joins without a space in jsdom; `WeaponTile` puts a space text node between the name and the fire rate.
- **Lint quirks**: the Tailwind lint checks every string inside `cn()` and any variable named `classes`, so keep variant names and data out of them. The React Compiler lint rejects `Math.random()` during render; use a `useState` initializer.
- **Recording with a fake clock**: after `page.clock.install()`, time still flows in real time until `page.clock.pauseAt()`; without the pause, the page reads times a millisecond off from the ones logged.
- **Chrome and Node differ in the last bit** of `Math.exp` and `Math.pow`, so the engine's scores match the browser's to 15 decimal places, not bit for bit; times, shot counts and stored scores match exactly.
- **Node has a global `localStorage`**: in scripts that hand functions to a page, declare only `window` and `document` (`/* global window, document */`).
- **A missing stylesheet passed unnoticed** while every unknown path rendered the trainer (until 2026-10-24): a page linking a CSS file that didn't exist got HTML with status 200 and showed unstyled. Unknown addresses answer 404 now, which fails the scenarios; they still check the body's background color.
- **A test that expects a 404**: the fixture fails a test on any failed request and on Chrome's console error "Failed to load resource", so take both out of `problems` (`e2e/docs.spec.ts`).
- **Lighthouse**: running it here through `pnpm dlx` is blocked (a package downloaded and run outside the lockfile). Approximate with Playwright and Chrome's performance entries (FCP, LCP, long tasks, layout shift, scored with Lighthouse's curves), and read the real scores from CI's `lighthouse` job.
- **Replaying recorded runs**: scores match bit for bit only when the spray happens at the same canvas coordinates; floating-point sums depend on where the spray is, not only on how the mouse moves. `e2e/trainer.spec.ts` presses where the recording pressed.
- **Escapes in files written by tools**: a `\uFEFF` typed into a file edit can arrive as the invisible character itself, which ESLint reports as irregular whitespace in a regular expression and lets pass in a string. Write such escapes through a script (`chr(92)` for the backslash), and Git Bash heredocs halve backslashes, so write scripts with a file tool.
- **Scripts**: `@axe-core/playwright` needs a page from `browser.newContext()`. The gallery has two buttons named "Delete sample", so scope lookups to a section (`getByRole('region', { name: /overlays/i })`).
- **Units**: until 2026-10-23 this report gave the first load in KiB (bytes / 1024) labeled kB, 2.3 % below the figure in kB: with the prerender in place, the Russian and Chinese trainer pages were at 201.6 and 201.0 kB (196.9 and 196.3 KiB). Compiling `cn()`'s tables at build time brought every new page down 5.6 kB, and the budget test measures in kB of 1000 bytes, the stricter reading.
- **Chunks multiply with pages**: Rolldown puts each module in a chunk with the modules that the same set of entries imports, so every page that imports a different subset of the shared code splits it further. Adding the Patterns page split five small chunks off the trainer's first load (the phone viewer, the weapon tile, the card, the run log, the score history) and cost it 3.4 kB, as small files compress worse. A `codeSplitting` group would merge them, but a group takes its modules' dependencies along by default: tried on 2026-10-24, it pulled engine code into the group and the old pages (`trainer.js`, `bundle.js`, `editor.js`) started loading it. Switching the minifier from esbuild to Oxc, Vite 8's default, won 5.4 kB per page instead. Before any chunking change, compare the old bundles' static imports too.
- **The prerender build**: its files are named `.mjs` (from before `package.json` declared ES modules), the name the server and the tests look for. ESLint and Prettier must skip build output (`dist-ssr/`) and generated code (`client/lib/cn-tables.ts`, whose packed strings hold control characters). The footer's year is the server's (`suppressHydrationWarning`), and a test that needs the page without JavaScript uses Playwright's `javaScriptEnabled: false`.

- **zod 4 and missing keys**: in an object, `z.unknown()` and `z.unknown().transform(...)` report a missing key as "expected nonoptional". A lenient field is `z.unknown().optional().transform(...)`, whose transform runs with `undefined`, so a default still applies; `.optional()` alone, `.catch()` and `z.preprocess` accept a missing key too.
- **Express 5 paths**: wildcards have names (`'/*key'`, `'/{*path}'`), and `req.params.key` is an array of decoded segments. An address that can't be decoded (`/%E0%A4%A`) fails in the router with 400 before any route, which is how the error page is tested.
- **The Tailwind lint's other stylistic rules stay off**: `enforce-canonical-classes` would rewrite about 100 class strings, among them `[[data-slot=x]_&]:...` into `in-data-[slot=x]:...`, whose `:where()` lowers the selector's specificity, with nothing to compare the pages before and after; `enforce-consistent-class-order` disagrees with Prettier's Tailwind plugin on the typography plugin's classes (Prettier keeps the order), and line wrapping is Prettier's.
- **Advisories in dev tools**: `pnpm-workspace.yaml` overrides `minimatch` 3, `brace-expansion` 1 and `picomatch` 2 (under `eslint-plugin-jsx-a11y` and nodemon) to their fixed versions. `postcss-selector-parser` 6, which `@tailwindcss/typography` pins, has an advisory fixed only in 7: it parses the plugin's own selectors at build time, so it stays. `pnpm audit --prod` is clean.
- **ES modules everywhere**: with `"type": "module"`, Playwright loads the scenarios as ES modules (`import.meta.dirname`, not `__dirname`), and nodemon would run `.ts` files with ts-node without its `execMap`. The server imports CommonJS packages by their default export (`import express from 'express'`), and ioredis by name (`import { Redis } from 'ioredis'`), whose default export TypeScript types as the module.

## 5. Verification

Run the full protocol in `AGENTS.md` before reporting. Results on 2026-10-24 (Node 24.22.1, Windows), with all of the above in place:

| Gate | Result |
| --- | --- |
| `python -m pytest tests` (in `processing/`) | 43 passed |
| `python -m recoil_discovery.shadow_parity` | 31 weapons, 0.000000 drift |
| `python -m recoil_discovery.cli verify` | every weapon OK |
| `pnpm build` | passes: the client into `dist/`, the Studio on its own into `dist/` (`studio.js`, 1.15 MB, 360 kB gzip, one file), the prerender into `dist-ssr/`. The gallery's and the Studio's entries are over 500 kB, hence Vite's chunk-size warnings. First loads (gzip, kB of 1000 bytes; English, Russian, Chinese): the trainer 189.3, 194.6 and 194.0 kB; the Patterns page and the Progress page 172.8, 178.1 and 177.5 kB; the documents 155.3 kB (English only) |
| `pnpm test` | 50 of 50 (the TypeScript server; 5 new for the request parsing), the first-load budget and `/api/discovery/status` included. The job queue's tests that start Python wait 20 s for it: one of them timed out at 5 s once, with two Python processes starting at the same time on Windows |
| `pnpm test:unit` | 234 tests in 33 files: 40 for the engine, 20 for the trainer and the Progress page, 5 for the prerender, and 71 for the Studio (its model, with the parity cases against the Recoil Editor; the store; the color correction; the analysis' progress in words) |
| `pnpm test:e2e` | 59 of 59: 24 on the trainer (the 12 recorded runs, the pages without JavaScript and consent included), 6 on the Patterns page, 6 on the Progress page, 6 on the documents and the 404 and error pages, 3 on the gallery, and 14 on the Studio (the Python discovery runs included) |
| `pnpm tsc` | no errors in the three configs (browser, tools, server) |
| `pnpm lint` | no errors and no warnings (the 219 warnings were in the JavaScript server, scripts and tests), then the conventions check |
| `pnpm format:check` | clean, the scripts, `vite.config.mjs` and `app.css` included |
| `node scripts/check-release.mjs` | fails with the 47 placeholders still to fill in, as it should until the owner's values are in |
| `pnpm audit --prod` | no advisories (one moderate in the dev tools, accepted, section 4) |

`pnpm test:services` (Redis and SeaweedFS from `compose.yaml`, after starting Docker Desktop): 64 of 64, the BullMQ queue (a worker killed mid-job included), S3 storage and the scaled mode's end-to-end analyses on the TypeScript server. By hand: the Studio's drag (3.4), a session analyzed on the local server, looked at in Chrome, and `node server/main.ts --dev` serving the pages, the sources and the API through Vite. `pnpm static` writes the 12 prerendered pages, the trainer's copies under `index-ru.html` and `index-zh-CN.html`, `404.html` and `editor.html`.

For 2.1, `scripts/record-runs.mjs` was also run against the build: the trainer running on the engine reproduced the 12 recorded runs exactly (events, shot times, scores, stored results). Since 2.2, `e2e/trainer.spec.ts` replays them through the range on every run of the suite; the recorder went with the old trainer in 2.8.

For the compiled `cn()` tables (2.5), the six prerendered pages and every element's classes on the gallery, the trainer and the Progress page in Chrome (desktop and phone) were captured before and after: identical. A differential run over 422,105 random combinations of the sources' class names and of classes on every token scale, with variants, merged them the same way with both.

Useful during UI work:
- `pnpm exec vitest run client/components client/lib`: component and library tests.
- `pnpm build && pnpm exec playwright test e2e/gallery.spec.ts`: the gallery, axe included; screenshots are attached to the report.
- `PORT=3220 node e2e/server.mjs` after `pnpm build`: the app on throwaway data, to look at the pages and `/next/components` by hand (`E2E_ANALYTICS=1` for the consent banner).
- `pnpm build && pnpm exec playwright test e2e/trainer.spec.ts -g replays`: the 12 recorded runs through the range (about 45 s).
- `pnpm build && node --test test/app-api.test.ts`: the first-load budget, with the size per page and language when it fails.
- `pnpm exec vitest run client/entries`: the prerender in Node, quicker than a build when a page fails to render on the server.

## 6. Next steps, in order

**Design work still open** (none of it blocks the start of Phase 2)
1. **Design decisions for the owner** (roadmap, M11): settle the radius scale, and fix or accept the three marks under 3:1 (`ui-redesign.md` lists them with what carries their meaning; its token table has every color). The rest of the design follow-ups were done on 2026-10-24 with the owner's approval to publish: the Design System's overlays, error toast, danger badge, result below the median and button hovers; artboards for the Patterns page, the documents, the 404 and server error, the trainer's dialogs, and the Studio's panels, analysis, checkpoint and dialogs. Main, Result and Phone draw the path to follow from the start point at the top; Main shows the Studio link, the selected chip's count and the Rampage's thermite grenade; Result switches to a run below the median.
2. **Drawn the way the app does, worth a look**: the session card's 56 px en dash before the first run reads as a bar. The artboards leave out the support link (shown only when `site.json` sets one); the ScoreCard rules give the result card's line for a run that isn't saved.
3. **Unstyled components**: none left. The four that were never styled (collapsible, form, sheet, sidebar) were deleted in Phase 5; a page that needs one adds it with the shadcn CLI and styles it to the design.

**Phase 2, what is left**
1. Read the `lighthouse` job's results after the next push: the desktop profile must score 90 or more for performance and accessibility (it fails the job otherwise); the phone profile's performance is recorded and only warned about. Measured here with Playwright on 2026-10-24 (Lighthouse's curves on Chrome's own metrics, not Lighthouse itself): about 100 on desktop for the trainer, Patterns, Progress and the FAQ; on the phone profile about 98, 99, 96 and 100.
2. Once `site.json` has `siteUrl`: `<link rel="canonical">` and `hreflang` alternates for the three languages in `renderPage` (the owner has no domain yet).
3. Consider `<link rel="modulepreload">` for an entry's chunks and its page's catalog in the prerendered head: the browser discovers them one level at a time (read the hashed names from a Vite manifest).

**Phase 3, what is left**
1. Run the manual capture check ([studio-capture-check.md](studio-capture-check.md)) with the game, and fix what it finds. It needs a person.
2. A realistic static-image fixture would let the screenshot scenario check the shots found (the small synthetic wall yields none).

**After Phase 5**: the plan's phases are done. What is left needs a push, a person or the owner: the Lighthouse scores from CI (Phase 2), the manual capture check (Phase 3), the two design decisions above, and the owner's values and final name (section 7, and `node scripts/check-release.mjs`).

## 7. Waiting on the owner

- The final name, logo, domain (none yet, 2026-10-24), GA4 measurement ID, privacy policy URL and support link (`site.json`; see the [ownership register](ownership-register.md)).
- Translations: the owner asked Claude to review them (2026-10-24), and Claude did, every key in ru and zh-CN against the English. What it changed and why is in the release notes ("Translation Review"). Left for a native speaker, if one is available before launch:
  - Two Chinese weapon names taken from the original project's page look doubtful: `G7侦灵枪` (Claude would expect 侦察 or 侦查) and `猎手冲锋枪` (possibly 猎兽). The other weapon names, also from the original pages, were kept as they are, in the game's localized forms.
  - **Shown in English on the ru and zh-CN pages, kept that way**: `legal.disclaimer` (the EA disclaimer).
  - **Changed on purpose**: English category chips use full words, as the design system specifies (the old page had "Mark", "Snip", "Shot", "Pist"), while Russian keeps its abbreviations.
