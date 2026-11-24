// Stops a release while owner-specific values are still placeholders (docs/ownership-register.md): a value
// in square brackets in site.json, or a placeholder left in what a release shows or ships: NOTICE, the
// copyright headers, and the documents the pages render (the privacy policy, the FAQ, the changelog).
// pnpm release runs it before building, and CI runs that for a version tag (v*). Empty links are fine:
// the pages hide them.
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
// "[OWNER NAME]", "[CONTACT EMAIL]", "[CONTRIBUTION TERMS: decide ...]"
const placeholder = /\[[A-Z][A-Z0-9 _/-]*[A-Z0-9](?::[^\]\n]*)?\]/g;
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const problems = [];

// site.json, every value; _readme describes the placeholders
function values(value, at) {
  if (typeof value === 'string') {
    if (/^\[.*\]$/.test(value.trim())) problems.push(`site.json: ${at} is a placeholder (${value})`);
  } else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) if (key !== '_readme') values(inner, at ? `${at}.${key}` : key);
  }
}
values(JSON.parse(read('site.json')), '');

function scan(file, lines = () => true) {
  read(file)
    .split('\n')
    .forEach((line, i) => {
      if (!lines(line)) return;
      for (const match of line.matchAll(placeholder)) problems.push(`${file}:${i + 1}: ${match[0]}`);
    });
}

for (const file of ['NOTICE', 'docs/privacy-policy.md', 'docs/faq.md', 'docs/changelog.md']) scan(file);

// The copyright headers of the files that hold the original project's code
function* sources(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) yield* sources(rel);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) yield rel;
  }
}
for (const dir of ['client', 'server', 'shared', 'scripts']) {
  for (const file of sources(dir)) scan(file, (line) => /^\s*\*\s*(Copyright|Modified by)\b/.test(line));
}

if (problems.length) {
  console.error(
    `Not ready for a release: ${problems.length} placeholder(s) to fill in (docs/ownership-register.md)\n${problems.join('\n')}`,
  );
  process.exit(1);
}
console.log('Release check: no placeholders left');
