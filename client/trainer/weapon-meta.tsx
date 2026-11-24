import { useTranslation } from 'react-i18next';
import type { WeaponClass } from './catalog';
import { useNames } from './names';

/**
 * A weapon's class and fire rate, as under its name: "Assault rifle · 810 RPM". The fire rate stays on
 * one line when the class is long (the Russian unit, выстр./мин, would break at its slash).
 */
export function WeaponMeta({ weaponClass, rpm }: { weaponClass: WeaponClass | undefined; rpm?: number }) {
  const { t } = useTranslation();
  const names = useNames();
  return (
    <>
      {names.weaponClassLong(weaponClass)} · <span className="whitespace-nowrap">{t('loadout.rpm', { rpm })}</span>
    </>
  );
}
