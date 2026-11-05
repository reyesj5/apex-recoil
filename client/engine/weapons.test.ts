import { describe, expect, it } from 'vitest';
import specs from '../specs.json';
import {
  formatMods,
  knownMagazines,
  knownPart,
  magSize,
  nextFireMode,
  parseMods,
  resolveFireMode,
  soundFile,
  weaponUsesStock,
  withMods,
  type Weapon,
} from './weapons';

const weapon = (name: string) => (specs as unknown as Weapon[]).find((w) => w.name === name)!;

describe('fire modes', () => {
  it('uses the stored mode when the weapon has it, its default otherwise', () => {
    expect(resolveFireMode('r99', 'default')).toBe('auto');
    expect(resolveFireMode('prowler', 'auto')).toBe('auto');
    expect(resolveFireMode('hemlok', 'auto')).toBe('burst');
    expect(resolveFireMode('wingman', 'default')).toBe('single');
  });

  it('cycles through the weapon’s modes with the B key', () => {
    expect(nextFireMode('prowler', 'burst')).toBe('auto');
    expect(nextFireMode('prowler', 'auto')).toBe('burst');
    expect(nextFireMode('r99', 'auto')).toBeUndefined();
  });
});

describe('magazines', () => {
  it('takes the stored magazine, limited to the ones the weapon has', () => {
    expect(magSize(weapon('r301'), 2, false)).toBe(28);
    expect(magSize(weapon('r301'), 9, false)).toBe(weapon('r301').mags.at(-1)!.size);
  });

  it('takes 4 rounds off for the corrupted stock, 1 off single-shell shotguns, none without a stock', () => {
    expect(magSize(weapon('r301'), 2, true)).toBe(24);
    expect(magSize(weapon('peacekeeper'), 0, true)).toBe(weapon('peacekeeper').mags[0].size - 1);
    expect(weaponUsesStock('wingman')).toBe(false);
    expect(magSize(weapon('wingman'), 0, true)).toBe(weapon('wingman').mags[0].size);
  });
});

/** The real part of a pattern (docs/corrections.md, C8) */
describe('known shots', () => {
  const sizes = (mags: { size: number }[]) => mags.map((m) => m.size);
  const full: Weapon = {
    name: 'test',
    mags: [
      { size: 2, audio: 'a' },
      { size: 3, audio: 'b' },
      { size: 5, audio: 'c' },
    ],
    time_points: [0, 10, 20, 30, 40],
    x: [0, 1, 2, 3, 4],
    y: [0, -1, -2, -3, -4],
    mods: {},
    ping_points: [],
  };

  it('lists the magazines the real shots fill', () => {
    expect(sizes(knownMagazines(full.mags, 5))).toEqual([2, 3, 5]);
    expect(sizes(knownMagazines(full.mags, 5, 4))).toEqual([2, 3]);
    expect(sizes(knownMagazines(full.mags, 5, 3))).toEqual([2, 3]);
    expect(sizes(knownMagazines(full.mags, 5, 0))).toEqual([]);
  });

  it('takes a pattern shorter than a magazine as not filling it, whatever the count says', () => {
    expect(sizes(knownMagazines(full.mags, 1))).toEqual([]);
    expect(sizes(knownMagazines(full.mags, 3, 5))).toEqual([2, 3]);
  });

  it('leaves a weapon with no count as it is', () => {
    expect(knownPart(full)).toEqual(full);
  });

  it('cuts the shots and their times to the real ones, and drops what those do not fill', () => {
    const part = knownPart(full, 3);
    expect(sizes(part.mags)).toEqual([2, 3]);
    expect(part.x).toEqual([0, 1, 2]);
    expect(part.y).toEqual([0, -1, -2]);
    expect(part.time_points).toEqual([0, 10, 20]);
  });

  it('leaves no magazine when no shot is real', () => {
    const part = knownPart(full, 0);
    expect(part.mags).toEqual([]);
    expect(part.x).toEqual([]);
  });

  it('cuts what an attachment replaces too', () => {
    const modded: Weapon = {
      ...full,
      mods: { fast: { mags: [{ size: 4, audio: 'd' }], time_points: [0, 5, 10, 15, 20], ping_points: [1] } },
    };
    const part = knownPart(modded, 3);
    expect(part.mods.fast.mags).toEqual([]);
    expect(part.mods.fast.time_points).toEqual([0, 5, 10]);
    expect(part.mods.fast.ping_points).toEqual([1]);
  });

  it('does not change the weapon it is given', () => {
    const before = structuredClone(full);
    knownPart(full, 1);
    expect(full).toEqual(before);
  });
});

describe('attachments', () => {
  it('replaces the fields an attachment lists, on a copy', () => {
    const rampage = weapon('rampage');
    const revved = withMods(rampage, parseMods('revved_up'));
    expect(revved.mags).toEqual(rampage.mods.revved_up.mags);
    expect(revved.time_points).toEqual(rampage.mods.revved_up.time_points);
    expect(revved.x).toEqual(rampage.x);
    expect(rampage.mags).not.toEqual(revved.mags);
  });

  it('reads and writes the stored list', () => {
    expect([...parseMods('')]).toEqual([]);
    expect(formatMods(parseMods('revved_up,other'))).toBe('revved_up,other');
  });
});

describe('sounds', () => {
  it('plays the magazine’s spray in full auto and a single shot otherwise', () => {
    expect(soundFile(weapon('r99'), 0, 'auto')).toBe('./audio/r99_0.mp3');
    expect(soundFile(weapon('r301'), 0, 'single')).toBe('./audio/single_shot.wav');
    expect(soundFile(weapon('peacekeeper'), 0, 'single')).toBe('./audio/shotgun_shot.wav');
  });
});
