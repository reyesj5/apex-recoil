// The links that tell search engines where each page lives (roadmap 2.11): the page's own address on
// the site (site.json's siteUrl), and the same page in each of its languages, English as the default
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bundle, notFound, pageAt, pageLinks, renderPage, serverError, type PageSpec } from '../server/prerender.ts';

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
