import { lazy, Suspense, useId, useState } from 'react';
import type { i18n } from 'i18next';
import { I18nextProvider, Trans, useTranslation } from 'react-i18next';
import { DownloadIcon } from 'lucide-react';
import { CrosshairPlaceholder } from '@/components/icons';
import { SummaryTile } from '@/components/stat-tile';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TooltipProvider } from '@/components/ui/tooltip';
import { dateToNumber } from '@/engine/stats';
import type { Locale } from '@/lib/i18n';
import { site } from '@/lib/site';
import { useTrainerSettings } from '@/lib/storage/trainer';
import { findWeapon, magazineTiers } from '../catalog';
import { ConsentPrompt, useAnalyticsStart } from '../consent';
import { readHistory, today } from '../history';
import { useMediaQuery, useStoredSettings } from '../hooks';
import { LegalFooter } from '../legal-footer';
import { trainerHref } from '../links';
import { practiceOf } from '../loadout';
import { useNames } from '../names';
import { readRuns, type LoggedRun } from '../run-log';
import { TopBar } from '../top-bar';
import {
  addDays,
  byWeapon,
  chartPoints,
  dayToDate,
  perDay,
  select,
  setupDays,
  summarize,
  toCsv,
  type Period,
  type SetupDay,
} from './progress-data';

// Recharts loads with the chart, after the rest of the page
const ScoreChart = lazy(() => import('./score-chart'));

/** The Progress page (the redesign's Progress artboard): the score history in this browser */
export function ProgressApp({ i18n, locale }: { i18n: i18n; locale: Locale }) {
  return (
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <ProgressPage locale={locale} />
      </TooltipProvider>
    </I18nextProvider>
  );
}

const isoDate = (day: number) => String(day).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

