"""Set a project up with the general agent rules and Claude Code's hooks, and keep its agent
files in step.

    python <kit>/agent_kit.py install <project> [--rules-only]   the rules in, and this computer's setup
    python scripts/agent_kit.py sync [--force]    CLAUDE.md and GEMINI.md say what AGENTS.md says
    python scripts/agent_kit.py check [--doc FILE] [--history FILE]
    python scripts/agent_kit.py doctor            what this computer needs: git, Node, gh, graphify on Gemini
    python scripts/agent_kit.py outdated [--record]  whether the kit changed since it was installed
    python scripts/agent_kit.py untrack [--yes]   stop committing anyone's own assistant setup
    python scripts/agent_kit.py clean [PATH...]   list scratch/, or delete what is named there
    python <kit>/agent_kit.py words WORD...       a harvest's new lines hold none of its project's words

`install` runs from the kit (a clone of the agent-kit repository), beside RULES.md, PROJECT.md,
MERGE.md, claude/ and skills/, with the prompt library beside the kit's folder (../prompts). In
an agent file it changes nothing outside the agent-rules markers, except to make a file that has
no rules of its own say what the others say. The project commits its rules alone: the kit's
setup for each person's assistants (its Claude Code settings, merged into
.claude/settings.local.json with everything else there kept, its hooks, and the prompt skill in
each assistant's skills folder) stays on that computer, and .gitignore keeps it out. It records
the rows it added there in
scripts/agent_kit.json, so a later install takes back only its own, and leaves a copy of this
file in the project's scripts/ for `sync`, `check` and `outdated`, which run from the project's
root. `outdated` clones the newest kit into a temporary folder and compares by a dry run of
install: it writes nothing in the project. `clean` deletes the throwaway work it is told to in
the project's scratch/, and nothing anywhere else, keeping any git work that is nowhere else.
Merging the project's own rules with the general ones takes judgment, so it is MERGE.md's, not
this file's. Standard library only.
"""

import argparse
import datetime
import difflib
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time

AGENT_FILES = ("AGENTS.md", "CLAUDE.md", "GEMINI.md")
#: Sections a tool writes into one assistant's file for that assistant alone. They may differ
#: from file to file, so `sync` keeps each file's own and `check` leaves them out.
TOOL_SECTIONS = ("## graphify",)
END = "<!-- END:agent-rules -->"
BLOCK = re.compile(r"<!-- BEGIN:agent-rules(?P<attrs>[^>]*)-->\n(?P<body>.*?)\n" + re.escape(END),
                   re.S)
#: A block another tool marks the same way (a framework's own rules): that tool's, not ours.
FOREIGN = re.compile(r"<!-- BEGIN:(?!agent-rules)(?P<name>[\w.-]+)[^>]*-->.*?"
                     r"<!-- END:(?P=name)[^>]*-->", re.S)
SCRIPT = "scripts/agent_kit.py"
#: What install added to the project's .gitignore, so a later install takes back what the kit no
#: longer has and never what the project had itself; and the kit's repository, for `outdated`.
#: Committed, and never a path.
RECORD = "scripts/agent_kit.json"
RECORD_ABOUT = ("Written by `python scripts/agent_kit.py install` and `sync`, never by hand: the "
                "rows the agent kit added to this project's .gitignore, so a later install takes "
                "back only its own; where the kit is, for `python scripts/agent_kit.py outdated`; "
                "and the fingerprint of what the agent files last said alike, so `sync` can tell "
                "its own copy from an edit.")
#: What install added to this computer's own Claude Code settings, so a later install takes back
#: only its own. One computer's, as those settings are: never committed.
LOCAL_RECORD = ".claude/agent-kit.json"
#: What the last `outdated --record` found, for the reminder at the start of a Claude Code session
#: (the kit's update-check hook). One computer's own: .claude/logs/ is never committed.
UPDATE_CHECK = ".claude/logs/agent-kit-update.json"
#: Claude Code's hooks from the kit. The folder is the kit's alone: every install replaces it.
CLAUDE_HOOKS = ".claude/hooks/agent-kit"
#: The prompt skill, which runs a prompt from the team's prompt library in the project, settling
#: its inputs first. One computer's own, as the hooks are: install writes it where the project's
#: skills are read, Claude Code's .claude/skills/ and the .agents/skills/ that Codex, Gemini CLI
#: and Antigravity all read (their docs, 2026-10-31: in a project Codex reads no other, and
#: Gemini CLI prefers it to .gemini/skills/), and each of those folders is the kit's alone. One
#: copy each: a second where an assistant reads both would show it twice. Its SKILL.md is the
#: kit's, with the library's catalog written in at its marker; the library is the prompts/ folder
#: beside the kit's own in its repository, copied word for word. A skill folder whose SKILL.md
#: lacks the kit's mark is someone's own skill of that name: install leaves it alone.
SKILL_SOURCE = "skills/prompt/SKILL.md"
SKILL_FOLDERS = (".claude/skills/prompt", ".agents/skills/prompt")
SKILL_MARK = "<!-- agent-kit: prompt skill"
LIBRARY = "../prompts"
CATALOG = "<!-- agent-kit: catalog -->"
#: Antigravity reads its workspace rules from .agents/rules/; this one sends it to AGENTS.md.
POINTER = ".agents/rules/agent-kit.md"
POINTER_TEXT = """---
trigger: always_on
description: Every rule for agents in this project is in AGENTS.md.
---

Before starting any task, read `AGENTS.md` at the workspace root in full, and follow it.
"""
#: Each person's own assistant setup, never committed (owner, 2026-10-28: "we don't need to commit
#: any local llm setups so that colleagues can run their own setup or sphyr's, but its up to them,
#: not us"): Claude Code's folder, with the kit's settings and hooks in it, Codex's, Gemini's and
#: Antigravity's, and graphify's .graphifyignore. A project commits its rules, the three agent
#: files; each person sets their assistants up, from the kit or their own way.
LOCAL_SETUP = [".claude/", ".codex/", ".gemini/", ".agents/", ".graphifyignore"]
#: Other assistants' setup, which the kit never makes but offers to stop committing all the same.
OTHER_SETUP = [".agent/", ".cursor/", ".windsurf/", ".mcp.json"]
#: Of LOCAL_SETUP, what the kit itself puts in a folder: kept out of git by name where the project
#: still tracks something else in that folder, so the kit's files are never committed with it.
KIT_LOCAL = {".claude/": [".claude/settings.local.json", LOCAL_RECORD, ".claude/hooks/agent-kit/",
                          ".claude/logs/", ".claude/worktrees/"],
             ".agents/": [".agents/rules/agent-kit.md"]}
for _folder in SKILL_FOLDERS:  # and the prompt skill, in each assistant's own folder
    KIT_LOCAL.setdefault(_folder.split("/")[0] + "/", []).append(_folder + "/")
del _folder
#: Above the rows `install` adds at the end of .gitignore, so a reader knows where they came from.
GITIGNORE_NOTE = "# Set by the agent kit (python scripts/agent_kit.py install)"
#: Never committed: throwaway agent work, the graph graphify generates, and the backups graphify's
#: installers leave beside each settings file they change (which still hold the old paths) and
#: beside each skill they replace (`<platform>/skills/graphify/SKILL.md.bak`, or Aider's
#: `.aider/graphify/SKILL.md.bak`, overwritten by each install).
GENERATED = ["scratch/", "graphify-out/", "*.graphify-bak", "**/graphify/SKILL.md.bak"]
#: The folder of throwaway agent work, at the project's root: `clean` deletes nowhere else
#: (RULES.md, *Cleaning up*).
SCRATCH = "scratch"
#: Tools that read the whole tree but not .gitignore, by the config files that say a project uses
#: them, with what a config holds when it reads .gitignore after all. Each must leave scratch/
#: alone itself (RULES.md, *scratch/*), or its checks read the kit's clone and other throwaway
#: work as the project's. A tool that reads .gitignore (Prettier, Ruff, Black) needs nothing.
TREE_TOOLS = (
    ("ESLint", ("eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts",
                "eslint.config.mts", "eslint.config.cts"), "includeIgnoreFile"),
)
#: What the kit installs and graphify's installers write, which the project's linters and
#: formatters leave as it is: every install replaces the kit's hooks and script word for word, a
#: formatter that re-wraps the general rules can change what they say (`*x*` becomes `_x_`), and
#: both write their settings in a layout of their own. A folder stands for the files in it.
TOOL_WRITTEN = AGENT_FILES + (POINTER, CLAUDE_HOOKS + "/", ".claude/settings.json",
                              ".claude/settings.local.json", LOCAL_RECORD, RECORD,
                              ".claude/CLAUDE.md", ".claude/skills/graphify/", ".codex/hooks.json",
                              ".codex/skills/graphify/", ".gemini/settings.json",
                              ".gemini/skills/graphify/", ".agents/skills/graphify/",
                              ".agents/rules/graphify.md", ".agents/workflows/graphify.md"
                              ) + tuple(folder + "/" for folder in SKILL_FOLDERS)
#: Linters and formatters that would change some of it unless their config says not to: each with
#: its own config files, the section that says a shared pyproject.toml configures it, what it
#: would read, and the word whose mention in its config leaves that alone.
CODE_TOOLS = (
    ("ESLint", TREE_TOOLS[0][1], None, CLAUDE_HOOKS + "/", ".claude"),
    ("Ruff", ("ruff.toml", ".ruff.toml"), "[tool.ruff", SCRIPT, "agent_kit"),
    ("Black", (), "[tool.black", SCRIPT, "agent_kit"),
)
#: What says a project formats with Prettier, besides package.json; and the files it formats, by
#: their extension (it passes over the rest).
PRETTIER = (".prettierrc", ".prettierrc.json", ".prettierrc.json5", ".prettierrc.yaml",
            ".prettierrc.yml", ".prettierrc.toml", ".prettierrc.js", ".prettierrc.cjs",
            ".prettierrc.mjs", ".prettierrc.ts", ".prettierrc.cts", ".prettierrc.mts",
            "prettier.config.js", "prettier.config.cjs", "prettier.config.mjs",
            "prettier.config.ts", "prettier.config.cts", "prettier.config.mts", ".prettierignore")
FORMATTED = (".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx", ".json", ".json5",
             ".jsonc", ".md", ".mdx", ".yaml", ".yml", ".css", ".scss", ".less", ".html", ".vue")
#: The kit's files every project gets or follows, where a harvest looks for its project's words.
GENERAL_FILES = ("RULES.md", "PROJECT.md", "MERGE.md", "HARVEST.md", "claude/settings.json",
                 SKILL_SOURCE)
#: Settings files whose hook commands graphify writes. A command that runs one computer's graphify
#: by its path (`C:/Users/<name>/.local/bin/graphify.EXE hook-check`) is made to run plain
#: `graphify`, found on each computer's PATH.
HOOK_SETTINGS = (".claude/settings.json", ".codex/hooks.json", ".gemini/settings.json")
GRAPHIFY_BY_PATH = re.compile(
    r'^\s*(?:"(?:[A-Za-z]:[\\/]|/)[^"]*?[\\/]graphify(?:\.exe)?"'
    r'|(?:[A-Za-z]:[\\/]|/)[^"\s]*?[\\/]graphify(?:\.exe)?)(?=\s|$)', re.I)
#: An absolute path that names one computer: a drive letter (never a URL's scheme), or a home
#: folder on macOS or Linux. A placeholder such as /Users/<you>/ is not a path.
MACHINE_PATH = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/](?![\\/])[^\s\"'`<>|]*"
                          r"|(?<![\w.~-])/(?:home|Users)/[^/\s\"'`<>]+/[^\s\"'`<>]*")
#: Where an assistant's committed setup lives; `check` looks there, and in the agent files, for a
#: path that names one computer.
TOOL_SETUP = (".claude/settings.json", ".claude/CLAUDE.md", ".claude/hooks/", ".claude/skills/",
              ".claude/agents/", ".claude/commands/", ".codex/", ".gemini/", ".agents/", ".mcp.json",
              RECORD)
#: Each assistant's global rules file, under the home folder, with the folder that says it is used.
GLOBAL_RULE_FILES = ((".claude", "CLAUDE.md"), (".codex", "AGENTS.md"), (".gemini", "GEMINI.md"))
#: What graphify leaves out of the graph, for a project with no .graphifyignore of its own.
GRAPHIFYIGNORE = """node_modules/
.venv/
venv/
.next/
dist/
build/
coverage/
__pycache__/
.pytest_cache/
scratch/
graphify-out/
.claude/logs/
"""
#: graphify's LLM work runs on this Gemini model (owner, 2026-10-24), and needs at least this
#: graphify: its --project installs name plain `graphify` in the hooks a project commits.
GEMINI_MODEL = "gemini-3.5-flash-lite"
MIN_GRAPHIFY = (0, 9, 57)
GRAPHIFY_INSTALL = 'pipx install --force "graphifyy[gemini]"'
#: Assistants follow CI with the GitHub CLI (owner, 2026-10-24); the owner alone signs it in.
GH_INSTALL = {"win32": "winget install --id GitHub.cli -e", "darwin": "brew install gh"}.get(
    sys.platform, "see https://github.com/cli/cli#installation")
