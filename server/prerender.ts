// The pages (the trainer, its Patterns and Progress pages, the documents of docs/ and the pages for an
// unknown address and a server error), rendered ahead of time with the prerender bundle
// (dist-ssr/prerender.mjs, built by pnpm build from client/entries/prerender.tsx). The server renders
// each page once, with the site values it runs with, and serves it from memory (routes/pages.ts);
// scripts/build-static.mjs writes them into the static site. The browser hydrates the markup. The pages
// that render in the browser only (the Studio, the gallery, and every page with pnpm dev) get a bare
// shell instead.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, type SiteValues } from './site.ts';

/** The prerender bundle; without it (pnpm dev, or a client-only build) the pages render in the browser */
export const bundle = path.join(root, 'dist-ssr', 'prerender.mjs');

export interface PageSpec {
  /** What the page shows: 'train', 'patterns', 'progress', a document, 'not-found' or 'error' */
  page: string;
  locale: string;
  /** The entry that hydrates it */
  entry: string;
  /** The title the bare shell takes when there is no prerender (pnpm dev), after the site's name */
  title: string;
  /** Where it is served; the 404 and error pages answer any address */
  path?: string;
}

/** The pages: where each is served, what it shows, its language, the entry that hydrates it, and its title */
export const pages: PageSpec[] = [
  { path: '/', page: 'train', locale: 'en', entry: 'trainer', title: 'Recoil trainer for Apex Legends' },
  { path: '/ru', page: 'train', locale: 'ru', entry: 'trainer', title: 'Тренажёр отдачи для Apex Legends' },
  { path: '/zh-CN', page: 'train', locale: 'zh-CN', entry: 'trainer', title: 'Apex Legends 压枪训练' },
  { path: '/patterns', page: 'patterns', locale: 'en', entry: 'patterns', title: 'Recoil patterns' },
  { path: '/ru/patterns', page: 'patterns', locale: 'ru', entry: 'patterns', title: 'Паттерны отдачи' },
  { path: '/zh-CN/patterns', page: 'patterns', locale: 'zh-CN', entry: 'patterns', title: '后坐力弹道' },
  { path: '/progress', page: 'progress', locale: 'en', entry: 'progress', title: 'Progress' },
  { path: '/ru/progress', page: 'progress', locale: 'ru', entry: 'progress', title: 'Прогресс' },
  { path: '/zh-CN/progress', page: 'progress', locale: 'zh-CN', entry: 'progress', title: '进度' },
  // The documents of docs/, in English only
  { path: '/privacy', page: 'privacy', locale: 'en', entry: 'docs', title: 'Privacy policy' },
  { path: '/faq', page: 'faq', locale: 'en', entry: 'docs', title: 'Frequently asked questions' },
  { path: '/changelog', page: 'changelog', locale: 'en', entry: 'docs', title: 'Changelog' },
];

/** The page for an address the app doesn't have, sent with the 404 status (404.html in the static site) */
export const notFound: PageSpec = { page: 'not-found', locale: 'en', entry: 'docs', title: 'Page not found' };

/** The page for a request the server failed, sent with the error's status */
export const serverError: PageSpec = { page: 'error', locale: 'en', entry: 'docs', title: 'Something went wrong' };

export interface ShellSpec {
  path: string;
  entry: string;
  title: (siteName: string) => string;
}

/** The pages that render in the browser only, at their addresses, with their titles for a site name */
export const shells: ShellSpec[] = [
  { path: '/editor', entry: 'studio', title: (name) => `${name} Studio` },
  { path: '/next/components', entry: 'gallery', title: (name) => `${name} · Components` },
];

/** The page served at an address ('/ru/' is '/ru'), or undefined */
const trimmed = (address: string) => (address.length > 1 ? address.replace(/\/$/, '') : address);

export function pageAt(address: string) {
  return pages.find((page) => page.path === trimmed(address));
}

/** The page that renders in the browser only at an address, or undefined */
export function shellAt(address: string) {
  return shells.find((shell) => shell.path === trimmed(address));
}

