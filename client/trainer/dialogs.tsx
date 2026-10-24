import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useTrainerSettings } from '@/lib/storage/trainer';
import { weaponClasses, weapons } from './catalog';
import { Slider } from '@/components/ui/slider';
import { Hint, NumberField, SwitchField } from './fields';
import { actions } from './loadout';
import { useNames } from './names';
import { useSession, type SessionState } from './session';

// The trainer's dialogs, opened from the top bar or with a key: settings, help, weapon search. They
// load as their own chunk the first time one opens (trainer-app.tsx).

/** The three dialogs; each shows while the session names it */
export default function Dialogs() {
  return (
    <>
      <SettingsDialog />
      <HelpDialog />
      <WeaponSearch />
    </>
  );
}

function useDialog(name: NonNullable<SessionState['dialog']>) {
  const open = useSession((s) => s.dialog === name);
  const onOpenChange = (next: boolean) => useSession.setState({ dialog: next ? name : null });
  return { open, onOpenChange };
}

/** A level set by feel, with its value shown next to the label */
function SliderField({
  label,
  hint,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  /** The value as shown, such as "0.5×" */
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label id={id}>{label}</Label>
        <span className="font-mono text-xs text-text-secondary">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-labelledby={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onValueChange={([v]) => onChange(v)}
      />
      <Hint id={`${id}-hint`}>{hint}</Hint>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="m-0 type-section-label text-text-muted">{title}</h3>
      {children}
    </section>
  );
}

/** Every setting in one place: mouse, practice, display and sound */
export function SettingsDialog() {
  const { t } = useTranslation();
  const dialog = useDialog('settings');
  const s = useTrainerSettings(
    useShallow((state) => ({
      sens: state.sens,
      ads: state.ads,
      invertY: state.invertY,
      stationaryTarget: state.stationaryTarget,
      targetSpeed: state.targetSpeed,
      speed: state.speed,
      scaleX: state.scaleX,
      scaleY: state.scaleY,
      mute: state.mute,
      volume: state.volume,
    })),
  );
  const set = useTrainerSettings.getState().set;
  return (
    <Dialog {...dialog}>
      <DialogContent className="max-h-[calc(100vh-2rem)] gap-5 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settingsDialog.title')}</DialogTitle>
          <DialogDescription>{t('settingsDialog.description')}</DialogDescription>
        </DialogHeader>
        <Group title={t('settingsDialog.mouse')}>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label={t('settingsDialog.sensitivity')}
              value={s.sens}
              min={0.01}
              max={100}
              step={0.1}
              onChange={(v) => set('sens', v)}
            />
            <NumberField
              label={t('settingsDialog.ads')}
              value={s.ads}
              min={0.01}
              max={10}
              step={0.05}
              onChange={(v) => set('ads', v)}
            />
          </div>
          <p className="m-0 text-xs leading-normal text-text-muted">
            {t('settingsDialog.sensitivityHint')} {t('settingsDialog.adsHint')}
          </p>
          <SwitchField label={t('settingsDialog.invertY')} checked={s.invertY} onChange={(on) => set('invertY', on)} />
        </Group>
        <Group title={t('settingsDialog.practice')}>
          <RecoilMoves stationary={s.stationaryTarget} onChange={(stationary) => set('stationaryTarget', stationary)} />
          <SliderField
            label={t('settingsDialog.targetSpeed')}
            value={s.targetSpeed}
            display={String(s.targetSpeed)}
            min={1}
            max={600}
            step={1}
            onChange={(v) => set('targetSpeed', v)}
          />
          <SliderField
            label={t('settingsDialog.firingSpeed')}
            hint={t('settingsDialog.firingSpeedHint')}
            value={s.speed}
            display={`${s.speed / 100}×`}
            min={10}
            max={100}
            step={10}
            onChange={(v) => set('speed', v)}
          />
        </Group>
        <Group title={t('settingsDialog.display')}>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label={t('settingsDialog.scaleX')}
              value={s.scaleX}
              min={0.1}
              max={10}
              step={0.05}
              onChange={(v) => set('scaleX', v)}
            />
            <NumberField
              label={t('settingsDialog.scaleY')}
              value={s.scaleY}
              min={0.1}
              max={10}
              step={0.05}
              onChange={(v) => set('scaleY', v)}
            />
          </div>
          <p className="m-0 text-xs leading-normal text-text-muted">{t('settingsDialog.scaleHint')}</p>
        </Group>
        <Group title={t('settingsDialog.sound')}>
          <SwitchField label={t('settingsDialog.playSounds')} checked={!s.mute} onChange={(on) => set('mute', !on)} />
          <SliderField
            label={t('settingsDialog.volume')}
            value={s.volume}
            display={String(s.volume)}
            min={0}
            max={100}
            step={1}
            onChange={(v) => set('volume', v)}
          />
        </Group>
      </DialogContent>
    </Dialog>
  );
}

// Whether the recoil moves the aim (the previous trainer's default) or the target, as in the game
function RecoilMoves({ stationary, onChange }: { stationary: boolean; onChange: (stationary: boolean) => void }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label id={id}>{t('settingsDialog.recoilMoves')}</Label>
        <ToggleGroup
          type="single"
          variant="neutral"
          aria-labelledby={id}
          value={stationary ? 'aim' : 'target'}
          onValueChange={(v) => v && onChange(v === 'aim')}
        >
          <ToggleGroupItem value="aim">{t('settingsDialog.recoilAim')}</ToggleGroupItem>
          <ToggleGroupItem value="target">{t('settingsDialog.recoilTarget')}</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <p className="m-0 text-xs leading-normal text-text-muted">{t('settingsDialog.recoilHint')}</p>
    </div>
  );
}