#: Run on graphify's own Python: which packages its `gemini` extra requires are missing ("ok"
#: when none). Read from graphify's metadata, since they change between versions (google-genai
#: once; openai and tiktoken since its Gemini backend went through Google's OpenAI endpoint).
GEMINI_PACKAGES = r"""
import importlib.metadata as m, re
missing = []
for req in m.metadata("graphifyy").get_all("Requires-Dist") or []:
    if re.search(r"extra\s*==\s*['\"]gemini['\"]", req):
        name = re.split(r"[\s;<>=!~\[(]", req, 1)[0]
        try:
            m.version(name)
        except m.PackageNotFoundError:
            missing.append(name)
print(" ".join(missing) or "ok")
"""
NEXT = """
Next, in the project: merge its own rules with the general ones (step 3 of {merge}), then
  python scripts/agent_kit.py sync
  python scripts/agent_kit.py check"""

#: What the docs check reads as a reference to a source file when it has no folder in it.
CODE = (".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".go", ".rs", ".rb", ".java", ".kt",
        ".swift", ".cs", ".php", ".sh", ".ps1", ".sql", ".vue", ".svelte")
#: Never walked outside git: dependencies, builds, caches, worktrees.
SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".next",
             "graphify-out", "scratch", "coverage", "target", ".claude"}
TICKED = re.compile(r"`([^`\s]+)`")
MODULE = re.compile(r"python -m ([A-Za-z_][A-Za-z0-9_.]*)")
STRUCK = re.compile(r"~~.*?~~", re.S)
#: A paragraph that tells history may name what is gone.
HISTORY = re.compile(r"removed|deleted|retired|git history|used to|no longer|\bgone\b"
                     r"|\bformer\b|\bold `", re.I)
#: A paragraph that names another system's paths (an artifact's files, another repository's
#: folders) says so with this, and they are not looked for here.
ELSEWHERE = re.compile(r"<!--\s*agent-kit:\s*elsewhere\s*-->")
#: The files a project names the Python packages it installs in.
MANIFESTS = re.compile(r"(requirements|constraints)[^/]*\.(txt|in|lock)|pyproject\.toml|setup\.(cfg|py)"
                       r"|Pipfile(\.lock)?|poetry\.lock|uv\.lock|environment\.ya?ml")


def read(path):
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read().replace("\r\n", "\n")
    except FileNotFoundError:
        return None


def write(path, text):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


def tidy(text):
    """The text without trailing spaces, runs of blank lines, or blank lines at either end."""
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    return re.sub(r"\n{3,}", "\n\n", text).strip("\n")


def digest(body):
    """The general rules' fingerprint. Blind to wrapping and spacing, so a formatter that
    re-flows them is not taken for an edit."""
    return hashlib.sha256(" ".join(body.split()).encode("utf-8")).hexdigest()[:12]


def split(text):
    """(tool, shared): the sections and blocks tools wrote into this file for its own
    assistant, and everything else."""
    tool = []

    def keep(match):
        tool.append(match.group(0))
        return ""

    text = FOREIGN.sub(keep, text)
    shared, section, fenced = [], None, False
    for line in text.split("\n"):
        if line.lstrip().startswith("```"):
            fenced = not fenced  # a `# comment` in a code block is not a heading
        if not fenced and line.startswith(("# ", "## ", "<!-- BEGIN:")):
            if section is not None:
                tool.append("\n".join(section))
            section = [line] if line.strip() in TOOL_SECTIONS else None
            if section is not None:
                continue
        (shared if section is None else section).append(line)
    if section is not None:
        tool.append("\n".join(section))
    return [tidy(part) for part in tool], tidy("\n".join(shared))


def shared_part(text):
    """What the three agent files must say alike: all but what tools wrote for one of them."""
    return split(text)[1]


def own_part(text):
    """What the project itself wrote: neither a tool's section nor the general rules."""
    return shared_part(BLOCK.sub("", text))


def _rules_as_installed(match):
    """Whether general rules (a BLOCK match) are as install wrote them: the body the marker's
    fingerprint names, never edited in place."""
    recorded = re.search(r"sha256:([0-9a-f]{12})", match.group("attrs"))
    return bool(recorded) and recorded.group(1) == digest(match.group("body"))


def _lost(shared, have, record):
    """The lines a copy's shared part would lose to AGENTS.md's (`have`, its lines): those the
    kit did not leave there. When its own part has the fingerprint the record keeps of what the
    kit last left in all three (`synced`), what it says that AGENTS.md lacks is AGENTS.md's old
    wording, and only general rules edited in place can be lost."""
    if digest(own_part(shared)) == record.get("synced"):
        shared = "\n".join(match.group("body") for match in BLOCK.finditer(shared)
                           if not _rules_as_installed(match))
    return [line for line in _lines(shared) if line not in have]


def with_block(text, block):
    """`text` with the general rules in it: in place of the old ones, or else at its end."""
    match = BLOCK.search(text)
    if match:
        return text[:match.start()] + block + text[match.end():]
    return text.rstrip("\n") + "\n\n" + block + "\n"


def compose(tool, body):
    return "\n\n".join(tool + [body]) + "\n"


def _git(folder, *args):
    return subprocess.run(["git", "-C", folder, *args], capture_output=True, text=True,
                          check=True).stdout.strip()


def _kit_repository(kit):
    """The top folder of the repository the kit is in, or "" when it is in none."""
    try:
        return _git(kit, "rev-parse", "--show-toplevel")
    except (OSError, subprocess.CalledProcessError):
        return ""


def _in_scratch(kit, project):
    """Whether the kit is a copy in the project's scratch/, where MERGE.md puts it: inside the
    project, yet not part of it."""
    try:
        rel = os.path.relpath(os.path.realpath(kit), os.path.realpath(project))
    except ValueError:  # two drives on Windows
        return False
    return rel.replace(os.sep, "/").split("/")[0] == "scratch"


def _source(kit, project=None):
    """(repository, folder): the kit's repository by its address (`github.com/SphyrLabs/
    llm-workflow`) and the kit's folder in it (`agent-kit`, or "." at its top); or (None, the kit
    folder's name) when it is in no repository of its own. Never a path on one computer, and
    never a credential a remote's address may carry."""
    top = _kit_repository(kit)
    if not top or (project and _same_folder(top, project)):  # a copy inside the project
        return None, os.path.basename(os.path.abspath(kit))
    try:
        url = _git(kit, "remote", "get-url", "origin")
    except (OSError, subprocess.CalledProcessError):
        url = ""
    name = os.path.basename(os.path.abspath(top))
    if url:
        url = re.sub(r"^(?:[a-z+]+://)?(?:[^@/]+@)?", "", url)
        name = re.sub(r"\.git$", "", url.replace(":", "/", 1))
    try:  # real paths: Windows may give one folder by its short 8.3 name and git by its long one
        rel = os.path.relpath(os.path.realpath(kit), os.path.realpath(top)).replace(os.sep, "/")
    except ValueError:  # two drives on Windows
        rel = "."
    return name, rel


def where(kit, project=None):
    """Where the general rules are changed: the kit's repository and its folder in it
    (`github.com/SphyrLabs/llm-workflow/agent-kit`), or the kit folder's name when it is in no
    repository of its own."""
    repository, folder = _source(kit, project)
    if repository is None:
        return folder
    return repository if folder == "." else f"{repository}/{folder}"


def _same_folder(a, b):
    return os.path.normcase(os.path.realpath(a)) == os.path.normcase(os.path.realpath(b))


def _same_file(a, b):
    """Whether two files hold the same: byte for byte, but blind to line endings in text, which
    a checkout may give either way."""
    try:
        with open(a, "rb") as one, open(b, "rb") as other:
            first, second = one.read(), other.read()
    except FileNotFoundError:
        return False
    if b"\0" in first or b"\0" in second:  # a sound, an image
        return first == second
    return first.replace(b"\r\n", b"\n") == second.replace(b"\r\n", b"\n")


class _Run:
    """One install: a line for each thing it does, the files it changes, and, in a dry run,
    nothing written."""

    def __init__(self, dry=False):
        self.dry, self.lines, self.changed = dry, [], []

    def write(self, path, text):
        self.changed.append(path)
        if not self.dry:
            write(path, text)

    def copy(self, source, target):
        self.changed.append(target)
        if not self.dry:
            os.makedirs(os.path.dirname(target), exist_ok=True)
            shutil.copyfile(source, target)

    def remove(self, path):
        self.changed.append(path)
        if not self.dry:
            os.remove(path)


def install(project, kit, dry=False, local=True):
    """Put the general rules into the project and, unless `local` is false, the kit's setup for
    this computer's assistants (its Claude Code settings and hooks, never committed); or bring
    them up to date. Returns what it did, a line each; in a dry run, what it would do, writing
    nothing."""
    return _install(project, kit, _Run(dry), local).lines


def pending(project, kit, local=True):
    """What installing `kit` would change in the project, a line each; none when the project has
    everything it would install. Writes nothing."""
    run = _install(project, kit, _Run(dry=True), local)
    return [line for line in run.lines if not line.endswith(": unchanged")] if run.changed else []


def has_local_setup(project):
    """Whether this computer has the kit's setup for the project's assistants (its hooks, its
    settings): what `outdated` then compares too, since it is each person's to take or leave."""
    if os.path.isdir(os.path.join(project, *CLAUDE_HOOKS.split("/"))):
        return True
    try:
        settings = json.loads(read(os.path.join(project, ".claude", "settings.local.json")) or "{}")
    except ValueError:
        return False
    return any(CLAUDE_HOOKS in command for command in _hook_commands(settings))


def _read_record(project):
    """The project's record of what the kit added (RECORD), or {} when it has none."""
    try:
        record = json.loads(read(os.path.join(project, *RECORD.split("/"))) or "{}")
    except ValueError:
        return {}
    return record if isinstance(record, dict) else {}


