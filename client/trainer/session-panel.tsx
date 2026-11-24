import { useTranslation, Trans } from 'react-i18next';
import { cn } from 'cn';
import { ChartLineIcon } from 'lucide-react';
import { ScoreCard } from '@/components/score-card';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Locale } from '@/lib/i18n';
import { useTrainerSettings } from '@/lib/storage/trainer';
import { readHistory, sameSetup, summarize } from './history';
import { LegalFooter, TextLink } from './legal-footer';
import { progressHref } from './links';
import { useRangeSettings } from './loadout';
import { openDialog, useSession } from './session';

/** The session panel: today's numbers for the current setup, their trend, tips and the legal footer */
export function SessionPanel({ locale, className }: { locale: Locale; className?: string }) {
  const { t } = useTranslation();
  const { trial } = useRangeSettings();
  const stats = useTrainerSettings((s) => s.stats);
  const last = useSession((s) => s.last);
  const summary = summarize(readHistory(stats), trial);
  // The last run of this visit, or else today's last saved score, for this setup
  const lastScore = last && sameSetup(last.settings.trial, trial) ? last.result.points : summary.today.at(-1);

  return (
    <aside
      aria-label={t('session.title')}
      className={cn('flex flex-col gap-3.5 rounded-panel border border-outline bg-panel p-4', className)}
    >
      <div className="flex items-center justify-between">
        <h2 className="m-0 type-section-label text-text-muted">{t('session.title')}</h2>
        <span className="text-xs text-text-muted">{t('session.today')}</span>
      </div>
      <ScoreCard
        label={t('session.lastScore')}
        score={lastScore}
        hint={lastScore === undefined || lastScore === null ? t('session.firstRun') : undefined}
      />
      <StatGrid>
        <StatTile label={t('session.tries')} value={summary.today.length} />
        <StatTile label={t('session.median')} value={summary.median} />
        <StatTile label={t('session.bestToday')} value={summary.bestToday} />
        <StatTile
          label={t('session.bestAllTime')}
          value={summary.bestAllTime}
          best={summary.bestAllTime !== undefined}
        />
      </StatGrid>
      {summary.today.length > 0 && summary.median !== undefined ? (
        <Trend scores={summary.today} median={summary.median} />
      ) : (
        <Card variant="well">{t('session.trendEmpty')}</Card>
      )}
      <Button variant="secondary" size="lg" asChild>
        <a href={progressHref(locale)}>
          <ChartLineIcon className="size-4" aria-hidden="true" />
          {t('session.progress')}
        </a>
      </Button>
      <Card variant="card" className="gap-2.5">
        <h3 className="m-0 type-label">{t('tips.title')}</h3>
        <p className="m-0 text-xs leading-normal text-text-secondary">
          <Trans
            i18nKey="tips.pointer"
            components={{ guide: <TextLink href={t('tips.pointerUrl')} tone="volt" external /> }}
          />
        </p>
        <p className="m-0 text-xs leading-normal text-text-secondary">
          <Trans
            i18nKey="tips.sensitivity"
            components={{ settings: <TextButton onClick={() => openDialog('settings')} /> }}
          />
        </p>
      </Card>
      <LegalFooter />
    </aside>
  );
}

// A button that reads as a link inside a sentence ("Set it")
function TextButton({ children, onClick }: { children?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer text-volt underline underline-offset-2 hover:text-volt-bright"
    >
      {children}
    </button>
  );
}

// Today's scores as a line, today's median dashed, the last run as a dot
function Trend({ scores, median }: { scores: number[]; median: number }) {
  const { t } = useTranslation();
  const width = 260;
  const height = 72;
  const low = Math.min(median, ...scores) - 4;
  const high = Math.max(median, ...scores) + 4;
  const y = (v: number) => height - 6 - ((v - low) / (high - low)) * (height - 12);
  const x = (i: number) => (scores.length === 1 ? width / 2 : 4 + (i * (width - 8)) / (scores.length - 1));
  const last = scores.length - 1;
  return (
    <figure className="m-0 rounded-card-lg border border-outline-card bg-card p-3.5">
      <figcaption className="flex justify-between text-xs text-text-secondary">
        <span>{t('session.trend')}</span>
        <span>{t('session.trendCount', { count: scores.length })}</span>
      </figcaption>
      <svg
        role="img"
        aria-label={t('session.trendLabel', { first: scores[0], last: scores[last], best: Math.max(...scores) })}
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2.5 h-auto w-full"
      >
        <line x1={0} x2={width} y1={y(median)} y2={y(median)} className="stroke-outline-strong" strokeDasharray="4 4" />
        <polyline
          points={scores.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          fill="none"
          className="stroke-volt"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={x(last)} cy={y(scores[last])} r={4} className="fill-volt" />
      </svg>
      <div className="mt-1.5 flex justify-between text-11 text-text-muted">
        <span>{t('session.trendFirst')}</span>
        <span>{t('session.trendMedian', { median })}</span>
      </div>
    </figure>
  );
}
