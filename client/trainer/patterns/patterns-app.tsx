import { Suspense, useId } from 'react';
import type { i18n } from 'i18next';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { PlayIcon } from 'lucide-react';
import { cn } from 'cn';
import { TierGroup, TierOption } from '@/components/tier-option';
import { SelectedWeapon } from '@/components/weapon-tile';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { FireMode } from '@/engine/weapons';
import type { Locale } from '@/lib/i18n';
import { useTrainerSettings } from '@/lib/storage/trainer';
import { ConsentPrompt, useAnalyticsStart } from '../consent';
import { useMediaQuery, useStoredSettings } from '../hooks';
import { LegalFooter } from '../legal-footer';
import { trainerHref } from '../links';
import { actions, useLoadout } from '../loadout';
import { useNames } from '../names';
import { PhoneViewer } from '../phone-viewer';
import { usePatternFrame } from '../pattern-frame';
import { usePlaySpray } from '../play-spray';
import { PatternPreview } from '../range/pattern-preview';
import { TopBar } from '../top-bar';
import { WeaponMeta } from '../weapon-meta';
import { PatternLibrary } from './pattern-library';

/**
 * The Patterns page (docs/ui-redesign.md: a pattern library by weapon and magazine): every weapon's
 * pattern, and the selected one large, played shot by shot, with its magazines and fire modes. Phones
 * get the pattern viewer, as on the trainer's page.
 */
export function PatternsApp({ i18n, locale }: { i18n: i18n; locale: Locale }) {
  return (
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <PatternsPage locale={locale} />
      </TooltipProvider>
    </I18nextProvider>
  );
}

function PatternsPage({ locale }: { locale: Locale }) {
  const { t } = useTranslation();
  const wide = useMediaQuery('(min-width: 48rem)');
  useStoredSettings();
  useAnalyticsStart();

  // Each layout is a Suspense boundary, so the prerendered page hydrates in shorter tasks
  return (
    <>
      <Suspense fallback={null}>
        <div className="hidden min-h-screen flex-col md:flex">
          <TopBar locale={locale} page="patterns" />
          <main className="mx-auto flex w-full max-w-340 flex-1 flex-col gap-5 px-5 pt-6 pb-8">
            <div>
              <h1 className="m-0 type-page-title">{t('patterns.title')}</h1>
              <p className="m-0 mt-1.5 max-w-180 text-text-secondary">{t('patterns.intro')}</p>
            </div>
            <div className="flex items-start gap-4">
              <PatternLibrary className="min-w-0 flex-1" />
              <PatternDetail locale={locale} className="sticky top-4 w-80 shrink-0 lg:w-100" />
            </div>
            <LegalFooter className="mt-auto" />
          </main>
        </div>
      </Suspense>
      <Suspense fallback={null}>
        <PhoneViewer locale={locale} page="patterns" className="flex min-h-screen flex-col md:hidden" />
      </Suspense>
      <ConsentPrompt sheet={!wide} />
    </>
  );
}

/** The selected weapon's pattern, large: Play spray, its magazines and fire modes, and the way to train it */
function PatternDetail({ locale, className }: { locale: Locale; className?: string }) {
  const { t } = useTranslation();
  const names = useNames();
  const loadout = useLoadout();
  const sens = useTrainerSettings((s) => s.sens * s.ads);
  const invertY = useTrainerSettings((s) => s.invertY);
  const { entry, weapon } = loadout;
  const name = names.weapon(entry.id);
  const spray = usePlaySpray(weapon, loadout.capacity);
  const frame = usePatternFrame();
  const fireModeId = useId();

  return (
    <aside
      aria-label={t('patterns.section', { weapon: name })}
      className={cn('flex flex-col gap-3.5 rounded-panel border border-outline bg-panel p-4', className)}
    >
      <SelectedWeapon
        name={name}
        art={entry.art}
        meta={<WeaponMeta weaponClass={entry.weaponClass} rpm={weapon.rpm} />}
      />

      {/* The pattern stops above Play spray, which would cover the end of a long spray */}
      <div className="relative flex h-90 justify-center rounded-card-lg bg-inset bg-[radial-gradient(var(--color-range-dot)_1px,transparent_1px)] bg-size-[18px_18px] pt-3 pb-14">
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
        <Button className="absolute right-2.5 bottom-2.5 rounded-pill" onClick={spray.play}>
          <PlayIcon className="size-3.5" fill="currentColor" aria-hidden="true" />
          {t('patterns.play')}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="m-0 type-label">{t('loadout.magazine')}</h2>
          <span className="text-xs text-text-muted">{names.ammo(weapon.name, loadout.capacity)}</span>
        </div>
        <TierGroup
          count={loadout.tiers.length}
          aria-label={t('loadout.magazine')}
          value={String(loadout.magIndex)}
          onValueChange={(v) => {
            if (!v) return;
            spray.stop();
            actions.setMag(Number(v));
          }}
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

      {loadout.modes.length > 1 && (
        <div className="flex items-center justify-between gap-3">
          <span id={fireModeId} className="type-label">
            {t('loadout.fireMode')}
          </span>
          <ToggleGroup
            type="single"
            variant="neutral"
            aria-labelledby={fireModeId}
            value={loadout.mode}
            onValueChange={(v) => {
              if (!v) return;
              spray.stop();
              actions.setFireMode(v as FireMode);
            }}
          >
            {loadout.modes.map((mode) => (
              <ToggleGroupItem key={mode} value={mode}>
                {names.fireMode(mode)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}

      <Button asChild>
        <a href={trainerHref(locale)}>{t('patterns.practice')}</a>
      </Button>
      <p className="m-0 text-xs leading-normal text-text-secondary">{t('patterns.read')}</p>
    </aside>
  );
}