def _install(project, kit, run, local=True):
    rules, skeleton = read(os.path.join(kit, "RULES.md")), read(os.path.join(kit, "PROJECT.md"))
    if rules is None or skeleton is None:
        raise SystemExit("install runs from the kit: RULES.md and PROJECT.md go beside "
                         "agent_kit.py")
    top = _kit_repository(kit)
    if _same_folder(project, kit) or (top and _same_folder(project, top)
                                      and not _in_scratch(kit, project)):
        raise SystemExit("install sets up another project, from a clone of the kit's repository "
                         "in that project's scratch/ (MERGE.md); this one holds the general "
                         "rules already")
    body = tidy(rules)
    block = (f"<!-- BEGIN:agent-rules from {where(kit, project)}, sha256:{digest(body)}. Change them "
             f"there, never here: an update replaces everything up to the END marker. -->\n"
             f"{body}\n{END}")
    texts = {name: read(os.path.join(project, name)) for name in AGENT_FILES}
    own = {name: own_part(text) if text else "" for name, text in texts.items()}
    source = next((name for name in AGENT_FILES if own[name]), None)
    lines, changed = run.lines, False
    for name, text in texts.items():
        match = BLOCK.search(text or "")
        if not match:
            continue
        old = tidy(match.group("body"))
        recorded = re.search(r"sha256:([0-9a-f]{12})", match.group("attrs"))
        if recorded and recorded.group(1) != digest(old):
            lines.append(f"{name}: its general rules had been edited in place, and those edits "
                         "are replaced now. Propose any that every project needs for RULES.md.")
        if digest(old) != digest(body) and not changed:
            changed = True
            lines.append("What changed in the general rules:\n" + "\n".join(difflib.unified_diff(
                old.split("\n"), body.split("\n"), "before", "now", lineterm="", n=1)))

    new = {}
    if source:
        new[source] = with_block(texts[source], block)
    for name in AGENT_FILES:
        if name == source:
            continue
        if own[name]:  # rules of its own: never overwritten, only given the general rules
            new[name] = with_block(texts[name], block)
        else:  # missing, or only a tool's section: it says what the others say
            tool = split(texts[name])[0] if texts[name] else []
            new[name] = compose(tool, shared_part(new[source]) if source
                                else tidy(skeleton) + "\n\n" + block)
    for name in AGENT_FILES:
        if new[name] != texts[name]:
            run.write(os.path.join(project, name), new[name])
            lines.append(f"{name}: {'made' if texts[name] is None else 'updated'}")
        else:
            lines.append(f"{name}: unchanged")

    # The kit's own script, never the one running: an older copy in the project compares the
    # newest kit for `outdated`, and a change to the kit's script is a change to install.
    here, copy = os.path.join(kit, "agent_kit.py"), os.path.join(project, *SCRIPT.split("/"))
    if os.path.exists(here) and not _same_folder(copy, here) and not _same_file(here, copy):
        lines.append(f"{SCRIPT}: {'updated' if os.path.exists(copy) else 'made'}")
        run.copy(here, copy)
    before = _read_record(project)
    if local:  # this computer's own setup: each person's, never committed
        pointer = os.path.join(project, *POINTER.split("/"))
        if read(pointer) != POINTER_TEXT:
            lines.append(f"{POINTER}: {'updated' if os.path.exists(pointer) else 'made'}")
            run.write(pointer, POINTER_TEXT)
        _install_claude(project, kit, run)
        _install_skill(project, kit, run)
        graphifyignore = os.path.join(project, ".graphifyignore")
        if read(graphifyignore) is None:
            run.write(graphifyignore, GRAPHIFYIGNORE)
            lines.append(".graphifyignore: made")
    _take_back_shared(project, run, before.get("permissions") or {})
    _portable_graphify(project, run)
    rows = _gitignore(project, run, before.get("gitignore") or [])
    if not run.dry:  # for the merge to fix, as a config is code: no change a dry run would list
        lines += scratch_unignored(project)
    repository, folder = _source(kit, project)
    fields = {"about": RECORD_ABOUT, "repository": repository, "folder": folder, "gitignore": rows}
    alike = len({shared_part(new[name]) for name in AGENT_FILES}) == 1
    synced = digest(own_part(new[AGENT_FILES[0]])) if alike else before.get("synced")
    if synced:
        fields["synced"] = synced
    record = json.dumps(fields, indent=2) + "\n"
    path = os.path.join(project, *RECORD.split("/"))
    if read(path) != record:
        lines.append(f"{RECORD}: {'updated' if os.path.exists(path) else 'made'}")
        run.write(path, record)
    if not run.dry:  # once all of it is there, for the merge to fix too, and to offer the owner
        lines += kit_files_unignored(project) + committed_setup_notes(project)
    found = os.path.join(project, *UPDATE_CHECK.split("/"))
    if not run.dry and os.path.exists(found):  # what the last check found is out of date now
        os.remove(found)
    return run


def merge_settings(current, kit, added=None):
    """(settings, added, taken back): the project's Claude Code settings with the kit's in them;
    the permissions the kit has added to them now, by kind ({"allow": [...]}); and those it took
    back. Everything else the project has stays. A permission is taken back only when an earlier
    install added it (`added`, from the project's record) and the kit no longer has it, so the
    project's own is never touched, even one the kit has too. The kit's own hooks are replaced
    where they are, never added twice nor moved, so another tool that adds its hooks after them
    (graphify) leaves nothing to change next time; and Claude Code never credits itself
    (*Commits and pull requests*)."""
    merged = json.loads(json.dumps(current))
    if "attribution" in kit:
        merged["attribution"] = kit["attribution"]
    if not isinstance(merged.get("permissions"), dict):
        merged["permissions"] = {}
    permissions, had = merged["permissions"], current.get("permissions") or {}
    before, wanted_by_kind = added or {}, kit.get("permissions", {})
    now, taken = {}, []
    for key in list(wanted_by_kind) + [key for key in before if key not in wanted_by_kind]:
        wanted, earlier = wanted_by_kind.get(key, []), before.get(key, [])
        have = permissions.setdefault(key, [])
        for rule in earlier:
            if rule not in wanted and rule in have:
                have.remove(rule)
                taken.append(rule)
        now[key] = [rule for rule in wanted if rule in earlier or rule not in have]
        have.extend(rule for rule in wanted if rule not in have)
        if not have and key not in had:
            del permissions[key]
    if not permissions and "permissions" not in current:
        del merged["permissions"]
    hooks = merged.setdefault("hooks", {})
    ours = kit.get("hooks", {})
    for event in list(hooks):
        kept, at = [], None
        for group in hooks[event]:
            theirs = [hook for hook in group.get("hooks", [])
                      if CLAUDE_HOOKS not in hook.get("command", "")]
            if at is None and len(theirs) < len(group.get("hooks", [])):
                at = len(kept)
            if theirs:
                kept.append({**group, "hooks": theirs})
        if event in ours:
            at = len(kept) if at is None else at
            kept[at:at] = json.loads(json.dumps(ours[event]))
        if kept:
            hooks[event] = kept
        else:
            del hooks[event]
    for event, groups in ours.items():
        if event not in hooks:
            hooks[event] = json.loads(json.dumps(groups))
    return merged, {key: rules for key, rules in now.items() if rules}, taken


def _hook_commands(settings):
    """Every hook command in a Claude Code settings file's parsed JSON."""
    hooks = settings.get("hooks") if isinstance(settings, dict) else None
    return [hook.get("command", "") for groups in (hooks or {}).values() if isinstance(groups, list)
            for group in groups if isinstance(group, dict)
            for hook in group.get("hooks", []) if isinstance(hook, dict)]


def _hooks_like_ours(project, names, lines):
    """Name the project's own hooks that bear a kit hook's name (an older copy, or one that does
    the same): both now run, two notifications or two guards, until the owner keeps one."""
    for rel in (".claude/settings.json", ".claude/settings.local.json"):
        text = read(os.path.join(project, *rel.split("/")))
        try:
            settings = json.loads(text) if text and text.strip() else {}
        except ValueError:
            continue
        found = sorted({re.split(r"[\\/]", match)[-1] for command in _hook_commands(settings)
                        for match in re.findall(r"\.claude[\\/]hooks[\\/](?!agent-kit[\\/])"
                                                r"([^\s\"']+)", command)
                        if re.split(r"[\\/]", match)[-1] in names})
        if found:
            lines.append(f"{rel} runs hooks of its own named like the kit's ({', '.join(found)}): "
                         "both run now. Keep one of each, with the owner's yes (MERGE.md, step 3)")


def _install_claude(project, kit, run):
    """Copy the kit's hooks in and merge its settings into this computer's own Claude Code
    settings, .claude/settings.local.json, never committed; keep what it added there in its own
    record (LOCAL_RECORD), so a later install takes back only that."""
    source = os.path.join(kit, "claude")
    template = read(os.path.join(source, "settings.json"))
    if template is None:
        return
    record_path = os.path.join(project, *LOCAL_RECORD.split("/"))
    try:
        record = json.loads(read(record_path) or "{}")
    except ValueError:
        record = {}
    added = record.get("permissions") if isinstance(record, dict) else None
    hooks_from = os.path.join(source, "hooks")
    changed = _mirror(run, os.path.join(project, *CLAUDE_HOOKS.split("/")), _files_in(hooks_from))
    if changed:
        run.lines.append(f"{CLAUDE_HOOKS}/: {', '.join(sorted(changed))}")

    path = os.path.join(project, ".claude", "settings.local.json")
    text = read(path)
    try:
        current = json.loads(text) if text and text.strip() else {}
    except ValueError:
        run.lines.append(".claude/settings.local.json is not valid JSON, so it was left alone: add "
                         "the kit's settings (claude/settings.json in the kit) to it by hand")
        return
    merged, ours, taken = merge_settings(current, json.loads(template), added)
    portable_hooks(merged)
    if merged != current or text is None:
        run.write(path, json.dumps(merged, indent=2) + "\n")
        run.lines.append(f".claude/settings.local.json: {'made' if text is None else 'updated'}"
                         + (f", taking back what the kit no longer has: {', '.join(taken)}"
                            if taken else ""))
    kept = json.dumps({"about": "Written by `python scripts/agent_kit.py install`, never by hand: "
                                "the permissions the agent kit added to this computer's "
                                ".claude/settings.local.json, so a later install takes back only "
                                "its own.", "permissions": ours}, indent=2) + "\n"
    if read(record_path) != kept:
        run.write(record_path, kept)
    _hooks_like_ours(project, {name for name in os.listdir(hooks_from) if name.endswith(".mjs")},
                     run.lines)


def _files_in(folder):
    """{path in `folder`, with forward slashes: the file's path} for every file in it."""
    found = {}
    for dirpath, _, filenames in os.walk(folder):
        for name in filenames:
            path = os.path.join(dirpath, name)
            found[os.path.relpath(path, folder).replace(os.sep, "/")] = path
    return found


def _mirror(run, target, files, texts=None):
    """Make the folder `target`, which is the kit's alone, hold what `texts` says ({path in it:
    the text to write there}) and `files` ({path in it: the file to copy there}), and nothing
    else: what differs is replaced, and what neither names is removed, with any folder that
    leaves empty. Texts go first, so a folder's SKILL.md is there before the rest. Returns what
    changed, a path each, one removed marked so."""
    wanted, changed = set(), []
    for rel, text in (texts or {}).items():
        wanted.add(os.path.normcase(os.path.join(*rel.split("/"))))
        path = os.path.join(target, *rel.split("/"))
        if read(path) != text:
            run.write(path, text)
            changed.append(rel)
    for rel, source in files.items():
        wanted.add(os.path.normcase(os.path.join(*rel.split("/"))))
        path = os.path.join(target, *rel.split("/"))
        if not _same_file(source, path):
            run.copy(source, path)
            changed.append(rel)
    for dirpath, _, filenames in os.walk(target):
        for name in filenames:
            rel = os.path.relpath(os.path.join(dirpath, name), target)
            if os.path.normcase(rel) not in wanted:
                run.remove(os.path.join(dirpath, name))
                changed.append(rel.replace(os.sep, "/") + " (gone from the kit)")
    if not run.dry:
        for dirpath, _, _ in os.walk(target, topdown=False):
            if not _same_folder(dirpath, target) and not os.listdir(dirpath):
                os.rmdir(dirpath)
    return changed


#: What the catalog reads from a prompt: its title, its use case (the first sentence of it), and
#: its variants: each bold label on a line of its own (`**SEO only (rankings dropped):**`), or,
#: in a section that has none, the section's heading when the section holds a prompt to paste.
#: The main template, the tips and a checklist are not variants.
TITLE = re.compile(r"^# (?:Prompt|Template): *(.+?) *$", re.M)
USE_CASE = re.compile(r"^\*\*Use case:\*\* *(.+?) *$", re.M)
SENTENCE = re.compile(r".+?[.!?](?=\s+[A-Z(\"'`]|\s*$)")
VARIANT = re.compile(r"^\*\*([^*]+?):\*\*\s*$")
NOT_VARIANTS = ("Template", "Tips", "Checklist")


def library_prompts(library):
    """The prompts in the library folder `library`, by their paths in it with forward slashes,
    in order: its Markdown files, but for its READMEs, which index it. None when there is no
    such folder."""
    if not os.path.isdir(library):
        return None
    found = []
    for dirpath, dirnames, filenames in os.walk(library):
        dirnames[:] = [name for name in dirnames if not name.startswith((".", "__"))]
        rel = os.path.relpath(dirpath, library).replace(os.sep, "/")
        found += [name if rel == "." else f"{rel}/{name}" for name in filenames
                  if name.endswith(".md") and name != "README.md" and not name.startswith(".")]
    return sorted(found)


def prompt_entry(text):
    """(title, use case, variants) of a prompt's text: its title, the first sentence of its use
    case, and the labels of its variants, each without its parenthesis; "" or [] for what it
    lacks. Code blocks are passed over: a template's own headings are not the prompt's."""
    title, use = TITLE.search(text), USE_CASE.search(text)
    sentence = SENTENCE.match(use.group(1)) if use else None
    variants, section, labels, pasted, fenced = [], None, [], False, False

    def close():
        if section and section not in NOT_VARIANTS:
            variants.extend(labels or ([section] if pasted else []))

    for line in text.split("\n"):
        if line.lstrip().startswith("```"):
            fenced, pasted = not fenced, True
        elif not fenced and line.startswith("## "):
            close()
            section, labels, pasted = re.sub(r"\s*\([^()]*\)$", "", line[3:].strip()), [], False
        elif not fenced and section:
            label = VARIANT.match(line.strip())
            if label:
                labels.append(re.sub(r"\s*\([^()]*\)$", "", label.group(1)).strip())
    close()
    return (title.group(1) if title else "",
            (sentence.group(0) if sentence else use.group(1)) if use else "", variants)


