// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/entries/prerender';
import site from '../../site.json';

// The pages with nothing to offer: no spec is checked against the current patch. On specs made for it,
// so this holds once client/specs.json has checked weapons. It renders in Node, as the prerender does:
// a page that crashed here would crash the server's start.

vi.mock('@/patch.json', () => ({ default: { current: 'v2' } }));

vi.mock('@/specs.json', () => ({
  default: [
    {
      name: 'r99',
      rpm: 1080,
      mags: [{ size: 2, audio: 'a' }],
      mods: {},
      ping_points: [],
      x: [0, 1],
      y: [0, -1],
      time_points: [0, 55],
      checked_patch: 'v1',
    },
  ],
}));

describe('with no weapon checked against the current patch', () => {
  it.each([
    ['train', 'en', 'No weapons to show yet'],
    ['train', 'ru', 'Пока нет доступного оружия'],
    ['train', 'zh-CN', '暂无可用武器'],
    ['patterns', 'en', 'No weapons to show yet'],
    ['patterns', 'ru', 'Пока нет доступного оружия'],
    ['patterns', 'zh-CN', '暂无可用武器'],
  ] as const)('the %s page in %s says so, and shows no weapon', async (page, locale, heading) => {
    const { html } = await render(page, locale, site);
    expect(html).toContain(heading);
    expect(html).not.toContain('data-weapon');
    expect(html).not.toContain('range-canvas');
  });

  it('keeps the way to the Studio, where weapons get checked, and leaves out the weapon search', async () => {
    const { html } = await render('train', 'en', site);
    expect(html).toContain('href="/editor"');
    expect(html).not.toContain('Ctrl K');
    expect(html).not.toContain('Search weapons');
  });

  it('still renders the Progress page, for the runs already saved', async () => {
    const { html } = await render('progress', 'en', site);
    expect(html).toContain('Progress');
  });
});
