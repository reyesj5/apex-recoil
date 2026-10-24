# How to Contribute

We'd love to accept your patches and contributions to this project. There are just a few small guidelines you need to follow.

## Contribution Terms

[CONTRIBUTION TERMS: decide whether contributors sign a CLA, add a DCO sign-off (`git commit -s`), or neither.] Until then, contributions are accepted under the project's license: section 5 of the Apache License 2.0 applies to anything you submit for inclusion.

All submissions, including submissions by project members, require review. We use GitHub pull requests for this purpose. Consult [GitHub Help](https://help.github.com/articles/about-pull-requests/) for more information on using pull requests.

## Quality Gates & Testing

Before submitting a pull request, ensure all quality gates pass:
1. **Python Unit Tests & Shadow Parity:** `cd processing && python -m pytest tests && python -m recoil_discovery.shadow_parity`
2. **Schema Verification:** `cd processing && python -m recoil_discovery.cli verify`
3. **Node.js Test Suites:** `pnpm test`; with `docker compose up -d`, `pnpm test:services` also runs the Redis, S3 and end-to-end suites
4. **Unit & End-to-End Tests:** `pnpm test:unit`, then `pnpm build && pnpm test:e2e` (Chrome; the discovery scenarios need Python with the processing requirements)
5. **Typecheck, Lint & Formatting:** `pnpm tsc` (browser, tools and server configs), `pnpm lint` (ESLint, then the UI's conventions: `app.css` as the only stylesheet, no `@apply`, no hex colors or `dark:` classes) and `pnpm format:check` (`pnpm format` fixes formatting)
6. **Static & Bundle Build:** `pnpm build` and `pnpm static`

## Package Manager

- The project uses pnpm 12, pinned in `package.json` under `devEngines.packageManager`; another pnpm 11+ switches to that version, and npm refuses to run (`EBADDEVENGINES`). `pnpm self-update` moves the pin.
- pnpm settings live in [pnpm-workspace.yaml](../pnpm-workspace.yaml), not in `package.json`. A new dependency with an install script fails `pnpm install` until it is allowed (or denied) under `allowBuilds` there.
- `pnpm-lock.yaml` also pins pnpm itself (its first document); commit it with every dependency or pnpm change.

## Development

- Node 22.22+ or 24.15+ (`engines` in `package.json`); 24 LTS is recommended.
- `pnpm dev` serves the client sources through Vite inside Express: style changes apply in place, code changes reload the page, and changes to `server/` or `shared/` restart the server (nodemon). It listens on this computer only, because Vite also serves project files. `pnpm build` (the client into `dist/`, the new pages' prerender into `dist-ssr/`) and `pnpm start` serve the production build.
- The server is TypeScript that Node runs as it is ([server/](../server/); `pnpm start` is `node server/main.ts`): imports name the `.ts` file, and only syntax that erases to JavaScript works (no enums, namespaces or parameter properties). `server/app.ts` builds the app (`createApp`) from the routers in `server/routes/`; the API's shapes are zod schemas in [shared/](../shared/), which the browser checks responses with and the server reads requests with.

## Tests

- End-to-end scenarios live in [e2e/](../e2e/) (Playwright in Chrome). [e2e/server.mjs](../e2e/server.mjs) runs the built app on a throwaway database, specs and captures. A scenario fails on any page error, console error or failed request to the app, and the accessibility checks fail on any axe violation (no page has a baseline). For the new interface, follow [ui-migration-progress.md](ui-migration-progress.md).
- Write scenarios the way a player or editor would work: click, type, then check what the page shows and what it stored (`localStorage`, the API).
- Unit and component tests sit next to the code as `client/**/*.test.ts(x)` (Vitest, Testing Library, MSW). A request without an MSW handler fails the test.
- The server's tests are `test/*.test.ts` (`node:test`, run by `pnpm test`). They build the app with `createApp()` around a throwaway database, specs file, captures folder and job queue, never the real ones.

## Names, Links and IDs

- Owner-specific values (the product name, the owner, the site address, help and repository links, the Google Analytics ID) live in [site.json](../site.json); pages read them as `site`. Add a key there instead of writing a URL into a page, and hide the link while the value is empty.
- Files that contain code from the original apex-recoil keep its copyright line and the `Modified by` line under it; the credit to the original project stays in [NOTICE](../NOTICE), the README and the page footer. See the [ownership register](./ownership-register.md).

## Styles

- Every page is React styled with Tailwind 4 utilities in the components; [client/styles/app.css](../client/styles/app.css) is the only stylesheet (Tailwind, the fonts, shadcn/ui's variables and the base layer). Don't add CSS files or `@apply`; repeated styling becomes a component.
- Colors, radii, sizes and type styles are the design system's tokens, generated from [client/styles/tokens.json](../client/styles/tokens.json) (`bg-panel`, `text-text-muted`, `rounded-card`, `h-control`, `type-label`). Tailwind's default palette is switched off, and the lint rejects unknown classes.
- Components come from shadcn/ui, kept and edited in [client/components/ui/](../client/components/ui/); the app's own are in `client/components/`. The gallery at `/next/components` shows each in every state.
- The trainer's pages exist in three languages from one component tree: add a string to all three catalogs in `client/locales/`. The Studio is in English.
- The conventions in detail (tokens, icons, accessibility, storage, pages, the Studio) are in [ui-migration-progress.md](ui-migration-progress.md), section 3.

## Project Roadmap & AI Guidelines

- Check [docs/roadmap.md](./roadmap.md) to see active milestones and planned weapon updates.
- If you are using AI coding assistants or LLMs, ensure you adhere to the mandatory workflow in [AGENTS.md](../AGENTS.md).