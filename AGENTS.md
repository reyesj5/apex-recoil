# LLM & AI Agent Guidelines

This repository enforces a strict **Task Completion Protocol** for all AI coding assistants (Antigravity, Claude, Copilot, Cursor, etc.). Whenever you complete any task, bugfix, or feature, you **MUST** execute and verify each step in this workflow before concluding your response.

> **The UI rebuild.** The trainer, the Studio and the server were rebuilt with React, Tailwind, shadcn/ui and TypeScript ([docs/ui-migration-plan.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/ui-migration-plan.md), Phases 0 to 5). Before you touch the interface or the server, read [docs/ui-migration-progress.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/ui-migration-progress.md): the conventions to keep, the pitfalls already paid for and what is left. Update it when you finish a piece of work. For the design, Claude reads the design canvas and the Design System artifacts with the Artifact tool; every other agent uses the snapshot in [docs/design/](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/design/README.md) (PNGs of every screen and component, with the brand book, tokens and component rules).

---

## ⚡ Mandatory Task Completion Protocol

Every AI agent working in this codebase must execute the following 4 steps after finishing code edits:

```
┌────────────────────────────────────────────────────────┐
│ 1. RUN AUTOMATED TESTS & TYPECHECKS                    │
│    • pytest in processing/                             │
│    • specs schema verification                         │
│    • TypeScript tsc (browser and Node configs)         │
│    • Vitest, Playwright, ESLint, Prettier              │
│                                                        │
│ 2. SYNCHRONIZE DOCUMENTATION & ROADMAP                 │
│    • docs/release-notes.md                             │
│    • docs/roadmap.md                                   │
│    • README.md / docs/capture.md                       │
│                                                        │
│ 3. ENFORCE .GITIGNORE & GIT HYGIENE                    │
│    • Check git status for unwanted artifacts           │
│    • Add any scratch/output patterns to .gitignore     │
│                                                        │
│ 4. PRESERVE INTEGRITY & CODE HEALTH                    │
│    • Never strip existing unrelated comments           │
│    • Keep clickable file links in responses           │
└────────────────────────────────────────────────────────┘
```

---

### Step 1: Automated Testing & Validation

Never consider a task complete without executing and passing these checks. Use pnpm, not npm: `package.json` pins pnpm 12 and npm refuses to run here (`EBADDEVENGINES`).

1. **Python Unit Tests & Shadow Parity**:
   ```bash
   cd processing
   python -m pytest tests
   python -m recoil_discovery.shadow_parity
   ```
   *Requirement:* All 43 unit tests must pass with 0 errors, and all 31 weapons must pass full-document shadow parity (0.000000 coordinate drift, identical fields and order). Tests run on temp databases; only the `shadow_parity` command reads `data/recoil.db`.

2. **Recoil Spec Schema Verification**:
   ```bash
   cd processing
   python -m recoil_discovery.cli verify
   ```
   *Requirement:* Must run whenever `client/specs.json` or spec-related logic is modified. All weapons must show `Status: OK`.

3. **Node.js Automated Test Suites**:
   ```bash
   pnpm build && pnpm test
   ```
   *Requirement:* All 50 tests must pass across the database, queue, storage, request parsing and API suites (`test/*.test.ts`, `node:test` running the TypeScript as it is). Without a prior build the two bundle tests are skipped: the trainer split from the Studio, and the new pages' first load (at most 200 kB of JavaScript, gzip). Tests must never write to `data/recoil.db` or `client/specs.json`: give `createApp()` and the services throwaway paths, as the existing tests do.
   If you touched the job queue, storage, uploads or discovery endpoints, also run the Redis/S3/end-to-end suites: `docker compose up -d && pnpm test:services` (64 tests in total).

4. **Unit, Component & End-to-End Tests**:
   ```bash
   pnpm test:unit
   pnpm build && pnpm test:e2e
   ```
   *Requirement:* All Vitest tests pass, and all 59 Playwright scenarios pass in Chrome. The scenarios fail on any page error, console error or failed request, and on any accessibility violation: every page allows none (`e2e/trainer.spec.ts`, `e2e/patterns.spec.ts`, `e2e/progress.spec.ts`, `e2e/docs.spec.ts`, `e2e/gallery.spec.ts`, `e2e/studio.spec.ts`). The Studio's live capture can't run headless: after a change to it, run [docs/studio-capture-check.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/studio-capture-check.md) by hand. CI also runs Lighthouse on the pages (`lighthouserc.json`): 90 or more for performance and accessibility on the desktop profile. They run the app on throwaway data (`e2e/server.mjs`) and need Python with the processing requirements for the discovery runs (skipped locally without it, required in CI).