export function hasBundle() {
  return fs.existsSync(bundle);
}

/**
 * The fonts a page shows in its first paint, preloaded so its text doesn't move when they arrive:
 * Inter in Latin (and Cyrillic in Russian) and Chakra Petch's two weights. Chinese uses the
 * system's fonts, and JetBrains Mono only sets numbers in fixed boxes. Their names carry the build's
 * hashes, so they are looked up in the built assets.
 */
function fontPreloads(assetsDir: string, locale: string) {
  const wanted = ['inter-latin-wght-normal', 'chakra-petch-latin-600-normal', 'chakra-petch-latin-700-normal'];
  if (locale === 'ru') wanted.push('inter-cyrillic-wght-normal');
  const files = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
  return wanted.flatMap((name) => {
    const file = files.find((f) => f.startsWith(`${name}-`) && f.endsWith('.woff2'));
    return file ? [`<link rel="preload" href="/assets/${file}" as="font" type="font/woff2" crossorigin>`] : [];
  });
}

/** A module in the client build's manifest (.vite/manifest.json): its file, and what it imports before it runs */
interface ManifestChunk {
  file: string;
  imports?: string[];
}

/**
 * The chunks a page's entry imports before it runs, all the way down, and its language's catalog,
 * preloaded together: the browser would otherwise find each level only once the one above it had
 * arrived. Their names carry the build's hashes, so they come from the build's manifest; there are
 * none without one (no build yet).
 */
export function modulePreloads(buildDir: string, entry: string, locale: string) {
  const manifestFile = path.join(buildDir, '.vite', 'manifest.json');
  if (!fs.existsSync(manifestFile)) return [];
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as Record<string, ManifestChunk>;
  const files = new Set<string>();
  const visit = (key: string) => {
    for (const imported of manifest[key]?.imports ?? []) {
      const file = manifest[imported]?.file;
      if (file && !files.has(file)) {
        files.add(file);
        visit(imported);
      }
    }
  };
  visit(`client/entries/${entry}.tsx`);
  // English is in the entry itself; the other languages' catalogs are chunks of their own
  const catalog = manifest[`client/locales/${locale}.json`]?.file;
  if (catalog) files.add(catalog);
  return [...files].map((file) => `<link rel="modulepreload" href="/${file}">`);
}

