// Logs every shell command Claude Code runs, with its output, in .claude/logs/bash.jsonl
// (gitignored: output can hold secrets). Past 5 MB the log starts again, and the last one is
// kept as bash.1.jsonl.
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'fs';

const LOG_DIR = '.claude/logs';
const LOG_FILE = `${LOG_DIR}/bash.jsonl`;
const LIMIT = 5 * 1024 * 1024;

mkdirSync(LOG_DIR, { recursive: true });
if (existsSync(LOG_FILE) && statSync(LOG_FILE).size > LIMIT) {
  renameSync(LOG_FILE, `${LOG_DIR}/bash.1.jsonl`);
}

let data = '';
process.stdin.on('data', (chunk) => (data += chunk));
process.stdin.on('end', () => {
  const json = JSON.parse(data);
  const entry = JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      session_id: json.session_id,
      tool: json.tool_name ?? 'Bash',
      command: json.tool_input?.command,
      stdout: json.tool_response?.stdout ?? null,
      stderr: json.tool_response?.stderr ?? null
    },
    null,
    2
  );
  appendFileSync(LOG_FILE, entry + '\n\n');
});
