# LLM & AI Agent Guidelines

## This project

<!-- This project's own part: everything in this file outside the agent-rules markers. The general rules
     refer to these headings by name. -->

Spraydown (owner, 2026-10-25: "The name wll be Spraydown no? I have a domain now. spraydown.click") trains recoil control for Apex Legends in the browser: players practice each weapon's spray on a range, with scores, a library of every pattern and their progress kept in the browser. The specs' maintainers record sprays in the game with the Studio, and the Python discovery pipeline turns them into the patterns that the trainer, the Studio and the Arduino export share in `client/specs.json`. It is based on apex-recoil (Apache-2.0, see `NOTICE`): files that hold its code keep the original copyright header and say they were modified. A weapon's spec is never lost or changed silently: every save is a new version.

### Where things are kept

- **The plan:** [docs/roadmap.md](docs/roadmap.md), the only place progress is tracked (owner, 2026-10-25: "Yes, fix the process tracking to match agent kit guidelines"). Under its corrections banner, its **Progress Dashboard** has a row for each milestone and for each phase of M10 and M11, and *Detailed Milestones & Tasks* has a box for each step: M11's carry the step ids of its plan, and every new step takes the next id in its phase. The two largest milestones also have plans of their own, which hold each phase's scope and decisions and track nothing: [docs/migration-plan.md](docs/migration-plan.md) (M10, the platform overhaul) and [docs/ui-migration-plan.md](docs/ui-migration-plan.md) (M11, the UI rebuild).
- **The corrections doc:** [docs/corrections.md](docs/corrections.md), what turned out to be true where the plan said otherwise, numbered C1, C2 and on. It outranks the plan, and each correction has a row in the banner at the top of the roadmap.
- **The architecture doc:** [docs/architecture.md](docs/architecture.md): the parts and how they talk, the specs' store, the analyses, the pages' prerendering and routing, and the code folder by folder.
- **Notes for the pages and the server:** [docs/ui-notes.md](docs/ui-notes.md), their notes doc since the UI rebuild: the design references, the conventions to keep and the pitfalls already paid for.
- **The design:** its source of truth is two private claude.ai artifacts, the design canvas and the Design System, which Claude reads with the Artifact tool. Where they disagree with each other, with the written spec ([docs/ui-redesign.md](docs/ui-redesign.md)) or with the code, the Design System wins (owner, 2026-10-25: "fix it to match the design system artifact, that's the ground truth for design choices"): bring the others in line with it. A change to the Design System itself is the owner's decision. Every other assistant uses their snapshot in [docs/design/](docs/design/README.md): PNGs of every screen and component, with the brand book, tokens and component rules, made by `scripts/export-design.mjs` ([docs/design/README.md](docs/design/README.md) says how).
- **Real data:** the weapon specs. `data/recoil.db` (SQLite, gitignored) keeps every version of each, with its audit history. Every save writes the active specs to `client/specs.json`, the committed text snapshot that the trainer, the Python pipeline and the Arduino export read, and keeps the file's previous contents in `client/specs.json.bak`. Edits made to `client/specs.json` outside the API (the Python CLI, a git pull, a hand edit) become new versions before the server's next read or write, so an older version comes back by putting back its `client/specs.json`. The captures, the Studio's recordings and wall screenshots, are kept in `processing/captures/`, or in an S3 bucket with `STORAGE_PROVIDER=s3`.
- **Shared contracts:** `shared/api.ts`, the API's zod schemas, which the server and the browser (through `client/lib/api/schemas.ts`) both use, with `shared/requests.ts` reading requests by them; and the shape of `client/specs.json`, which the trainer, the Studio, the Python pipeline and the spec store share and `python -m recoil_discovery.cli verify` checks.
- **The placeholders:** [docs/ownership-register.md](docs/ownership-register.md) lists each value only the owner can give, and where it is: `site.json`, `NOTICE`, the copyright headers and the pages' documents.
- **Generated output**, all gitignored: `dist/` and `dist-ssr/` (`pnpm build`), `static/` (`pnpm static`), `test-results/`, `playwright-report/` and `blob-report/` (Playwright), `.lighthouseci/` and `lighthouse-results/` (Lighthouse), `graphify-out/` (the code graph), and the JSON files the discovery CLI writes (`*_trial.json`, `*_aggregated_spec.json`; the rest is listed in `.gitignore` and `processing/.gitignore`). Two generated files are committed, because lint and format read them before any build: `client/styles/design-tokens.css` and `client/lib/cn-tables.ts`, which `vite.config.mjs` generates from the design tokens (`client/styles/tokens.json`). Never edit them.

### Checks

Use pnpm, not npm: `package.json` pins pnpm 12 and npm refuses to run here (`EBADDEVENGINES`). Each check runs from the root unless it names a folder, and CI (`.github/workflows/ci.yml`) runs it on Ubuntu and on Windows unless it says otherwise. A pull request runs only the jobs its files can affect (the workflow's `changes` job: the web checks and Lighthouse unless it changes `processing/` alone, the pipeline's tests when it changes the pipeline, `client/specs.json` or `arduino_mouse/`), while the end-to-end jobs and the agent files' check always run, and a push to `main` runs everything (owner, 2026-10-25: "ci path filters work").