export const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// JSON inside a script element: "<" escaped, so no value can end the element
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/** The site's address (site.json's siteUrl) when it is a web address, or null (empty, or a placeholder) */
function siteAddress(site: SiteValues) {
  if (typeof site.siteUrl !== 'string') return null;
  try {
    const url = new URL(site.siteUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * Where a page lives, for search engines: its address on the site, and, for a page in several
 * languages, the address of each version, with English as the default. Null without a site address,
 * and for the 404 and error pages, which answer any address.
 */
function pageAddresses({ path: address, page }: PageSpec, site: SiteValues) {
  const base = siteAddress(site);
  if (!address || !base) return null;
  const href = (to: string) => new URL(to, base).href;
  const versions = pages.filter((spec) => spec.page === page);
  const english = versions.find((spec) => spec.locale === 'en');
  const alternates =
    versions.length > 1
      ? [
          ...versions.map((spec) => ({ hreflang: spec.locale, href: href(spec.path!) })),
          ...(english ? [{ hreflang: 'x-default', href: href(english.path!) }] : []),
        ]
      : [];
  return { canonical: href(address), alternates };
}

/** A page's addresses as links in its head (pageAddresses) */
export function pageLinks(spec: PageSpec, site: SiteValues) {
  const addresses = pageAddresses(spec, site);
  if (!addresses) return [];
  return [
    `<link rel="canonical" href="${escapeHtml(addresses.canonical)}">`,
    ...addresses.alternates.map(
      ({ hreflang, href }) => `<link rel="alternate" hreflang="${hreflang}" href="${escapeHtml(href)}">`,
    ),
  ];
}

/**
 * The sitemap, sitemap.xml: every page with its addresses, as its head names them. Null without a site
 * address, since a sitemap names full addresses. The server serves it (routes/pages.ts), and
 * scripts/build-static.mjs writes it into the static site.
 */
export function sitemapXml(site: SiteValues) {
  if (!siteAddress(site)) return null;
  const entries = pages.map((spec) => {
    const { canonical, alternates } = pageAddresses(spec, site)!;
    return [
      '  <url>',
      `    <loc>${escapeHtml(canonical)}</loc>`,
      ...alternates.map(
        ({ hreflang, href }) => `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${escapeHtml(href)}"/>`,
      ),
      '  </url>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * robots.txt: every page may be crawled (the Studio, the gallery and the error pages keep themselves
 * out of search results with their noindex), and it names the sitemap when there is one
 */
export function robotsTxt(site: SiteValues) {
  const base = siteAddress(site);
  return ['User-agent: *', 'Allow: /', ...(base ? [`Sitemap: ${new URL('/sitemap.xml', base).href}`] : []), ''].join(
    '\n',
  );
}

interface ShellOptions {
  title: string;
  entry: string;
  page?: string;
  locale?: string;
  noindex?: boolean;
}

/**
 * A page that renders in the browser: the same head and root as a prerendered page, without markup.
 * With `dev` (pnpm dev) the stylesheet and the entry come from source through Vite. `page` names the
 * page for an entry that shows several (the documents), and the site values go with it as they do
 * with a prerendered page.
 */
export function renderShell(
  { title, entry, page = '', locale = 'en', noindex = true }: ShellOptions,
  site: SiteValues,
  { dev = false } = {},
) {
  return [
    '<!doctype html>',
    `<html lang="${locale}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    ...(noindex ? ['<meta name="robots" content="noindex">'] : []),
    `<title>${escapeHtml(title)}</title>`,
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg">',
    `<link rel="stylesheet" href="${dev ? '/client/styles/app.css' : '/app.css'}">`,
    `<script type="module" src="${dev ? `/client/entries/${entry}.tsx` : `/${entry}.js`}"></script>`,
    '</head>',
    '<body>',
    `<div id="root"${page ? ` data-page="${page}"` : ''}></div>`,
    `<script id="site-json" type="application/json">${scriptJson(site)}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** What the prerender bundle (client/entries/prerender.tsx) exports */
interface PrerenderBundle {
  render(page: string, locale: string, site: SiteValues): Promise<{ html: string; title: string; description: string }>;
}

/**
 * A page's HTML: the prerendered markup in the page's shell, with the site values the page was
 * rendered with, which the browser reads back (client/lib/site.ts) so both agree. `noindex` keeps
 * search engines off a page (the 404 and error pages have it); any other page names its address
 * (pageLinks); `buildDir` is the client build the page links, whose fonts and chunks it preloads
 * (dist, or the static site, which is a build of its own).
 */
export async function renderPage(
  spec: PageSpec,
  site: SiteValues,
  {
    noindex = spec.page === 'not-found' || spec.page === 'error',
    buildDir = path.join(root, 'dist'),
  }: { noindex?: boolean; buildDir?: string } = {},
) {
  const { page, locale, entry } = spec;
  const { render } = (await import(pathToFileURL(bundle).href)) as PrerenderBundle;
  const out = await render(page, locale, site);
  return [
    '<!doctype html>',
    `<html lang="${locale}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    ...(noindex ? ['<meta name="robots" content="noindex">'] : []),
    `<meta name="description" content="${escapeHtml(out.description)}">`,
    `<title>${escapeHtml(out.title)}</title>`,
    ...(noindex ? [] : pageLinks(spec, site)),
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg">',
    ...fontPreloads(path.join(buildDir, 'assets'), locale),
    '<link rel="stylesheet" href="/app.css">',
    `<script type="module" src="/${entry}.js"></script>`,
    ...modulePreloads(buildDir, entry, locale),
    '</head>',
    '<body>',
    `<div id="root" data-page="${page}">${out.html}</div>`,
    `<script id="site-json" type="application/json">${scriptJson(site)}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
