// At the start of a session in a project that uses graphify, warns the owner when this computer
// is not set up to keep graphify's LLM work on Gemini 3.5 Flash-Lite (owner, 2026-10-24). Prints
// nothing when all is well; `python scripts/agent_kit.py doctor` checks the rest.
import { existsSync } from 'fs';

const MODEL = 'gemini-3.5-flash-lite';

if (existsSync('graphify-out') || existsSync('.graphifyignore')) {
  const problems = [];
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    problems.push('GEMINI_API_KEY is not set');
  }
  const model = process.env.GRAPHIFY_GEMINI_MODEL;
  if (model !== MODEL) {
    problems.push(`GRAPHIFY_GEMINI_MODEL is ${model ? `"${model}"` : 'not set'}, not ${MODEL}`);
  }
  if (process.env.ANTHROPIC_API_KEY) {
    problems.push('ANTHROPIC_API_KEY is set, so graphify could pick Claude if Gemini is not available');
  }
  if (problems.length) {
    const text =
      `graphify on this computer: ${problems.join('; ')}. Leave its semantic pass undone until ` +
      'this is fixed (python scripts/agent_kit.py doctor); a code-only `graphify update .` is fine.';
    console.log(
      JSON.stringify({
        systemMessage: text,
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text }
      })
    );
  }
}
