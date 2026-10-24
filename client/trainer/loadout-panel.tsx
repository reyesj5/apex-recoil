import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from 'cn';
import { TierGroup, TierOption } from '@/components/tier-option';
import { SelectedWeapon, WeaponGrid, WeaponTile } from '@/components/weapon-tile';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupCount, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { FireMode } from '@/engine/weapons';
import { classCounts, weaponClasses, weapons, type WeaponClass } from './catalog';
import { actions, useLoadout } from './loadout';
import { useNames } from './names';

const counts = classCounts();

/** The loadout panel: the selected weapon, the weapon grid with its filters, the magazine and fire mode */
export function LoadoutPanel({ className }: { className?: string }) {
  const { t } = useTranslation();
  const names = useNames();
  const loadout = useLoadout();
  const [query, setQuery] = useState('');
  const [weaponClass, setWeaponClass] = useState<WeaponClass | 'all'>('all');
  const ids = { fireMode: useId(), stock: useId() };
  const q = query.trim().toLowerCase();
  const shown = weapons.filter(
    (w) =>
      (weaponClass === 'all' || w.weaponClass === weaponClass) &&
      (!q || w.id.toLowerCase().includes(q) || names.weapon(w.id).toLowerCase().includes(q)),
  );
  const { entry, weapon } = loadout;

  return (
    <aside
      aria-label={t('loadout.title')}
      className={cn('flex flex-col gap-3.5 rounded-panel border border-outline bg-panel p-4', className)}
    >
      <div className="flex items-center justify-between">
        <h2 className="m-0 type-section-label text-text-muted">{t('loadout.title')}</h2>
        <span className="text-xs text-text-muted">{t('loadout.count', { count: weapons.length })}</span>
      </div>

      <SelectedWeapon
        name={names.weapon(entry.id)}
        art={entry.art}
        meta={t('loadout.meta', { class: names.weaponClassLong(entry.weaponClass), rpm: weapon.rpm })}
      />

      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('loadout.filter')}
        aria-label={t('loadout.filter')}
        className="h-control text-13"
      />

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

      {/* Native scrolling with a thin divider-colored bar, like the Scroll area component, which would
          add 4 kB to the first load */}
      <div className="h-73 shrink-0 [scrollbar-width:thin] [scrollbar-color:var(--color-divider)_transparent] overflow-y-auto pr-1.5 xl:h-auto xl:min-h-24 xl:flex-1">
        {shown.length > 0 ? (
          <WeaponGrid
            aria-label={t('loadout.grid')}
            value={entry.id}
            onValueChange={(id) => id && actions.selectWeapon(id)}
          >
            {shown.map((w) => (
              <WeaponTile
                key={w.id}
                value={w.id}
                data-weapon={w.id}
                name={names.weapon(w.id)}
                art={w.art}
                meta={t('loadout.rpm', { rpm: w.spec.rpm })}
              />
            ))}
          </WeaponGrid>
        ) : (
          <p className="m-0 py-6 text-center text-xs text-text-muted">{t('loadout.noMatch', { query })}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="m-0 type-label">{t('loadout.magazine')}</h3>
          <span className="text-xs text-text-muted">{names.ammo(weapon.name, loadout.capacity)}</span>
        </div>
        <TierGroup
          count={loadout.tiers.length}
          aria-label={t('loadout.magazine')}
          value={String(loadout.magIndex)}
          onValueChange={(v) => v && actions.setMag(Number(v))}
        >
          {loadout.tiers.map((tier, i) => (
            <TierOption
              key={tier}
              value={String(i)}
              tier={tier}
              size={loadout.capacities[i]}
              name={names.tier(tier, loadout.tiers.length)}
              aria-label={t('tier.option', {
                tier: names.tierLong(tier, loadout.tiers.length),
                capacity: names.ammo(weapon.name, loadout.capacities[i]),
              })}
            />
          ))}
        </TierGroup>
      </div>

      <div className="flex flex-col gap-2.5 pt-1">
        <div className="flex items-center justify-between gap-3">
          <span id={ids.fireMode} className="type-label">
            {t('loadout.fireMode')}
          </span>
          <ToggleGroup
            type="single"
            variant="neutral"
            aria-labelledby={ids.fireMode}
            value={loadout.mode}
            onValueChange={(v) => v && actions.setFireMode(v as FireMode)}
          >
            {loadout.modes.map((mode) => (
              <ToggleGroupItem key={mode} value={mode}>
                {names.fireMode(mode)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {loadout.usesStock && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={ids.stock} className="type-label text-text">
              {t('loadout.corruptedStock')}
            </Label>
            <Switch id={ids.stock} checked={loadout.corruptedStock} onCheckedChange={actions.setCorruptedStock} />
          </div>
        )}
        {loadout.mods.map((mod) => (
          <ModSwitch key={mod.name} name={mod.name} on={mod.on} />
        ))}
      </div>
    </aside>
  );
}

// An attachment the weapon takes; the Rampage's thermite grenade is the only one so far
function ModSwitch({ name, on }: { name: string; on: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="type-label text-text">
        {name === 'revved_up' ? t('loadout.thermite') : name}
      </Label>
      <Switch id={id} checked={on} onCheckedChange={(checked) => actions.setMod(name, checked)} />
    </div>
  );
}
