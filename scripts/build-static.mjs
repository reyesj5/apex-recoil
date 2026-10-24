// Builds the deployable static site into ./static (replaces the old `gulp static` task): the Vite
// bundles, etc/ (Vite publicDir) and assets/; the pages rendered ahead of time with the prerender
// bundle, which this builds into dist-ssr/ (not deployed): a folder per page (ru/patterns/index.html),
// so static hosts serve every address without rewrites, plus index-ru.html and index-zh-CN.html for
// servers set up for the old file names (docs/playbooks.md) and 404.html; and the Studio (editor.html),
// which renders in the browser, in its shell.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'static');

const site = JSON.parse(fs.readFileSync(path.join(root, 'site.json'), 'utf8'));

await build({
  root,
  configFile: path.join(root, 'vite.config.mjs'),
  logLevel: 'warn',
  build: { outDir, emptyOutDir: true, sourcemap: false },
});
// The Studio builds on its own (vite.config.mjs explains why)
await build({
  root,
  configFile: path.join(root, 'vite.config.mjs'),
  mode: 'studio',
  logLevel: 'warn',
  build: { outDir, sourcemap: false },
});
await build({
  root,
  configFile: path.join(root, 'vite.config.mjs'),
  logLevel: 'warn',
  build: { ssr: true, sourcemap: false },
});

fs.cpSync(path.join(root, 'assets'), outDir, { recursive: true });

const prerender = await import(pathToFileURL(path.join(root, 'server', 'prerender.ts')).href);
// The Studio renders in the browser: its shell, as the server sends it (the gallery is left out)
const studio = prerender.shells.find((shell) => shell.entry === 'studio');
fs.writeFileSync(
  path.join(outDir, 'editor.html'),
  prerender.renderShell({ title: studio.title(site.name), entry: studio.entry }, site),
);
for (const page of prerender.pages) {
  const html = await prerender.renderPage(page, site, { assetsDir: path.join(outDir, 'assets') });
  const dir = path.join(outDir, ...page.path.split('/').filter(Boolean));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  // The trainer in Russian and Chinese under the file names the old pages had too
  if (page.page === 'train' && page.locale !== 'en') {
    fs.writeFileSync(path.join(outDir, `index-${page.locale}.html`), html);
  }
}
fs.writeFileSync(
  path.join(outDir, '404.html'),
  await prerender.renderPage(prerender.notFound, site, { assetsDir: path.join(outDir, 'assets') }),
);

console.log(
  `Static site written to ${path.relative(process.cwd(), outDir) || '.'} (${prerender.pages.length} pages, index-ru.html, index-zh-CN.html, 404.html, editor.html)`,
);
