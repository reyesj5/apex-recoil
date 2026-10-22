// Builds the deployable static site into ./static (replaces the old `gulp static` task):
// Vite bundles + etc/ (Vite publicDir) + assets/ + every page in views/ rendered to HTML.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import pug from 'pug';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'static');

// Pages and titles as served by app.js
const pages = [
  { view: 'index', title: 'Apex Legends Recoils' },
  { view: 'index-ru', title: 'Apex Legends Recoils' },
  { view: 'index-zh-CN', title: 'Apex Legends Recoils' },
  { view: 'editor', title: 'Editor' }
];

await build({
  root,
  configFile: path.join(root, 'vite.config.mjs'),
  logLevel: 'warn',
  build: { outDir, emptyOutDir: true, sourcemap: false }
});

fs.cpSync(path.join(root, 'assets'), outDir, { recursive: true });

for (const { view, title } of pages) {
  const html = pug.renderFile(path.join(root, 'views', `${view}.pug`), { title });
  fs.writeFileSync(path.join(outDir, `${view}.html`), html);
}

console.log(`Static site written to ${path.relative(process.cwd(), outDir) || '.'} (${pages.map(p => p.view + '.html').join(', ')})`);
