// The new pages (the rebuilt trainer and its Progress page), rendered ahead of time with the prerender
// bundle (dist-ssr/prerender.mjs, built by pnpm build from client/entries/prerender.tsx). app.js renders
// each page once, with the site values it runs with, and serves it from memory;
// scripts/build-static.mjs writes them into the static site. The browser hydrates the markup.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The prerender bundle; without it (pnpm dev, or a client-only build) the pages render in the browser */
export const bundle = path.join(root, 'dist-ssr', 'prerender.mjs');

/** The new pages: where each is served, what it shows, its language and the entry that hydrates it */
export const pages = [
  { path: '/next', page: 'train', locale: 'en', entry: 'trainer-next' },
  { path: '/next/ru', page: 'train', locale: 'ru', entry: 'trainer-next' },
  { path: '/next/zh-CN', page: 'train', locale: 'zh-CN', entry: 'trainer-next' },
  { path: '/next/progress', page: 'progress', locale: 'en', entry: 'progress-next' },
  { path: '/next/ru/progress', page: 'progress', locale: 'ru', entry: 'progress-next' },
  { path: '/next/zh-CN/progress', page: 'progress', locale: 'zh-CN', entry: 'progress-next' },
];

export function hasBundle() {
  return fs.existsSync(bundle);
}

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// JSON inside a script element: "<" escaped, so no value can end the element
const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * A page's HTML: the same shell as views/next.pug around the prerendered markup, with the site values
 * the page was rendered with, which the browser reads back (client/lib/site.ts) so both agree.
 * `prefix` is where the pages live ('/next' while previewed); `noindex` keeps search engines off a
 * preview.
 */
export async function renderPage({ page, locale, entry }, site, { prefix = '/next', noindex = true } = {}) {
  const { render } = await import(pathToFileURL(bundle).href);
  const out = await render(page, locale, site, prefix);
  return [
    '<!doctype html>',
    `<html lang="${locale}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    ...(noindex ? ['<meta name="robots" content="noindex">'] : []),
    `<meta name="description" content="${escapeHtml(out.description)}">`,
    `<title>${escapeHtml(out.title)}</title>`,
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg">',
    '<link rel="stylesheet" href="/app.css">',
    `<script type="module" src="/${entry}.js"></script>`,
    '</head>',
    '<body>',
    `<div id="root">${out.html}</div>`,
    `<script id="site-json" type="application/json">${scriptJson(site)}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
