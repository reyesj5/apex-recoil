import specs from '@/specs.json';
import { isSingleShellShotgun, type Weapon } from '@/engine/weapons';

// The trainer's weapons: each spec in client/specs.json (exported from the spec database, and bundled
// so the trainer also runs on the static host) with its class and its art in assets/images, in the
// order the current trainer page lists them: by class, as the game does.

export const weaponClasses = ['ar', 'smg', 'lmg', 'marksman', 'sniper', 'shotgun', 'pistol'] as const;
export type WeaponClass = (typeof weaponClasses)[number];

const listed: [id: string, weaponClass: WeaponClass, art: string][] = [
  ['flatline', 'ar', 'flatline.png'],
  ['r301', 'ar', 'r301.png'],
  ['havoc_tc', 'ar', 'havoc.png'],
  ['hemlok', 'ar', 'hemlok.png'],
  ['nemesis', 'ar', 'nemesis.svg'],
  ['alternator', 'smg', 'alternator.png'],
  ['prowler', 'smg', 'prowler.png'],
  ['r99', 'smg', 'r99.png'],
  ['volt', 'smg', 'volt.png'],
  ['car', 'smg', 'car.png'],
  ['devotion_tc', 'lmg', 'devotion.png'],
  ['lstar', 'lmg', 'lstar.png'],
  ['spitfire', 'lmg', 'spitfire.png'],
  ['rampage', 'lmg', 'rampage.png'],
  ['g7_scout', 'marksman', 'g7_scout.svg'],
  ['triple_take', 'marksman', 'triple_take.svg'],
  ['3030_repeater', 'marksman', '3030_repeater.svg'],
  ['bocek', 'marksman', 'bocek.svg'],
  ['charge_rifle', 'sniper', 'charge_rifle.svg'],
  ['longbow', 'sniper', 'longbow.svg'],
  ['sentinel', 'sniper', 'sentinel.svg'],
  ['kraber', 'sniper', 'kraber.svg'],
  ['eva8', 'shotgun', 'eva8.svg'],
  ['mastiff', 'shotgun', 'mastiff.svg'],
  ['mozambique', 'shotgun', 'mozambique.svg'],
  ['mozambique_akimbo', 'shotgun', 'mozambique_akimbo.svg'],
  ['peacekeeper', 'shotgun', 'peacekeeper.svg'],
  ['re45', 'pistol', 're45.png'],
  ['p2020', 'pistol', 'p2020.svg'],
  ['p2020_akimbo', 'pistol', 'p2020_akimbo.svg'],
  ['wingman', 'pistol', 'wingman.svg'],
];

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

const position = (id: string) => {
  const i = listed.findIndex(([listedId]) => listedId === id);
  return i < 0 ? listed.length : i;
};

export const weapons: TrainerWeapon[] = specs
  .map((s) => {
    const entry = listed.find(([id]) => id === s.name);
    return { id: s.name, weaponClass: entry?.[1], art: entry && `/images/${entry[2]}`, spec: toWeapon(s) };
  })
  .sort((a, b) => position(a.id) - position(b.id));

/** The stored weapon, or the R-99 (the current trainer's default) for a name that isn't one */
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