def catalog(library, prompts):
    """The library's catalog, a Markdown table: each prompt by its name (its path, without .md),
    with its title, its use case and its variants."""
    rows = ["| Prompt | Title | Use case | Variants |", "|---|---|---|---|"]
    for rel in prompts:
        title, use, variants = prompt_entry(read(os.path.join(library, *rel.split("/"))) or "")
        cells = (f"`{rel[:-len('.md')]}`", title, use, "; ".join(variants))
        rows.append("| " + " | ".join(cell.replace("|", "\\|") for cell in cells) + " |")
    return "\n".join(rows)


def skill_text(template, library, prompts):
    """The prompt skill's SKILL.md: the kit's, with the library's catalog at its marker."""
    return template.replace(CATALOG, catalog(library, prompts), 1)


def _theirs(folder):
    """Whether a skill folder holds someone's own skill: a SKILL.md without the kit's mark. A
    folder with no SKILL.md is no skill at all, and the kit's to write (one whose SKILL.md was
    deleted gets it back)."""
    text = read(os.path.join(folder, "SKILL.md"))
    return text is not None and SKILL_MARK not in text


def _install_skill(project, kit, run):
    """Write the prompt skill into each assistant's skills folder (SKILL_FOLDERS): its SKILL.md,
    with the library's catalog, and the library's prompts word for word; and take out what the
    library no longer has. A folder that holds someone's own skill of that name is left alone.
    From a kit with no library beside it (a copy of the kit's folder alone) the skill stays as it
    is, and an install says so."""
    template = read(os.path.join(kit, *SKILL_SOURCE.split("/")))
    if template is None:
        return
    library = os.path.normpath(os.path.join(kit, *LIBRARY.split("/")))
    prompts = library_prompts(library)
    if not prompts:
        if not run.dry:
            run.lines.append(f"the prompt skill: left as it is, since the kit has no prompt "
                             f"library beside it ({LIBRARY}). Install from a clone of the kit's "
                             "whole repository (MERGE.md) to bring it in")
        return
    files = {f"prompts/{rel}": os.path.join(library, *rel.split("/")) for rel in prompts}
    texts = {"SKILL.md": skill_text(template, library, prompts)}
    done = {}
    for folder in SKILL_FOLDERS:
        target = os.path.join(project, *folder.split("/"))
        if _theirs(target):
            if not run.dry:
                run.lines.append(f"{folder}/ holds a skill of its own, not the kit's, so it was "
                                 "left alone: rename that folder, then install again to bring "
                                 "the kit's prompt skill in for that assistant")
            continue
        made = not os.path.isdir(target)
        changed = sorted(_mirror(run, target, files, texts))
        if made:
            what = f"made, with {len(prompts)} prompts"
        elif changed:
            what = ", ".join(changed[:6]) + (f" and {len(changed) - 6} more" if len(changed) > 6
                                             else "")
        else:
            continue
        done.setdefault(what, []).append(folder + "/")
    for what, folders in done.items():
        run.lines.append(f"the prompt skill, in {', '.join(folders)}: {what}")


def _take_back_shared(project, run, added):
    """An older kit merged its settings into the project's own .claude/settings.json: take its
    hooks and the permissions its record names (`added`) back out of it, as they are each
    person's now, in .claude/settings.local.json. Everything else there stays."""
    path = os.path.join(project, ".claude", "settings.json")
    text = read(path)
    try:
        settings = json.loads(text) if text and text.strip() else None
    except ValueError:
        return
    if not isinstance(settings, dict):
        return
    kept = json.loads(json.dumps(settings))
    for event, groups in list((kept.get("hooks") or {}).items()):
        left = [{**group, "hooks": [hook for hook in group.get("hooks", [])
                                    if CLAUDE_HOOKS not in hook.get("command", "")]}
                for group in groups if isinstance(group, dict)]
        left = [group for group in left if group["hooks"]]
        if left:
            kept["hooks"][event] = left
        else:
            del kept["hooks"][event]
    for key, rules in (added or {}).items():
        have = (kept.get("permissions") or {}).get(key)
        if isinstance(have, list) and any(rule in rules for rule in have):
            have[:] = [rule for rule in have if rule not in rules]
            if not have:
                del kept["permissions"][key]
    for key in ("hooks", "permissions"):
        if key in kept and not kept[key] and settings.get(key):
            del kept[key]
    if kept != settings:
        run.write(path, json.dumps(kept, indent=2) + "\n")
        run.lines.append(".claude/settings.json: the kit's hooks and permissions taken out of it, "
                         "as they are each person's now (.claude/settings.local.json)")


def portable_hooks(settings):
    """Make every hook command that runs one computer's graphify by its path run plain
    `graphify`, and drop a hook that then repeats another. Returns whether anything changed."""
    hooks = settings.get("hooks") if isinstance(settings, dict) else None
    if not isinstance(hooks, dict):
        return False
    changed = False
    for event, groups in hooks.items():
        if not isinstance(groups, list):
            continue
        seen, kept_groups = set(), []
        for group in groups:
            kept = []
            for hook in group.get("hooks", []) if isinstance(group, dict) else []:
                command = hook.get("command")
                if isinstance(command, str):
                    portable = GRAPHIFY_BY_PATH.sub("graphify", command, count=1)
                    if portable != command:
                        hook["command"], changed = portable, True
                key = (group.get("matcher"), hook.get("command"))
                if key in seen:
                    changed = True
                    continue
                seen.add(key)
                kept.append(hook)
            if kept:
                kept_groups.append({**group, "hooks": kept})
            else:
                changed = True
        hooks[event] = kept_groups
    return changed


def _portable_graphify(project, run):
    """graphify's hooks in Claude Code's, Codex's and Gemini's settings run plain `graphify`."""
    for rel in HOOK_SETTINGS:
        path = os.path.join(project, *rel.split("/"))
        text = read(path)
        if not text or not text.strip():
            continue
        try:
            data = json.loads(text)
        except ValueError:
            run.lines.append(f"{rel} is not valid JSON, so it was left alone")
            continue
        if portable_hooks(data):
            run.write(path, json.dumps(data, indent=2) + "\n")
            run.lines.append(f"{rel}: graphify's hooks now run plain graphify, never one computer's "
                             "path")


def _has_row(rows, row):
    """Whether .gitignore `rows` keep out what `row` does already: the same, with or without its
    slashes, or the folder's every file (`.claude/*`)."""
    bare = row.strip("/")
    return any(other.strip("/") in (bare, bare + "/*") for other in rows)


def _tracked_under(project, entries):
    """The files git tracks under each of `entries` (a folder, ending in "/", or a file), by the
    entry they fall under; none outside git."""
    try:
        listed = _git(project, "ls-files", "-z", "--", *(entry.rstrip("/") for entry in entries))
    except (OSError, subprocess.CalledProcessError):
        return {}
    found = {}
    for name in filter(None, listed.split("\0")):
        for entry in entries:
            if name == entry.rstrip("/") or (entry.endswith("/") and name.startswith(entry)):
                found.setdefault(entry, []).append(name)
                break
    return found


def _gitignore(project, run, added=()):
    """What is generated is ignored (GENERATED), and so is each person's own assistant setup
    (LOCAL_SETUP). Where the project still tracks something in one of those, that stays as it is
    for the owner to decide (`untrack`), and the kit's own files there are kept out by name
    (KIT_LOCAL). Rows it adds go at the end, under a note saying where they came from. Returns
    the rows the kit has added, for the record: a later install takes back one the kit no longer
    wants (`added`, from that record, such as an older kit's `!.claude/...` rows), and never a row
    the project had itself."""
    path = os.path.join(project, ".gitignore")
    text = read(path) or ""
    out = text.rstrip("\n").split("\n") if text.strip() else []
    anything = set(GENERATED + LOCAL_SETUP) | {row for rows in KIT_LOCAL.values() for row in rows}
    anything |= {entry + "*" for entry in LOCAL_SETUP if entry.endswith("/")}
    done, gone = [], [row for row in added if row not in anything and row in map(str.strip, out)]
    if gone:
        out = [row for row in out if row.strip() not in gone]
        done.append(f"took back {', '.join(gone)}, which the kit no longer has")
    stripped = [row.strip() for row in out]
    tracked = _tracked_under(project, LOCAL_SETUP)
    reopened = any(row.startswith(("!.claude/", "!/.claude/")) for row in stripped)
    needed = []
    for entry in LOCAL_SETUP:
        if entry in tracked or (entry == ".claude/" and reopened):
            needed += KIT_LOCAL.get(entry, [])
        else:
            needed.append(entry)
    tail = [row for row in GENERATED + needed if not _has_row(stripped, row)]
    done += tail
    if tail:
        if GITIGNORE_NOTE not in stripped:
            out += ([""] if out and out[-1].strip() else []) + [GITIGNORE_NOTE]
        out += tail
    if done:
        run.write(path, "\n".join(out) + "\n")
        run.lines.append(f".gitignore: {'; '.join(done)}")
    kept = [row for row in added if row in anything and row in stripped]
    return list(dict.fromkeys(kept + tail))


def _lines(text):
    return [line.strip() for line in text.split("\n") if line.strip()]


def sync(project, force=False):
    """Make CLAUDE.md and GEMINI.md say what AGENTS.md says, each keeping its tool sections.
    A file that says it already is left as it is, wherever its tool sections are (graphify adds
    its own at the end). A file with a line AGENTS.md lacks that the kit did not leave there
    (`_lost`) is left alone, unless forced: that line was written there, and a copy would lose
    it. AGENTS.md's old wording is replaced, edit after edit. Returns (done, refused), a line
    each."""
    agents = read(os.path.join(project, "AGENTS.md"))
    if agents is None:
        raise SystemExit("sync makes the other files say what AGENTS.md says, and there is no "
                         "AGENTS.md")
    shared = shared_part(agents)
    have = set(_lines(shared))
    record = _read_record(project)
    done, refused = [], []
    for name in AGENT_FILES[1:]:
        path = os.path.join(project, name)
        text = read(path)
        tool, mine = split(text) if text else ([], "")
        if text is not None and mine == shared:
            continue
        lost = _lost(mine, have, record)
        if lost and not force:
            refused.append(f"{name}: not changed. It has {len(lost)} line(s) AGENTS.md lacks, "
                           f"the first: {lost[0]!r}. Move them into AGENTS.md, or run sync "
                           f"--force.")
            continue
        new = compose(tool, shared)
        if new != text:
            write(path, new)
            done.append(f"{name}: now says what AGENTS.md says")
    if record and not refused and record.get("synced") != digest(own_part(shared)):
        record["synced"] = digest(own_part(shared))  # all three say it now, as install records
        write(os.path.join(project, *RECORD.split("/")), json.dumps(record, indent=2) + "\n")
    return done, refused


def files_of(project):
    """Every file a checkout of the project has: git's tracked and untracked-but-not-ignored
    files, or, outside git, the tree without its dependency and build folders."""
    try:
        listed = _git(project, "ls-files", "--cached", "--others", "--exclude-standard")
        return [f for f in listed.split("\n") if f and os.path.exists(os.path.join(project, f))]
    except (OSError, subprocess.CalledProcessError):
        pass
    found = []
    for dirpath, dirnames, filenames in os.walk(project):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        rel = os.path.relpath(dirpath, project).replace(os.sep, "/")
        found.extend(name if rel == "." else f"{rel}/{name}" for name in filenames)
    return found


def _ignored_paths(project, paths):
    """Which of `paths` git ignores. They go to git as bytes: through a text-mode pipe, Windows
    would end each but the last with a carriage return, which git reads as the path's."""
    try:
        out = subprocess.run(["git", "-C", project, "check-ignore", "--stdin"],
                             input="\n".join(paths).encode("utf-8"), capture_output=True)
    except OSError:
        return set()
    return set(out.stdout.decode("utf-8", "replace").splitlines())


def _ignored(project, paths):
    """Whether git ignores any of `paths`: a local database or a run's output is on the owner's
    machine, not in a checkout."""
    return bool(_ignored_paths(project, paths))


def _folders(files):
    """Every folder the project's files are in, at any depth (`src/`, holding only folders, as
    much as `src/db/`)."""
    return sorted({"/".join(parts[:depth]) for f in files for parts in [f.split("/")[:-1]]
                   for depth in range(1, len(parts) + 1)})


def _bases(files, project, folders=None):
    """The folders a doc may name a path from: every folder the project's files are in, but one
    git ignores the contents of whatever they are called (`backups/*`, kept for a tracked
    placeholder), where every path would read as ignored, and none as missing."""
    folders = _folders(files) if folders is None else folders
    probes = {f"{folder}/agent-kit-probe": folder for folder in folders}
    kept_out = {probes[probe] for probe in _ignored_paths(project, list(probes)) if probe in probes}
    return [folder for folder in folders if folder not in kept_out]


