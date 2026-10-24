import { beforeEach, describe, expect, it } from 'vitest';
import specs from '@/specs.json';
import { readValues } from '@/lib/storage';
import { trainerFields, useTrainerSettings } from '@/lib/storage/trainer';
import { ammoUnit, classCounts, findWeapon, magazineTiers, weapons } from './catalog';
import { readHistory, sameSetup, summarize, today, withResult } from './history';
import { actions, practiceOf } from './loadout';

describe('catalog', () => {
  it('has every spec once, each with its class and art', () => {
    expect(weapons.map((w) => w.id).sort()).toEqual(specs.map((s) => s.name).sort());
    expect(weapons.filter((w) => !w.weaponClass || !w.art).map((w) => w.id)).toEqual([]);
    expect(classCounts()).toEqual({ all: 31, ar: 5, smg: 5, lmg: 4, marksman: 4, sniper: 4, shotgun: 5, pistol: 4 });
  });

  it('lists weapons by class, as the game does', () => {
    expect(weapons.slice(0, 5).map((w) => w.id)).toEqual(['flatline', 'r301', 'havoc_tc', 'hemlok', 'nemesis']);
    expect(weapons.at(-1)?.id).toBe('wingman');
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

  it('stores attachments and the practice mode as the current trainer does', () => {
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

  it('adds a run in the current trainer’s format and sums up today', () => {
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
