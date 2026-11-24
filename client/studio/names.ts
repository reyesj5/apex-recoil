import { fireMode, weapons } from '@/locales/en.json';
import { weaponEntry } from '@/trainer/weapon-list';

// Names as the Studio writes them. The Studio is in English, so it reads the English catalog directly.

const weaponNames: Record<string, string> = weapons.name;

/** The weapon as the game writes it (R-99), or its id in capitals for one the catalog doesn't name */
export const weaponName = (id: string) => weaponNames[id] ?? id.toUpperCase();

/** "SMG", "Assault rifle"; nothing for a weapon the list doesn't have */
export function weaponClassName(id: string): string | undefined {
  const { weaponClass } = weaponEntry(id);
  return weaponClass ? weapons.classLong[weaponClass] : undefined;
}

export const fireModeName = (mode: string) => fireMode[mode as keyof typeof fireMode] ?? mode;

/** "1 sample", "4 samples" */
export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