def references(text):
    """(kind, name) for everything a doc's present-tense text names. Struck-through text, a
    paragraph that tells history or says its paths are another system's (ELSEWHERE), and a list
    right after one of those ending in a colon are not checked."""
    history_list = False
    for paragraph in re.split(r"\n\s*\n", STRUCK.sub("", text)):
        if HISTORY.search(paragraph) or ELSEWHERE.search(paragraph):
            history_list = paragraph.rstrip().endswith(":")
            continue
        if history_list and paragraph.lstrip().startswith(("* ", "- ")):
            continue
        history_list = False
        for token in TICKED.findall(paragraph):
            token = token.rstrip(").,;:").lstrip("(")
            if (any(c in token for c in "<>*{}$=|") or "..." in token or "…" in token
                    or token.startswith(("/", "~", "-", "@", "http"))
                    or re.match(r"[A-Za-z]:[\\/]", token)):
                continue
            if "/" in token.rstrip("/"):
                last = token.split("::")[0].rstrip("/").rsplit("/", 1)[-1]
                if "." in last or token.endswith("/") or "::" in token:
                    yield "path", token
            elif token.endswith(CODE) and not token.startswith("."):  # `.sql` is a kind of file
                yield "file", token
        for module in MODULE.findall(paragraph):
            # `python -m tools.<name>` names the package; the rest is a placeholder.
            yield "module", module.rstrip(".")


def _path_ok(ref, files, project, bases=None, folders=None, near=None):
    """A path, or `path::name` with the name still in that file. A doc may name a path from
    inside one of the project's folders (`bases`), so any file whose path ends with it will do.
    One no file has may be one git ignores (a local database), asked about from the doc's own
    folder (`near`), as a link in it would be read, and from the folders that hold the most of
    the folders it names on its way (`data/backups/` names `src/data/backups/`): asked about
    from every folder, it read as ignored wherever a folder of that name was kept out (another
    part's `data/`), and every missing path under it went through. Only a path the project has
    none of the folders of (a run's output) may be ignored from any of them."""
    ref, _, symbol = ref.partition("::")
    folder = ref.endswith("/")
    ref = ref.strip("/")
    tail = "/" + ref
    hits = [f for f in files if ("/" + f).endswith(tail)]
    if symbol:
        pattern = re.compile(rf"\b{re.escape(symbol)}\b")
        return any(pattern.search(read(os.path.join(project, f)) or "") for f in hits)
    if hits or any(tail + "/" in "/" + f for f in files):
        return True
    # A folder git ignores by a folder rule (`logs/`) matches only when asked about with its
    # slash, and a folder a run makes may not exist yet.
    name = ref + "/" if folder else ref
    have = set(_folders(files) if folders is None else folders)
    on_the_way = ref.split("/")[:-1]
    held = {parent: _held(parent, on_the_way, have) for parent in [""] + sorted(have)}
    most = max(held.values())
    if most:
        parents = [parent for parent, count in held.items() if count == most]
        if near is not None:
            parents.append(near)
        return _ignored(project, [f"{parent}/{name}".lstrip("/") for parent in parents])
    parents = _bases(files, project) if bases is None else bases
    return _ignored(project, [name] + [f"{parent}/{name}" for parent in parents])


def _held(parent, on_the_way, have):
    """How many of the folders a path names on its way (`lib`, then `domain`) the project has
    inside `parent`, from the first."""
    count = 0
    for depth in range(1, len(on_the_way) + 1):
        if "/".join(([parent] if parent else []) + on_the_way[:depth]) not in have:
            break
        count = depth
    return count


def _installs(project, files):
    """Every name the project's dependency files (`MANIFESTS`) give, as `_package` writes it."""
    names = set()
    for f in files:
        if MANIFESTS.fullmatch(f.rsplit("/", 1)[-1]):
            text = read(os.path.join(project, f)) or ""
            names.update(map(_package, re.findall(r"[A-Za-z0-9][A-Za-z0-9_-]*", text)))
    return names


def _package(name):
    """A package's name as Python's packaging compares them: `Foo-Bar` is `foo_bar`."""
    return re.sub(r"[-_]+", "_", name).lower()


def _module_ok(module, files, installs=frozenset()):
    """A `python -m` module of this project's must be there. One of a package the project lacks
    is someone else's: by its one name, a tool's (`python -m pytest`); dotted, a package's module
    (`nltk.downloader`), so the package is Python's own or one the project's dependency files
    name (`installs`). Any other dotted one was this project's, its package renamed or moved
    since the doc named it, which a check taking every package the project lacks for someone
    else's let through."""
    padded = ["/" + f for f in files]
    parts = module.split(".")
    top = "/" + parts[0]
    if not any(top + "/" in f or f.endswith(top + ".py") for f in padded):
        python = getattr(sys, "stdlib_module_names", None)  # Python 3.10 and later
        return (len(parts) == 1 or python is None or parts[0] in python
                or _package(parts[0]) in installs)
    rel = "/" + "/".join(parts)
    return any(f.endswith(rel + suffix) for f in padded
               for suffix in (".py", "/__init__.py", "/__main__.py"))


def stale_docs(project, docs=(), history=()):
    """Every doc that names a file, path, function or module that does not exist. The agent
    files and READMEs are checked, and any doc in `docs`; never one in `history`, a record of
    what happened."""
    files = files_of(project)
    folders = _folders(files)
    bases = _bases(files, project, folders)
    installs = _installs(project, files)
    exempt = {os.path.normpath(h).replace(os.sep, "/") for h in history}
    chosen = {f for f in files if f.rsplit("/", 1)[-1] in AGENT_FILES + ("README.md",)}
    chosen |= {os.path.normpath(d).replace(os.sep, "/") for d in docs}
    problems = []
    for doc in sorted(chosen - exempt):
        text = read(os.path.join(project, doc))
        if text is None:
            problems.append(f"{doc}: there is no such doc to check")
            continue
        stale = set()
        near = doc.rsplit("/", 1)[0] if "/" in doc else ""
        for kind, name in references(BLOCK.sub("", text)):
            ok = (_path_ok(name, files, project, bases, folders, near) if kind == "path"
                  else any(f.rsplit("/", 1)[-1] == name for f in files) if kind == "file"
                  else _module_ok(name, files, installs))
            if not ok:
                stale.add(f"{kind} {name}")
        if stale:
            problems.append(f"{doc} names what does not exist: {', '.join(sorted(stale))}. Fix "
                            "the sentence to say what is true now, or strike the old claim "
                            "through (~~ ~~) and say what replaced it.")
    return problems


def local_setup(project):
    """(level, text) for this computer's own setup of the kit for the project, which `doctor`
    reports: none at all is the person's choice; once taken, Claude Code's credit lines stay off
    and every hook its settings name is in place."""
    if not has_local_setup(project):
        return [("suggest", "this computer has none of the kit's setup for this project's "
                            "assistants (Claude Code's hooks and settings): yours to take or "
                            "leave; the kit's install sets it up (MERGE.md, step 2)")]
    text = read(os.path.join(project, ".claude", "settings.local.json"))
    try:
        settings = json.loads(text) if text and text.strip() else {}
    except ValueError:
        return [("fix", ".claude/settings.local.json is not valid JSON")]
    found = []
    attribution = settings.get("attribution") or {}
    if attribution.get("commit") != "" or attribution.get("pr") != "":
        found.append(("fix", ".claude/settings.local.json lets Claude Code credit itself in commits "
                             "or pull requests: install the kit again, which switches that off"))
    ours = [command for command in _hook_commands(settings) if CLAUDE_HOOKS in command]
    if not ours:
        found.append(("fix", "the kit's hooks are not in .claude/settings.local.json: install the "
                             "kit again"))
    for command in ours:
        match = re.search(re.escape(CLAUDE_HOOKS) + r"/([^\s\"']+)", command)
        if match and not os.path.exists(os.path.join(project, *CLAUDE_HOOKS.split("/"),
                                                     *match.group(1).split("/"))):
            found.append(("fix", f"{CLAUDE_HOOKS}/{match.group(1)} is missing: install the kit "
                                 "again"))
    for folder in SKILL_FOLDERS:
        path = os.path.join(project, *folder.split("/"))
        if _theirs(path):
            found.append(("warn", f"{folder}/ holds a skill of its own, not the kit's prompt "
                                  "skill: rename that folder, then install the kit again to bring "
                                  "it in for that assistant"))
        elif read(os.path.join(path, "SKILL.md")) is None:
            found.append(("fix", f"{folder}/SKILL.md is missing, so that assistant has no prompt "
                                 "skill: install the kit again"))
    return found or [("ok", "the kit's setup for this project's assistants is on this computer")]


def _run(command):
    """(returncode, stdout, stderr), or (None, "", "") when the command cannot run."""
    try:
        done = subprocess.run(command, capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.TimeoutExpired):
        return None, "", ""
    return done.returncode, done.stdout, done.stderr


def _version(text):
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", text or "")
    return tuple(int(part) for part in match.groups()) if match else None


def _tool_python(executable):
    """The Python a console script runs on, from its launcher's #! line (the first line of a
    script; near the end of a Windows launcher), or None when it does not say."""
    try:
        with open(os.path.realpath(executable), "rb") as handle:
            data = handle.read()
    except OSError:
        return None
    at = 0 if data.startswith(b"#!") else data.rfind(b"#!")
    if at < 0:
        return None
    line = data[at + 2:].split(b"\n", 1)[0].decode("utf-8", "replace").strip().strip('"')
    if line.startswith("/usr/bin/env"):
        return shutil.which(line.split()[-1])
    return line if os.path.isfile(line) else None


def environment_problems(env):
    """(level, text) for what this computer's environment lacks to keep graphify on Gemini."""
    windows = sys.platform == "win32"
    found = []
    if not (env.get("GEMINI_API_KEY") or env.get("GOOGLE_API_KEY")):
        found.append(("fix", "GEMINI_API_KEY is not set: set it in your user environment yourself "
                             "(a secret: never in a repository, never typed by an assistant)"))
    model = env.get("GRAPHIFY_GEMINI_MODEL")
    if model != GEMINI_MODEL:
        how = (f"setx GRAPHIFY_GEMINI_MODEL {GEMINI_MODEL}" if windows
               else f"export GRAPHIFY_GEMINI_MODEL={GEMINI_MODEL} in your shell profile")
        found.append(("fix", f"GRAPHIFY_GEMINI_MODEL is {repr(model) if model else 'not set'}, "
                             f"not {GEMINI_MODEL}: {how}, then open a new terminal"))
    if env.get("ANTHROPIC_API_KEY"):
        found.append(("warn", "ANTHROPIC_API_KEY is set, so graphify could pick Claude when Gemini "
                              "is not available: keep it out of graphify's environment"))
    return found


def project_graphify(project):
    """A graphify in the project's own virtual environment, which runs instead of the computer's
    inside the project, or None."""
    for folder in (".venv", "venv", "env"):
        for script in (("Scripts", "graphify.exe"), ("bin", "graphify")):
            path = os.path.join(project, folder, *script)
            if os.path.exists(path):
                return path.replace(os.sep, "/")
    return None


def shown(path, home=None):
    """A path as the owner reads it: under the home folder as ~/..., never this computer's own
    prefix."""
    home = os.path.realpath(home or os.path.expanduser("~"))
    real = os.path.realpath(path)
    try:
        inside = os.path.normcase(os.path.commonpath([real, home])) == os.path.normcase(home)
    except ValueError:  # two drives on Windows
        inside = False
    if inside:
        return "~/" + os.path.relpath(real, home).replace(os.sep, "/")
    return path.replace(os.sep, "/")


def global_suggestions(home):
    """(level, text) for what this computer could have globally, for projects without the kit:
    Claude Code's credit lines off, and the commit and pull-request rules in each assistant's
    global file. Suggestions only: none of it is changed without the owner's yes."""
    found = []
    settings = read(os.path.join(home, ".claude", "settings.json"))
    try:
        attribution = (json.loads(settings) if settings else {}).get("attribution") or {}
    except (ValueError, AttributeError):
        attribution = {}
    if os.path.isdir(os.path.join(home, ".claude")) and (attribution.get("commit") != ""
                                                          or attribution.get("pr") != ""):
        found.append(("suggest", "Claude Code credits itself in projects without the kit: add "
                                 '"attribution": {"commit": "", "pr": "", "sessionUrl": false} to '
                                 "~/.claude/settings.json, changing nothing else in it"))
    for folder, name in GLOBAL_RULE_FILES:
        if not os.path.isdir(os.path.join(home, folder)):
            continue
        text = (read(os.path.join(home, folder, name)) or "").lower()
        if "co-authored-by" not in text or "pull request" not in text:
            found.append(("suggest", f"~/{folder}/{name} lacks the commit and pull-request rules: "
                                     "add them (RULES.md, *Commits and pull requests*), for "
                                     "projects without the kit"))
    return found


