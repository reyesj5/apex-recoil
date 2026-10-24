/**
 * Copyright 2021 Mikhail Goncharov
 * Modified by [OWNER NAME], 2025-2026.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Weapons as the trainer uses them: fire modes, magazines, attachments and sounds. Moved from
// client/game.ts; plain functions without a DOM, shared by the current trainer and the new one.

export type FireMode = 'auto' | 'burst' | 'single';

export interface WeaponModeConfig {
  modes: FireMode[];
  defaultMode: FireMode;
  burstSize?: number; // shots per burst
  burstDelayMs?: number; // pause between bursts (ms)
  burstIntraMs?: number; // time between shots within burst (ms)
  refireDelayMs?: number; // minimum time between clicks in single-fire (ms)
  recoilResetMs?: number; // time for recoil to return to 0 (ms)
}

export const WEAPON_FIRE_MODES: Record<string, WeaponModeConfig> = {
  prowler: {
    modes: ['burst', 'auto'],
    defaultMode: 'burst',
    burstSize: 5,
    burstDelayMs: 200,
    burstIntraMs: 50,
    refireDelayMs: 200,
    recoilResetMs: 150,
  },
  hemlok: {
    modes: ['burst', 'single'],
    defaultMode: 'burst',
    burstSize: 3,
    burstDelayMs: 215,
    burstIntraMs: 98,
    refireDelayMs: 160,
    recoilResetMs: 160,
  },
  nemesis: {
    modes: ['burst'],
    defaultMode: 'burst',
    burstSize: 4,
    burstDelayMs: 142,
    burstIntraMs: 64,
    recoilResetMs: 110,
  },
  r301: {
    modes: ['auto', 'single'],
    defaultMode: 'auto',
    refireDelayMs: 130,
    recoilResetMs: 110,
  },
  flatline: {
    modes: ['auto', 'single'],
    defaultMode: 'auto',
    refireDelayMs: 140,
    recoilResetMs: 120,
  },
  peacekeeper: {
    modes: ['single'],
    defaultMode: 'single',
    refireDelayMs: 1176,
    recoilResetMs: 400,
  },
  mastiff: {
    modes: ['single'],
    defaultMode: 'single',
    refireDelayMs: 760,
    recoilResetMs: 300,
  },
  wingman: {
    modes: ['single'],
    defaultMode: 'single',
    refireDelayMs: 357,
    recoilResetMs: 200,
  },
  p2020: {
    modes: ['single'],
    defaultMode: 'single',
    refireDelayMs: 140,
    recoilResetMs: 100,
  },
  p2020_akimbo: {
    modes: ['single'],
    defaultMode: 'single',
    refireDelayMs: 100,
    recoilResetMs: 80,
  },
  '3030_repeater': {
    modes: ['single'],
    defaultMode: 'single',
    refireDelayMs: 428,
    recoilResetMs: 250,
  },
  g7_scout: {
    modes: ['single'],
    defaultMode: 'single',
    refireDelayMs: 246,
    recoilResetMs: 180,
  },
  triple_take: {
    modes: ['single'],
    defaultMode: 'single',
    refireDelayMs: 740,
    recoilResetMs: 350,
  },
  bocek: {
    modes: ['single'],
    defaultMode: 'single',
    refireDelayMs: 800,
    recoilResetMs: 350,
  },
  charge_rifle: {
    modes: ['single'],
    defaultMode: 'single',
    refireDelayMs: 1100,
    recoilResetMs: 400,
  },
  longbow: {
    modes: ['single'],
    defaultMode: 'single',
    refireDelayMs: 698,
    recoilResetMs: 350,
  },
  sentinel: {
    modes: ['single'],
    defaultMode: 'single',
    refireDelayMs: 1579,
    recoilResetMs: 500,
  },
  kraber: {
    modes: ['single'],
    defaultMode: 'single',
    refireDelayMs: 2400,
    recoilResetMs: 700,
  },
};

export function getWeaponModeConfig(weaponName: string): WeaponModeConfig {
  return (
    WEAPON_FIRE_MODES[weaponName] || {
      modes: ['auto'],
      defaultMode: 'auto',
    }
  );
}

/** The fire mode in use: the stored one if the weapon has it, its default otherwise */
export function resolveFireMode(weaponName: string, stored: string): FireMode {
  const cfg = getWeaponModeConfig(weaponName);
  if (stored && cfg.modes.includes(stored as FireMode)) return stored as FireMode;
  return cfg.defaultMode;
}

