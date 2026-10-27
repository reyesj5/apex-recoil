// Copies the design canvas and the Design System artifact into docs/design/ for agents that can't
// open claude.ai artifacts, and renders PNGs of the artboards and the component previews. The
// artifacts stay the source of truth; docs/design/ is a snapshot of them (see docs/design/README.md).
//
// A Claude session downloads the artifacts' files with the Artifact tool first, then runs:
//   node scripts/export-design.mjs --canvas <dir> --system <dir> [--canvas-version <v>] [--system-version <v>]
//   (--out <dir> writes somewhere else than docs/design/, to check files before publishing them)
// <canvas dir>: project/*.dc.html, project/canvas.json, artifact-type/dc-runtime.js and _blob/<asset id>.<ext>
// <system dir>: project/README.md, building.md, tokens.json, assets/Logos/README.md and components/
// Rendering needs Chrome and the network (the pages load their fonts from Google Fonts).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const out = args.out ? path.resolve(args.out) : path.join(root, 'docs', 'design');
if (!args.canvas || !args.system) {
  console.error('Usage: node scripts/export-design.mjs --canvas <dir> --system <dir>');
  process.exit(1);
}
const canvasDir = path.resolve(args.canvas);
const systemDir = path.resolve(args.system, 'project');

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

// --- Copy the text sources ---

fs.rmSync(path.join(out, 'screens'), { recursive: true, force: true });
fs.rmSync(path.join(out, 'system'), { recursive: true, force: true });

const canvas = JSON.parse(fs.readFileSync(path.join(canvasDir, 'project', 'canvas.json'), 'utf8'));
for (const name of [...canvas.order, 'canvas.json']) {
  copy(path.join(canvasDir, 'project', name), path.join(out, 'screens', 'source', name));
}

for (const name of ['README.md', 'building.md', 'tokens.json', 'assets/Logos/README.md', 'components/bundle.css']) {
  copy(path.join(systemDir, name), path.join(out, 'system', name));
}
const components = fs
  .readdirSync(path.join(systemDir, 'components'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
for (const name of components) {
  for (const file of ['README.md', 'preview.html']) {
    const from = path.join(systemDir, 'components', name, file);
    if (fs.existsSync(from)) copy(from, path.join(out, 'system', 'components', name, file));
  }
}

// The previews use the token variables the Design System type generates from tokens.json
const tokens = JSON.parse(fs.readFileSync(path.join(systemDir, 'tokens.json'), 'utf8'));
const tokenValue = (value) => {
  const v = typeof value === 'string' ? value : Object.values(value)[0];
  const alias = /^\{(.+)\}$/.exec(v);
  return alias ? `var(--${alias[1]})` : v;
};
const variables = ['color', 'spacing', 'radius', 'shadow', 'size'].flatMap((group) =>
  tokens[group].tokens.map((t) => `  --${t.name}: ${tokenValue(t.value)};`),
);
const typeStyles = tokens.type.groups.flatMap((group) =>
  group.styles.map((style) =>
    [
      `.${style.name} {`,
      `  font-family: var(--font-${style.family || group.family});`,
      `  font-size: ${style.fontSize};`,
      style.lineHeight !== undefined && `  line-height: ${style.lineHeight};`,
      `  font-weight: ${style.fontWeight};`,
      style.letterSpacing && `  letter-spacing: ${style.letterSpacing};`,
      '}',
    ]
      .filter(Boolean)
      .join('\n'),
  ),
);
fs.writeFileSync(
  path.join(out, 'system', 'tokens.css'),
  [
    '/* Generated from tokens.json by scripts/export-design.mjs for the component previews. */',
    ':root {',
    ...variables,
    ...Object.entries(tokens.type.families).map(([key, stack]) => `  --font-${key}: ${stack};`),
    '}',
    ...typeStyles,
    '',
  ].join('\n'),
);

fs.writeFileSync(
  path.join(out, 'snapshot.json'),
  JSON.stringify(
    {
      exported: new Date().toISOString().slice(0, 10),
      canvas: { url: 'https://claude.ai/artifact/3Uv9xgQocE1qqS2ohS2MQG', version: args['canvas-version'] ?? null },
      system: { url: 'https://claude.ai/artifact/XK1KCFGz6tF9WzmKUykaFe', version: args['system-version'] ?? null },
    },
    null,
    2,
  ) + '\n',
);

// --- Render the PNGs ---

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const blobs = fs.readdirSync(path.join(canvasDir, '_blob'));
// The Design System's assets are the logos, which brand/ holds under the same names
const logoFiles = new Map();
const systemManifest = path.join(systemDir, 'design-system.json');
if (fs.existsSync(systemManifest)) {
  for (const group of Object.values(JSON.parse(fs.readFileSync(systemManifest, 'utf8')).assetGroups ?? {})) {
    for (const file of Object.values(group.files ?? {})) {
      const found = [path.join(root, 'brand', file.name), path.join(root, 'brand', 'source', file.name)].find((p) =>
        fs.existsSync(p),
      );
      if (found) logoFiles.set(file.blob, found);
    }
  }
}

// A component preview is a fragment; the Design System type wraps it with the tokens and bundle.css
function previewPage(name) {
  const fragment = fs.readFileSync(path.join(out, 'system', 'components', name, 'preview.html'), 'utf8');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="/system/tokens.css"><link rel="stylesheet" href="/system/components/bundle.css"></head><body>${fragment}</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file;
  if (url.startsWith('/preview/')) {
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(previewPage(path.basename(url)));
    return;
  }
  if (url.startsWith('/_blob/')) {
    const id = path.basename(url);
    const match = blobs.find((name) => name.startsWith(id + '.'));
    file = match ? path.join(canvasDir, '_blob', match) : logoFiles.get(id);
  } else if (url === '/screens/support.js') {
    file = path.join(canvasDir, 'artifact-type', 'dc-runtime.js');
  } else if (url.startsWith('/screens/')) {
    file = path.join(out, 'screens', 'source', path.basename(url));
  } else if (url.startsWith('/system/')) {
    file = path.join(out, url.slice(1));
  }
  if (!file || !fs.existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome' });

async function shoot(url, viewport, file) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  // Runs in the page, so it's a string to Node's linter
  await page.evaluate('document.fonts.ready');
  await page.waitForTimeout(500);
  await page.screenshot({ path: file, fullPage: true });
  await context.close();
  console.log(`${path.relative(root, file)}${errors.length ? ` (page errors: ${errors.join('; ')})` : ''}`);
}

for (const name of canvas.order) {
  const board = canvas.boards[name];
  await shoot(
    `${base}/screens/${name}`,
    { width: board.w, height: board.h },
    path.join(out, 'screens', name.replace('.dc.html', '.png')),
  );
}
for (const name of components) {
  const fragment = fs.readFileSync(path.join(out, 'system', 'components', name, 'preview.html'), 'utf8');
  const height = Number(/height=(\d+)/.exec(fragment)?.[1] ?? 300);
  await shoot(
    `${base}/preview/${name}`,
    { width: 960, height },
    path.join(out, 'system', 'components', name, 'preview.png'),
  );
}

await browser.close();
server.close();