def github_cli():
    """(level, text) for the GitHub CLI, which assistants read CI with: installed, and signed in.
    `gh auth status` says whether it is without showing the token, which is never read here."""
    gh = shutil.which("gh")
    if not gh:
        return "fix", f"the GitHub CLI is not installed, so assistants cannot follow CI: {GH_INSTALL}"
    version = _version(_run([gh, "--version"])[1])
    if _run([gh, "auth", "status"])[0] != 0:
        return "fix", ("gh is not signed in to GitHub, or could not reach it: run `gh auth login` "
                       "yourself (an assistant never signs it in)")
    return "ok", f"gh {'.'.join(map(str, version)) if version else '?'}, signed in"


def doctor(project, env=None, home=None):
    """(level, text) for what this computer needs to use the kit: git, Node for the hooks, the
    GitHub CLI for CI, and graphify with its Gemini support, key and model; and what it could
    have globally. Levels:
    ok, fix, warn, and suggest (a global change, made only with the owner's yes)."""
    env = os.environ if env is None else env
    home = home or os.path.expanduser("~")
    found = [("ok", "git") if shutil.which("git") else ("fix", "git is not installed")]
    node = shutil.which("node")
    version = _version(_run([node, "--version"])[1]) if node else None
    if not node:
        found.append(("fix", "Node is not installed: Claude Code's hooks need Node 18 or later"))
    elif version and version >= (18, 0, 0):
        found.append(("ok", f"node {'.'.join(map(str, version))}"))
    else:
        found.append(("fix", "Node is older than 18: Claude Code's hooks need 18 or later"))
    found.append(github_cli())
    graphify = shutil.which("graphify")
    if not graphify:
        found.append(("fix", f"graphify is not installed: {GRAPHIFY_INSTALL}"))
    else:
        _, out, err = _run([graphify, "--version"])
        version = _version(out)
        where_from = shown(graphify, home)
        if version and version >= MIN_GRAPHIFY:
            found.append(("ok", f"graphify {'.'.join(map(str, version))} ({where_from})"))
        else:
            found.append(("fix", f"graphify {'.'.join(map(str, version)) if version else '?'} "
                                 f"({where_from}) is older than "
                                 f"{'.'.join(map(str, MIN_GRAPHIFY))}: {GRAPHIFY_INSTALL}"))
        python = _tool_python(graphify)
        code, out, _ = _run([python, "-c", GEMINI_PACKAGES]) if python else (None, "", "")
        if code != 0:
            found.append(("warn", "could not tell whether graphify has its Gemini support: if "
                                  f"unsure, {GRAPHIFY_INSTALL}"))
        elif out.strip() == "ok":
            found.append(("ok", "graphify has the packages its Gemini backend needs"))
        else:
            found.append(("fix", f"graphify lacks what its Gemini backend needs ({out.strip()}): "
                                 f"{GRAPHIFY_INSTALL}"))
        for line in err.splitlines():
            match = re.search(r"skill at (.+?) is from graphify (\S+), package is (\S+)\. "
                              r"Run '([^']+)'", line)
            if match:
                found.append(("suggest", f"graphify's global skill at {shown(match.group(1), home)} "
                                         f"is from {match.group(2)}, graphify is {match.group(3)}: "
                                         f"{match.group(4)} (it changes that global skill)"))
    problems = environment_problems(env)
    found += problems
    named = " ".join(text for _, text in problems)
    if "GEMINI_API_KEY" not in named:
        found.append(("ok", "GEMINI_API_KEY is set"))
    if "GRAPHIFY_GEMINI_MODEL" not in named:
        found.append(("ok", f"GRAPHIFY_GEMINI_MODEL is {GEMINI_MODEL}"))
    shadow = project_graphify(project)
    if shadow:
        found.append(("warn", f"{shadow}: this project's own environment has a graphify, which runs "
                              "instead of yours inside the project: uninstall it there (pip "
                              "uninstall graphifyy) unless the project needs it"))
    if not shutil.which("pipx") and any(GRAPHIFY_INSTALL in text for _, text in found):
        found.append(("warn", "pipx is not on PATH, so that command will not run as typed: use "
                              "`python -m pipx` instead, or add the folder pipx is in to your user "
                              "PATH (on Windows, %APPDATA%\\Python\\Python3XX\\Scripts)"))
    found += local_setup(project)
    found += [("warn", note) for note in committed_setup_notes(project)]
    return found + global_suggestions(home)


def _text(path):
    """A file's text, or None for one that is binary (a sound, an image) or unreadable."""
    try:
        with open(path, "rb") as handle:
            data = handle.read(2_000_000)
    except OSError:
        return None
    if b"\0" in data:
        return None
    return data.decode("utf-8", "replace")


def machine_paths(project):
    """Every committed agent file or assistant setting that names one computer by an absolute
    path, with the paths it names (the general rules' block aside: the kit checks that)."""
    problems = []
    for name in sorted(files_of(project)):
        if not (name in AGENT_FILES or any(name == place or (place.endswith("/")
                                                              and name.startswith(place))
                                           for place in TOOL_SETUP)):
            continue
        text = _text(os.path.join(project, name))
        found = sorted({match.group(0) for match in MACHINE_PATH.finditer(BLOCK.sub("", text or ""))})
        if found:
            problems.append(f"{name} names one computer: {', '.join(found[:3])}. Run a tool by its "
                            "command (graphify, node) and reach the project's files by paths "
                            "relative to its root; what only one computer needs goes in "
                            ".claude/settings.local.json, never committed.")
    return problems


def scratch_unignored(project):
    """Each tool config at the project's root whose tool would read scratch/ (TREE_TOOLS): one
    that neither names scratch/ nor reads .gitignore."""
    problems = []
    for tool, configs, reads_gitignore in TREE_TOOLS:
        for name in configs:
            text = read(os.path.join(project, name))
            if text is not None and "scratch" not in text and reads_gitignore not in text:
                problems.append(f"{name}: {tool} reads the whole tree but not .gitignore, so it "
                                "would read scratch/ too, the kit's clone included. Add "
                                "'scratch/' to its ignores (RULES.md, scratch/).")
    return problems


def _uses_prettier(project):
    """Whether the project formats with Prettier: a config or ignore file of its own, or Prettier
    in package.json."""
    if any(os.path.exists(os.path.join(project, name)) for name in PRETTIER):
        return True
    try:
        package = json.loads(read(os.path.join(project, "package.json")) or "{}")
    except ValueError:
        return False
    return isinstance(package, dict) and ("prettier" in package or any(
        isinstance(package.get(key), dict) and "prettier" in package[key]
        for key in ("dependencies", "devDependencies")))


def _formatted(project):
    """Of TOOL_WRITTEN, each entry this project has, with its files Prettier would format."""
    found = {}
    for entry in TOOL_WRITTEN:
        target = os.path.join(project, *entry.rstrip("/").split("/"))
        names = []
        if entry.endswith("/"):
            for dirpath, _, filenames in os.walk(target):
                rel = os.path.relpath(dirpath, project).replace(os.sep, "/")
                names += [f"{rel}/{name}" for name in filenames]
        elif os.path.isfile(target):
            names = [entry]
        names = [name for name in names if name.lower().endswith(FORMATTED)]
        if names:
            found[entry] = names
    return found


def _ignore_rows(project, *names):
    """The patterns of the ignore files `names` at the project's root, comments and negations
    aside."""
    rows = []
    for name in names:
        rows += [row.strip() for row in (read(os.path.join(project, name)) or "").split("\n")]
    return [row for row in rows if row and not row.startswith(("#", "!"))]


def _glob(pattern):
    """An ignore file's pattern as a regular expression: `*` and `?` stay within one folder,
    `**` crosses them."""
    out, at = [], 0
    while at < len(pattern):
        if pattern.startswith("**/", at):
            out.append("(?:.*/)?")
            at += 3
        elif pattern.startswith("**", at):
            out.append(".*")
            at += 2
        elif pattern[at] in "*?":
            out.append("[^/]*" if pattern[at] == "*" else "[^/]")
            at += 1
        elif pattern[at] == "[" and "]" in pattern[at + 2:]:
            end = pattern.index("]", at + 2)
            inside = pattern[at + 1:end]
            out.append("[" + ("^" + inside[1:] if inside.startswith("!") else inside) + "]")
            at = end + 1
        else:
            out.append(re.escape(pattern[at]))
            at += 1
    return re.compile("".join(out) + r"\Z")


def _covered(path, rows):
    """Whether ignore `rows` cover the file `path`, as git reads them: the file or a folder it is
    in, by its name anywhere, or by its path from the root when the pattern has a folder in it."""
    parts = path.split("/")
    for row in rows:
        folders_only, pattern = row.endswith("/"), row.strip("/")
        anchored = row.startswith("/") or "/" in pattern
        matches = _glob(pattern).match
        for depth in range(1, len(parts) + (0 if folders_only else 1)):
            if matches("/".join(parts[:depth]) if anchored else parts[depth - 1]):
                return True
    return False


def kit_files_unignored(project):
    """Each linter or formatter config that would change what the kit and graphify write
    (TOOL_WRITTEN): one of CODE_TOOLS whose config never mentions what it must leave alone, and
    Prettier, when the project formats with it, while its ignore rows (and .gitignore's, which it
    reads too) leave any of that in."""
    problems = []
    pyproject = read(os.path.join(project, "pyproject.toml")) or ""
    for tool, configs, section, target, mention in CODE_TOOLS:
        if not os.path.exists(os.path.join(project, *target.rstrip("/").split("/"))):
            continue
        found = [(name, read(os.path.join(project, name))) for name in configs]
        if section and section in pyproject:
            found.append(("pyproject.toml", pyproject))
        for name, text in found:
            if text is not None and mention not in text:
                problems.append(f"{name}: {tool} would read {target}, which every install "
                                "replaces word for word. Add it to its ignores (MERGE.md, step 3).")
    if _uses_prettier(project):
        rows = _ignore_rows(project, ".prettierignore", ".gitignore")
        left = [entry for entry, names in _formatted(project).items()
                if not all(_covered(name, rows) for name in names)]
        if left:
            problems.append(".prettierignore: Prettier would rewrite what the kit and graphify "
                            f"write: {', '.join(left)}. Add them to .prettierignore (MERGE.md, "
                            "step 3).")
    return problems


def committed_setup(project):
    """Each person's own assistant setup the project's git tracks (LOCAL_SETUP, OTHER_SETUP): its
    files, by the folder or file they fall under."""
    return _tracked_under(project, LOCAL_SETUP + OTHER_SETUP)


def committed_setup_notes(project):
    """A line for the owner when the project commits anyone's own assistant setup, with how to
    stop from now on; none when it commits none."""
    files = [name for names in committed_setup(project).values() for name in names]
    if not files:
        return []
    named = ", ".join(files[:6]) + (f" and {len(files) - 6} more" if len(files) > 6 else "")
    return [f"Committed here, though it is each person's own assistant setup (RULES.md, *Working "
            f"with the owner*): {named}. To stop committing it from now on, with the owner's yes: "
            "python scripts/agent_kit.py untrack --yes. Every file stays on this computer; every "
            "other computer loses its copy at the pull that brings that change, and sets its own "
            "up again (the kit's install, graphify's installer)."]


def untrack(project):
    """Stop committing each person's assistant setup that the project tracks: keep it out in
    .gitignore and take it out of git's index, every file staying on this computer. Returns what
    it did, a line each; the commit that follows is the owner's."""
    found = committed_setup(project)
    if not found:
        return ["Nothing of anyone's own assistant setup is committed here."]
    path = os.path.join(project, ".gitignore")
    text = read(path) or ""
    rows = text.rstrip("\n").split("\n") if text.strip() else []
    tail = [entry for entry in found if not _has_row([row.strip() for row in rows], entry)]
    if tail:
        if GITIGNORE_NOTE not in [row.strip() for row in rows]:
            rows += ([""] if rows and rows[-1].strip() else []) + [GITIGNORE_NOTE]
        write(path, "\n".join(rows + tail) + "\n")
    files = [name for names in found.values() for name in names]
    for start in range(0, len(files), 100):  # a command line has a length limit on Windows
        _git(project, "rm", "-q", "--cached", "--", *files[start:start + 100])
    return [f".gitignore: {', '.join(tail)}" if tail else ".gitignore keeps them out already",
            f"No longer tracked, and still on this computer: {', '.join(files)}",
            "Commit it to finish. At their next pull, every other computer loses its copy of "
            "these files and sets its own up again."]