5. **TypeScript Typecheck, Lint & Formatting**:
   ```bash
   pnpm tsc
   pnpm lint
   pnpm format:check
   ```
   *Requirement:* 0 TypeScript compilation errors in the three configs (`tsconfig.json` for the browser, `tsconfig.node.json` for tool configs and `e2e/`, `tsconfig.server.json` for `server/`, `shared/` and `test/`), 0 ESLint errors and 0 warnings, and every file Prettier formatted (`pnpm format` fixes it). Node runs the server's TypeScript without compiling it, so only erasable syntax works there (no enums, namespaces or parameter properties), and imports name the `.ts` file. `pnpm lint` also runs `scripts/check-conventions.mjs`: `client/styles/app.css` is the only stylesheet (with the generated `design-tokens.css`), it has no `@apply`, and the client has no hex colors and no `dark:` classes.

6. **Asset & Bundle Verification**:
   If CSS, TypeScript, or static bundling logic was altered, verify that `pnpm build` (the client into `dist/`, the new pages' prerender into `dist-ssr/`) or `pnpm static` succeeds without crashing.
   A release (not every change) goes through `pnpm release`, which fails while placeholders remain in `site.json`, `NOTICE`, the copyright headers or the pages' documents (`scripts/check-release.mjs`, the [ownership register](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/ownership-register.md)). It fails today, by design, until the owner's values are in.

---

### Step 2: Documentation & Roadmap Synchronization

Always update the project documentation to reflect your changes:

1. **Release Notes** ([docs/release-notes.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/release-notes.md)):
   - Add new features, bug fixes, or behavioral changes to the active version block (e.g. `v260922`).
2. **Project Roadmap** ([docs/roadmap.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/roadmap.md)):
   - Mark completed checklist items with `[x]`.
   - Update the Progress Dashboard status table.
   - Add any newly discovered follow-up tasks or edge cases to upcoming milestones.
3. **User & Developer Guides**:
   - Update [README.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/README.md) if installation steps, CLI arguments, or high-level features changed.
   - Update [docs/capture.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/docs/capture.md) if the Auto-Capture Studio, recording guidelines, or discovery workflow changed.
   - Update [processing/README.md](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/README.md) if Python modules or CLI parameters changed.

---

### Step 3: .gitignore & Git Hygiene

Always check the repository working tree before reporting task completion:

1. Run `git status` to inspect modified and untracked files.
2. If your task generated new temporary files, test outputs, trial JSONs, session recordings, or cache directories:
   - Add their patterns to [.gitignore](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/.gitignore) and [processing/.gitignore](file:///c:/Users/micro.VADER/Documents/Projects/apex/recoil/processing/.gitignore).
   - Never leave loose intermediate debug scripts or dump files in the repository root.

---

### Step 4: Code & Comment Preservation

- **Maintain Comments**: Never delete or rewrite existing code comments, docstrings, or license headers that are unrelated to your current changes.
- **Clickable File Links**: Always cite files with clickable markdown links (`[filename](file:///path/to/file)`) using forward slashes for Windows compatibility.

---

## Where this project differs from the general rules

The general rules are the ones every project follows (the agent kit's `RULES.md`, not merged into this project yet). Each exception names the rule it overrides.

- **The Studio's live capture is checked by hand** (owner, 2026-10-24: "Keep the general rule unchanged and add an exception"). It overrides *No guessing, no manual steps* and *A session at the owner's keyboard checks as it goes*, which want every check automated, or a tool that checks each step live rather than a checklist; both still hold for everything else here. Headless browsers can't share the game window, hear its sound or record it, so after a change to the live capture a person runs [docs/studio-capture-check.md](docs/studio-capture-check.md) with the game (Step 1, item 4).
