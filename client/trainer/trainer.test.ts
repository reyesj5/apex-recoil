import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import specs from '@/specs.json';
import { isCheckedNow } from '@/lib/game-patch';
import { setSite, type SiteJson } from '@/lib/site';
import { readValues } from '@/lib/storage';
import { trainerFields, useTrainerSettings } from '@/lib/storage/trainer';
import { knownPart, type Weapon } from '@/engine/weapons';
import { ammoUnit, classCounts, findWeapon, magazineTiers, offeredWeapons, shownClasses } from './catalog';
import { readHistory, sameSetup, summarize, today, withResult } from './history';
import { actions, practiceOf } from './loadout';
import { weaponPosition } from './weapon-list';

describe('catalog', () => {
  // catalog.test.ts holds these rules to specs made for them; here, to the specs as they are, on the
  // preview the end-to-end scenarios use, which has weapons to work on while nothing is checked
  const preview = (e2eShowUnchecked: boolean) => setSite({ e2eShowUnchecked } as SiteJson);
  beforeAll(() => preview(true));
  afterAll(() => preview(false));

  const real = (specs as unknown as (Weapon & { known_shots?: number; checked_patch?: string })[]).filter(
    (s) => knownPart(s, s.known_shots).mags.length > 0,
  );
  const names = (list: { name: string }[]) => list.map((s) => s.name).sort();

  it('has each spec with a magazine its real shots fill, once, with its class and art', () => {
    const weapons = offeredWeapons();
    expect(weapons.map((w) => w.id).sort()).toEqual(names(real));
    expect(weapons.filter((w) => !w.weaponClass || !w.art).map((w) => w.id)).toEqual([]);
    const counts = classCounts();
    expect(counts.all).toBe(weapons.length);
    expect(shownClasses().reduce((sum, c) => sum + counts[c], 0)).toBe(weapons.length);
  });

  it('offers only what is checked against the current patch, without the preview', () => {
    preview(false);
    expect(
      offeredWeapons()
        .map((w) => w.id)
        .sort(),
    ).toEqual(names(real.filter(isCheckedNow)));
    preview(true);
  });

  it('lists weapons by class, as the game does', () => {
    const order = offeredWeapons().map((w) => weaponPosition(w.id));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(offeredWeapons()[0].id).toBe('flatline');
  });

  it('falls back to the R-99 for a weapon it does not know', () => {
    expect(findWeapon('r301').id).toBe('r301');
    expect(findWeapon('no-such-weapon').id).toBe('r99');
  });

  it('names magazine tiers and what they hold', () => {
    expect(magazineTiers(1)).toEqual(['base']);
    expect(magazineTiers(4)).toEqual(['base', 'level1', 'level2', 'level3']);
    expect(magazineTiers(5)).toEqual(['base', 'level1', 'level2', 'level3', 'corrupted']);
    expect([ammoUnit('mastiff'), ammoUnit('bocek'), ammoUnit('r99')]).toEqual(['shells', 'arrows', 'rounds']);
  });
});

describe('loadout changes', () => {
  beforeEach(() => {
    useTrainerSettings.setState(readValues(trainerFields, undefined));
    localStorage.clear();
  });

  const state = () => useTrainerSettings.getState();

  it('keeps the fire mode when the new weapon has it, else takes its default', () => {
    // The R-99 fires full auto; the Prowler has auto too, the Hemlok only bursts and single
    actions.selectWeapon('prowler');
    expect(localStorage.getItem('game::fire-mode')).toBe('auto');
    actions.setFireMode('burst');
    actions.selectWeapon('hemlok');
    expect(state().fireMode).toBe('burst');
    actions.selectWeapon('r301');
    expect(state().fireMode).toBe('auto');
  });

  it('switches fire modes in the weapon’s order, as the B key does', () => {
    actions.selectWeapon('r301');
    actions.toggleFireMode();
    expect(state().fireMode).toBe('single');
    actions.toggleFireMode();
    expect(state().fireMode).toBe('auto');
    // A weapon with one mode stays in it
    actions.selectWeapon('kraber');
    actions.toggleFireMode();
    expect(state().fireMode).toBe('single');
  });

  it('stores attachments and the practice mode as the previous trainer did', () => {
    actions.setMod('revved_up', true);
    expect(localStorage.getItem('game::mods')).toBe('revved_up');
    actions.setMod('revved_up', false);
    expect(localStorage.getItem('game::mods')).toBe('');

    actions.setPractice('moving');
    expect(localStorage.getItem('game::hint')).toBe('false');
    expect(localStorage.getItem('game::moving-target')).toBe('true');
    expect(practiceOf(state().hint, state().movingTarget)).toBe('moving');
    actions.setPractice('path');
    expect(practiceOf(state().hint, state().movingTarget)).toBe('path');
  });

  it('cycles the result style with the middle button', () => {
    actions.setTrace(2);
    actions.cycleTrace();
    expect(state().traceMode).toBe(0);
  });
});

describe('score history', () => {
  const setup = { weapon: 'r301', mag: 2, hint: true, moving: false };

  it('adds a run in the previous trainer’s format and sums up today', () => {
    const raw = withResult(withResult('[]', 80, setup), 91, setup);
    expect(JSON.parse(raw)).toEqual([
      { v: 3, setup, bestAllTime: 91, today: today(), todayResults: [80, 91], dayResults: [] },
    ]);
    expect(summarize(readHistory(raw), setup)).toEqual({ today: [80, 91], median: 86, bestToday: 91, bestAllTime: 91 });
  });

  it('keeps setups apart', () => {
    const raw = withResult('[]', 70, setup);
    expect(summarize(readHistory(raw), { ...setup, moving: true })).toEqual({ today: [] });
    expect(sameSetup(setup, { ...setup })).toBe(true);
    expect(sameSetup(setup, { ...setup, mag: 3 })).toBe(false);
  });
});
