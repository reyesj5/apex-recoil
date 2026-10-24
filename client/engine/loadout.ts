// What a run needs from the player's settings: the weapon with its attachments, the rounds in the
// magazine, the fire mode and the pattern scaled for the sensitivity. The trainer reads the settings
// from lib/storage and sets up runs the way the previous trainer did from its attributes.

import { recoilPattern, sensitivityScale } from './pattern';
import type { RunSetup } from './run';
import { getWeaponModeConfig, magSize, parseMods, resolveFireMode, withMods, type Weapon } from './weapons';

export interface LoadoutSettings {
  /** The magazine's index, as stored (game::mag) */
  mag: number;
  /** As stored (game::fire-mode); 'default' or one the weapon lacks means its default */
  fireMode: string;
  /** Attachments, as stored (game::mods) */
  mods: string;
  corruptedStock: boolean;
  sens: number;
  invertY: boolean;
  /** Firing speed in percent (game::speed) */
  speed: number;
}

/** The weapon as the run uses it, with its attachments applied */
export function loadoutWeapon(weapon: Weapon, settings: Pick<LoadoutSettings, 'mods'>): Weapon {
  return withMods(weapon, parseMods(settings.mods));
}

/** Sets up a run of `weapon` (as in client/specs.json) with the player's settings */
export function runSetup(weapon: Weapon, settings: LoadoutSettings): RunSetup {
  const w = loadoutWeapon(weapon, settings);
  const mag = magSize(w, settings.mag, settings.corruptedStock);
  return {
    pattern: recoilPattern(w, mag, { sens: settings.sens, invertY: settings.invertY }),
    timePoints: w.time_points,
    mag,
    mode: resolveFireMode(w.name, settings.fireMode),
    fire: getWeaponModeConfig(w.name),
    rpm: w.rpm,
    speedPercent: settings.speed,
    sensScale: sensitivityScale(settings.sens),
  };
}
