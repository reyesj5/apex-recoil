// Builds the deployable static site into ./static (replaces the old `gulp static` task):
// Vite bundles + etc/ (Vite publicDir) + assets/ + every page in views/ rendered to HTML.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

fs.cpSync(path.join(root, 'assets'), outDir, { recursive: true });

for (const { view, title, publicPage } of pages) {
  const html = pug.renderFile(path.join(root, 'views', `${view}.pug`), { title, site, analytics: publicPage && analyticsReady });
  fs.writeFileSync(path.join(outDir, `${view}.html`), html);
}

console.log(`Static site written to ${path.relative(process.cwd(), outDir) || '.'} (${pages.map(p => p.view + '.html').join(', ')})`);
