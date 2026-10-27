// @vitest-environment node
import { describe, expect, it } from 'vitest';
import site from '../../site.json';
import specs from '../specs.json';
import { render } from './prerender';

// The prerender runs in Node, without a window, a document or storage: every page renders there in
// every language, with the site values the server gives it.

describe('prerender', () => {
  it('renders the trainer in each language, with the defaults', async () => {
    const en = await render('train', 'en', site);
    expect(en.title).toBe('Spraydown · Recoil trainer for Apex Legends');
    expect(en.description).toMatch(/^Practice the spray pattern of every Apex Legends weapon/);
    expect(en.html).toContain('Click and hold anywhere in the range to spray');
    expect(en.html).toMatch(/aria-checked="true"[^>]*data-weapon="r99"/);
    expect(en.html).toContain('href="/progress"');

    const ru = await render('train', 'ru', site);
    expect(ru.title).toBe('Spraydown · Тренажёр отдачи для Apex Legends');
    expect(ru.description).toMatch(/^Отрабатывайте отдачу/);
    expect(ru.html).toContain('Снаряжение');
    expect(ru.html).toContain('href="/ru/progress"');

    const zh = await render('train', 'zh-CN', site);
    expect(zh.description).toMatch(/^在浏览器中练习/);
    expect(zh.html).toContain('装备');
  });

  it('renders the Patterns page with every weapon at one scale', async () => {
    const page = await render('patterns', 'en', site);
    expect(page.title).toBe('Spraydown · Recoil patterns');
    expect(page.description).toMatch(/^The recoil pattern of every Apex Legends weapon/);
    // A card per weapon, each drawing its pattern in the same frame
    const cards = [...page.html.matchAll(/data-weapon="[^"]+"[^>]*>.*?<svg[^>]*viewBox="([^"]+)"/g)];
    expect(cards).toHaveLength(specs.length);
    expect(new Set(cards.map((m) => m[1])).size).toBe(1);
    expect(page.html).toContain('href="/patterns"');
    expect((await render('patterns', 'ru', site)).html).toContain('Библиотека паттернов');
  });

  it('renders the documents of docs/ in English, and the page for an unknown address', async () => {
    const privacy = await render('privacy', 'en', site);
    expect(privacy.title).toBe('Spraydown · Privacy policy');
    expect(privacy.description).toMatch(/^What data Spraydown processes and why/);
    expect(privacy.html).toContain('<h2 id="who-is-responsible">');
    const faq = await render('faq', 'en', site);
    expect(faq.html).toContain('<table tabindex="0">');
    expect(faq.html).not.toContain('href="capture.md"');
    expect((await render('changelog', 'en', site)).title).toBe('Spraydown · Changelog');
    const notFound = await render('not-found', 'en', site);
    expect(notFound.title).toBe('Spraydown · Page not found');
    expect(notFound.html).toContain('Go to the trainer');
    const error = await render('error', 'en', site);
    expect(error.title).toBe('Spraydown · Something went wrong');
    expect(error.html).toContain('The server couldn');
  });

  it('renders the Progress page without figures, which load in the browser', async () => {
    const page = await render('progress', 'en', site);
    expect(page.title).toBe('Spraydown · Progress');
    expect(page.description).toMatch(/^Your Apex Legends recoil practice over time/);
    expect(page.html).toContain('Stored in this browser only.');
    expect(page.html).not.toContain('No saved runs yet');
  });

  it('renders with the site values it is given', async () => {
    const live = await render('train', 'en', { ...site, gaMeasurementId: 'G-TEST', privacyUrl: '/privacy' });
    expect(live.html).toContain('href="/privacy"');
    expect(live.html).toContain('Cookie settings');
    // The consent banner reads a choice stored on the device, so only the browser shows it
    expect(live.html).not.toContain('We use Google Analytics cookies');
    expect((await render('train', 'en', site)).html).not.toContain('Cookie settings');
  });
});
