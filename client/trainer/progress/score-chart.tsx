import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { ChartPoint } from './progress-data';

/**
 * The score per day: the best in volt, the median in text-secondary, the tries as bars along the
 * bottom (chart-bar stands only 1.4:1 off the panel, so the tooltip and the summary give them too).
 * Recharts loads with this component, after the rest of the page.
 */
export default function ScoreChart({
  points,
  label,
  names,
  formatDay,
}: {
  points: ChartPoint[];
  /** The text alternative, stating the trend */
  label: string;
  names: { best: string; median: string; tries: string };
  formatDay: (day: number) => string;
}) {
  const config = {
    best: { label: names.best, color: 'var(--color-volt)' },
    median: { label: names.median, color: 'var(--color-text-secondary)' },
    tries: { label: names.tries, color: 'var(--color-chart-bar)' },
  } satisfies ChartConfig;
  const scores = points.flatMap((p) => [p.best, p.median].filter((v): v is number => v !== undefined));
  // Gridlines every 10 points, from just below the lowest score to 100
  const low = Math.max(0, Math.floor((Math.min(90, ...scores) - 5) / 10) * 10);
  const ticks = Array.from({ length: (100 - low) / 10 + 1 }, (_, i) => low + i * 10);
  const maxTries = Math.max(1, ...points.map((p) => p.tries));
  // With one or two days of practice the lines need their points to show
  const dot = scores.length < 6 ? { r: 3, strokeWidth: 0 } : false;
  const data = points.map((p) => ({ ...p, label: formatDay(p.day) }));

  return (
    <ChartContainer config={config} className="mt-3.5 aspect-auto h-60 w-full" role="img" aria-label={label}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} yAxisId="score" stroke="var(--color-hover)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          minTickGap={24}
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
        />
        <YAxis
          yAxisId="score"
          domain={[low, 100]}
          ticks={ticks}
          tickLine={false}
          axisLine={false}
          tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
        />
        <YAxis yAxisId="tries" hide domain={[0, maxTries * 4]} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar yAxisId="tries" dataKey="tries" fill="var(--color-tries)" barSize={14} isAnimationActive={false} />
        <Line
          yAxisId="score"
          dataKey="median"
          stroke="var(--color-median)"
          strokeWidth={2}
          dot={dot && { ...dot, fill: 'var(--color-median)' }}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          yAxisId="score"
          dataKey="best"
          stroke="var(--color-best)"
          strokeWidth={2.5}
          dot={dot && { ...dot, fill: 'var(--color-best)' }}
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
