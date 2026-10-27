import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from 'cn';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { ToggleGroup, ToggleGroupCount, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useTrainerSettings } from '@/lib/storage/trainer';
import { classCounts, weaponClasses, weapons, type WeaponClass } from '../catalog';
import { actions, useLoadout, useSetupSettings, weaponSetup } from '../loadout';
import { useNames } from '../names';
import { usePatternFrame } from '../pattern-frame';
import { PatternPreview } from '../range/pattern-preview';

const counts = classCounts();

/**
 * The pattern library: every weapon's pattern with the stored magazine and fire mode, all at one
 * scale, filtered by class. Picking one selects it, as in the trainer's loadout.
 */
export function PatternLibrary({ className }: { className?: string }) {
  const { t } = useTranslation();
  const names = useNames();
  const { entry } = useLoadout();
  const settings = useSetupSettings();
  const sens = useTrainerSettings((s) => s.sens * s.ads);
  const invertY = useTrainerSettings((s) => s.invertY);
  const frame = usePatternFrame();
  const [weaponClass, setWeaponClass] = useState<WeaponClass | 'all'>('all');
  const setups = useMemo(() => new Map(weapons.map((w) => [w.id, weaponSetup(w, settings)])), [settings]);
  const shown = weapons.filter((w) => weaponClass === 'all' || w.weaponClass === weaponClass);

  return (
    <section
      aria-label={t('patterns.library')}
      className={cn('flex flex-col gap-3.5 rounded-panel border border-outline bg-panel p-4', className)}
    >
      <div className="flex items-center justify-between">
        <h2 className="m-0 type-section-label text-text-muted">{t('patterns.library')}</h2>
        <span className="text-xs text-text-muted">{t('loadout.count', { count: shown.length })}</span>
      </div>

      <ToggleGroup
        type="single"
        variant="chips"
        aria-label={t('loadout.classes')}
        value={weaponClass}
        onValueChange={(v) => v && setWeaponClass(v as WeaponClass | 'all')}
      >
        {(['all', ...weaponClasses] as const).map((c) => (
          <ToggleGroupItem key={c} value={c}>
            {names.weaponClass(c)} <ToggleGroupCount>{counts[c]}</ToggleGroupCount>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <ToggleGroupPrimitive.Root
        type="single"
        aria-label={t('loadout.grid')}
        value={entry.id}
        onValueChange={(id) => id && actions.selectWeapon(id)}
        className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4"
      >
        {shown.map((w) => {
          const setup = setups.get(w.id)!;
          return (
            <ToggleGroupPrimitive.Item
              key={w.id}
              value={w.id}
              data-weapon={w.id}
              className="group/card flex min-w-0 cursor-pointer flex-col gap-2.5 rounded-card-lg border border-outline-card bg-card p-3 text-left text-text transition-colors data-[state=off]:hover:bg-hover data-[state=on]:border-volt data-[state=on]:bg-volt-wash"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate type-label">{names.weapon(w.id)}</span>
                {/* The space keeps "R-301 810 RPM" apart in the card's name */}{' '}
                <span className="truncate text-11 text-text-muted group-data-[state=on]/card:text-text-secondary">
                  {t('loadout.rpm', { rpm: w.spec.rpm })}
                </span>
              </span>
              <span className="flex h-44 items-center justify-center rounded-card bg-inset py-2">
                <PatternPreview
                  weapon={setup.weapon}
                  count={setup.capacity}
                  mode={setup.mode}
                  sens={sens}
                  invertY={invertY}
                  tone="ink"
                  frame={frame}
                  className="h-full w-auto max-w-full"
                />
              </span>
            </ToggleGroupPrimitive.Item>
          );
        })}
      </ToggleGroupPrimitive.Root>
    </section>
  );
}