def check(project, docs=(), history=()):
    """Every problem with the project's agent files, its tools' configs and its docs; none when
    all is well. This computer's own assistant setup is not the project's, so `doctor` looks at
    that instead."""
    problems, shared = [], {}
    for name in AGENT_FILES:
        text = read(os.path.join(project, name))
        if text is None:
            problems.append(f"{name} is missing. Each assistant reads its own file: run sync.")
            continue
        blocks = list(BLOCK.finditer(text))
        if len(blocks) != 1:
            problems.append(f"{name} holds the general rules {len(blocks)} times, not once: "
                            "install them again from the kit.")
        elif not _rules_as_installed(blocks[0]):
            problems.append(f"{name}: the general rules were edited here. Change them in the "
                            "kit the marker names, and install them again.")
        shared[name] = shared_part(text)
    names = list(shared)
    for name in names[1:]:
        if shared[name] != shared[names[0]]:
            first, other = shared[names[0]].split("\n"), shared[name].split("\n")
            at = next((i for i, (a, b) in enumerate(zip(first, other)) if a != b),
                      min(len(first), len(other)))
            line = other[at] if at < len(other) else "(the file ends here)"
            problems.append(f"{name} differs from {names[0]} at line {at + 1} of what they "
                            f"share: {line!r}. Change AGENTS.md, then run sync.")
    return (problems + machine_paths(project) + scratch_unignored(project)
            + kit_files_unignored(project) + stale_docs(project, docs, history))


def words_in(text, words):
    """The words of `words` that begin a word of `text`, in any case: `menu` is in "Menus", never
    in "commenu" or "x.menu"."""
    text = text.lower()
    return [word for word in words if re.search(rf"(?<![\w.]){re.escape(word.lower())}", text)]


def _at(kit, base, name):
    """The kit's file `name` as it was at `base` (a branch or a commit; "" for what git has
    staged), or None when git cannot say."""
    try:
        return subprocess.run(["git", "-C", kit, "show", f"{base}:./{name}"], capture_output=True,
                              encoding="utf-8", check=True).stdout.replace("\r\n", "\n")
    except (OSError, subprocess.CalledProcessError):
        return None


def harvest_words(kit, words, base="main"):
    """Each line of the kit's general files that is new since `base` and holds one of the
    harvested project's `words`, as (file, line number, words, line). A file git cannot show
    as it was at `base` has every line checked."""
    hits = []
    for name in GENERAL_FILES:
        text = read(os.path.join(kit, *name.split("/")))
        if text is None:
            continue
        lines, old = text.split("\n"), _at(kit, base, name)
        if old is None:
            new = range(len(lines))
        else:
            matcher = difflib.SequenceMatcher(None, old.split("\n"), lines, autojunk=False)
            new = [j for tag, _, _, start, end in matcher.get_opcodes()
                   if tag in ("replace", "insert") for j in range(start, end)]
        for j in new:
            found = words_in(lines[j], words)
            if found:
                hits.append((name, j + 1, found, lines[j].strip()))
    return hits


def _recorded_source(project):
    """(repository, folder) the project's kit came from: its record's, or else what the marker
    in its agent files names (`from github.com/owner/repository/folder`); (None, None) when
    neither says."""
    record = _read_record(project)
    if record.get("repository"):
        return record["repository"], record.get("folder") or "."
    for name in AGENT_FILES:
        match = BLOCK.search(read(os.path.join(project, name)) or "")
        named = re.search(r"from (\S+?),", match.group("attrs")) if match else None
        parts = named.group(1).split("/") if named else []
        if len(parts) >= 3 and "." in parts[0]:  # a host, an owner and a repository
            return "/".join(parts[:3]), "/".join(parts[3:]) or "."
    return None, None


def clone_urls(repository):
    """Where a kit's repository is cloned from: by SSH first, as MERGE.md's prompt does, then
    HTTPS."""
    host, _, path = repository.partition("/")
    return [f"git@{host}:{path}.git", f"https://{host}/{path}.git"]


def update_prompt(repository, folder):
    """What to tell a project's assistant to bring the project up to date with the kit."""
    merge = "MERGE.md" if folder == "." else f"{folder}/MERGE.md"
    return (f"Clone `{clone_urls(repository)[0]}` into `scratch/{repository.rsplit('/', 1)[-1]}` "
            f"(or, if it is there, switch it to `main` and pull) and follow its `{merge}`.")


def unmerged(kit, project="."):
    """Why the kit here may hold what the owner has not merged: its clone is on a branch other
    than its repository's main (a harvest's, say), or has changes not committed. "" when it is
    on main as committed, or when nothing can say (a copy, a repository with no commit yet)."""
    if not _kit_repository(kit):
        return ""
    try:
        _git(kit, "rev-parse", "--verify", "-q", "HEAD")
        branch = _git(kit, "rev-parse", "--abbrev-ref", "HEAD")
        dirty = _git(kit, "status", "--porcelain", "--", ".")
    except (OSError, subprocess.CalledProcessError):
        return ""
    try:
        main = _git(kit, "symbolic-ref", "--short", "refs/remotes/origin/HEAD").split("/", 1)[-1]
    except (OSError, subprocess.CalledProcessError):
        main = "main"
    top = _kit_repository(kit)
    try:  # real paths, as in where(): Windows may name one folder two ways
        clone = os.path.relpath(os.path.realpath(top), os.path.realpath(project)).replace(os.sep, "/")
    except ValueError:  # two drives on Windows
        clone = ".."
    clone = clone if not clone.startswith("..") else shown(top)
    if branch != main:
        return (f"the kit's clone is on {branch}, not {main}, so it may hold rules the owner has "
                f"not merged (a harvest's). Once they are: git -C {clone} switch {main}, then "
                f"git -C {clone} pull --ff-only")
    if dirty:
        return (f"the kit in {clone} has changes not committed, which the owner has not merged: "
                "commit them on a branch of their own, or set them aside")
    return ""


def _remove_tree(path):
    """Delete a folder, git's read-only files included, which Windows would otherwise refuse."""
    def writable(func, target, _):
        os.chmod(target, stat.S_IWRITE)
        func(target)
    if os.path.isdir(path):
        if sys.version_info >= (3, 12):
            shutil.rmtree(path, onexc=writable)
        else:
            shutil.rmtree(path, onerror=writable)


def _linked(info):
    """Whether an lstat result is a link: a symbolic link, or on Windows a junction, whose tag
    only Windows' stat module has."""
    junction = getattr(stat, "IO_REPARSE_TAG_MOUNT_POINT", None)
    return (stat.S_ISLNK(info.st_mode)
            or (junction is not None and getattr(info, "st_reparse_tag", None) == junction))


def _is_link(path):
    """Whether `path` is a link, which a delete must remove alone, never what it points at."""
    try:
        return _linked(os.lstat(path))
    except OSError:
        return False


def _inside(path, folder):
    """Whether `path` is below `folder`: in it, and not the folder itself."""
    path, folder = os.path.normcase(path), os.path.normcase(folder)
    try:
        return path != folder and os.path.commonpath([path, folder]) == folder
    except ValueError:  # two drives on Windows
        return False


def _contents(path):
    """(size, newest, checkouts) for what is at `path`, never through a link: how many bytes its
    files hold, when anything in it last changed outside git's own folders (a timestamp), and
    each git checkout in it (a folder holding a .git), it included."""
    size, newest, checkouts, todo = 0, 0.0, [], [(path, False)]
    while todo:
        here, in_git = todo.pop()
        try:
            info = os.lstat(here)
        except OSError:
            continue
        if not in_git:
            newest = max(newest, info.st_mtime)
        if _linked(info) or not stat.S_ISDIR(info.st_mode):
            size += 0 if _linked(info) else info.st_size
            continue
        try:
            names = os.listdir(here)
        except OSError:
            continue
        if ".git" in names:
            checkouts.append(here)
        todo += [(os.path.join(here, name), in_git or name == ".git") for name in names]
    return size, newest, checkouts


def _unsaved(checkout, within=None):
    """What a git checkout holds that is nowhere else, a phrase each (none when there is nothing
    to lose): changes not committed, commits no remote has, a stash. With `within` (a path in the
    checkout, from its top), only the changes there: deleting it leaves the checkout's commits
    and stashes where they are. It writes nothing, so a listing never makes a clone look recently
    used. Raises OSError or CalledProcessError when git cannot say."""
    def git(*args):
        return subprocess.run(["git", "--no-optional-locks", "-C", checkout, *args],
                              capture_output=True, text=True, check=True).stdout.strip()
    found = []
    changed = git("status", "--porcelain", *(["--", within] if within else [])).splitlines()
    if changed:
        found.append(f"{len(changed)} change(s) not committed")
    if within:
        return found
    head = subprocess.run(["git", "-C", checkout, "rev-parse", "--verify", "-q", "HEAD"],
                          capture_output=True).returncode == 0
    ahead = git("rev-list", "--count", *(["HEAD"] if head else []), "--branches", "--not",
                "--remotes")
    if ahead not in ("", "0"):
        found.append(f"{ahead} commit(s) no remote has")
    if git("stash", "list"):
        found.append("a stash")
    return found


