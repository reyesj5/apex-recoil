// @vitest-environment node
import { describe, expect, it } from 'vitest';
import site from '../../site.json';
import { render } from './prerender';

// The prerender runs in Node, without a window, a document or storage: every page renders there in
// every language, with the site values and the path prefix the server gives it.

describe('prerender', () => {
  it('renders the trainer in each language, with the defaults', async () => {
    const en = await render('train', 'en', site, '/next');
    expect(en.title).toBe('Spraydown · Recoil trainer for Apex Legends');
    expect(en.description).toMatch(/^Practice the spray pattern of every Apex Legends weapon/);
    expect(en.html).toContain('Click and hold anywhere in the range to spray');
    expect(en.html).toMatch(/aria-checked="true"[^>]*data-weapon="r99"/);
    expect(en.html).toContain('href="/next/progress"');

    const ru = await render('train', 'ru', site, '/next');
    expect(ru.title).toBe('Spraydown · тренажёр отдачи для Apex Legends');
    expect(ru.description).toMatch(/^Отрабатывайте отдачу/);
    expect(ru.html).toContain('Снаряжение');
    expect(ru.html).toContain('href="/next/ru/progress"');

    const zh = await render('train', 'zh-CN', site, '/next');
    expect(zh.description).toMatch(/^在浏览器中练习/);
    expect(zh.html).toContain('装备');
  });

  it('renders the Progress page without figures, which load in the browser', async () => {
    const page = await render('progress', 'en', site, '/next');
    expect(page.title).toBe('Spraydown · Progress');
    expect(page.description).toMatch(/^Your Apex Legends recoil practice over time/);
    expect(page.html).toContain('Stored in this browser only.');
    expect(page.html).not.toContain('No saved runs yet');
  });

  it('renders with the site values and prefix it is given', async () => {
    const live = await render('train', 'en', { ...site, gaMeasurementId: 'G-TEST', privacyUrl: '/privacy' }, '');
    expect(live.html).toContain('href="/privacy"');
    expect(live.html).toContain('Cookie settings');
    expect(live.html).toContain('href="/progress"');
    // The consent banner reads a choice stored on the device, so only the browser shows it
    expect(live.html).not.toContain('We use Google Analytics cookies');
    expect((await render('train', 'en', site, '/next')).html).not.toContain('Cookie settings');
  });
});
