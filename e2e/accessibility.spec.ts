import { AxeBuilder } from '@axe-core/playwright';
import { expect, specs, test } from './fixtures';

// WCAG 2.1 A and AA checks with axe. The current pages have known violations, counted here per rule
// (elements affected) so that nothing new slips in; fixing one lowers its count. The rebuild
// (docs/ui-migration-plan.md) must bring every page to none.
const baseline: Record<string, Record<string, number>> = {
  '/': {
    'aria-required-children': 1,
    'color-contrast': 1,
    'html-has-lang': 1,
    'scrollable-region-focusable': 1,
  },
  '/ru': {
    'aria-required-children': 1,
    'color-contrast': 1,
    'html-has-lang': 1,
    label: 5,
    'scrollable-region-focusable': 1,
  },
  '/zh-CN': {
    'aria-required-children': 1,
    'color-contrast': 1,
    'html-has-lang': 1,
    label: 5,
    'scrollable-region-focusable': 1,
  },
  '/editor': {
    'color-contrast': 1,
    'html-has-lang': 1,
    'label-content-name-mismatch': 8,
    'select-name': 1,
  },
};

for (const [path, known] of Object.entries(baseline)) {
  test(`adds no accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    const ready = path === '/editor' ? '#weapon-select option' : '#weapon-select > .btn';
    await expect(page.locator(ready)).toHaveCount(specs.length);

    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const worse = violations
      .filter((v) => v.nodes.length > (known[v.id] ?? 0))
      .map(
        (v) =>
          `${v.id}: ${v.nodes.length} element(s), was ${known[v.id] ?? 0} (${v.help}) ${v.nodes[0].target.join(' ')}`,
      );
    expect(worse, 'new accessibility violations').toEqual([]);
  });
}
