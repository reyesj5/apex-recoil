# LLM & AI Agent Guidelines

This repository enforces a strict **Task Completion Protocol** for all AI coding assistants (Antigravity, Claude, Copilot, Cursor, etc.). Whenever you complete any task, bugfix, or feature, you **MUST** execute and verify each step in this workflow before concluding your response.

---

## ⚡ Mandatory Task Completion Protocol

Every AI agent working in this codebase must execute the following 4 steps after finishing code edits:

```
┌────────────────────────────────────────────────────────┐
│ 1. RUN AUTOMATED TESTS & TYPECHECKS                    │
│    • pytest in processing/                             │
│    • specs schema verification                         │
│    • TypeScript tsc typecheck                          │
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

Never consider a task complete without executing and passing these checks:

1. **Python Unit Tests**:
   ```bash
   cd processing
   python -m pytest tests
   ```
   *Requirement:* All unit tests must pass with 0 errors.

2. **Recoil Spec Schema Verification**:
   ```bash
   cd processing
   python -m recoil_discovery.cli verify
   ```
   *Requirement:* Must run whenever `client/specs.json` or spec-related logic is modified. All weapons must show `Status: OK`.

3. **TypeScript Typecheck**:
   ```bash
   npm run tsc   # or: cmd /c npm run tsc
   ```
   *Requirement:* 0 TypeScript compilation errors.

4. **Asset & Bundle Verification**:
   If Gulp, SCSS, or static bundling logic was altered, verify that `npx gulp public` or `npm run static` succeeds without crashing.

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
