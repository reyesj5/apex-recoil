import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MonitorIcon, PlayIcon } from 'lucide-react';
import { SpraydownLogo } from '@/components/icons';
import { TierGroup, TierOption } from '@/components/tier-option';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { localeNames, locales, type Locale } from '@/lib/i18n';
import { site } from '@/lib/site';
import { useTrainerSettings } from '@/lib/storage/trainer';
import { weapons } from './catalog';
import { LegalFooter } from './legal-footer';
import { patternsHref, trainerHref } from './links';
import { actions, useLoadout } from './loadout';
import { useNames } from './names';
import { usePatternFrame } from './pattern-frame';
import { usePlaySpray } from './play-spray';
import { PatternPreview } from './range/pattern-preview';

const shortNames: Record<Locale, string> = { en: 'EN', ru: 'RU', 'zh-CN': '中文' };

/**
 * What phones get instead of the trainer and the Patterns page: each weapon's real pattern with a
 * Play button, its magazines, and a link to copy for practicing on a computer. `page` is the page it
 * stands in for, which the language select keeps.
 */
export function PhoneViewer({
  locale,
  page = 'train',
  className,
}: {
  locale: Locale;
  page?: 'train' | 'patterns';
  className?: string;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const loadout = useLoadout();
  const sens = useTrainerSettings((s) => s.sens * s.ads);
  const invertY = useTrainerSettings((s) => s.invertY);
  const [copied, setCopied] = useState(false);
  const { entry, weapon } = loadout;
  const name = names.weapon(entry.id);
  const spray = usePlaySpray(weapon, loadout.capacity);
  const frame = usePatternFrame();
  const href = page === 'patterns' ? patternsHref : trainerHref;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(site.siteUrl || location.href);
      setCopied(true);
    } catch {
      // the browser refused; the address bar still has the link
    }
  };

  return (
    <div className={className}>
      <header className="flex items-center gap-2.5 border-b border-outline px-4 py-3.5">
        <SpraydownLogo className="h-7.5" />
        <Select value={locale} onValueChange={(v) => location.assign(href(v as Locale))}>
          <SelectTrigger
            aria-label={t('topBar.language')}
            className="ml-auto h-touch rounded-card border-divider bg-panel"
          >
            <SelectValue>{shortNames[locale]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {locales.map((l) => (
              <SelectItem key={l} value={l} lang={l}>
                {localeNames[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>
      <main className="flex flex-1 flex-col gap-3.5 px-4 pt-4.5 pb-4">
        <div>
          <h1 className="m-0 type-page-title-phone">{t('phone.title')}</h1>
          <p className="m-0 mt-2 leading-normal text-text-secondary">{t('phone.intro')}</p>
        </div>
        <ToggleGroup
          type="single"
          variant="chips"
          size="touch"
          aria-label={t('phone.weapon')}
          value={entry.id}
          onValueChange={(id) => id && actions.selectWeapon(id)}
        >
          {weapons.map((w) => (
            <ToggleGroupItem key={w.id} value={w.id}>
              {names.weapon(w.id)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <section
          aria-label={t('patterns.section', { weapon: name })}
          className="flex flex-col gap-3 rounded-sheet border border-outline bg-panel p-3.5"
        >
          <div className="flex items-center gap-3">
            {entry.art && <img src={entry.art} alt="" className="h-9 w-23 object-contain" />}
            <div>
              <div className="type-weapon-name">{name}</div>
              <div className="text-xs text-text-secondary">
                {t('patterns.meta', {
                  rpm: weapon.rpm,
                  capacity: names.ammo(weapon.name, loadout.capacity),
                  tier: names.tier(loadout.tiers[loadout.magIndex], loadout.tiers.length),
                })}
              </div>
            </div>
          </div>
          <div className="relative flex h-62.5 justify-center rounded-card-lg bg-inset bg-[radial-gradient(var(--color-range-dot)_1px,transparent_1px)] bg-size-[18px_18px] py-1.5">
            <PatternPreview
              weapon={weapon}
              count={loadout.capacity}
              mode={loadout.mode}
              sens={sens}
              invertY={invertY}
              tone="volt"
              shown={spray.shown}
              label={t('patterns.pattern', { weapon: name, shots: names.ammo(weapon.name, loadout.capacity) })}
              frame={frame}
              className="h-full w-auto max-w-full"
            />
            <Button size="touch" className="absolute right-2.5 bottom-2.5 rounded-pill" onClick={spray.play}>
              <PlayIcon className="size-3.5" fill="currentColor" aria-hidden="true" />
              {t('patterns.play')}
            </Button>
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
                touch
                aria-label={t('tier.option', {
                  tier: names.tierLong(tier, loadout.tiers.length),
                  capacity: names.ammo(weapon.name, loadout.capacities[i]),
                })}
              />
            ))}
          </TierGroup>
        </section>
        <section
          aria-label={t('phone.computerLabel')}
          className="flex items-center gap-3 rounded-panel border border-divider bg-card p-3.5"
        >
          <MonitorIcon className="size-7 shrink-0 text-text-secondary" aria-hidden="true" />
          <p className="m-0 flex-1 text-13 leading-snug text-text-secondary">
            <strong className="text-text">{t('phone.computer')}</strong> {t('phone.computerText')}
          </p>
          <Button variant="secondary" size="touch" onClick={() => void copy()}>
            {copied ? t('phone.copied') : t('phone.copy')}
          </Button>
        </section>
        <LegalFooter />
      </main>
    </div>
  );
}
