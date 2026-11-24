// The weapons the interface knows: each spec's class and its art in assets/images, in the order the
// previous trainer page listed them (by class, as the game does). The trainer's catalog joins this to
// the bundled specs; the Studio, which loads the specs from the API, uses it on its own.

export const weaponClasses = ['ar', 'smg', 'lmg', 'marksman', 'sniper', 'shotgun', 'pistol'] as const;
export type WeaponClass = (typeof weaponClasses)[number];

export const weaponList: [id: string, weaponClass: WeaponClass, art: string][] = [
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

/** A weapon's class and art URL; neither for a weapon added since this list was written */
export function weaponEntry(id: string): { weaponClass?: WeaponClass; art?: string } {
  const entry = weaponList.find(([listedId]) => listedId === id);
  return entry ? { weaponClass: entry[1], art: `/images/${entry[2]}` } : {};
}

/** Where a weapon sorts in the list; unlisted ones go last */
export function weaponPosition(id: string): number {
  const i = weaponList.findIndex(([listedId]) => listedId === id);
  return i < 0 ? weaponList.length : i;
}