- **Python unit tests and shadow parity**, in `processing/`: `python -m pytest tests` and `python -m recoil_discovery.shadow_parity`. All 43 unit tests pass with 0 errors, and all 31 weapons pass full-document shadow parity (0.000000 coordinate drift, identical fields and order). The tests run on temporary databases; only `shadow_parity` reads `data/recoil.db`, after importing into it any edit made to `client/specs.json` (with `--no-sync` it only reports the drift).
- **The specs' schema**, in `processing/`: `python -m recoil_discovery.cli verify`, whenever `client/specs.json` or the logic around specs changes. Every weapon shows `Status: OK`.
- **Node tests**: `pnpm build && pnpm test`. All 72 tests pass, across the database, queue, storage, request parsing, API, server, settings and prerender suites (`test/*.test.ts`, `node:test` running the TypeScript as it is). Without a build first, the two bundle tests are skipped: the trainer split from the Studio, and the new pages' first load (at most 200 kB of JavaScript, gzip). Tests never write to `data/recoil.db` or `client/specs.json`: give `createApp()` and the services throwaway paths, as the existing tests do. After a change to the job queue, storage, uploads or the discovery endpoints, also run the Redis, S3 and end-to-end suites: `docker compose up -d && pnpm test:services` (86 tests in all). CI runs them on Ubuntu only: their services are Linux containers, which Windows runners can't run.
- **Unit, component and end-to-end tests**: `pnpm test:unit`, then `pnpm build && pnpm test:e2e`. All Vitest tests pass, and all 59 Playwright scenarios pass in Chrome (`e2e/trainer.spec.ts`, `e2e/patterns.spec.ts`, `e2e/progress.spec.ts`, `e2e/docs.spec.ts`, `e2e/gallery.spec.ts`, `e2e/studio.spec.ts`; what every scenario fails on is in `e2e/fixtures.ts`). They run the app on throwaway data (`e2e/server.mjs`) and need Python with the processing requirements for the discovery runs (skipped locally without it, required in CI). The Studio's live capture can't run headless: after a change to it, run [docs/studio-capture-check.md](docs/studio-capture-check.md) by hand (*Where this project differs from the general rules*). CI also runs Lighthouse on the pages, on Ubuntu (`lighthouserc.json`): 90 or more for performance and accessibility on the desktop profile.
- **Types, lint and formatting**: `pnpm tsc`, `pnpm lint` and `pnpm format:check`. No TypeScript errors in the three configs (`tsconfig.json` for the browser, `tsconfig.node.json` for tool configs and `e2e/`, `tsconfig.server.json` for `server/`, `shared/` and `test/`), no ESLint errors or warnings, and every file Prettier formatted (`pnpm format` fixes it). `pnpm lint` also runs `scripts/check-conventions.mjs`: `client/styles/app.css` is the only stylesheet (with the generated `design-tokens.css`), it has no `@apply`, and the client has no hex colors and no `dark:` classes.
- **The build**: after a change to CSS, TypeScript or the bundling, `pnpm build` (the client into `dist/`, the new pages' prerender into `dist-ssr/`) or `pnpm static` succeeds. A release (not every change) goes through `pnpm release`, which fails while placeholders remain in `site.json`, `NOTICE`, the copyright headers or the pages' documents (`scripts/check-release.mjs`, the ownership register); CI runs it for a version tag (`v*`). It fails today, by design, until the owner's values are in.
- **Known vulnerabilities in the locks**: `pnpm audit` for `pnpm-lock.yaml`, and `pip-audit -r processing/requirements.txt --require-hashes --disable-pip` for the pipeline's (pip-audit 2.10.1, installed beside the project, never in its lock). Neither finds any. `.github/workflows/audit.yml` runs both on each change and every Monday, on Ubuntu only: a lock's advisories are the same on every system. A fix that a dependency doesn't take (it pins the vulnerable version) is an override in `pnpm-workspace.yaml`, kept only once the build is proven unchanged by it.
- **The agent files**: `python scripts/agent_kit.py check --doc docs/architecture.md --doc docs/capture.md --doc docs/code-of-conduct.md --doc docs/contributing.md --doc docs/corrections.md --doc docs/faq.md --doc docs/ownership-register.md --doc docs/playbooks.md --doc docs/privacy-policy.md --doc docs/studio-capture-check.md --doc docs/ui-notes.md --doc docs/ui-redesign.md --doc docs/weapons-wiki-stats.md --history docs/roadmap.md --history docs/migration-plan.md --history docs/ui-migration-plan.md --history docs/release-notes.md --history docs/changelog.md --history docs/history/upstream-release-notes.md`: the three agent files agree, the general rules are as installed, Claude Code's hooks are in place, the linters and formatters leave the kit's files alone, and the docs name only what exists. CI runs it in a job of its own, on Ubuntu and Windows, for every change (owner, 2026-10-25: "CI - yes, as you recommend", once the kit's fixes were merged).
- `python scripts/agent_kit.py outdated`: whether the kit changed since it was installed here, and what an update would change. It needs the kit's repository, so it is not for CI.

### Which doc to update

| What changed | What to update |
|---|---|
| A new feature, a bug fix or a change in behaviour | [docs/release-notes.md](docs/release-notes.md): the active version block (e.g. `v260922`) |
| Installation steps, CLI arguments or the high-level features | [README.md](README.md) |
| The Studio, the recording guidelines or the discovery workflow | [docs/capture.md](docs/capture.md) |
| The Python modules or their CLI parameters | [processing/README.md](processing/README.md) |
| A file or folder of the code added, moved or removed, or how the parts talk | [docs/architecture.md](docs/architecture.md): its parts and flows, and *The code, folder by folder* |

### Project shape

- **The pages** (`client/`): React 19 with Tailwind 4 and shadcn/ui, which replaced the old pages in the UI rebuild (M11, Phases 0 to 5). `pnpm build` builds them with Vite 8 into `dist/` and prerenders them into `dist-ssr/`. The trainer is at `/`, `/ru` and `/zh-CN`, with `/patterns` and `/progress` after each; the privacy policy, FAQ and changelog at `/privacy`, `/faq` and `/changelog`; the Studio, for the specs' maintainers, at `/editor`; and the components' gallery at `/next/components`.
- **The server** (`server/`): Express 5 in TypeScript, which Node runs as it is; `server/main.ts` starts the app that `createApp()` in `server/app.ts` builds. `pnpm start` serves the built pages and the API on port 3000 (or `PORT`; without it, the next free port up to 3010), and `pnpm dev` the client's sources through Vite with hot reload. Both listen on 127.0.0.1 only and refuse a request addressed to any host but this computer, since there is no sign-in yet. Its settings come from the environment or `.env` (`.env.example`); `server/settings.ts` lists every one, with what it takes and when it is required, and checks them before the server or a worker starts, so a missing or malformed one stops the start with a message naming it (owner, 2026-10-25: "4.9 - yes, check at start."). A setting the server starts reading goes in that list, or `test/main.test.ts` fails.
- **The job queue and storage**: analyses run in the server's process, or on Redis/BullMQ workers with `REDIS_URL` (the server runs one embedded worker, and `pnpm worker` starts more: `server/worker.ts`). Captures are kept on disk, or in S3-compatible storage with `STORAGE_PROVIDER=s3`. `compose.yaml` runs Redis and SeaweedFS (for S3) for this scaled mode and for `pnpm test:services`.
- **Shared** (`shared/`): the API's zod schemas, used by the server and the browser.
- **Discovery** (`processing/`, Python with OpenCV): the `recoil_discovery` package, which the server starts for each analysis, and its CLI, run from `processing/`: `python -m recoil_discovery.cli` with `verify`, `diff`, `process`, `batch`, `session` or `export-arduino`, which writes `arduino_mouse/src/recoil.inc` from `client/specs.json`. Its packages are locked with their hashes in `processing/requirements.txt`, which `uv pip compile` makes from `processing/requirements.in` (the command heads both files); `pip install -r requirements.txt` installs exactly them, and CI adds `--require-hashes`.
- **The Arduino firmware** (`arduino_mouse/`): a separate PlatformIO project, which reads the patterns `export-arduino` writes.
- **The static site**: `pnpm static` (`scripts/build-static.mjs`) writes `static/` for a static host, without the Studio's capture or saving.
- **The tests**: `test/` (`node:test`, the server), the `*.test.ts` and `*.test.tsx` files beside the client's code (Vitest), `e2e/` (Playwright; `e2e/server.mjs` runs the app on throwaway data on ports 3210 and 3211) and `processing/tests/` (pytest).
- **The rest**: `scripts/` (the static build, the conventions and release checks, the design export, the Markdown plugin and `agent_kit.py`), `brand/` (the logo and its sources), `assets/` (the game's images and sounds, not under Apache-2.0), `etc/` (the favicons, copied into the static site) and `docs/`.

### Where this project differs from the general rules

Each exception names the general rule it overrides.

- **The Studio's live capture is checked by hand** (owner, 2026-10-24: "Keep the general rule unchanged and add an exception"). It overrides *No guessing, no manual steps* and *A session at the owner's keyboard checks as it goes*, which want every check automated, or a tool that checks each step live rather than a checklist; both still hold for everything else here. Headless browsers can't share the game window, hear its sound or record it, so after a change to the live capture a person runs [docs/studio-capture-check.md](docs/studio-capture-check.md) with the game (*Checks*).
### Rules for this project

- **Only erasable TypeScript on the server.** Node runs the server's TypeScript without compiling it, so only erasable syntax works there (no enums, namespaces or parameter properties), and imports name the `.ts` file.
- **The mathematical invariants hold in every change**: the Source Engine scale factor, `K_px_to_mouse` = 3.36 (or 0.2976 px/mickey; `COUNTS_PER_PIXEL_1080P` in `client/studio/model/calibration.ts`); the Havoc TC's multiplier, 0.73 (y end -393.11); and the Arduino PROGMEM bound, exactly 55 elements per weapon array (`MAX_LENGTH` in `arduino_mouse/src/main.cpp` and in `export-arduino`).
- **Both .gitignore files.** Temporary files, test outputs, trial JSONs, session recordings and cache folders that a change generates are gitignored in `.gitignore` and in `processing/.gitignore`.

<!-- BEGIN:agent-rules from github.com/SphyrLabs/llm-workflow/agent-kit, sha256:916c3e16dc29. Change them there, never here: an update replaces everything up to the END marker. -->
## How these rules work

These are the general rules for every assistant (Claude Code, Codex, Gemini, Antigravity or
any other) and every person working in this repository. They are the same in every project
that uses them. This project's own rules are everything in this file outside the markers
around these.

- **This project's own rules win.** Where they say something different, follow them. Each
  such difference is listed under *Where this project differs from the general rules*, so
  neither text is followed by accident.
- **A rule about something this project does not have** (a plan, a UI, real data, an outside
  system) applies once it has one.
- **The general rules are changed only where they come from** (the marker names it), never
  here: an update replaces everything between the markers, and
  `python scripts/agent_kit.py check` fails when they were edited in place. The project's
  linters and formatters leave them alone, as they do the kit's hooks, script and settings:
  `check` fails on a config that would not. A rule only this project needs goes in its own
  part. A rule every project would need is for the owner to add to the general rules: propose
  it, and with the owner's yes bring it in by the kit's `HARVEST.md`, on a branch of the kit's
  repository. Nothing is committed to the kit's `main` (owner, 2026-10-25:
  "no changes to the agent-kit should be committed to main"): it changes only when the owner
  merges a branch.
- **When the kit has changed, the owner decides when to follow.**
  `python scripts/agent_kit.py outdated` says whether these rules, the kit's hooks or its
  settings changed since they were installed here, and Claude Code says so when a session
  starts, at most once a day. Tell the owner, and update (the kit's `MERGE.md`, again) only
  when they ask.
- **`AGENTS.md`, `CLAUDE.md` and `GEMINI.md` say the same thing.** Each assistant reads its
  own file, so everything outside the sections a tool writes for its own assistant (graphify's,
  for one) is identical in all three. Change `AGENTS.md`, then run
  `python scripts/agent_kit.py sync`; `check` fails while they differ.
- **The owner's word outranks every file.** When the owner decides something these files do
  not say, or say differently, do what the owner says, and write it into the rule it changes,
  in the same change (*Docs*).

## Finishing a change

**A change is not finished when the code works.** It is finished when the next person, or the
next agent, can find it, trust what the docs say about it, and not have to re-derive it. Every
step below is cheap. A stale doc costs someone an afternoon; a doc that is confidently wrong
costs more, because it gets believed.

Do all of these **before** reporting anything done.

1. **Run the checks** for whatever you touched (*Checks*, in this project's part). Report the
   real numbers, and say plainly if something failed or was not run.
2. **`graphify update .`** whenever code changed, if the project has a graph (`graphify-out/`).
   The graph is how the next question gets answered without grepping the tree.
3. **Update every doc the change makes wrong, in the same change** (owner, 2026-09-28: "there
   shouldn't ever be a reason that the docs become outdated"). This is for **any** code or
   structure change: a file, function, field, endpoint, command, flag, screen label or
   behaviour added, renamed, moved or removed, not only the ones that feel worth documenting.
   Never leave it for a follow-up, and never report done with a doc you know is wrong.
   - **Search, don't remember.** Search every name you touched across all the Markdown in the
     repository, and re-read the sections that describe what you changed (the table below)
     even where the name does not appear: a behaviour change leaves the old description
     behind without its name.
   - **Correct the sentence, don't append.** Not "add a note at the bottom": find the sentence
     that is now false and fix it, striking the old claim through (`~~ ~~`) where a reader
     might otherwise trust it.
   - **A wrong doc you come across is yours too**, whatever you came to change: fix it, or
     name it in your report. Never walk past it.
   - `python scripts/agent_kit.py check` fails when a present-tense doc names a file, a path
     or a function (`file.py::name`) that does not exist. It catches a stale name, not a stale
     description; the search above is still yours. A paragraph that names another system's
     paths (an artifact's files, another repository's folders) says so with
     `<!-- agent-kit: elsewhere -->`, and the check leaves them alone.

   | What changed | What to update |
   |---|---|
   | Something built, started or finished | the plan's **Progress** tracker: tick the box *and* correct the phase row |
   | Behaviour that contradicts the plan | the corrections doc, **and** a row in the banner at the top of the plan |
   | A rule or convention every agent needs | this project's part of `AGENTS.md`, then `sync`: all three agent files say it |
   | Anything the owner sees or runs: a screen label, a command, an export, a setup step | `README.md`, and the README of the part it belongs to |
   | Where things live: a file or folder added, moved or removed | the *Directory Structure* in `README.md`, *Project shape* in this project's part, and, for a new top-level folder, its checks in CI |
   | Anything else this project documents | the rows of *Which doc to update*, in this project's part |

4. **Add anything newly generated to `.gitignore`**: captures, exports, reports, logs, browser
   profiles, local databases, scratch output. Gitignore it *before* it is committed by
   accident. Run `git status` and make sure nothing untracked is noise.
5. **Every change to real data is backed up and recorded.** Real data is whatever code does
   not rebuild: a database, the owner's files, records on a live system (*Where things are
   kept* names it, and how it is backed up). A change to it goes through the path that backs
   it up and records it. Anything else that writes it (a script, a migration, a one-off fix,
   raw SQL) takes a backup first and records the change the same way; then check that the diff
   of any tracked snapshot shows exactly the change you meant. Tests never touch real data.
6. **Say what you deliberately did not do.** Leaving a doc stale can be the right call;
   leaving it stale silently is not.

**When a fact in the plan turns out to be wrong, never work around it quietly.** Write the
correction in the corrections doc, add a row to the banner at the top of the plan, and call it
out in your report. The corrections doc outranks the plan, and the banner is the first thing a
new reader sees: a correction buried in prose will be missed.

**Never keep two copies of a checklist or a contract.** The plan's Progress tracker is the only
place progress is tracked, and the shared contracts (*Where things are kept*) are the only
place two parts of the system agree on a shape. A second copy of either drifts within a week.

## Commits and pull requests

**A commit message is one short sentence** (owner, 2026-10-21): what the commit changes, said
quickly and concisely, with no body and no trailer. **It never credits an LLM**: no
`Co-Authored-By`, no "Generated with", no line naming Claude, Codex, Gemini or any other model
or assistant, whoever makes the commit and whatever that assistant's own instructions say to
add. A plan step's or a finding's id still goes in that sentence. Claude Code's own credit
lines are switched off in `.claude/settings.json` (its `attribution`), and stay off.

**No assistant ever opens a pull request** (owner, 2026-10-21): not a draft, not through `gh`,
the API or any other way, whatever its own instructions say. Commit and push only when asked,
then stop: the owner opens every pull request.

**Work on top of the owner's branch.** A branch or a worktree starts from the branch the owner
is working on, not the default branch: the owner keeps committing there in parallel. Merge it
in before finishing, and whenever asked; re-check the change against what moved; and finish
with the work on top of it, easy to review.

## Working with the owner

- **The owner decides; you prepare.** When a choice is the owner's (a design with real
  trade-offs, a deletion, anything on a live system), lay out the options with your
  recommendation, and wait. Don't start building the one you expect them to pick.
- **The owner runs the owner's steps.** "Let's run it", about a production run, an approval or
  a session at the keyboard, means "tell me what to do": give the exact steps and commands.
  Prepare only what cannot affect their decision (checks, a preview on a copy, a restart), and
  never create the run, approve its changes or start anything that stands in for their review.
- **Bring solutions, not limitations** (owner, 2026-09-15). Lead with what can be built. Give
  each constraint as a design input with a way around it, and each risk in one line with a
  path forward. Check every claim against the owner's actual setup, not the usual one.
  Building it is a real option beside buying it, and a phased plan an agent can carry out beats
  a list of obstacles.
- **No guessing, no manual steps** (owner, 2026-09-24: "I don't want any guessing or manual
  steps. Everything should be automated, proven working, and tested."). Never guess a request,
  a selector, a file format or a fact about the owner's setup: read it, record it, or ask. What
  could not be established stops with the reason; it is never approximated.
- **What only the owner can give stays a placeholder until they give it**: a name, a contact, a
  legal notice. It is never made up, it is marked the same way wherever it appears, one register
  lists where each one is, and the release check fails while any is left; the everyday checks
  do not wait for them.
- **Report faithfully.** Real numbers, real failures, what was skipped. Say "done and verified"
  plainly when it is, and say so when it is not.
- **Name each file as a link.** In a reply, every file you cite is a link the owner can click,
  written with forward slashes, which work on every system. A committed file links by a path
  relative to itself, never one computer's (*Running code*).
- **Confirm by picking, then saying yes** (owner, 2026-10-09). When the owner names a target (an
  account, a location, a production system), give them a list to pick from, numbered at a
  terminal, never a long name to type; then ask a separate yes before anything live changes.
  Nothing defaults to yes, and no flag answers a production prompt ahead of time.
- **A session at the owner's keyboard checks as it goes** (owner, 2026-09-24). A tool the owner
  runs checks each step live, stops at the first problem with the evidence, and saves its
  progress so it can resume. It batches the owner's part into one sitting, and every prompt
  lets the owner add a note or go back a step. Never hand over a checklist to verify later.
- **Plans cover everything** (owner, 2026-10-17). A plan to fix what a review found also gives
  every area the review did not reach a review-and-fix step of its own (the files it reads in
  full, the risks to check, a rule to fix and test what it finds), and ends with a re-review of
  the whole tree.
- **One word for each thing.** Pick one name for each thing the owner reads, and use it on every
  screen, report and doc. Two words for one thing read as two things.
- **The owner's computer is the owner's** (owner, 2026-10-24). Anything outside the project
  (installed tools, the user environment and PATH, and the files in the home folder, such as
  `~/.claude/`, `~/.codex/`, `~/.gemini/` and `~/.agents/`) is suggested, with the exact command
  or change, and changed only with the owner's yes. A setting already there is never overwritten
  without showing what is there and what would replace it, and a secret is set by the owner
  alone.
- **One computer's own setup stays out of the shared files**: editor settings, shell tweaks and
  a machine's own paths belong in user-level config or `.claude/settings.local.json`, never in
  what the project commits. Claude Code's hooks are the exception (*Running code*): they come
  with these rules, so every computer has them.

## Working from the plan

- **Read first**: the plan, then these rules, then the architecture doc. For a question about
  the code, ask the graph before searching (*The code graph*).
- **One phase at a time, in order.** Don't start a phase until everything it depends on is done.
- **Start a phase with a short plan**: the goal, the files you will create or change, and the
  prerequisites you are relying on. A prerequisite only the owner can confirm, not yet
  confirmed, is a stop: ask.
- **A detail marked unconfirmed is confirmed before it is built on**: in a recording, a sandbox
  or the vendor's docs, with the result written in the corrections doc.
- **Keep the plan true as you go**: tick the tracker; mark what is built inside the phase, and
  what is left; strike through a prerequisite or a decision once it is answered, with the answer
  beside it; and add each follow-up or edge case you find to the phase it belongs to, never only
  to your report.

## Running code

- **A running process serves the code it started with.** Restart it, or run it with reload,
  after changing its code, before trusting an API response, an export or a screenshot from it.
- **Run each part from where its docs say** (*Checks*, *Project shape*). Code resolves its paths
  from its own location or an explicit setting, never from the folder it happens to start in.
- **Nothing committed names one computer** (owner, 2026-10-24): no absolute path, a drive letter
  or a home folder, in a committed file. Run a tool by its command (`graphify`, `node`), reach the
  project's files by paths relative to its root, and write the home folder as `~`; what works only
  with one computer's path goes in that computer's own settings (`.claude/settings.local.json`).
  `python scripts/agent_kit.py check` fails on one in the agent files or an assistant's settings.
- **Until it has a sign-in, a server listens on 127.0.0.1 only**, and refuses a request
  addressed to any other host.
- **Wait on a condition, never a fixed sleep**: poll for the state you need, with a timeout. A
  driven browser is waited on through its driver, which may deliver events only during its own
  calls.
- **Stop a long job between steps, never mid-change.** A stop is honoured before the next
  change, never by killing a process halfway through a write.
- **One user at a time for anything exclusive** (a browser profile, a device, a session): every
  way in takes the same lock before it starts, and a new way in takes it too.
- **No destructive command without a backup**: a restore, a migration, a drop, a mass delete.
  Never point a test, a script or a demo at real data unless that is its job.
- **Claude Code's hooks come with these rules** (owner, 2026-10-23), in `.claude/settings.json`
  and `.claude/hooks/agent-kit/`, both committed so every computer has them. A guard refuses a
  command that destroys what cannot be put back (a recursive or forced delete, a force push, a
  hard reset, a dropped table) and anything that would open a pull request; a second keeps
  graphify's LLM work on Gemini, and a check at the start of a session warns when this computer
  is not set up for it (*The code graph*); every shell command
  and its output is logged in `.claude/logs/`, which is gitignored because output can hold
  secrets; and a notification and a sound say when a turn ends or a permission is needed. **A
  refused command is never worked around**: find a way that loses nothing, or ask the owner.

## The code graph

When the project uses graphify (`graphify-out/`, `.graphifyignore`):

- **Ask the graph first**: for a question about the code, `graphify query "<question>"`,
  `graphify path "<A>" "<B>"` or `graphify explain "<concept>"` before searching the tree.
- **Keep it current**: `graphify update .` after a code change (*Finishing a change*). It reads
  code by its structure, with no model and no key.
- **Its LLM work runs on Gemini, never on Claude** (owner, 2026-10-24). graphify's semantic pass
  over docs, papers and images, and the naming of the graph's communities, go through
  graphify's Gemini backend: `graphify extract . --backend gemini`, then
  `graphify label . --backend gemini`, with `GEMINI_API_KEY` in the computer's user environment
  (a secret: never in a repository, never typed by an assistant) and `GRAPHIFY_GEMINI_MODEL`
  set to `gemini-3.5-flash-lite`. Gemini may also do that work itself when it is the assistant, in
  Antigravity. No other assistant ever does it itself, whatever graphify's own skill says (it
  makes the assistant the model when it finds no key): no subagents reading files to write
  graphify's extraction, no names written for its communities, no `--backend claude` or
  `claude-cli`, and no `ANTHROPIC_API_KEY` for graphify. Claude Code's guard refuses all of
  these.
- **When Gemini is not ready, say so and stop there**: with no key, another model set, or
  graphify without its Gemini support, warn the owner (`python scripts/agent_kit.py doctor`
  shows which) and leave the semantic pass undone. A code-only `graphify update .` needs none of
  it, and goes on.
- **graphify belongs to the computer, not the project**: installed once per computer as a tool
  with its Gemini support (`pipx install "graphifyy[gemini]"`), never into a project's own
  environment, where it would run instead. Its setup for each assistant is installed with
  `--project`, so the hooks a project commits name plain `graphify`, never one computer's path.
- **`graphify-out/` is generated and gitignored**, and `.graphifyignore` keeps dependencies,
  builds and `scratch/` out of the graph.

## Tests

- **Test first.** A bug or a review finding gets a test that fails on the code as it is and
  passes with the fix, in the suite it belongs to. A finding's id goes in the test's docstring
  and in the commit message.
- **Every test runs in a sandbox of its own**, set up before the code under test is imported:
  every setting the code reads from the environment points at a throwaway or is unset. The
  setup keeps the list of those settings, and a test reads the source and fails when the code
  reads one the list lacks. A throwaway run's output, its backups included, stays beside its
  throwaway data.
- **No test reaches a real service or real data.** Use recorded fixtures with fake clients or
  fake servers; an unstubbed network call fails a unit test. An end-to-end suite starts every
  process on throwaway data, against fakes of the outside services that accept only the suite's
  own credentials.
- **A broken page cannot pass by accident.** Every end-to-end test fails on an uncaught error or
  a console error in the page, a failed request to the project's own server, or an accessibility
  violation (no page keeps a list of allowed ones), whatever else it checks. A test that expects
  one of them removes exactly that one.
- **One rule, two implementations, one set of cases.** When the same logic exists twice (two
  languages, client and server), both suites assert one shared fixture file, so neither can
  change alone. A change to one goes into both, with a test on each side.
- **A test fails when a list falls behind**: wherever something new must be registered (an
  action that must be previewed, a setting that must be sandboxed, a field a contract must
  name), a test enumerates them and fails on one that is not.
- **Golden files for output that must not move**: an export a change must not affect is
  compared with a committed copy.
- **A limit is a test.** A limit the project holds itself to (how much a page loads, a
  performance or an accessibility score) is measured by a check that fails past it, which CI
  runs, never judged by eye.
- **A convention is a check.** A convention the project settles on that its linters cannot see
  gets a script of its own in the lint step, which fails on each breach with the file, the line
  and what to do instead. A convention kept only in a doc drifts.
- **Test the check**: a test that guards something (the docs, a contract) has a case proving
  it catches what it is for.
- **A warning fails like an error.** The type checker, the linter and the formatter pass only
  with nothing to report, so a new warning shows the day it appears instead of joining the old
  ones.
- **CI runs every check, on every operating system the project runs on, and skips none.** A check
  that needs what a computer may lack (a tool, a service, a build) may skip itself on a computer
  without it, saying what it needs; in CI it fails instead, where a skip would pass in silence.

## Data safety

- **Every save leaves a backup and a version.** A bad write is a rollback, never a loss. A
  restore first backs up what it replaces, and leaves the version higher than before.
- **Commit a text snapshot, never the binary store.** When real data lives in a database, the
  repository tracks a text export of it as the recovery point, refreshed by every save, and
  only the real data writes it, never a test's throwaway.
- **A migration builds the new store beside the old one, verifies it, then swaps it in.** One
  that fails leaves the old store as it was. A migration that must not change values refuses to
  write if any would move. Once it has run everywhere it is deleted (git history keeps it), and
  loading the old shape fails with a message saying how to restore it.
- **Validate every write, and refuse rather than drop.** A write with a broken reference or an
  impossible value is refused with a clear message, never saved with the bad part silently
  dropped or coerced.
- **Read, change and save under one lock** whenever someone else may write in between, so no
  save is lost.
- **Never lose an edit to a concurrent save.** A save made against an older version is merged
  onto the newer one, stopping only where both changed the same value.
- **Originals are kept byte for byte.** A file the owner provides (a photo, a document, an
  import) is never modified or deleted by code. An edited version is a separate file that
  records its original and what was done to it, made with the owner's approval; nothing is
  cropped or converted automatically.
- **Off for now is not gone for good.** "Switched off here", "off everywhere" and "retired" are
  different states: never infer one from another. Deleting is a deliberate act the owner
  confirms.
- **A bulk change that would remove too much changes nothing**: an automated change that would
  clear or delete more than a sane share of something (a quarter, say) does none of it and says
  why.
- **Secrets and customer data stay out of git**: secrets in gitignored `.env` files beside a
  committed `.env.example`, encrypted at rest when stored, never in a recording or a log.

## External systems

When the project reads from or writes to a system it does not own (an API, a vendor's portal,
a point of sale, a third-party service):

- **The project's own data is the truth; the others are destinations.** A difference is pushed
  to them, never read back into the project's data, unless the owner says otherwise. The one
  thing taken from them is what only they can know, such as the ids they mint.
- **Every write follows one sequence**: build what should be there from the project's data; diff
  it against a fresh read; show the dry run, including what it will overwrite; the owner
  approves; apply; capture the ids the system minted; save, with a version note. Run again with
  nothing changed, it makes no writes.
- **Never guess a request.** Every write is built from a recorded real request (the owner doing
  it by hand, recorded), held to that shape by a test, and confirmed by reading the system back,
  never from its reply alone. A kind of change never recorded is reported as manual, and never
  sent.
- **Sandbox first.** A new kind of write is proven on a safe target (a sandbox, a test account)
  in a run the owner makes, and the proof gates it; a change to how a proven write is sent makes
  it unproven again. Production needs its own explicit setting and the owner's confirmation for
  that run, never set in a test or a script, and a first run there goes step by step.
- **Check what you read before acting on it** (a preflight). Every field the code depends on is
  there with its type, the data is the target's own, and it is complete by the system's own
  counts. If not, stop with nothing sent and print the command that shows the evidence. A field
  the code starts depending on joins that contract in the same change, with a recorded example
  (or the reason none can be recorded), and a test runs every request builder on the recorded
  replies and fails when one reads a field the contract does not name.
- **Plan from a fresh read**, and make only what was approved and a fresh plan still wants, with
  the same result. A partial or failed read is never "the latest". Before each change, re-read
  the live value, and skip it if it already matches.
- **Update a record by sending back what the system returned, with only your change**: never a
  record rebuilt from a form or a template.
- **An id belongs to the system that minted it**, and to the account or location it was minted
  for. An id you do not have is left blank, never filled with another one, and a name is never
  sent as an id. A made-up id is marked as made up, and never taken for a real one.
- **Match by id first, then by exact name only when exactly one record answers to it.** A name
  two records share matches neither. A near match is a suggestion a person confirms, never
  applied by itself; "not the same" is an answer too, remembered so it is not asked again. A
  tool that settles a tie by itself prints each choice and what it was chosen over.
- **What only they have is asked about**: a record the other system has and the project does not
  is listed first, its deletion unticked, and removed only once the owner confirms.
- **Never leave a half-made record live.** A record built in steps is created switched off,
  completed, then switched on; a failure on the way removes it again. A create that answered with
  an error is looked for before it counts as refused: it may exist.
- **Nothing reads as done while anything is left.** A change held back, a manual step, an id
  missing or a question unanswered is listed with why and counted; a run says before it starts
  what it will leave manual.
- **Compare only what can differ**: skip a difference only where both sides are known to
  normalise it (whitespace a system flattens), and treat a value the system did not send as
  unknown, never as zero.
- **Read an import for what it actually says**: a list of what is active somewhere is not the
  list of what exists.
- **Write down what is easy to get wrong** about the system (a "required" that is a count, an
  absence that means "everywhere") where the code reads it.
- **A read never writes.** A capture or a read changes nothing on the system, and discards an
  "unsaved changes" prompt.
- **Stamp what a run was planned by**, and refuse a run planned by older code.
- **Be a good client.** Keep to the system's rate limits and, on a 429, wait for its
  `retry-after`, then back off exponentially. Verify a webhook's signature first, with a
  constant-time comparison; answer it quickly, process it in the background, and drop
  duplicates by event id. Webhooks make events arrive sooner; a poller is what makes sure none
  is missed.
- **Drive a portal the way the owner would**: the owner signs in by hand, in a browser they can
  see; the tool never stores a password, never tries to get around a sign-in or a bot check
  (it pauses for the owner), never accepts an automatic crop or edit, leaves a few seconds
  between actions, logs every change, and keeps no cookies or credentials in a recording. Open
  pages by their direct addresses rather than clicking through from the home page, and move to
  an official API once there is one.

## Code design

- **One owner for every fact.** Each value, rule or term is computed or stored in exactly one
  place, and everything else asks it. Never re-derive a business question inline, and never
  add a second implementation of one that exists.
- **Shared by default, different on purpose.** Variants inherit one shared value unless one is
  explicitly overridden, so they agree without anyone keeping copies in step.
- **Variants are data, not code paths.** Channels, providers and plans are entries in a registry
  the code reads: adding one is an entry, never a branch or a schema change. A generated copy is
  made by one command, and a test fails while it is stale.
- **Reference by id; names are labels.** Records point at each other by id, so a rename cannot
  break a link; order is an explicit field; anything derivable is derived, never stored twice
  where the copies could disagree. A retired field stays blank, and no new code uses it.
- **`null` is not `0`, `false` or `""`.** Absent means "inherit" or "unknown"; zero is a value.
  Never collapse them with `||`, `or` or a truthiness test.
- **Money is integer cents** (or a decimal type) at every boundary, rounded at the points the
  system it must match rounds, by one rule every language shares. Languages break ties
  differently: Python's `round()` to even, JavaScript's `toFixed` away from zero.
- **Display changes only the display**: formatting for a screen, a printout or an export never
  changes the stored value.
- **Resolve a setting when it is used, never copy it at import.** A copied path or setting keeps
  one test's, one user's or one request's value for every caller; a test patches a setting where
  it is defined.
- **Check every setting when the program starts.** One list names each setting the program reads
  from its environment, with its type and when it is required; a missing or malformed one stops
  the start with a message naming it, never a failure at the first request that needs it. The
  check only gates the start: each setting is still read where it is used.
- **Compare paths safely**: on Windows, two paths on different drives make relative-path helpers
  raise; catch it, and normalise separators.
- **Shared runners, not copies.** When variants share a workflow, it is written once and each
  variant brings only its specifics.
- **Keep the working fallback** until its replacement is proven. A replacement that must not
  change what comes out is proven on every real input: the old and the new run side by side,
  and their whole outputs match, every field in the same order, with no drift.
  **Remove dead paths** (a feature reading a file nothing writes), recording why, so nobody adds
  them back.
- **New records are created complete**, through one constructor that fills every required part.
- **Leave the comments a change is not about.** Never delete or rewrite a comment, a docstring
  or a licence header unrelated to the change. One the change makes wrong is corrected in the
  same change, as a doc would be (*Finishing a change*).

## Screens the owner uses

When the project has a UI:

- **Every edit is previewed before it is saved.** Nothing writes until the owner saves; a
  dialog's edits wait for its own Save and go with its Cancel; a test lists every action that
  changes state, so a new one cannot skip the preview.
- **One place per job.** Steps that always follow each other share one screen and one
  vocabulary, and save in place. Other buttons open that screen, already scoped, never a second
  copy of it; where a combined view needs what a single view already shows well, it reuses that
  view whole.
- **Select all selects all.** A bulk action acts on every row, and first warns about the risky
  part (a deletion), with a way to leave it out. Rows that need a decision come first, with a
  summary and a filter for them.
- **Say what is needed, where it is needed.** A warning that something is missing appears only
  where it is needed, and the fix is offered where the problem is shown.
- **Poll one request at a time**, and drop a reply whose question is no longer asked.
- **A report is a page, not terminal output**: searchable, the truth beside what was found. A
  page that carries real data is self-contained and uploaded nowhere.

## Dependencies and CI

- **Install from the lock, as it is**: a lock with hashes, so the same packages install
  everywhere. To move a version, change the requirement, make the lock again with its own
  command, run the checks, and commit them together.
- **One package manager per part, its version pinned and enforced**, so each part has one lock:
  any other manager, or another version, refuses to run there rather than write a lock of its
  own. A dependency runs an install script only if it is allowed by name.
- **CI pins every action to its release's commit**, runs every check, and audits every lock for
  known vulnerabilities on each change and weekly.
- **Follow CI with the GitHub CLI** (owner, 2026-10-24: "so llms can see the ci notes/status"),
  where it runs on GitHub: after a push, find its run (`gh run list --branch <branch>`), look
  again until it ends (`gh run view <id>`), read a failed job's log
  (`gh run view <id> --log-failed`) before saying why it failed, and report the result with the
  push. Only the owner signs `gh` in. An assistant reads with it: anything that would change
  GitHub (a comment, a re-run, a merge) waits for the owner's yes, and a pull request is never
  opened. Without `gh`, or signed out, say so (`doctor` names the fix).

## Docs

- **`README.md` is the owner's way in**: what the project does, a Quick Start from a fresh clone
  to running, the checks, and a *Directory Structure* of where things live.
- **Keep the root clean** (owner, 2026-10-24). The root holds only what must be there: the
  README, the agent files each assistant looks for there (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`),
  a licence, the config files tools require at the root, the folders of the project's parts, and
  `docs/`, `scripts/` (where `agent_kit.py` is) and `scratch/`.
  The plan, the corrections doc, design and decision docs, notes, reports and prompts for agents
  go in `docs/`, and throwaway work in `scratch/`. A new file at the root needs a tool that
  requires it there.
- **The plan has one Progress tracker, at its top**, and it is the only place progress is
  tracked: a row per phase, a box per step, each step with an id that tests, commits and docs
  can name. Its banner lists every correction.
- **The corrections doc outranks the plan**: what turned out to be true is written there.
- **What an area has taught is written down for the next agent.** Work on an area that runs over
  many sessions keeps one notes doc for it in `docs/`, named in the agent files: the conventions
  to keep, and the pitfalls already paid for, each with what works instead. Read it before
  working in that area, and bring it up to date as you finish each piece of work there. What is
  left stays in the plan's tracker, the only place progress is kept (*Finishing a change*).
- **Every assistant can read what the work depends on.** A source of truth only one assistant can
  open (a design in an app it signs in to, a page only its connector reaches) has a snapshot in
  `docs/`, as images and text, made by one command and naming the version it was taken from. The
  assistant that can open the source works from it, since it may be newer, and refreshes the
  snapshot in the same change as any edit to the source. The others work from the snapshot,
  never edit it by hand, and note a change the source needs for the owner, or an assistant who
  can open it.
- **Docs describe the present.** History belongs to the plan, the corrections doc and git. A
  claim that stops being true is corrected where it stands, the old one struck through
  (`~~ ~~`) where a reader might still trust it.
- **A decision is written into the rule it changes**, with who made it, when, and in their own
  words: `(owner, 2026-09-28: "...")`.

## scratch/

`scratch/` at the repo root is throwaway agent workspace. It is always gitignored (owner,
2026-10-24: "Scratch folders should always be ignored actually"): in a project that does not
ignore it yet, add `scratch/` to `.gitignore` before putting anything there, with no need to
ask. Every tool that reads the whole tree but not `.gitignore` (ESLint's flat config, a test
runner, a type checker) leaves it alone too (owner, 2026-10-24: "Yes add the linter to
ignore"): add `scratch/` to its ignores the same way, or its checks read the kit's clone and
other throwaway work as the project's. `python scripts/agent_kit.py check` fails on an ESLint
config that would. Its contents are disposable, and **nothing may depend on it**: no test, no
script, no build step.
<!-- END:agent-rules -->

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
