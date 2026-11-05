import specs from '@/specs.json';
import { isSingleShellShotgun, knownPart, type Weapon } from '@/engine/weapons';
import { isCheckedNow } from '@/lib/game-patch';
import { site } from '@/lib/site';
import { weaponClasses, weaponEntry, weaponPosition, type WeaponClass } from './weapon-list';

// The trainer's weapons: each spec in client/specs.json (exported from the spec database, and bundled
// so the trainer also runs on the static host) with its class and its art in assets/images
// (weapon-list.ts), in the order the previous trainer page listed them: by class, as the game does.
// The pages offer a weapon once it's checked against the current game patch (owner, 2026-11-04: "Hide any
// weapon not checked against the patches"), and then only its real part, without a weapon whose real part
// fills no magazine (docs/corrections.md, C8). The Studio loads every spec from the API.

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

function entryOf(spec: Weapon): TrainerWeapon {
  const { weaponClass, art } = weaponEntry(spec.name);
  return { id: spec.name, weaponClass, art, spec };
}

const byPosition = (a: TrainerWeapon, b: TrainerWeapon) => weaponPosition(a.id) - weaponPosition(b.id);

// No spec has to have a check yet, so the JSON's type may not name it
type CheckMark = Parameters<typeof isCheckedNow>[0];

// Each with only its real shots and the magazines they fill
const real = specs
  .map((s) => ({ weapon: entryOf(knownPart(toWeapon(s), s.known_shots)), checked: isCheckedNow(s as CheckMark) }))
  .filter(({ weapon }) => weapon.spec.mags.length > 0)
  .sort((a, b) => byPosition(a.weapon, b.weapon));
const realWeapons = real.map(({ weapon }) => weapon);
const checkedWeapons = real.filter(({ checked }) => checked).map(({ weapon }) => weapon);

/** The weapons the pages offer. It can be none: they say so (no-weapons.tsx). */
export function offeredWeapons(): TrainerWeapon[] {
  return site.e2eShowUnchecked ? realWeapons : checkedWeapons;
}

/** The classes that have a weapon to offer */
export function shownClasses(): WeaponClass[] {
  return weaponClasses.filter((c) => offeredWeapons().some((w) => w.weaponClass === c));
}

const savedSpecs = specs.map((s) => entryOf(toWeapon(s)));

/** The R-99 (the previous trainer's default), or the first of a list without it */
const defaultOf = (list: TrainerWeapon[]): TrainerWeapon | undefined => list.find((w) => w.id === 'r99') ?? list[0];

/**
 * The stored weapon, or the default for one the pages don't offer. With nothing to offer, the pages
 * don't ask; a stored weapon still reads as something rather than crashing a hook.
 */
export function findWeapon(id: string): TrainerWeapon {
  const offered = offeredWeapons();
  return offered.find((w) => w.id === id) ?? defaultOf(offered) ?? savedWeapon(id);
}

/**
 * The weapon of a saved run, whole: a run stays in the history, with its weapon's name and art and its
 * magazine's tier, after the weapon or the magazine is hidden. The R-99 for a name no spec has.
 */
export function savedWeapon(id: string): TrainerWeapon {
  return savedSpecs.find((w) => w.id === id) ?? defaultOf(savedSpecs)!;
}

/** How many weapons each class filter shows */
export function classCounts(): Record<WeaponClass | 'all', number> {
  const offered = offeredWeapons();
  const counts = { all: offered.length } as Record<WeaponClass | 'all', number>;
  for (const c of weaponClasses) counts[c] = offered.filter((w) => w.weaponClass === c).length;
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