/** The fire mode after `current` (the B key), or undefined when the weapon has only one */
export function nextFireMode(weaponName: string, current: FireMode): FireMode | undefined {
  const cfg = getWeaponModeConfig(weaponName);
  if (cfg.modes.length <= 1) return undefined;
  const idx = cfg.modes.indexOf(current);
  return cfg.modes[(idx + 1) % cfg.modes.length];
}

export function weaponUsesStock(name: string): boolean {
  const noStockWeapons = new Set(['re45', 'p2020', 'p2020_akimbo', 'mozambique_akimbo', 'wingman', 'bocek', 'kraber']);
  return !noStockWeapons.has(name);
}

export function isSingleShellShotgun(name: string): boolean {
  return name === 'peacekeeper' || name === 'mastiff' || name === 'eva8' || name === 'mozambique';
}

export function isSingleFireWeapon(name: string): boolean {
  const cfg = getWeaponModeConfig(name);
  return cfg.defaultMode === 'single';
}

export interface MagInfo {
  size: number;
  audio: string;
}

export interface Weapon {
  name: string;
  rpm?: number;
  mags: MagInfo[];
  time_points: number[];
  x: number[];
  y: number[];
  /** Attachments that change the weapon, such as the Rampage's thermite grenade: the fields they replace */
  mods: { [key: string]: Partial<Omit<Weapon, 'name' | 'mods'>> };
  ping_points: number[];
}

/** Attachments as stored (game::mods): names joined with commas */
export function parseMods(stored: string): Set<string> {
  return new Set(stored.split(',').filter((v) => v != ''));
}

export function formatMods(mods: Iterable<string>): string {
  return Array.from(mods).join(',');
}

/** A copy of the weapon with its active attachments applied: each replaces the fields it lists */
export function withMods(weapon: Weapon, mods: Iterable<string>): Weapon {
  const w = JSON.parse(JSON.stringify(weapon)) as Weapon;
  for (const name of mods) {
    const mod = w.mods[name];
    if (mod == null) continue;
    for (const k in mod) {
      (w as unknown as Record<string, unknown>)[k] = (mod as Record<string, unknown>)[k];
    }
  }
  return w;
}

/** The stored magazine index, limited to the magazines the weapon has */
export function magIndex(weapon: Weapon, stored: number): number {
  return Math.min(stored, weapon.mags.length - 1);
}

/** Rounds in the magazine; the corrupted stock takes 4 off (1 for single-shell shotguns) where a stock fits */
export function magSize(weapon: Weapon, stored: number, corruptedStock: boolean): number {
  const raw = weapon.mags[Math.min(stored, weapon.mags.length - 1)]?.size || 1;
  if (!corruptedStock || !weaponUsesStock(weapon.name)) {
    return raw;
  }
  const reduction = isSingleShellShotgun(weapon.name) ? 1 : 4;
  return Math.max(1, raw - reduction);
}

/** The sound of a run: a single shot for single fire, the magazine's spray otherwise */
export function soundFile(weapon: Weapon, stored: number, mode: FireMode): string {
  let audioName: string;
  if (mode === 'single') {
    audioName = isSingleShellShotgun(weapon.name) ? 'shotgun_shot' : 'single_shot';
  } else {
    const idx = Math.min(stored, weapon.mags.length - 1);
    audioName = weapon.mags[idx]?.audio || 'spitfire_0';
  }
  const ext =
    audioName.endsWith('.wav') || audioName.endsWith('.mp3')
      ? ''
      : audioName === 'shotgun_shot' || audioName === 'single_shot'
        ? '.wav'
        : '.mp3';
  return `./audio/${audioName}${ext}`;
}
