import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MouseIcon, Volume2Icon, VolumeXIcon } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { RunResult, ScoreDelta } from '@/components/score-card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTrainerSettings } from '@/lib/storage/trainer';
import { magazineTiers } from './catalog';
import { NumberField, SwitchField } from './fields';
import { readHistory, summarize, withResult } from './history';
import { actions, practiceOf, useLoadout, useRangeSettings, type Practice } from './loadout';
import { useNames } from './names';
import { PatternPreview } from './range/pattern-preview';
import { RangeCanvas, type RangeHandle } from './range/range-canvas';
import type { RunEnd } from './range/renderer';
import { withRun } from './run-log';
import { useSession } from './session';

const replaySpeeds = [0.5, 1, 2];

/**
 * The practice range: the canvas where runs happen, the options floating over it, the pattern to
 * learn before a run and the result card after it. `live` mounts the canvas (not on phones, where the
 * range is hidden).
 */
export function RangePanel({ live }: { live: boolean }) {
  const { t } = useTranslation();
  const settings = useRangeSettings();
  const shown = useSession((s) => s.shown);
  const tooSmall = useSession((s) => s.tooSmall);
  const replaySpeed = useTrainerSettings((s) => s.replaySpeed);
  const section = useRef<HTMLElement>(null);
  const range = useRef<RangeHandle>(null);

  // A new weapon, magazine, fire mode or sensitivity clears the last run, as on the previous page
  const { loadout, scale } = settings;
  const loadoutKey = JSON.stringify([settings.weapon.name, loadout, scale]);
  useEffect(() => {
    useSession.setState({ shown: null });
    range.current?.clear();
  }, [loadoutKey]);

  // The range marks itself while a run goes on, so what covers it hides without a React render
  const onRunStart = () => section.current?.setAttribute('data-running', '');
  const onRunEnd = (end: RunEnd) => {
    section.current?.removeAttribute('data-running');
    if (end.result.counted) {
      const { stats, runs, set } = useTrainerSettings.getState();
      const { trial, hint, moving } = end.settings;
      set('stats', withResult(stats, end.result.points, trial));
      set(
        'runs',
        withRun(runs, {
          t: end.result.finishedAt,
          weapon: trial.weapon,
          mag: trial.mag,
          size: end.mag,
          practice: practiceOf(hint, moving),
          fire: end.mode,
          score: end.result.points,
        }),
      );
    }
    useSession.setState({ shown: end, last: end });
  };

  return (
    <section
      ref={section}
      aria-label={t('range.label')}
      className="group/range relative flex min-h-150 flex-1 overflow-hidden rounded-panel border border-outline bg-inset bg-[radial-gradient(var(--color-range-dot)_1px,transparent_1px)] bg-size-[24px_24px]"
    >
      {live && (
        <RangeCanvas
          ref={range}
          settings={settings}
          onRunStart={onRunStart}
          onRunEnd={onRunEnd}
          onCycleTrace={actions.cycleTrace}
          onAreaChange={(small) => useSession.setState({ tooSmall: small })}
        />
      )}
      {!shown && <ReadyState />}
      <PracticeOptions />
      {shown ? (
        <>
          <Legend />
          <RunCard
            end={shown}
            onReplay={() => range.current?.replay(replaySpeeds.includes(replaySpeed) ? replaySpeed : 1)}
            onNext={() => {
              useSession.setState({ shown: null });
              range.current?.clear();
            }}
          />
        </>
      ) : (
        <MouseSettings />
      )}
      <MuteButton />
      {tooSmall && (
        <p
          role="status"
          className="absolute inset-x-0 bottom-17 mx-auto my-0 w-fit max-w-[80%] rounded-card border border-warning/40 bg-panel px-3 py-2 text-center text-xs text-warning group-data-running/range:hidden"
        >
          {t('range.tooSmall')}
        </p>
      )}
    </section>
  );
}

