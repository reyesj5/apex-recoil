# Ownership Register: Making the Project Our Own

*Created and applied 2026-10-22. This project started as a fork of apex-recoil by Mikhail Goncharov, published under the Apache License 2.0. Every reference to the original project or its author has been replaced with a placeholder; this page records what the owner still has to fill in, what stays because the license requires it, and what is left for later phases of the [UI migration](ui-migration-plan.md).*

## Values to provide

Names, links and IDs used by the pages live in [`site.json`](../site.json) at the repository root. The server ([`server/site.ts`](../server/site.ts)) and the static build pass it to every page, and the React app imports the same file. An empty link is hidden; a value in square brackets is shown as is until it is replaced.

| Value | Where | Used for |
| --- | --- | --- |
| `name`: `Spraydown` (placeholder) | `site.json` (page titles, server log), `NOTICE`, README, privacy policy, `package.json` (`spraydown`), the logo in `brand/` | The product name. To rename: change `site.json` and `package.json`, rebuild the logo with `python brand/source/build_logo.py --name <Name>` (see `brand/README.md`) and search the docs for "Spraydown" |
| `owner`: `[OWNER NAME]` | `site.json` (footer copyright), `NOTICE`, the 24 file headers (`Modified by [OWNER NAME], 2025-2026.`), privacy policy | The legal owner of the project and the controller under the GDPR |
| `siteUrl`: empty, `[SITE URL]` | `site.json`, README, privacy policy | The website address |
| `[DOMAIN]`, `[DEPLOY USER]@[DEPLOY HOST]:[WEB ROOT]` | `docs/playbooks.md` | Deployment and the nginx `server_name` |
| `contactEmail`: empty, `[CONTACT EMAIL]`, `[POSTAL ADDRESS]` | `site.json`, privacy policy | Privacy contact |
| `privacyUrl`: empty | `site.json` | Where the privacy policy is published (until the app has its own `/privacy` page, for example the policy's page in your repository) |
| `gaMeasurementId`: empty | `site.json` | Your Google Analytics 4 measurement ID |
| `faqUrl`, `changelogUrl`, `repoUrl`, `issuesUrl`, `communityUrl`, `supportUrl`, `videoUrl`: empty | `site.json` | Links in the trainer; each is hidden until set |
| `[ISSUES URL]`, `[SCRIPT URL]`, `[REVIEW: …]` | `docs/faq.md` | Issue tracker, an AutoHotkey script of your own, and how patterns are verified today |
| `[CONTRIBUTION TERMS: …]` | `docs/contributing.md` | A CLA, a DCO sign-off, or neither; until then Apache-2.0 section 5 applies |
| `[EFFECTIVE DATE]`, `[HOSTING PROVIDER]`, `[HOSTING LOCATION]`, `[LOG RETENTION]`, `[GA RETENTION]`, `[COOKIE LIFETIME]`, `[CONFIRM IN GOOGLE ANALYTICS: …]` | [`docs/privacy-policy.md`](privacy-policy.md) | Facts only the owner knows, and the Google Analytics settings to check |
| `[STORAGE PROVIDER]`, `[UPLOAD RETENTION]` | Privacy policy, section 6 | Only if the Studio is offered to the public; otherwise delete section 6 |

Analytics and its cookie banner stay off until both `gaMeasurementId` and `privacyUrl` are set, and they never load on the Studio.

To list every placeholder that is left:

```bash
git grep -nE "\[(App name|[A-Z][A-Z ]{2,}[A-Z])(\]([^(]|$)|[:,])" -- ':!etc/' ':!docs/ui-*.md' ':!docs/ownership-register.md'
```

## License and credit

The license text is summarized here; it is not legal advice.

- **`LICENSE` (Apache-2.0) stays**, unchanged.
- **The original copyright notices stay** (section 4(c)). When this register was written, 30 files carried `Copyright 2021 Mikhail Goncharov` (one wrote the name `Goncharov Mikhail`): `app.js`, 8 files in `client/`, the 11 editor modules, 4 stylesheets and 6 templates. The UI rebuild replaced most of them; on 2026-10-24 the notice is on the 24 files that hold code moved or ported out of them: the trainer's engine (`client/engine/`: pattern, point, run, stats, target, weapons), its range (`client/trainer/range/renderer.ts`, `sound.ts`) and its settings (`client/trainer/loadout.ts`); the Studio's logic ported from the editor modules (`client/studio/model/`: analysis, calibration, capture, detect, pattern) and its live capture (`client/studio/panels/use-live-capture.ts`); and the server split out of `app.js` (`server/app.ts`, `errors.ts`, `uploads.ts`, `analysis-params.ts`, and `routes/`: captures, discovery, jobs, pages, specs). Pages and panels written anew from the new design carry none, nor does code that only keeps the old storage keys or behaves as the old pages did.
- **Modified files say so** (section 4(b)). Each of those files has `Modified by [OWNER NAME], 2025-2026.` under the original line, in the file's own comment style. Code moved out of an original file keeps both lines; a file written from scratch needs neither.
- **Credit to the original, in one clean place per surface:**
  - [`NOTICE`](../NOTICE) at the root;
  - the License section of the README;
  - one footer line on the trainer pages: "Based on apex-recoil by Mikhail Goncharov, Apache License 2.0", linked to the original repository.
  The original has no NOTICE file, so the license does not require a credit in the product; this keeps the origin visible without branding the app with it.
- **The EA disclaimer stays** in the footer, and the README's note that the game art in `assets/` is not covered by Apache-2.0 stays.

## "Apex Legends" in the name

The trainer is for Apex Legends, and saying so is fine and useful: "a recoil trainer for Apex Legends" describes the product. The concern is only about using the game's trademark as the brand itself, as in "Apex Legends Recoils". A product name that starts with the trademark reads like an official EA product, and the footer disclaimer does not undo that. A name of your own, with "for Apex Legends" in the tagline and page descriptions, avoids it and still works when more games are added.

## Register

Status: **Will** changes for certain, **Should** is recommended, **Could** is optional.

| # | Item | Where | Was | Now | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Google Analytics property | `etc/tarteaucitron_init.js` | The original author's ID `G-961MVSXWCZ` | `gaMeasurementId` in `site.json`; analytics off until set | Will · **done** |
| 2 | "Support" donation link | Trainer header | The original author's PayPal button | `supportUrl`, hidden until set | Will · **done** |
| 3 | Privacy policies | `docs/privacy-policy*.md` | The original's policies, naming him as controller | A new policy with placeholders; the German copy is deleted | Will · **done**, values to provide |
| 4 | Cookie banner | `views/layout.pug`, `etc/tarteaucitron_init.js` | tarteaucitron with the original's policy and ID | The app's own consent banner (Phase 2, 2026-10-24); tarteaucitron is gone. The choice is kept in local storage (`consent:analytics`) for 12 months, as the privacy policy says | Will · **done** |
| 5 | Author credit | Trainer footers | "© … Mikhail equanimity_rulez Goncharov" | `© <year> [OWNER NAME]` and the "Based on apex-recoil" credit | Will · **done** |
| 6 | Links to the original repository | Trainer pages, `docs/faq.md`, `.github/ISSUE_TEMPLATE.md` | FAQ, issues, release notes, repository | `faqUrl`, `changelogUrl`, `repoUrl`, `[ISSUES URL]`; in-app pages in Phase 2 | Will · **done** |
| 7 | Reddit launch post and icon | Trainer footer and phone text | The original author's post | A text link to `communityUrl` if set | Will · **done** |
| 8 | YouTube overview | Trainer instructions | The original author's video | `videoUrl`, hidden until set | Will · **done** |
| 9 | Live site | README | `apexlegendsrecoils.net` | `[SITE URL]` | Will · **done** |
| 10 | Deploy target | `docs/playbooks.md` | `root@46.101.102.179`, the original's domain | `[DEPLOY USER]@[DEPLOY HOST]:[WEB ROOT]`, `[DOMAIN]` | Will · **done** |
| 11 | Contribution terms | `docs/contributing.md` | The original's CLA | `[CONTRIBUTION TERMS]`; Apache-2.0 section 5 meanwhile | Will · **done** |
| 12 | Old-domain redirect | `client/bootstrap.ts` | Sent visitors on any `.online` host to the original's site | Removed | Will · **done** |
| 13 | Product name | Page titles, headings, README title, server log | Descriptive names around "Apex Legends Recoils" | `name` from `site.json`, "Spraydown" for now; "for Apex Legends" as the descriptor | Will · **done** with the placeholder name |
| 14 | Logo and favicons | `etc/favicon*`, `etc/apple-touch-icon.png`, header | The original's icons | The Spraydown mark and wordmark (`brand/`): the favicons, and the logo in the trainer's and the Studio's top bars (`SpraydownLogo`) | Will · **done** with the placeholder name |
| 15 | FAQ voice | `docs/faq.md` | The original author in the first person | Neutral wording; `[REVIEW]` on pattern verification | Should · **done**, review |
| 16 | Release history | `docs/release-notes.md` | Includes the original's versions and Reddit launch | Moved to `docs/history/upstream-release-notes.md`; the players' changelog is `docs/changelog.md` (`/changelog`), and `docs/release-notes.md` keeps this project's own versions | Could · **done** (2026-10-24) |
| 17 | Package name | `package.json` | `"name": "app"` | `spraydown`, follows the name | Should · **done** with the placeholder name |
| 18 | Identifiers containing `apex-recoil` | `compose.yaml`, `.env.example`, the server, tests | `apex-recoil`, `apex-recoil-bucket`, `apex` | The final name's slug, once there is one: compose's project name (its volumes' names follow it, so local Redis and S3 data start empty), the example bucket, the queue prefix's default (`RECOIL_QUEUE_PREFIX`, `apex`: jobs queued under the old prefix are left behind), the temporary folders (`apex_uploads`, `apex_session_`, `apex_job_`) and the tests' prefixes | Could · waits for the final name |
| 19 | Game art and sounds | `assets/` | EA content under the disclaimer | Keep; review the rights before any commercial use | Should · before launch |
| 20 | Third-party references | FAQ, trainer | EA, Respawn, Apex Legends Wiki, ArduinoXInput, a Reddit guide, a Desmos graph, a Google search link | Kept as useful references | Could |

## Progress

- 2026-10-22: items 1 to 12 and 15 applied with placeholders; `site.json`, `NOTICE`, the modification notices and the new privacy policy added. Waiting for the owner's values (table above) and a name.
- 2026-10-22: the placeholder name "Spraydown" (items 13 and 17) and its logo and favicons (item 14) applied; the server log and the processing README use the name too.
- 2026-10-24: the release history moved (item 16), and the original's notice placed on the 24 files that hold its code after the rebuild (an audit of the files' own provenance notes and of the code they share with the 30 originals: 17 of them lacked it). `pnpm release` (and CI for a version tag) fails while a placeholder is left in `site.json`, `NOTICE`, the copyright headers or the documents the pages show ([scripts/check-release.mjs](../scripts/check-release.mjs)); `node scripts/check-release.mjs` lists them, 47 on that day (the 24 headers' `[OWNER NAME]` among them). Left for the owner: the values, the final name (then item 18), and item 19 before launch.
