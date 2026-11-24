// The UI's conventions that ESLint doesn't check (docs/ui-migration-plan.md, Phase 5.2), run by pnpm lint:
// client/styles/app.css is the only stylesheet (with design-tokens.css, which vite.config.mjs generates
// from the tokens), it has no @apply, the client's code takes colors from the tokens, never as hex, and no
// class uses the dark: variant (the app has one dark theme, so it would never apply).
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const stylesheets = new Set(['client/styles/app.css', 'client/styles/design-tokens.css']);
// Generated: cn()'s merge tables hold Tailwind's class names, not colors
const generated = new Set(['client/lib/cn-tables.ts']);
const hex = /(?<![\w/&#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
// dark:bg-..., dark:[&>svg]:..., but not an object key such as `dark: '.dark'`
const darkVariant = /(?<![\w-])dark:(?=[\w[!-])/;

function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(file);
    else yield file;
  }
}

const problems = [];
for (const file of files(path.join(root, 'client'))) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  if (/\.(css|scss|sass|less|styl)$/.test(rel) && !stylesheets.has(rel)) {
    problems.push(`${rel}: a stylesheet besides app.css; style with utilities in the components`);
  }
  if (!/\.tsx?$/.test(rel) || /\.test\.tsx?$|\.fixture\./.test(rel) || generated.has(rel)) continue;
  fs.readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const match of line.matchAll(hex)) {
        // Recharts' default strokes, matched in attribute selectors (chart.tsx), aren't colors of ours
        if (/=['"]$/.test(line.slice(0, match.index))) continue;
        problems.push(`${rel}:${i + 1}: the color ${match[0]}; use a token (a class, or the tokens for a canvas)`);
      }
      if (darkVariant.test(line)) problems.push(`${rel}:${i + 1}: a dark: class, which never applies; remove it`);
    });
}

// @apply, outside the comments that say not to use it
const appCss = fs.readFileSync(path.join(root, 'client', 'styles', 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
if (/@apply\b/.test(appCss)) problems.push('client/styles/app.css: @apply; repeated styling becomes a component');

if (problems.length) {
  console.error(`The UI's conventions (docs/ui-notes.md, Conventions to keep):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(
  'Conventions: app.css is the only stylesheet, without @apply; no hex colors or dark: classes in the client',
);
