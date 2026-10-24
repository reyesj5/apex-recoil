import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { loadoutWeapon } from '@/engine/loadout';
import {
  formatMods,
  getWeaponModeConfig,
  magIndex,
  magSize,
  nextFireMode,
  parseMods,
  resolveFireMode,
  weaponUsesStock,
  type FireMode,
} from '@/engine/weapons';
import { useTrainerSettings } from '@/lib/storage/trainer';
import { findWeapon, magazineTiers } from './catalog';
import type { RangeSettings } from './range/renderer';

// The loadout as the trainer shows and runs it, derived from the stored settings, and the changes a
// player makes, written the way the current trainer writes them.

export type Practice = 'path' | 'still' | 'moving';

const get = () => useTrainerSettings.getState();

export const actions = {
  /** Picks a weapon, keeping the fire mode when the new weapon has it (else its own default) */
  selectWeapon(id: string) {
    const { weapon, fireMode, set } = get();
    if (id === weapon) return;
    const current = resolveFireMode(weapon, fireMode);
    const cfg = getWeaponModeConfig(id);
    set('weapon', id);
    const next = cfg.modes.includes(current) ? current : cfg.defaultMode;
    if (next !== fireMode) set('fireMode', next);
  },
  setMag(index: number) {
    get().set('mag', index);
  },
  setFireMode(mode: FireMode) {
    get().set('fireMode', mode);
  },
  /** The B key: the weapon's next fire mode */
  toggleFireMode() {
    const { weapon, fireMode, set } = get();
    const next = nextFireMode(weapon, resolveFireMode(weapon, fireMode));
    if (next) set('fireMode', next);
  },
  setCorruptedStock(on: boolean) {
    get().set('corruptedStock', on);
  },
  setMod(name: string, on: boolean) {
    const { mods, set } = get();
    const active = parseMods(mods);
    if (on) active.add(name);
    else active.delete(name);
    set('mods', formatMods(active));
  },
  /** Follow path, still target or moving target (the A, S and D keys) */
  setPractice(practice: Practice) {
    const { set } = get();
    set('hint', practice === 'path');
    set('movingTarget', practice === 'moving');
  },
  setTrace(style: number) {
    get().set('traceMode', style);
  },
  /** The middle button: the next result style */
  cycleTrace() {
    const { traceMode, set } = get();
    set('traceMode', (traceMode + 1) % 3);
  },
};

export function practiceOf(hint: boolean, moving: boolean): Practice {
  if (moving) return 'moving';
  return hint ? 'path' : 'still';
}

/** The selected weapon and everything the loadout panel shows about it */
export function useLoadout() {
  const s = useTrainerSettings(
    useShallow((state) => ({
      weapon: state.weapon,
      mag: state.mag,
      fireMode: state.fireMode,
      mods: state.mods,
      corruptedStock: state.corruptedStock,
    })),
  );
  return useMemo(() => {
    const entry = findWeapon(s.weapon);
    const weapon = loadoutWeapon(entry.spec, s);
    const cfg = getWeaponModeConfig(weapon.name);
    return {
      entry,
      /** The weapon with its attachments */
      weapon,
      magIndex: magIndex(weapon, s.mag),
      /** Rounds per magazine tier, after the corrupted stock */
      capacities: weapon.mags.map((_, i) => magSize(weapon, i, s.corruptedStock)),
      tiers: magazineTiers(weapon.mags.length),
      capacity: magSize(weapon, s.mag, s.corruptedStock),
      mode: resolveFireMode(weapon.name, s.fireMode),
      modes: cfg.modes,
      usesStock: weaponUsesStock(weapon.name),
      corruptedStock: s.corruptedStock,
      /** Attachments the weapon takes, and whether each is on */
      mods: Object.keys(entry.spec.mods).map((name) => ({ name, on: parseMods(s.mods).has(name) })),
    };
  }, [s]);
}

/** Everything a run needs, for the range */
export function useRangeSettings(): RangeSettings {
  const s = useTrainerSettings(
    useShallow((state) => ({
      weapon: state.weapon,
      mag: state.mag,
      fireMode: state.fireMode,
      mods: state.mods,
      corruptedStock: state.corruptedStock,
      sens: state.sens,
      ads: state.ads,
      scaleX: state.scaleX,
      scaleY: state.scaleY,
      invertY: state.invertY,
      speed: state.speed,
      stationaryTarget: state.stationaryTarget,
      movingTarget: state.movingTarget,
      targetSpeed: state.targetSpeed,
      hint: state.hint,
      traceMode: state.traceMode,
      volume: state.volume,
      mute: state.mute,
    })),
  );
  return useMemo(() => {
    const entry = findWeapon(s.weapon);
    return {
      weapon: entry.spec,
      loadout: {
        mag: s.mag,
        fireMode: s.fireMode,
        mods: s.mods,
        corruptedStock: s.corruptedStock,
        sens: s.sens * s.ads,
        invertY: s.invertY,
        speed: s.speed,
      },
      scale: { scaleX: s.scaleX, scaleY: s.scaleY },
      hint: s.hint,
      moving: s.movingTarget,
      recoilTarget: !s.stationaryTarget,
      targetSpeed: s.targetSpeed,
      trace: s.traceMode,
      volume: s.volume,
      mute: s.mute,
      trial: {
        weapon: entry.id,
        mag: magIndex(loadoutWeapon(entry.spec, s), s.mag),
        hint: s.hint,
        moving: s.movingTarget,
      },
    };
  }, [s]);
}
