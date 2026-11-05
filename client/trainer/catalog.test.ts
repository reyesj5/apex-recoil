import { afterEach, describe, expect, it, vi } from 'vitest';
import { setSite, type SiteJson } from '@/lib/site';
import { classCounts, findWeapon, offeredWeapons, savedWeapon, shownClasses } from './catalog';

// What the pages offer, on specs made for it, so these cases hold whichever patterns client/specs.json
// has at the moment: a weapon shows once it's checked against the current patch (owner, 2026-11-04),
// and then only its real part (docs/corrections.md, C8).

vi.mock('@/patch.json', () => ({ default: { current: 'v2' } }));

vi.mock('@/specs.json', () => {
  const pattern = (shots: number) => ({
    x: Array.from({ length: shots }, (_, i) => i),
    y: Array.from({ length: shots }, (_, i) => -i),
    time_points: Array.from({ length: shots }, (_, i) => i * 100),
  });
  const mags = (...sizes: number[]) => sizes.map((size) => ({ size, audio: `a${size}` }));
  const rest = { mods: {}, ping_points: [] };
  return {
    default: [
      // Checked, with no real shots: nothing to show
      { name: 'wingman', rpm: 168, mags: mags(5, 6), known_shots: 0, checked_patch: 'v2', ...rest, ...pattern(6) },
      // Checked, and part of it real
      { name: 'r301', rpm: 810, mags: mags(21, 28, 37), known_shots: 31, checked_patch: 'v2', ...rest, ...pattern(37) },
      // Checked, all of it real
      { name: 'r99', rpm: 1080, mags: mags(18, 27), checked_patch: 'v2', ...rest, ...pattern(27) },
      // Real, but never checked
      { name: 'flatline', rpm: 600, mags: mags(19, 29), ...rest, ...pattern(29) },
      // Real, and checked against an earlier patch
      { name: 'volt', rpm: 720, mags: mags(20), checked_patch: 'v1', ...rest, ...pattern(20) },
      // Real, and the check taken back
      { name: 'car', rpm: 930, mags: mags(20), checked_patch: null, ...rest, ...pattern(20) },
      // Checked, but its pattern is shorter than its magazines
      { name: 'p2020', rpm: 420, mags: mags(9), checked_patch: 'v2', ...rest, ...pattern(1) },
    ],
  };
});

const ids = () => offeredWeapons().map((w) => w.id);
const preview = (e2eShowUnchecked: boolean) => setSite({ e2eShowUnchecked } as SiteJson);

afterEach(() => preview(false));

describe('the weapons the pages offer', () => {
  it('offers only what is checked against the current patch and has a magazine its real shots fill', () => {
    expect(ids()).toEqual(['r301', 'r99']);
  });

  it('offers only the magazines the real shots fill, and none of the other shots', () => {
    const r301 = findWeapon('r301').spec;
    expect(r301.mags.map((m) => m.size)).toEqual([21, 28]);
    expect(r301.x).toHaveLength(31);
    expect(r301.y).toHaveLength(31);
    expect(r301.time_points).toHaveLength(31);
  });

  it('leaves a checked weapon with no count as it is', () => {
    const r99 = findWeapon('r99').spec;
    expect(r99.mags.map((m) => m.size)).toEqual([18, 27]);
    expect(r99.x).toHaveLength(27);
  });

  it('selects the R-99 in place of a stored weapon that is hidden', () => {
    for (const hidden of ['wingman', 'flatline', 'volt', 'car', 'p2020', 'no-such-weapon']) {
      expect(findWeapon(hidden).id).toBe('r99');
    }
  });

  it('counts and lists only the classes it has weapons for', () => {
    expect(shownClasses()).toEqual(['ar', 'smg']);
    expect(classCounts()).toMatchObject({ all: 2, ar: 1, smg: 1, pistol: 0, sniper: 0 });
  });
});

describe('the preview the end-to-end scenarios run on', () => {
  it('adds the real patterns that are not checked, and still nothing that is not real', () => {
    preview(true);
    expect(ids()).toEqual(['flatline', 'r301', 'r99', 'volt', 'car']);
    expect(shownClasses()).toEqual(['ar', 'smg']);
    expect(findWeapon('flatline').id).toBe('flatline');
    expect(findWeapon('wingman').id).toBe('r99');
    expect(findWeapon('r301').spec.mags.map((m) => m.size)).toEqual([21, 28]);
  });

  it('is off unless the server turns it on', () => {
    setSite({} as SiteJson);
    expect(ids()).toEqual(['r301', 'r99']);
  });
});

describe('the weapons of saved runs', () => {
  it('still knows a hidden weapon, for the runs saved with it', () => {
    const wingman = savedWeapon('wingman');
    expect(wingman.id).toBe('wingman');
    expect(wingman.art).toBe('/images/wingman.svg');
    expect(savedWeapon('flatline').id).toBe('flatline');
  });

  it('keeps every magazine, so a run on one hidden since keeps its name', () => {
    expect(savedWeapon('r301').spec.mags.map((m) => m.size)).toEqual([21, 28, 37]);
  });

  it('falls back to the R-99 for a weapon no spec has', () => {
    expect(savedWeapon('no-such-weapon').id).toBe('r99');
  });
});
