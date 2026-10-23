import { cn } from 'cn';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The last score in the session panel; before the first run it shows an en dash and a hint. */
function ScoreCard({
  className,
  label,
  score,
  hint,
  ...props
}: React.ComponentProps<'div'> & { label: string; score?: number | null; hint?: string }) {
  return (
    <div
      data-slot="score-card"
      className={cn('rounded-card-lg border border-outline-card bg-card p-4', className)}
      {...props}
    >
      <div className="text-xs text-text-secondary">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="type-score-lg">{score ?? '–'}</span>
        <span className="text-sm text-text-muted">/ 100</span>
      </div>
      {hint && <p className="m-0 mt-2 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

/**
 * How a run compares with today's median: a pill with an arrow and the difference, then the words.
 * Only the positive case is designed; a run below the median uses the neutral colors for now.
 */
function ScoreDelta({
  className,
  delta,
  children,
  ...props
}: React.ComponentProps<'div'> & { delta: number; children: React.ReactNode }) {
  const up = delta >= 0;
  const Arrow = up ? ArrowUpIcon : ArrowDownIcon;
  return (
    <div
      data-slot="score-delta"
      className={cn('flex items-center gap-2 text-[13px] text-text-secondary', className)}
      {...props}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 font-semibold',
          up ? 'bg-volt-wash text-volt' : 'bg-hover text-text-secondary',
        )}
      >
        <Arrow aria-hidden="true" className="size-3" strokeWidth={2.5} />
        {Math.abs(delta)}
      </span>
      {children}
    </div>
  );
}

/**
 * The result card that floats over the range when a run ends: the score in volt, the delta, the
 * setup, and Replay and Next run. It announces itself.
 */
function RunResult({
  className,
  title,
  score,
  delta,
  meta,
  replayLabel,
  nextLabel,
  onReplay,
  onNext,
  ...props
}: Omit<React.ComponentProps<'div'>, 'title'> & {
  title: string;
  score: number;
  /** The pill and its words, from ScoreDelta */
  delta?: React.ReactNode;
  /** The setup: weapon, magazine and mode */
  meta: string;
  replayLabel: string;
  nextLabel: string;
  onReplay?: () => void;
  onNext?: () => void;
}) {
  return (
    <div
      role="status"
      data-slot="run-result"
      className={cn(
        'flex w-70 flex-col gap-3 rounded-panel border border-divider bg-panel-glass p-4.5 shadow-float',
        className,
      )}
      {...props}
    >
      <div className="type-section-label text-text-muted">{title}</div>
      <div className="flex items-baseline gap-2">
        <span className="type-score-xl text-volt">{score}</span>
        <span className="text-base text-text-muted">/ 100</span>
      </div>
      {delta}
      <div className="text-xs text-text-muted">{meta}</div>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onReplay}>
          {replayLabel}
        </Button>
        <Button className="flex-1" onClick={onNext}>
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}

export { ScoreCard, ScoreDelta, RunResult };
