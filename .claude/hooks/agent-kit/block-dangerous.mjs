// The kit's guard: refuses, before it runs, a command that destroys what cannot be put back,
// or anything that would open a pull request (owner, 2026-10-21: the owner opens every pull
// request). Exit code 2 makes Claude Code refuse the call and shows the reason.
let data = '';
process.stdin.on('data', (chunk) => (data += chunk));
process.stdin.on('end', () => {
  const json = JSON.parse(data);
  const cmd = json.tool_input?.command ?? '';
  const reason = refusal(json.tool_name ?? '', cmd);
  if (reason) {
    console.error(`BLOCKED: ${reason}\nCommand: ${cmd || json.tool_name}`);
    process.exit(2);
  }
});

const destructive = [
  { regex: /rm\s+(-[^\s]*r[^\s]*|--recursive)\s/, reason: 'recursive delete (rm -r)' },
  { regex: /rm\s+-[^\s]*f/, reason: 'force delete (rm -f)' },
  { regex: /rmdir\s+\/s/i, reason: 'recursive directory delete (rmdir /s)' },
  { regex: /\bRemove-Item\b[^\n;|]*\s-Recurse\b/i, reason: 'recursive delete (Remove-Item -Recurse)' },
  { regex: /git\s+push\s+.*--force/, reason: 'git force push' },
  { regex: /git\s+reset\s+--hard/, reason: 'git reset --hard' },
  { regex: /git\s+clean\s+-[^\s]*f/, reason: 'git clean -f' },
  { regex: /git\s+checkout\s+--?\s+\./, reason: 'git checkout -- . (discard all changes)' },
  { regex: /git\s+branch\s+-D\s/i, reason: 'force delete branch (git branch -D)' },
  { regex: /:\s*>\s*\//, reason: 'truncate system file' },
  { regex: /mkfs\./, reason: 'format filesystem (mkfs)' },
  { regex: /dd\s+.*of=\/dev\//, reason: 'raw disk write (dd)' },
  { regex: /chmod\s+-R\s+777/, reason: 'recursive chmod 777' },
  { regex: />\s*\/dev\/sda/, reason: 'write to raw disk' },
  { regex: /drop\s+(database|table)\s/i, reason: 'SQL drop database/table' },
  { regex: /truncate\s+table\s/i, reason: 'SQL truncate table' }
];

// Where a command starts: the line's start, after a separator or a quote (bash -c "...", or
// PowerShell's & with gh.exe's full path in quotes), with any variables set before it and its path.
const START = String.raw`(?:^|[;&|(\x60\n"']|\$\()\s*(?:\w+=\S*\s+)*(?:[^;&|\n"']*[/\\])?`;
const pullRequest = [
  new RegExp(START + String.raw`gh(?:\.exe)?["']?\s+(?:[^;&|\n]*\s)?pr\s+(?:create|new)\b`, 'i'),
  new RegExp(START + String.raw`hub(?:\.exe)?["']?\s+pull-request\b`, 'i'),
  /\bcreatePullRequest\b/i // GraphQL's mutation
];
// REST: POST /repos/{owner}/{repo}/pulls, the one endpoint that opens a pull request.
const PULLS = /\/pulls(?![\/\w])/;
const WRITE =
  /-X\s*POST|--request[=\s]+POST|--method[=\s]+POST|-Method\s+Post|\s-[dfF]\b|--data|--json|--field|--raw-field|--input|-Body\b|['"]post['"]/i;
const PULL_REQUEST = 'opening a pull request (the owner opens every one)';

function refusal(tool, cmd) {
  if (tool.startsWith('mcp__')) {
    return tool.toLowerCase().replaceAll('_', '').includes('createpullrequest') ? PULL_REQUEST : null;
  }
  for (const { regex, reason } of destructive) {
    if (regex.test(cmd)) return reason;
  }
  if (pullRequest.some((regex) => regex.test(cmd)) || (PULLS.test(cmd) && WRITE.test(cmd))) {
    return PULL_REQUEST;
  }
  return null;
}
