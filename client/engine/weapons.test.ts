import { describe, expect, it } from 'vitest';
import specs from '../specs.json';
import {
  formatMods,
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