// Before a run: the weapon's pattern, faint, and the instruction under it
function ReadyState() {
  const { t } = useTranslation();
  const names = useNames();
  const loadout = useLoadout();
  const s = useRangeSettings();
  const practice = practiceOf(s.hint, s.moving);
  const instruction =
    loadout.mode === 'single'
      ? t('range.instructionSingle')
      : loadout.mode === 'burst'
        ? t('range.instructionBurst')
        : t('range.instruction');
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4.5 px-4 pt-18 pb-16 group-data-running/range:invisible">
      <PatternPreview
        weapon={loadout.weapon}
        count={loadout.capacity}
        mode={loadout.mode}
        sens={s.loadout.sens}
        invertY={s.loadout.invertY}
        scale={s.scale}
        label={t('range.pattern', { weapon: names.weapon(loadout.entry.id) })}
        className="h-auto max-h-[calc(100%-6rem)] w-auto max-w-full"
      />
      <div className="text-center">
        <p className="m-0 type-lead">{instruction}</p>
        <p className="m-0 mt-1.5 text-13 text-text-secondary">
          {{ path: t('range.hintPath'), still: t('range.hint'), moving: t('range.hintMoving') }[practice]}
        </p>
      </div>
    </div>
  );
}

// The options floating at the top: mode, result style and replay speed
function PracticeOptions() {
  const { t } = useTranslation();
  const s = useTrainerSettings(
    useShallow((state) => ({
      hint: state.hint,
      moving: state.movingTarget,
      trace: state.traceMode,
      replay: state.replaySpeed,
    })),
  );
  const replayLabel = useId();
  const trace = ((s.trace % 3) + 3) % 3;
  const replay = replaySpeeds.includes(s.replay) ? s.replay : 1;
  return (
    <div
      role="group"
      aria-label={t('range.options')}
      className="absolute inset-x-3.5 top-3.5 flex flex-wrap justify-center gap-2"
    >
      <ToggleGroup
        type="single"
        variant="floating"
        aria-label={t('range.mode')}
        value={practiceOf(s.hint, s.moving)}
        onValueChange={(v) => v && actions.setPractice(v as Practice)}
      >
        <ToggleGroupItem value="path">{t('range.followPath')}</ToggleGroupItem>
        <ToggleGroupItem value="still">{t('range.stillTarget')}</ToggleGroupItem>
        <ToggleGroupItem value="moving">{t('range.movingTarget')}</ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup
        type="single"
        variant="floating"
        aria-label={t('range.showAs')}
        value={String(trace)}
        onValueChange={(v) => v && actions.setTrace(Number(v))}
      >
        <ToggleGroupItem value="0">{t('range.target')}</ToggleGroupItem>
        <ToggleGroupItem value="1">{t('range.dots')}</ToggleGroupItem>
        <ToggleGroupItem value="2">{t('range.lines')}</ToggleGroupItem>
      </ToggleGroup>
      <div className="flex h-control items-center gap-2 rounded-card border border-divider bg-panel px-2.5 text-xs text-text-secondary">
        <span id={replayLabel}>{t('range.replay')}</span>
        <Select
          value={String(replay)}
          onValueChange={(v) => useTrainerSettings.getState().set('replaySpeed', Number(v))}
        >
          <SelectTrigger
            aria-labelledby={replayLabel}
            className="h-segment-sm gap-1 border-0 bg-transparent px-0 font-semibold"
          >
            <SelectValue>{t('range.speed', { speed: replay })}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {replaySpeeds.map((speed) => (
              <SelectItem key={speed} value={String(speed)}>
                {t('range.speed', { speed })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// A setting's number as the chip shows it: one decimal at least, in the page's language
const decimal = (value: number, digits: number, locale: string) =>
  value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: digits, useGrouping: false });

// The mouse settings in one chip in the bottom left; it opens them in a popover
function MouseSettings() {
  const { t, i18n } = useTranslation();
  const s = useTrainerSettings(useShallow((state) => ({ sens: state.sens, ads: state.ads, invertY: state.invertY })));
  const set = useTrainerSettings.getState().set;
  const locale = i18n.language;
  return (
    <div className="absolute bottom-3.5 left-3.5">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-control gap-2.5 rounded-card px-3 text-xs font-normal">
            <MouseIcon className="size-4" aria-hidden="true" />
            <span>
              {t('range.sensitivity')}{' '}
              <strong className="font-mono font-semibold text-text">{decimal(s.sens, 3, locale)}</strong>
            </span>
            <span>
              {t('range.ads')}{' '}
              <strong className="font-mono font-semibold text-text">{decimal(s.ads, 2, locale)}×</strong>
            </span>
            <span>
              {t('range.invertY')}{' '}
              <strong className="font-semibold text-text">{s.invertY ? t('range.on') : t('range.off')}</strong>
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent aria-label={t('range.mouse')} align="start" className="flex w-64 flex-col gap-3">
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
          <SwitchField label={t('settingsDialog.invertY')} checked={s.invertY} onChange={(on) => set('invertY', on)} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function MuteButton() {
  const { t } = useTranslation();
  const mute = useTrainerSettings((s) => s.mute);
  const Icon = mute ? VolumeXIcon : Volume2Icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('range.mute')}
          aria-pressed={mute}
          onClick={() => useTrainerSettings.getState().set('mute', !mute)}
          className="absolute right-3.5 bottom-3.5 rounded-card"
        >
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('range.mute')}</TooltipContent>
    </Tooltip>
  );
}

// After a run: what the drawing shows
function Legend() {
  const { t } = useTranslation();
  return (
    <div className="absolute bottom-3.5 left-3.5 flex gap-4 rounded-card border border-divider bg-panel px-3 py-2.5 text-xs text-text-secondary group-data-running/range:invisible">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-0.5 w-2.5 bg-pattern-ink/50" />
        {t('range.legendPattern')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2 rounded-full bg-volt" />
        {t('range.legendShots')}
      </span>
    </div>
  );
}

// The result card in the top right: the score, how it compares with today's median, the setup, and
// Replay and Next run
function RunCard({ end, onReplay, onNext }: { end: RunEnd; onReplay: () => void; onNext: () => void }) {
  const { t } = useTranslation();
  const names = useNames();
  const stats = useTrainerSettings((s) => s.stats);
  const { result, settings } = end;
  const summary = summarize(readHistory(stats), settings.trial);
  const tiers = magazineTiers(settings.weapon.mags.length);
  const tier = tiers[Math.min(settings.trial.mag, tiers.length - 1)];
  const magazine = t('result.magazine', { tier: names.tierLong(tier, tiers.length), count: end.mag });
  const practice = names.practice(practiceOf(settings.hint, settings.moving));
  let delta: React.ReactNode;
  let below = false;
  if (!result.counted) {
    delta = <p className="m-0 text-13 text-text-secondary">{t('result.notSaved')}</p>;
  } else if (summary.today.length <= 1 || summary.median === undefined) {
    delta = <p className="m-0 text-13 text-text-secondary">{t('result.first')}</p>;
  } else if (result.points === summary.median) {
    delta = <p className="m-0 text-13 text-text-secondary">{t('result.level')}</p>;
  } else {
    const difference = result.points - summary.median;
    below = difference < 0;
    delta = <ScoreDelta delta={difference}>{difference > 0 ? t('result.above') : t('result.below')}</ScoreDelta>;
  }
  return (
    <RunResult
      title={t('result.title')}
      score={result.points}
      below={below}
      delta={delta}
      meta={t('result.meta', { weapon: names.weapon(settings.trial.weapon), magazine, mode: practice })}
      replayLabel={t('result.replay')}
      nextLabel={t('result.next')}
      onReplay={onReplay}
      onNext={onNext}
      className="absolute top-19 right-5 group-data-running/range:hidden"
    />
  );
}