/** How to practice, and every key */
export function HelpDialog() {
  const { t } = useTranslation();
  const dialog = useDialog('help');
  const keys: [string, string][] = [
    [t('help.fireMode'), 'B'],
    [t('range.followPath'), 'A'],
    [t('range.stillTarget'), 'S'],
    [t('range.movingTarget'), 'D'],
    [t('help.search'), 'Ctrl K'],
    [t('help.resultStyle'), t('help.middleClick')],
  ];
  return (
    <Dialog {...dialog}>
      <DialogContent className="max-h-[calc(100vh-2rem)] gap-5 overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('help.title')}</DialogTitle>
          <DialogDescription>{t('help.description')}</DialogDescription>
        </DialogHeader>
        <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 text-sm leading-normal text-text-secondary marker:text-text-muted">
          <li>{t('help.pointer')}</li>
          <li>{t('help.sensitivity')}</li>
          <li>{t('help.pick')}</li>
          <li>{t('help.spray')}</li>
          <li>{t('help.score')}</li>
        </ol>
        <Group title={t('help.shortcuts')}>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
            {keys.map(([action, key]) => (
              <li key={action} className="flex items-center justify-between gap-3">
                {action} <Kbd>{key}</Kbd>
              </li>
            ))}
          </ul>
        </Group>
      </DialogContent>
    </Dialog>
  );
}

/** The command palette (Ctrl K): every weapon by class; picking one selects it */
export function WeaponSearch() {
  const { t } = useTranslation();
  const names = useNames();
  const dialog = useDialog('search');
  return (
    <CommandDialog {...dialog} title={t('search.title')} description={t('search.description')} showCloseButton={false}>
      <CommandInput placeholder={t('search.placeholder')} aria-label={t('search.placeholder')} />
      <CommandList>
        <CommandEmpty>{t('search.empty')}</CommandEmpty>
        {weaponClasses.map((c) => (
          <CommandGroup key={c} heading={names.weaponClassLong(c)}>
            {weapons
              .filter((w) => w.weaponClass === c)
              .map((w) => (
                <CommandItem
                  key={w.id}
                  value={`${names.weapon(w.id)} ${w.id}`}
                  onSelect={() => {
                    actions.selectWeapon(w.id);
                    useSession.setState({ dialog: null });
                  }}
                >
                  {names.weapon(w.id)}
                  <span className="ml-auto text-xs text-text-muted">{t('loadout.rpm', { rpm: w.spec.rpm })}</span>
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
