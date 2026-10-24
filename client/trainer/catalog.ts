import specs from '@/specs.json';
import { isSingleShellShotgun, type Weapon } from '@/engine/weapons';
import { weaponClasses, weaponEntry, weaponPosition, type WeaponClass } from './weapon-list';

// The trainer's weapons: each spec in client/specs.json (exported from the spec database, and bundled
// so the trainer also runs on the static host) with its class and its art in assets/images
// (weapon-list.ts), in the order the previous trainer page listed them: by class, as the game does.

export { weaponClasses, type WeaponClass } from './weapon-list';

export interface TrainerWeapon {
  /** The spec's name, as stored (game::weapon) */
  id: string;
  /** A weapon added to the specs since this list was written shows under All only */
  weaponClass?: WeaponClass;
  /** Image URL; without it the crosshair placeholder shows */
  art?: string;
  spec: Weapon;
}

function toWeapon(s: (typeof specs)[number]): Weapon {
  return {
    name: s.name,
    rpm: s.rpm,
    mags: s.mags.map((m) => ({ size: m.size, audio: m.audio })),
    time_points: s.time_points,
    x: s.x,
    y: s.y,
    mods: ('mods' in s && s.mods ? s.mods : {}) as Weapon['mods'],
    ping_points: s.ping_points ?? [],
  };
}

export const weapons: TrainerWeapon[] = specs
  .map((s) => {
    const { weaponClass, art } = weaponEntry(s.name);
    return { id: s.name, weaponClass, art, spec: toWeapon(s) };
  })
  .sort((a, b) => weaponPosition(a.id) - weaponPosition(b.id));

/** The stored weapon, or the R-99 (the previous trainer's default) for a name that isn't one */
export function findWeapon(id: string): TrainerWeapon {
  return weapons.find((w) => w.id === id) ?? weapons.find((w) => w.id === 'r99') ?? weapons[0];
}

/** How many weapons each class filter shows */
export function classCounts(): Record<WeaponClass | 'all', number> {
  const counts = { all: weapons.length } as Record<WeaponClass | 'all', number>;
  for (const c of weaponClasses) counts[c] = weapons.filter((w) => w.weaponClass === c).length;
  return counts;
}

/** Magazine tiers in game order. A weapon with one magazine has one, named Standard. */
export type Tier = 'base' | 'level1' | 'level2' | 'level3' | 'corrupted';

export function magazineTiers(count: number): Tier[] {
  return (['base', 'level1', 'level2', 'level3', 'corrupted'] as const).slice(0, Math.max(1, count));
}

/** What a magazine holds: shells for the single-shell shotguns, arrows for the Bocek, rounds otherwise */
export function ammoUnit(weaponId: string): 'shells' | 'arrows' | 'rounds' {
  if (isSingleShellShotgun(weaponId)) return 'shells';
  return weaponId === 'bocek' ? 'arrows' : 'rounds';
}