def _human(size):
    """A size as people read it: 1 byte, 512 bytes, 3.4 MB."""
    for unit in ("bytes", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return (f"{size} byte{'' if size == 1 else 's'}" if unit == "bytes"
                    else f"{size:.1f} {unit}")
        size /= 1024


def _ago(timestamp, now):
    """How long before `now` a timestamp is, in its largest whole unit: "3 days ago"."""
    seconds = max(0.0, now - timestamp)
    for unit, length in (("day", 86400), ("hour", 3600), ("minute", 60)):
        if seconds >= length:
            count = int(seconds // length)
            return f"{count} {unit}{'' if count == 1 else 's'} ago"
    return "just now"


def _remove(path):
    """Delete what is at `path`: a link alone, never what it points at; a file; or a folder and
    everything in it, git's read-only files included."""
    if _is_link(path):
        try:
            os.unlink(path)
        except OSError:  # Windows removes a junction, or a link to a folder, as a folder
            os.rmdir(path)
    elif os.path.isdir(path):
        _remove_tree(path)
    else:
        try:
            os.remove(path)
        except PermissionError:  # read-only, which Windows refuses to delete
            os.chmod(path, stat.S_IWRITE)
            os.remove(path)


def _git_work(path, checkouts, project, within=False):
    """A phrase for each of `checkouts` holding git work that is nowhere else, or whose work git
    cannot tell: none when deleting `path` loses nothing of git's. Each checkout is in `path`, or
    with `within`, `path` is in it, and only its changes there count, unless `path` is in its
    .git, which holds all its commits and stashes."""
    held = []
    for checkout in checkouts:
        part = os.path.relpath(path, checkout).replace(os.sep, "/") if within else None
        where = "" if checkout == path else (
            " in " + os.path.relpath(checkout, project).replace(os.sep, "/"))
        try:
            found = _unsaved(checkout, None if part is None or part.split("/")[0] == ".git"
                             else part)
        except (OSError, subprocess.CalledProcessError) as error:
            said = (getattr(error, "stderr", "") or str(error)).strip().splitlines()
            held.append(f"what git cannot tell{where} ({said[-1] if said else 'git failed'})")
            continue
        if found:
            held.append(", ".join(found) + where)
    return held


def _checkouts_around(path, scratch):
    """Each git checkout `path` is in, up to `scratch` (a clone in scratch/, say)."""
    found, folder = [], os.path.dirname(path)
    while _inside(folder, scratch) or os.path.normcase(folder) == os.path.normcase(scratch):
        if os.path.lexists(os.path.join(folder, ".git")):
            found.append(folder)
        folder = os.path.dirname(folder)
    return found


def scratch_contents(project):
    """A line for each thing in the project's scratch/: its size, when it last changed, and the
    git work in it that is nowhere else. Changes nothing."""
    root = os.path.realpath(project)
    scratch = os.path.join(root, SCRATCH)
    names = sorted(os.listdir(scratch)) if os.path.isdir(scratch) else []
    if not names:
        return [f"{SCRATCH}/ holds nothing"]
    lines, total, now = [], 0, time.time()
    for name in names:
        path = os.path.join(scratch, name)
        if _is_link(path):
            lines.append(f"{SCRATCH}/{name}: a link, to {shown(os.path.realpath(path))} (clean "
                         "removes the link alone)")
            continue
        size, newest, checkouts = _contents(path)
        total += size
        held = _git_work(path, checkouts, root)
        git = ("; git work nowhere else: " + "; ".join(held) if held
               else "; git: all on a remote" if checkouts else "")
        lines.append(f"{SCRATCH}/{name}: {_human(size)}, last changed {_ago(newest, now)}{git}")
    lines.append(f"{len(names)} thing(s), {_human(total)}. Delete what is yours and done with "
                 f"(RULES.md, *Cleaning up*): python scripts/agent_kit.py clean {SCRATCH}/<name>")
    return lines


def clean(project, paths=()):
    """Throwaway work in the project's scratch/ (RULES.md, *Cleaning up*): with no path, what it
    holds (scratch_contents), changing nothing; with paths, each one deleted, unless it is
    outside scratch/ (or scratch/ itself), git tracks it, or it holds git work that is nowhere
    else. A link goes alone, never what it points at. (lines, problems): what was removed, and
    each path kept, with why."""
    root = os.path.realpath(project)
    scratch = os.path.join(root, SCRATCH)
    if _is_link(scratch):
        return [], [f"{SCRATCH}/ is a link, to {os.path.realpath(scratch)}: clean deletes only in "
                    "a folder of the project's own"]
    if not paths:
        return scratch_contents(project), []
    lines, problems, freed = [], [], 0
    for name in paths:
        given = os.path.abspath(os.path.join(root, name))
        # The folder it is in, through any link, and the name itself as it is: a link is a name.
        target = os.path.join(os.path.realpath(os.path.dirname(given)), os.path.basename(given))
        named = name.replace(os.sep, "/")
        if not _inside(target, scratch):
            problems.append(f"{named}: kept, since it is not in {SCRATCH}/, the one place clean "
                            "deletes: remove it with the tool that made it, or ask the owner")
            continue
        if not os.path.lexists(target):
            problems.append(f"{named}: nothing there")
            continue
        try:
            tracked = _git(root, "ls-files", "--",
                           os.path.relpath(target, root).replace(os.sep, "/")).splitlines()
        except (OSError, subprocess.CalledProcessError):
            tracked = []  # not a repository, or no git: nothing is tracked
        if tracked:
            problems.append(f"{named}: kept, since git tracks {tracked[0]}"
                            f"{' and more' if len(tracked) > 1 else ''} in it, and {SCRATCH}/ is "
                            "never committed (RULES.md, *scratch/*): ask the owner")
            continue
        size, checkouts = 0, []
        if not _is_link(target):
            size, _, checkouts = _contents(target)
        held = (_git_work(target, checkouts, root)
                + _git_work(target, _checkouts_around(target, scratch), root, within=True))
        if held:
            problems.append(f"{named}: kept, since deleting it could lose git work that is "
                            f"nowhere else: {'; '.join(held)}. Push or save it first, or ask the "
                            "owner")
            continue
        try:
            _remove(target)
        except OSError as error:
            problems.append(f"{named}: not all deleted ({error.strerror or error}): a program "
                            "may still be using it. Stop it, then clean again")
            continue
        freed += size
        lines.append(f"removed {named} ({_human(size)})")
    if lines:
        lines.append(f"{_human(freed)} freed")
    return lines, problems


def fetch_kit(repository, into):
    """Clone the newest commit of the kit's repository into `into`, by SSH or else HTTPS, never
    asking for anything, so a check in the background cannot wait on an answer. Raises OSError,
    in git's own words, when neither works."""
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    errors = []
    for url in clone_urls(repository):
        try:
            done = subprocess.run(["git", "clone", "-q", "--depth", "1", url, into], env=env,
                                  stdin=subprocess.DEVNULL, capture_output=True, text=True,
                                  timeout=180)
        except (OSError, subprocess.TimeoutExpired) as error:
            errors.append(f"{url}: {error}")
            continue
        if done.returncode == 0:
            return
        errors.append(f"{url}: {(done.stderr.strip().splitlines() or ['git failed'])[-1]}")
        _remove_tree(into)
    raise OSError("; ".join(errors))


def _kind(rel):
    """What a file an install changes is, as the owner would name it."""
    if rel in AGENT_FILES:
        return "the general rules"
    if rel.startswith(CLAUDE_HOOKS + "/"):
        return "Claude Code's hooks"
    if rel in (".claude/settings.json", ".claude/settings.local.json", LOCAL_RECORD):
        return "Claude Code's settings"
    if any(rel.startswith(folder + "/") for folder in SKILL_FOLDERS):
        return "the prompt skill"
    return rel


def outdated(project, fetch=None):
    """(status, summary, lines): "current" when the project has everything the newest kit would
    install; "behind", with what an update would change; or "unknown", with why it cannot tell.
    The newest kit is cloned into a temporary folder outside the project and compared by a dry
    run of this file's own install: nothing in the project is written and nothing fetched is run
    (a change to the kit's script shows as one to scripts/agent_kit.py)."""
    repository, folder = _recorded_source(project)
    if not repository:
        return "unknown", ("nothing says which repository this project's agent kit came from "
                           "(it was installed from a copy, or never)"), []
    temporary = tempfile.mkdtemp(prefix="agent-kit-")
    try:
        clone = os.path.join(temporary, repository.rsplit("/", 1)[-1])
        try:
            (fetch or fetch_kit)(repository, clone)
        except OSError as error:
            return "unknown", f"could not fetch {repository}: {error}", []
        kit = clone if folder == "." else os.path.join(clone, *folder.split("/"))
        run = _install(project, kit, _Run(dry=True), has_local_setup(project))
    except SystemExit as refusal:
        return "unknown", str(refusal), []
    finally:
        _remove_tree(temporary)
    if not run.changed:
        return "current", "", []
    kinds = []
    for path in run.changed:
        kind = _kind(os.path.relpath(path, project).replace(os.sep, "/"))
        if kind not in kinds:
            kinds.append(kind)
    return ("behind", ", ".join(kinds),
            [line for line in run.lines if not line.endswith(": unchanged")])


def record_check(project, status, message):
    """Keep what `outdated` found in UPDATE_CHECK, for the reminder at the start of a session,
    leaving the day it was last shown."""
    path = os.path.join(project, *UPDATE_CHECK.split("/"))
    try:
        state = json.loads(read(path) or "{}")
    except ValueError:
        state = {}
    if not isinstance(state, dict):
        state = {}
    state.update(checked=datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"), status=status, message=message)
    write(path, json.dumps(state, indent=2) + "\n")


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(prog="agent_kit.py", description=__doc__.split("\n", 1)[0])
    commands = parser.add_subparsers(dest="command", required=True)
    put = commands.add_parser("install", help="put the general rules into a project, and the kit's "
                                              "setup for this computer's assistants, or bring "
                                              "them up to date")
    put.add_argument("project")
    put.add_argument("--rules-only", action="store_true",
                     help="the project's part alone (the rules, the script and its record): none "
                          "of the kit's setup for this computer's assistants")
    put.add_argument("--any-branch", action="store_true",
                     help="install from a kit clone on another branch, or with changes not "
                          "committed (what the owner has not merged), all the same")
    mirror = commands.add_parser("sync", help="make CLAUDE.md and GEMINI.md say what AGENTS.md "
                                              "says")
    mirror.add_argument("--project", default=".")
    mirror.add_argument("--force", action="store_true",
                        help="even over a file with lines AGENTS.md lacks")
    look = commands.add_parser("check", help="the agent files agree, the hooks are in place, "
                                             "the linters and formatters leave the kit's files "
                                             "alone, and the docs name only what exists")
    look.add_argument("--project", default=".")
    look.add_argument("--doc", action="append", default=[], metavar="FILE",
                      help="also check this doc (the agent files and READMEs always are)")
    look.add_argument("--history", action="append", default=[], metavar="FILE",
                      help="a record of the past, such as the plan or a changelog: not checked")
    ready = commands.add_parser("doctor", help="what this computer needs: git, Node, the GitHub "
                                               "CLI, and graphify with its Gemini support, key "
                                               "and model")
    ready.add_argument("--project", default=".")
    late = commands.add_parser("outdated", help="whether the kit changed since it was installed "
                                                "here, and what installing it again would change")
    late.add_argument("--project", default=".")
    late.add_argument("--record", action="store_true",
                      help=f"also keep the answer in {UPDATE_CHECK}, for the reminder at the "
                           "start of a Claude Code session")
    harvest = commands.add_parser("words", help="the lines a harvest adds to the general rules "
                                                "that hold one of its project's words")
    harvest.add_argument("words", nargs="+", metavar="WORD")
    harvest.add_argument("--base", default="main", help="what the harvest's branch started from")
    away = commands.add_parser("untrack", help="stop committing each person's own assistant setup "
                                               "from now on: list it, or with --yes keep it out "
                                               "of git, every file staying on this computer")
    away.add_argument("--project", default=".")
    away.add_argument("--yes", action="store_true", help="do it: the owner has said yes")
    sweep = commands.add_parser("clean", help="the throwaway work in the project's scratch/: list "
                                              "it, or delete what is named there, keeping any git "
                                              "work that is nowhere else")
    sweep.add_argument("paths", nargs="*", metavar="PATH",
                       help="what to delete, from the project's root: scratch/<name>")
    sweep.add_argument("--project", default=".")
    args = parser.parse_args(argv)
    if args.command == "clean":
        lines, problems = clean(args.project, args.paths)
        for line in lines + problems:
            print(line)
        return 1 if problems else 0
    if args.command == "untrack":
        if not args.yes:
            notes = committed_setup_notes(args.project)
            print(notes[0] + " Run it again with --yes once the owner has said yes." if notes
                  else "Nothing of anyone's own assistant setup is committed here.")
            return 1 if notes else 0
        try:
            lines = untrack(args.project)
        except (OSError, subprocess.CalledProcessError) as error:
            print(f"Not done: git said {getattr(error, 'stderr', '') or error}")
            return 1
        for line in lines:
            print(line)
        return 0
    if args.command == "outdated":
        status, summary, lines = outdated(args.project)
        repository, folder = _recorded_source(args.project)
        named = repository if folder in (None, ".") else f"{repository}/{folder}"
        prompt = update_prompt(repository, folder) if repository else ""
        if status == "current":
            print(f"agent kit: up to date with {named}")
        elif status == "behind":
            print(f"agent kit: behind {named} ({summary}). Installing it again would change:")
            for line in lines:
                print("  " + line.replace("\n", "\n  "))
            print(f"To update, tell the project's assistant: {prompt}")
        else:
            print(f"agent kit: cannot tell whether this project is up to date: {summary}")
        if args.record:
            record_check(args.project, status, (
                f"The agent kit has changed since this project installed it ({summary}). To "
                f"update, tell your assistant: {prompt}") if status == "behind" else summary)
        return {"current": 0, "behind": 1}.get(status, 2)
    if args.command == "words":
        kit = os.path.dirname(os.path.abspath(__file__))
        if read(os.path.join(kit, "RULES.md")) is None:
            raise SystemExit("words runs from the kit, beside RULES.md (HARVEST.md, step 4)")
        if _at(kit, args.base, "RULES.md") is None:
            print(f"git cannot show the kit as it was at {args.base!r}, so every line is checked")
        hits = harvest_words(kit, args.words, args.base)
        for name, number, found, line in hits:
            print(f"{name}:{number}: {', '.join(found)}: {line}")
        print(f"{len(hits)} line(s) hold this project's words: reword them, then run this again"
              if hits else "No line the harvest adds holds one of these words")
        return 1 if hits else 0
    if args.command == "doctor":
        found = doctor(args.project)
        for level, text in found:
            print(f"{level:<7} {text}")
        if any(level == "suggest" for level, _ in found):
            print("Each suggestion changes this computer, not the project: make it only if you "
                  "want it.")
        return 1 if any(level == "fix" for level, _ in found) else 0
    if args.command == "install":
        kit = os.path.dirname(os.path.abspath(__file__))
        problem = unmerged(kit, args.project)
        if problem and not args.any_branch:
            print(f"Not installed: {problem}. To install it all the same, add --any-branch.")
            return 1
        for line in install(args.project, kit, local=not args.rules_only):
            print(line)
        merge = os.path.join(kit, "MERGE.md")
        try:
            relative = os.path.relpath(os.path.realpath(merge), os.path.realpath(args.project))
        except ValueError:  # two drives on Windows
            relative = ".."
        print(NEXT.format(merge=relative.replace(os.sep, "/") if not relative.startswith("..")
                          else shown(merge)))
        return 0
    if args.command == "sync":
        done, refused = sync(args.project, args.force)
        for line in done + refused:
            print(line)
        return 1 if refused else 0
    problems = check(args.project, args.doc, args.history)
    for line in problems:
        print(line)
    for line in committed_setup_notes(args.project):  # the owner's to decide: never a failure
        print(f"note: {line}")
    print(f"agent kit: {len(problems)} problem(s)" if problems else "agent kit: all good")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
