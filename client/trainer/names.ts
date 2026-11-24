import { useTranslation } from 'react-i18next';
import type { FireMode } from '@/engine/weapons';
import { ammoUnit, type Tier, type WeaponClass } from './catalog';
import type { Practice } from './loadout';

// Names as the interface writes them, in the page's language: weapons as the game writes them,
// classes, fire modes, magazine tiers and ammunition with its count.

const tierLevel = (tier: Tier) => Number(tier.slice('level'.length));

export function useNames() {
  const { t } = useTranslation();
  return {
    weapon: (id: string) => t(`weapons.name.${id}` as 'weapons.name.r99', { defaultValue: id }),
    weaponClass: (c: WeaponClass | 'all') => t(`weapons.category.${c}` as 'weapons.category.all'),
    weaponClassLong: (c: WeaponClass | undefined) =>
      c ? t(`weapons.classLong.${c}` as 'weapons.classLong.ar') : t('weapons.category.all'),
    fireMode: (mode: FireMode) => t(`fireMode.${mode}` as 'fireMode.auto'),
    practice: (practice: Practice) =>
      ({ path: t('range.followPath'), still: t('range.stillTarget'), moving: t('range.movingTarget') })[practice],
    /** The tier as a tier option names it: Base, Lv 1, Corrupted; Standard when it is the only one */
    tier: (tier: Tier, tiers: number) => {
      if (tiers === 1) return t('tier.standard');
      if (tier === 'base') return t('tier.base');
      if (tier === 'corrupted') return t('tier.corrupted');
      return t('tier.level', { level: tierLevel(tier) });
    },
    /** The magazine in words: Level 2 magazine */
    tierLong: (tier: Tier, tiers: number) => {
      if (tiers === 1) return t('tier.standardLong');
      if (tier === 'base') return t('tier.baseLong');
      if (tier === 'corrupted') return t('tier.corruptedLong');
      return t('tier.levelLong', { level: tierLevel(tier) });
    },
    /** 28 rounds, 5 shells, 1 arrow */
    ammo: (weaponId: string, count: number) => {
      const unit = ammoUnit(weaponId);
      if (unit === 'shells') return t('units.shells', { count });
      if (unit === 'arrows') return t('units.arrows', { count });
      return t('units.rounds', { count });
    },
  };
}
