import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// The component gallery (/next/components): every component of the new interface on the design
// system's tokens (docs/ui-migration-plan.md, Phase 1). Unlike the current pages it has no
// accessibility baseline: WCAG 2.1 A and AA with no violations, with every overlay open too.

async function violations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.length} element(s) (${v.help}) ${v.nodes[0].target.join(' ')}`);
}

test('shows every component on the design system tokens', async ({ page }, testInfo) => {
  await page.goto('/next/components');
  await expect(page.getByRole('heading', { level: 1, name: 'Components' })).toBeVisible();
  for (const section of ['Actions', 'Selection', 'Fields', 'Feedback', 'Data', 'Overlays', 'Surfaces']) {
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^${section}$`, 'i') })).toBeVisible();
  }

  // The tokens reach the page: ground behind everything, volt on the primary button
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(10, 12, 15)');
  await expect(page.getByRole('button', { name: 'Save spec', exact: true })).toHaveCSS(
    'background-color',
    'rgb(197, 242, 58)',
  );
  // The three families, self-hosted in the build
  const families = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((font) => font.status === 'loaded').map((font) => font.family);
  });
  expect(new Set(families)).toEqual(new Set(['Chakra Petch', 'Inter Variable', 'JetBrains Mono Variable']));

  await testInfo.attach('gallery', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('meets WCAG 2.1 A and AA with every overlay open', async ({ page }) => {
  await page.goto('/next/components');
  await expect(page.getByRole('heading', { level: 1, name: 'Components' })).toBeVisible();
  expect(await violations(page), 'accessibility violations').toEqual([]);

  const overlays = page.getByRole('region', { name: /^overlays$/i });
  const cases = [
    { trigger: 'Keyboard shortcuts', role: 'dialog', name: 'Keyboard shortcuts' },
    { trigger: 'Delete sample', role: 'alertdialog', name: 'Delete this sample?' },
    { trigger: 'Settings on a phone', role: 'dialog', name: 'Settings' },
    { trigger: 'Sensitivity 5.0', role: 'dialog', name: 'Mouse settings' },
    { trigger: 'More actions', role: 'menu', name: undefined },
  ] as const;
  for (const { trigger, role, name } of cases) {
    const button = overlays.getByRole('button', { name: trigger, exact: true });
    await button.click();
    const overlay = page.getByRole(role, { name });
    await expect(overlay).toBeVisible();
    expect(await violations(page), `accessibility violations with "${trigger}" open`).toEqual([]);
    // Escape closes it and gives focus back to the button that opened it
    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();
    await expect(button).toBeFocused();
  }
});

test('fits a phone screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/next/components');
  await expect(page.getByRole('heading', { level: 1, name: 'Components' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);

  // The run table scrolls sideways in its own container, which the keyboard can reach
  await expect(page.getByRole('region', { name: 'Recent runs' })).toHaveAttribute('tabindex', '0');
  expect(await violations(page), 'accessibility violations').toEqual([]);

  await testInfo.attach('gallery on a phone', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
