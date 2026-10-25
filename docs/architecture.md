# Architecture

How the system fits together, as it is now: what each part does, how the parts talk to each other, and where the code is. [AGENTS.md](../AGENTS.md) (*Project shape*) says how to run each part and where it listens; the plan and its history are in [roadmap.md](roadmap.md), and the conventions and pitfalls of the web code in [ui-notes.md](ui-notes.md).

## The parts

- **The pages** (`client/`) are React 19 with Tailwind 4 and shadcn/ui. The trainer, its Patterns and Progress pages and the documents are prerendered in each language and hydrated in the browser; the Studio, for the specs' maintainers, and the component gallery render in a bare shell. The trainer's engine (`client/engine/`) and the Studio's model (`client/studio/model/`) hold their logic without a DOM.
- **The server** (`server/`) is Express 5 in TypeScript, which Node runs as it is. It listens on 127.0.0.1 only and refuses a request addressed to any other host, since there is no sign-in yet. `createApp()` in `server/app.ts` builds it around a spec database, capture storage, a job queue and the site's values, and mounts `/captures`, `/api/specs`, `/api/discovery` (with its jobs under `/api/discovery/jobs`) and the pages.
- **The API's shapes** (`shared/`) are zod schemas: the browser checks every response with `shared/api.ts`, and the server reads requests through `shared/requests.ts`.
- **Discovery** (`processing/recoil_discovery/`) is Python with OpenCV: it finds each spray's decals on the wall, measures the fire rate from the clips' sound and frames, and integrates several sprays into one pattern. The server runs its CLI for every analysis, and maintainers run it by hand (`python -m recoil_discovery.cli`).
- **The static site** (`pnpm static`) is the pages without the server, so the Studio's capture and saving are not on it.

## The weapon specs

`data/recoil.db` (SQLite, written by `server/db.ts` and `processing/recoil_discovery/db.py` with one schema) keeps every version of every spec, losslessly (`spec_json`), with its audit history. `client/specs.json` holds the active ones in their order, and is what the trainer's bundle, the Python pipeline and the Arduino export read. A save through the API (`POST /api/specs`) writes a new version and rewrites only the changed weapons' entries in the file, leaving the others byte for byte, with the previous file kept as `client/specs.json.bak`. Edits made to `client/specs.json` outside the API (the Python CLI, a git pull, a hand edit) are imported as new versions before the API's next read or write, so a save never reverts them. `python -m recoil_discovery.shadow_parity` compares the two field by field, and `python -m recoil_discovery.cli export-arduino` writes `arduino_mouse/src/recoil.inc` from the file.

## Analyses

The Studio sends a session's clips and wall screenshots to `/api/discovery/process-session`, or wall screenshots alone to `/api/discovery/process-static-image`. With S3 storage it puts the files straight into the bucket through presigned URLs, for which `/api/discovery/uploads` signs a grant, and falls back to a multipart upload through the API; `server/uploads.ts` stages either. Each analysis is a job: in the server's own process (`JobQueue`), or with `REDIS_URL` on BullMQ, where jobs survive restarts and `pnpm worker` adds workers on other machines (`server/jobs.ts` picks one; both implement `AnalysisQueue`). A job runs the discovery CLI's `session` command on a folder of its inputs (`server/analysis-params.ts`, `server/analysis-runner.ts`), which reports its progress in `PROGRESS:` lines; the browser follows the job over Server-Sent Events (`/api/discovery/jobs/:id/events`) or by polling, and can cancel it. A finished session is indexed in the database (`discovery_sessions`), and its files stay in capture storage, a local folder (`processing/captures/` unless `RECOIL_CAPTURES_DIR` says otherwise) or an S3 bucket, which the browser reads through `/captures`.

## Pages: prerendering and routing

[server/routes/pages.ts](../server/routes/pages.ts) serves the pages of `server/prerender.ts` (`/`, `/ru`, `/zh-CN`, each with `/patterns` and `/progress`, and `/privacy`, `/faq`, `/changelog`): each is rendered once with this server's `site.json` values, all of them when the server starts, and served from memory with `Cache-Control: no-cache`. With `pnpm dev`, or a build without `dist-ssr/`, they render in the browser in a bare shell instead. `/next/...` answers with a permanent redirect to the page's own address (the previews), except `/next/components`, the gallery. An unknown address gets the 404 page when a browser asks for HTML, and a bare 404 otherwise (a missing script, an API path); a request that fails gets the error page, with its status. `/editor` is the Studio, in its shell (`/editor/next`, its preview's address, redirects there). Hashed files under `dist/chunks` and `dist/assets` are cached as immutable.

## The code, folder by folder

Each folder or file and what it holds; the generated files are committed, and never edited by hand.

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
client/studio/model/             the Studio's logic without a DOM, tested (roadmap.md, M11 3.1)
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
