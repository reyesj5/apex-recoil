// At the start of a session, tells the owner when this project is behind the agent kit (its rules,
// hooks or settings changed in the kit since the project last installed them), at most once a day.
// The check itself, `python scripts/agent_kit.py outdated --record`, runs in the background at most
// once a day, so a session never waits for it; offline, or with no answer, it says nothing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { spawn } from 'child_process';

const FOUND = '.claude/logs/agent-kit-update.json';
const SCRIPT = 'scripts/agent_kit.py';
const AGAIN = 20 * 60 * 60 * 1000; // a little under a day, so each day's first session checks
const PYTHON = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];

let state = {};
try {
  state = JSON.parse(readFileSync(FOUND, 'utf8'));
} catch {
  // No answer kept yet: start from nothing.
}
const today = new Date().toISOString().slice(0, 10);
const message = state.status === 'behind' && state.message && state.shown !== today ? state.message : null;
if (message) state.shown = today;
const due = existsSync(SCRIPT) && !(Date.now() - Date.parse(state.checked) < AGAIN);
if (due) state.checked = new Date().toISOString(); // today's check, even if it never finishes
if (message || due) {
  mkdirSync('.claude/logs', { recursive: true });
  writeFileSync(FOUND, JSON.stringify(state, null, 2) + '\n');
}
if (due) check(PYTHON);
if (message) {
  console.log(
    JSON.stringify({
      systemMessage: message,
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: message }
    })
  );
}

// Starts the check apart from this hook, which ends at once; the next Python name is tried when
// one is not installed.
function check(names) {
  if (!names.length) return;
  const child = spawn(names[0], [SCRIPT, 'outdated', '--record'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.on('error', () => check(names.slice(1)));
  child.unref();
}
