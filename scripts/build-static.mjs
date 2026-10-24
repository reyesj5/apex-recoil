// Builds the deployable static site into ./static (replaces the old `gulp static` task):
// Vite bundles + etc/ (Vite publicDir) + assets/ + every page in views/ rendered to HTML, and the
// new pages (the rebuilt trainer and its Progress page) prerendered into next/.../index.html with the
// prerender bundle, which this builds into dist-ssr/ (not deployed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import pug from 'pug';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'static');

// Pages, titles and analytics as served by app.js (pageLocals there)
const site = JSON.parse(fs.readFileSync(path.join(root, 'site.json'), 'utf8'));
const analyticsReady = Boolean(site.gaMeasurementId && site.privacyUrl);
const pages = [
  { view: 'index', title: site.name + ' · Recoil trainer for Apex Legends', publicPage: true },
  { view: 'index-ru', title: site.name + ' · тренажёр отдачи для Apex Legends', publicPage: true },
  { view: 'index-zh-CN', title: site.name + ' · Apex Legends 压枪训练', publicPage: true },
  { view: 'editor', title: site.name + ' Studio', publicPage: false }
];

await build({
  root,
  configFile: path.join(root, 'vite.config.mjs'),
  logLevel: 'warn',
  build: { outDir, emptyOutDir: true, sourcemap: false }
});
await build({
  root,
  configFile: path.join(root, 'vite.config.mjs'),
  logLevel: 'warn',
  build: { ssr: true, sourcemap: false }
});

fs.cpSync(path.join(root, 'assets'), outDir, { recursive: true });

for (const { view, title, publicPage } of pages) {
  const html = pug.renderFile(path.join(root, 'views', `${view}.pug`), { title, site, analytics: publicPage && analyticsReady });
  fs.writeFileSync(path.join(outDir, `${view}.html`), html);
}

// The new pages, previewed under /next until they replace the pages above; a folder per page, so
// static hosts serve /next/ru/ without rewrites
const prerender = await import(pathToFileURL(path.join(root, 'server', 'prerender.mjs')).href);
for (const page of prerender.pages) {
  const html = await prerender.renderPage(page, site);
  const dir = path.join(outDir, ...page.path.split('/').filter(Boolean));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

console.log(`Static site written to ${path.relative(process.cwd(), outDir) || '.'} (${pages.map(p => p.view + '.html').join(', ')}, and ${prerender.pages.length} prerendered pages under next/)`);
