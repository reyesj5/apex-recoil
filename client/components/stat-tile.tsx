import { cn } from 'cn';

/** Stat tiles two across, as a description list. */
function StatGrid({ className, ...props }: React.ComponentProps<'dl'>) {
  return <dl data-slot="stat-grid" className={cn('m-0 grid grid-cols-2 gap-2', className)} {...props} />;
}

/** No value yet: a thin en dash in text-muted, since the display face's bold one reads as a bar */
function NoValue() {
  return <span className="font-sans font-normal text-text-muted">–</span>;
}

/**
 * One number with its label (today's tries, median, best). A best score takes volt. Before the first
 * run pass no value: the tile shows a thin, quiet en dash, never a zero.
 */
function StatTile({
  className,
  label,
  value,
  best = false,
  ...props
}: React.ComponentProps<'div'> & { label: string; value?: number | string | null; best?: boolean }) {
  return (
    <div
      data-slot="stat-tile"
      className={cn('rounded-card border border-outline-card bg-card p-3', className)}
      {...props}
    >
      <dt className="type-stat-label text-text-muted">{label}</dt>
      <dd className={cn('m-0 mt-1 type-stat-value', best && 'text-volt')}>{value ?? <NoValue />}</dd>
    </div>
  );
}

/**
 * A page total on the Progress page: label, value and a note after it ("253 last 30 days"). A total
 * that has no value shows the stat tile's thin dash.
 */
function SummaryTile({
  className,
  label,
  value,
  note,
  ...props
}: React.ComponentProps<'div'> & { label: string; value?: number | string | null; note?: string }) {
  return (
    <div
      data-slot="summary-tile"
      className={cn('rounded-card-lg border border-outline bg-panel p-4', className)}
      {...props}
    >
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="m-0 mt-1.5 flex items-baseline gap-2">
        <span className="type-summary-value">{value ?? <NoValue />}</span>
        {note && <span className="text-xs text-text-muted">{note}</span>}
      </dd>
    </div>
  );
}

export { StatGrid, StatTile, SummaryTile };
