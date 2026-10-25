// What tells search engines where each page lives: the links in a page's head (roadmap 2.11), the page's
// own address on the site (site.json's siteUrl) and the same page in each of its languages, English as
// the default; and the sitemap that lists them all, which robots.txt names (2.15)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  bundle,
  notFound,
  pageAt,
  pageLinks,
  pages,
  renderPage,
  robotsTxt,
  serverError,
  sitemapXml,
  type PageSpec,
} from '../server/prerender.ts';

const site = { name: 'Spraydown', siteUrl: 'https://example.test' };
const at = (address: string) => pageAt(address) as PageSpec;

test('name a page and its versions in the three languages, English as the default', () => {
  assert.deepEqual(pageLinks(at('/ru/patterns'), site), [
    '<link rel="canonical" href="https://example.test/ru/patterns">',
    '<link rel="alternate" hreflang="en" href="https://example.test/patterns">',
    '<link rel="alternate" hreflang="ru" href="https://example.test/ru/patterns">',
    '<link rel="alternate" hreflang="zh-CN" href="https://example.test/zh-CN/patterns">',
    '<link rel="alternate" hreflang="x-default" href="https://example.test/patterns">',
  ]);
  assert.deepEqual(pageLinks(at('/'), site).slice(0, 2), [
    '<link rel="canonical" href="https://example.test/">',
    '<link rel="alternate" hreflang="en" href="https://example.test/">',
  ]);
});

test('give a document in one language its own address only', () => {
  assert.deepEqual(pageLinks(at('/faq'), site), ['<link rel="canonical" href="https://example.test/faq">']);
});

test('read the site address with or without a trailing slash', () => {
  assert.deepEqual(
    pageLinks(at('/progress'), { ...site, siteUrl: 'https://example.test/' }),
    pageLinks(at('/progress'), site),
  );
});

test('leave the links out without a web address, and on the 404 and error pages', () => {
  for (const siteUrl of ['', '[SITE URL]', 'example.test', 'javascript:alert(1)', undefined]) {
    assert.deepEqual(pageLinks(at('/'), { name: 'Spraydown', siteUrl }), [], String(siteUrl));
  }
  assert.deepEqual(pageLinks(notFound, site), []);
  assert.deepEqual(pageLinks(serverError, site), []);
});

test('list every page in the sitemap, each with the same versions its head names', () => {
  const xml = sitemapXml(site) as string;
  assert.match(
    xml,
    /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9" xmlns:xhtml="http:\/\/www.w3.org\/1999\/xhtml">\n/,
  );
  assert.match(xml, /<\/urlset>\n$/);
  const entries = [...xml.matchAll(/<url>\n([\s\S]*?)\n {2}<\/url>/g)].map((m) => m[1]);
  // A page added to `pages` is in the sitemap without anything else to update
  assert.equal(entries.length, pages.length);
  for (const [i, spec] of pages.entries()) {
    const head = pageLinks(spec, site).map((link) =>
      link
        .replace(/^<link rel="canonical" href="(.*)">$/, '    <loc>$1</loc>')
        .replace(
          /^<link rel="alternate" hreflang="(.*)" href="(.*)">$/,
          '    <xhtml:link rel="alternate" hreflang="$1" href="$2"/>',
        ),
    );
    assert.equal(entries[i], head.join('\n'), spec.path);
  }
  assert.match(entries[0], /^ {4}<loc>https:\/\/example.test\/<\/loc>\n {4}<xhtml:link rel="alternate" hreflang="en"/);
});

test('name the sitemap in robots.txt, which lets every page be crawled', () => {
  assert.equal(robotsTxt(site), 'User-agent: *\nAllow: /\nSitemap: https://example.test/sitemap.xml\n');
  assert.equal(robotsTxt({ ...site, siteUrl: 'https://example.test/' }), robotsTxt(site));
});

test('have no sitemap without a web address, since it names full addresses', () => {
  for (const siteUrl of ['', '[SITE URL]', undefined]) {
    assert.equal(sitemapXml({ name: 'Spraydown', siteUrl }), null, String(siteUrl));
    assert.equal(robotsTxt({ name: 'Spraydown', siteUrl }), 'User-agent: *\nAllow: /\n', String(siteUrl));
  }
});

test(
  'put the links in the prerendered page',
  { skip: !fs.existsSync(bundle) && 'run `pnpm build` first' },
  async () => {
    const html = await renderPage(at('/zh-CN'), site);
    const head = html.slice(0, html.indexOf('</head>'));
    const links = pageLinks(at('/zh-CN'), site);
    assert.equal(links.length, 5);
    for (const link of links) assert.ok(head.includes(link), link);
    // A page kept out of search engines names no address
    assert.doesNotMatch(await renderPage(notFound, site), /rel="(canonical|alternate)"/);
  },
);
