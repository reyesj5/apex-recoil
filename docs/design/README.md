# Design References

*A snapshot of the design, exported 2026-10-24; [snapshot.json](snapshot.json) names the artifact versions it was taken from.*

The design lives in two private claude.ai artifacts, which are the source of truth:

- **Design canvas**, "Recoil Trainer Redesign" (https://claude.ai/artifact/3Uv9xgQocE1qqS2ohS2MQG): fourteen artboards. The trainer ready, after a run, its Progress and Patterns pages, a document page, the page not found and server error, and its dialogs (settings, help, weapon search); the Studio, its side panels in use, the analysis and the check before saving, and its shortcuts and new-weapon dialogs; the phone pattern viewer; Foundations; the logo.
- **Design System**, "Spraydown" (https://claude.ai/artifact/XK1KCFGz6tF9WzmKUykaFe): the tokens, the brand book, the mapping to Tailwind and shadcn/ui, 30 components with live previews, and the logos.

## Which one to use

- **Claude with the Artifact tool** (Claude Code signed in to the owner's claude.ai account): work from the artifacts, since they can be newer than this folder. Read them with the Artifact tool (`action: "list"` with `scope: "files"`, then `action: "read"`); WebFetch only reaches the login page. When you change an artifact, refresh this folder (below) in the same piece of work.
- **Any other agent** (Codex, Gemini, Copilot, Cursor, or Claude without the Artifact tool): use this folder. Look at the PNGs, and read the Markdown and source files for exact values. Don't edit them by hand; the next export overwrites them. If you change a design decision while building, record it in [ui-migration-progress.md](../ui-migration-progress.md) so a Claude session or the owner can update the artifacts.

Where the code moves past the design, the code and the progress report win until the artifacts catch up. As of this export the two agree: on 2026-10-24 the canvas gained the boards for every remaining screen and the Design System its overlays (Dialog, AlertDialog, Drawer, CommandPalette), the error toast and the run below the median, and the app follows them; `system/tokens.json` equals the app's `client/styles/tokens.json`.

## What's here

```
snapshot.json                       when this was exported, from which artifact versions
screens/<Board>.png                 each artboard as the canvas renders it:
                                    Main (trainer, ready), Result (after a run), Progress, Patterns,
                                    Document (FAQ, privacy, changelog), NotFound (also the server
                                    error), Dialogs (settings, help, weapon search), Studio,
                                    StudioPanels (side panels in use), StudioAnalysis (the analysis
                                    and the check before saving), StudioShortcuts (shortcuts, new
                                    weapon), Phone (pattern viewer), Foundations, Logo
screens/source/<Board>.dc.html      the artboards' markup: inline styles give exact sizes and colors;
                                    {{...}} values and <sc-for> lists are filled by the script at the
                                    end of each file; /_blob/... images are weapon art from assets/images
screens/source/canvas.json          board titles and sizes
system/README.md                    the brand book: principles, content, color, type, space and shape,
                                    states and motion, layout, icons, logo, accessibility
system/building.md                  how the tokens and components map to Tailwind and shadcn/ui
system/tokens.json                  the tokens (the app's copy is client/styles/tokens.json)
system/tokens.css                   the tokens as CSS variables, generated for the previews
system/components/bundle.css        the components as plain CSS (sd- classes) on the tokens
system/components/<Name>/README.md  each component's rules: anatomy, states, words, what to provide,
                                    and what to build it from in the app
system/components/<Name>/preview.html, preview.png
                                    its preview (an HTML fragment on bundle.css) and how it renders
system/assets/Logos/README.md       the logos and their use; the files themselves are in brand/
```

The Foundations board is 1440 × 1280 px and cuts off its last row on the canvas too. Two boards have a variant you switch on the canvas, and their PNGs show the default: Result (a run below today's median: the score and its pill turn neutral) and NotFound (the server error).

## Refreshing this folder (Claude only)

1. Read the Design System's files into a folder with the Artifact tool: `action: "read"` with `paths` set to every `project/...` file the file listing shows (`design-system.json` included). They land in `<folder>/project/`.
2. Read the canvas's `project/*.dc.html`, `project/canvas.json` and `artifact-type/dc-runtime.js` into a second folder (`out_dir`). Then download each image asset into `<that folder>/_blob`: list them with `action: "list"` and `scope: "assets"`, then read each one with `path` set to its id, since `paths` doesn't take asset ids.
3. Run `node scripts/export-design.mjs --canvas <second folder> --system <first folder> --canvas-version <v> --system-version <v>`, with the versions from the read results. It replaces `screens/` and `system/` and rewrites `snapshot.json`; this README stays. It renders with Chrome and needs the network for the fonts.
4. Look over the PNGs that changed, and update the date at the top of this README. The owner reviews and commits.
