// Keeps graphify's LLM work on Gemini (owner, 2026-10-24): Claude never does graphify's semantic
// extraction or names its communities itself, whatever graphify's own skill says (it makes the
// assistant the model when it finds no key). Refuses dispatching graphify's extraction subagents,
// writing its chunk or label files, and running graphify's LLM steps on anything but Gemini.
// Exit code 2 makes Claude Code refuse the call and shows the reason.
let data = '';
process.stdin.on('data', (chunk) => (data += chunk));
process.stdin.on('end', () => {
  const json = JSON.parse(data);
  const reason = refusal(json.tool_name ?? '', json.tool_input ?? {});
  if (reason) {
    console.error(`BLOCKED: ${reason}`);
    process.exit(2);
  }
});

const GEMINI =
  "graphify's semantic extraction and community naming run on Gemini, never by Claude: " +
  '`graphify extract . --backend gemini`, then `graphify label . --backend gemini`, with ' +
  'GEMINI_API_KEY set and GRAPHIFY_GEMINI_MODEL=gemini-3.5-flash-lite. If Gemini is not ready, tell the owner.';
const CHUNK = /\.graphify_chunk_\d*/; // the files graphify's extraction subagents write
const LABELS = /\.graphify_labels\.json/; // the names of the graph's communities
const SPEC = /extraction-spec/; // the extraction prompt graphify's skill hands its subagents
const WRITE =
  /write_text|write_bytes|json\.dump|open\([^)]*["'][wax]|Set-Content|Out-File|Add-Content|>\s*["']?[^\s"']*graphify_(?:chunk|labels)/;
const NOT_GEMINI = /--backend[=\s]+["']?(?!gemini\b)[\w-]+|backend\s*=\s*["'](?!gemini["'])[\w-]+["']/i;
// Each of graphify's LLM steps in a command, with its own arguments up to the end of that command.
const LLM_STEP = /\bgraphify(?:\.exe)?["']?\s+(extract|label|cluster-only)\b([^;&|\n]*)/gi;

function refusal(tool, input) {
  if (tool === 'Agent' || tool === 'Task') {
    const prompt = `${input.prompt ?? ''} ${input.description ?? ''}`;
    return CHUNK.test(prompt) || SPEC.test(prompt) ? GEMINI : null;
  }
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const path = input.file_path ?? input.notebook_path ?? '';
    return CHUNK.test(path) || LABELS.test(path) ? GEMINI : null;
  }
  const cmd = input.command ?? '';
  if (!/graphify/i.test(cmd)) return null;
  if ((CHUNK.test(cmd) || LABELS.test(cmd)) && WRITE.test(cmd)) return GEMINI;
  if (/extract_corpus|graphify\.llm/.test(cmd) && NOT_GEMINI.test(cmd)) return GEMINI;
  // Each step is judged by its own arguments, never by words elsewhere in the line. None of them
  // takes --help (`graphify extract . --help` extracts, `graphify label --help` names), so a help
  // flag earns no pass.
  for (const [, step, args] of cmd.matchAll(LLM_STEP)) {
    if (NOT_GEMINI.test(args)) return GEMINI;
    const free = /--code-only\b/.test(args) || (step.toLowerCase() === 'cluster-only' && /--no-label\b/.test(args));
    if (!free && !/--backend[=\s]+["']?gemini\b/i.test(args)) return GEMINI;
  }
  return null;
}