function ProgressPage({ locale }: { locale: Locale }) {
  const { t, i18n } = useTranslation();
  const names = useNames();
  const wide = useMediaQuery('(min-width: 48rem)');
  useStoredSettings();
  useAnalyticsStart();
  // The history loads after hydration: until then the page shows neither figures nor the empty state
  const loaded = useTrainerSettings((s) => s.loaded);
  const raw = useTrainerSettings((s) => s.stats);
  const rawRuns = useTrainerSettings((s) => s.runs);
  const [weapon, setWeapon] = useState('all');
  const [period, setPeriod] = useState<Period>(30);
  const ids = { weapon: useId(), chart: useId(), weapons: useId(), recent: useId() };

  const day = today();
  const all = setupDays(readHistory(raw), day);
  const practiced = byWeapon(all).map((w) => w.weapon);
  const days = select(all, weapon, period, day);
  const summary = summarize(days);
  const perWeapon = byWeapon(days);
  const from = period === 'all' ? 0 : addDays(day, -(period - 1));
  const runs = readRuns(rawRuns)
    .filter((r) => (weapon === 'all' || r.weapon === weapon) && dateToNumber(new Date(r.t)) >= from)
    .reverse()
    .slice(0, 10);
  const dayFormat = new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' });
  const formatDay = (d: number) => dayFormat.format(dayToDate(d));

  const csvRow = (d: SetupDay) => {
    const tiers = magazineTiers(findWeapon(d.setup.weapon).spec.mags.length);
    return [
      isoDate(d.day),
      names.weapon(d.setup.weapon),
      names.tierLong(tiers[Math.min(d.setup.mag, tiers.length - 1)], tiers.length),
      names.practice(practiceOf(d.setup.hint, d.setup.moving)),
      d.tries,
      Math.round(d.median),
      d.best,
    ];
  };

  const exportCsv = () => {
    const header = ['csvDate', 'csvWeapon', 'csvMagazine', 'csvMode', 'csvTries', 'csvMedian', 'csvBest'] as const;
    const csv = toCsv([header.map((key) => t(`progress.${key}`)), ...days.map((d) => csvRow(d))]);
    // The byte order mark lets spreadsheets read the names in Russian and Chinese
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${site.name.toLowerCase()}-progress-${isoDate(day)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar locale={locale} page="progress" />
      <main className="mx-auto flex w-full max-w-340 flex-1 flex-col gap-5 px-5 pt-6 pb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="m-0 type-page-title">{t('progress.title')}</h1>
            <p className="m-0 mt-1.5 text-text-secondary">{t('progress.stored')}</p>
          </div>
          {all.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-control items-center gap-2 rounded-card border border-divider bg-panel px-2.5 text-13 text-text-secondary">
                <span id={ids.weapon}>{t('progress.weapon')}</span>
                <Select value={weapon} onValueChange={setWeapon}>
                  <SelectTrigger
                    aria-labelledby={ids.weapon}
                    className="h-segment-sm gap-1 border-0 bg-transparent px-0 font-semibold text-text"
                  >
                    <SelectValue>{weapon === 'all' ? t('progress.allWeapons') : names.weapon(weapon)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('progress.allWeapons')}</SelectItem>
                    {practiced.map((w) => (
                      <SelectItem key={w} value={w}>
                        {names.weapon(w)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ToggleGroup
                type="single"
                variant="floating"
                aria-label={t('progress.period')}
                value={String(period)}
                onValueChange={(v) => v && setPeriod(v === 'all' ? 'all' : v === '7' ? 7 : 30)}
              >
                <ToggleGroupItem value="7">{t('progress.days7')}</ToggleGroupItem>
                <ToggleGroupItem value="30">{t('progress.days30')}</ToggleGroupItem>
                <ToggleGroupItem value="all">{t('progress.allTime')}</ToggleGroupItem>
              </ToggleGroup>
              <Button variant="secondary" onClick={exportCsv} disabled={days.length === 0}>
                <DownloadIcon className="size-4" aria-hidden="true" />
                {t('progress.export')}
              </Button>
            </div>
          )}
        </div>

        {!loaded ? null : all.length === 0 ? (
          <Card variant="card" className="max-w-160 items-start gap-3 p-6">
            <h2 className="m-0 type-heading">{t('progress.emptyTitle')}</h2>
            <p className="m-0 text-sm leading-normal text-text-secondary">{t('progress.emptyText')}</p>
            <Button asChild>
              <a href={trainerHref(locale)}>{t('progress.train')}</a>
            </Button>
          </Card>
        ) : (
          <>
            <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
              <SummaryTile
                label={t('progress.runs')}
                value={summary.runs}
                note={
                  period === 7
                    ? t('progress.runsNote7')
                    : period === 30
                      ? t('progress.runsNote30')
                      : t('progress.runsNoteAll')
                }
              />
              <SummaryTile
                label={t('progress.best')}
                value={summary.best?.score}
                note={
                  summary.best && (weapon === 'all' ? names.weapon(summary.best.weapon) : formatDay(summary.best.day))
                }
              />
              <SummaryTile
                label={t('progress.median')}
                value={summary.median}
                note={summary.trend === undefined ? undefined : t('progress.trend', { delta: signed(summary.trend) })}
              />
              <SummaryTile
                label={t('progress.days')}
                value={summary.daysPracticed}
                note={
                  period !== 'all'
                    ? t('progress.daysOf', { count: period })
                    : summary.firstDay
                      ? t('progress.daysSince', { date: formatDay(summary.firstDay) })
                      : undefined
                }
              />
            </dl>

            <div className="flex flex-wrap gap-4">
              <section
                aria-labelledby={ids.chart}
                className="min-w-0 flex-[999_1_640px] rounded-panel border border-outline bg-panel p-4.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id={ids.chart} className="m-0 type-heading">
                    {t('progress.chart')}
                  </h2>
                  <ChartLegend />
                </div>
                {days.length > 0 ? (
                  <Suspense fallback={<div className="mt-3.5 h-60" />}>
                    <ScoreChart
                      points={chartPoints(perDay(days), period, day)}
                      label={t('progress.chartLabel', {
                        best: summary.best?.score,
                        median: summary.median,
                        days: summary.daysPracticed,
                      })}
                      names={{
                        best: t('progress.chartBest'),
                        median: t('progress.chartMedian'),
                        tries: t('progress.chartTries'),
                      }}
                      formatDay={formatDay}
                    />
                  </Suspense>
                ) : (
                  <Card variant="well" className="mt-3.5 h-60">
                    {t('progress.noDays')}
                  </Card>
                )}
              </section>
              <section
                aria-labelledby={ids.weapons}
                className="flex flex-[1_1_300px] flex-col gap-3 rounded-panel border border-outline bg-panel p-4.5"
              >
                <h2 id={ids.weapons} className="m-0 type-heading">
                  {t('progress.byWeapon')}
                </h2>
                {perWeapon.length > 0 ? (
                  <ul className="m-0 flex list-none flex-col gap-3 p-0">
                    {perWeapon.map((w) => (
                      <WeaponRow key={w.weapon} {...w} share={w.runs / perWeapon[0].runs} />
                    ))}
                  </ul>
                ) : (
                  <Card variant="well">{t('progress.noDays')}</Card>
                )}
              </section>
            </div>

            <section aria-labelledby={ids.recent} className="rounded-panel border border-outline bg-panel p-4.5">
              <h2 id={ids.recent} className="m-0 mb-3 type-heading">
                {t('progress.recent')}
              </h2>
              {runs.length > 0 ? (
                <RecentRuns runs={runs} day={day} formatDay={formatDay} />
              ) : (
                <Card variant="well">{t('progress.recentEmpty')}</Card>
              )}
            </section>
          </>
        )}
        <LegalFooter className="mt-auto" />
      </main>
      <ConsentPrompt sheet={!wide} />
    </div>
  );
}

function ChartLegend() {
  const { t } = useTranslation();
  return (
    <div className="flex gap-3.5 text-xs text-text-secondary">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-0.75 w-3.5 rounded-[2px] bg-volt" />
        {t('progress.chartBest')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="h-0.75 w-3.5 rounded-[2px] bg-text-secondary" />
        {t('progress.chartMedian')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2.5 rounded-[2px] bg-chart-bar" />
        {t('progress.chartTries')}
      </span>
    </div>
  );
}

// A weapon's runs, best and median, with a bar for its share of the practice
function WeaponRow({
  weapon,
  runs,
  best,
  median,
  share,
}: {
  weapon: string;
  runs: number;
  best: number;
  median: number;
  share: number;
}) {
  const { t } = useTranslation();
  const names = useNames();
  const art = findWeapon(weapon).art;
  return (
    <li className="flex items-center gap-3">
      {art ? (
        <img src={art} alt="" className="h-7 w-16 shrink-0 object-contain" />
      ) : (
        <CrosshairPlaceholder className="w-16 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2 text-13">
          <span className="font-semibold">{names.weapon(weapon)}</span>
          <span className="text-text-secondary">{t('progress.weaponRuns', { count: runs })}</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-[3px] bg-hover">
          <div className="h-1.5 rounded-[3px] bg-volt" style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
        <div className="mt-1 text-11 text-text-muted">
          <Trans
            i18nKey="progress.weaponStats"
            values={{ best, median }}
            components={{ strong: <strong className="text-text" /> }}
          />
        </div>
      </div>
    </li>
  );
}

// The last runs saved with their times (from the run log); scores from 85 up in volt
function RecentRuns({ runs, day, formatDay }: { runs: LoggedRun[]; day: number; formatDay: (d: number) => string }) {
  const { t, i18n } = useTranslation();
  const names = useNames();
  const timeFormat = new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' });
  const when = (time: number) => {
    const date = new Date(time);
    const d = dateToNumber(date);
    const clock = timeFormat.format(date);
    if (d === day) return t('progress.today', { time: clock });
    if (d === addDays(day, -1)) return t('progress.yesterday', { time: clock });
    return `${formatDay(d)}, ${clock}`;
  };
  return (
    <Table aria-label={t('progress.recent')}>
      <TableHeader>
        <TableRow>
          <TableHead>{t('progress.when')}</TableHead>
          <TableHead>{t('progress.weapon')}</TableHead>
          <TableHead>{t('progress.magazine')}</TableHead>
          <TableHead>{t('progress.mode')}</TableHead>
          <TableHead className="text-right">{t('progress.score')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => {
          const tiers = magazineTiers(findWeapon(run.weapon).spec.mags.length);
          const tier = tiers[Math.min(run.mag, tiers.length - 1)];
          return (
            <TableRow key={run.t}>
              <TableCell>{when(run.t)}</TableCell>
              <TableCell className="font-semibold text-text">{names.weapon(run.weapon)}</TableCell>
              <TableCell>{`${names.tier(tier, tiers.length)} · ${run.size}`}</TableCell>
              <TableCell>{names.practice(run.practice)}</TableCell>
              <TableCell
                className={
                  run.score >= 85 ? 'text-right type-score-cell text-volt' : 'text-right type-score-cell text-text'
                }
              >
                {run.score}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
