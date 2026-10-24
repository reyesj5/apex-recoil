import { dateToNumber, percentile, type TrialSetup, type TrialStats } from '@/engine/stats';

// The Progress page's figures, from the score history (game::stats). The history keeps, per setup
// (weapon, magazine, mode), today's scores and a median and best for each earlier day. A day that mixes
// setups has no exact median, so its median is the setups' medians weighted by their tries.

/** One setup's results on one day */
export interface SetupDay {
  /** 2026-10-23 is 20261023, as the history stores days */
  day: number;
  setup: TrialSetup;
  tries: number;
  median: number;
  best: number;
}

/** A day of practice, all setups shown together */
export interface DayRow {
  day: number;
  tries: number;
  median: number;
  best: number;
}

export type Period = 7 | 30 | 'all';

export function dayToDate(day: number): Date {
  return new Date(Math.floor(day / 10000), (Math.floor(day / 100) % 100) - 1, day % 100);
}

export function addDays(day: number, n: number): number {
  const date = dayToDate(day);
  date.setDate(date.getDate() + n);
  return dateToNumber(date);
}

/** Every setup's days, today's from its scores, oldest first */
export function setupDays(stats: TrialStats[], today: number): SetupDay[] {
  const days: SetupDay[] = [];
  for (const s of stats) {
    for (const [day, tries, median, best] of s.dayResults) days.push({ day, setup: s.setup, tries, median, best });
    if (s.today === today && s.todayResults.length > 0) {
      days.push({
        day: today,
        setup: s.setup,
        tries: s.todayResults.length,
        median: percentile(s.todayResults, 0.5),
        best: percentile(s.todayResults, 1),
      });
    }
  }
  return days.sort((a, b) => a.day - b.day);
}

/** The days of one weapon ('all' for every weapon) within a period ending today */
export function select(days: SetupDay[], weapon: string, period: Period, today: number): SetupDay[] {
  const from = period === 'all' ? 0 : addDays(today, -(period - 1));
  return days.filter((d) => (weapon === 'all' || d.setup.weapon === weapon) && d.day >= from && d.day <= today);
}

/**
 * The median of groups' medians, each weighing as many tries as it has (one for the oldest history,
 * which kept no count): exact for one group, an estimate for several.
 */
export function mergedMedian(groups: { tries: number; median: number }[]): number | undefined {
  const weighted = groups
    .filter((g) => Number.isFinite(g.median))
    .map((g) => ({ median: g.median, weight: g.tries > 0 ? g.tries : 1 }))
    .sort((a, b) => a.median - b.median);
  const total = weighted.reduce((sum, g) => sum + g.weight, 0);
  let seen = 0;
  for (const g of weighted) {
    seen += g.weight;
    if (seen * 2 >= total) return g.median;
  }
  return undefined;
}

/** The days with practice, setups together, oldest first */
export function perDay(days: SetupDay[]): DayRow[] {
  const groups = new Map<number, SetupDay[]>();
  for (const d of days) groups.set(d.day, [...(groups.get(d.day) ?? []), d]);
  return [...groups]
    .sort(([a], [b]) => a - b)
    .map(([day, group]) => ({
      day,
      tries: group.reduce((sum, d) => sum + d.tries, 0),
      median: Math.round(mergedMedian(group) ?? 0),
      best: Math.max(...group.map((d) => d.best)),
    }));
}

export interface ChartPoint {
  day: number;
  tries: number;
  median?: number;
  best?: number;
}

/**
 * The chart's days: every day of a 7 or 30 day period (empty days leave a gap), or the days with
 * practice for all time
 */
export function chartPoints(rows: DayRow[], period: Period, today: number): ChartPoint[] {
  if (period === 'all') return rows;
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return Array.from({ length: period }, (_, i) => {
    const day = addDays(today, i - (period - 1));
    return byDay.get(day) ?? { day, tries: 0 };
  });
}

export interface Summary {
  runs: number;
  best?: { score: number; weapon: string; day: number };
  median?: number;
  /** The last week's median against the first week's, when the days span two weeks or more */
  trend?: number;
  daysPracticed: number;
  firstDay?: number;
}

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

export function summarize(days: SetupDay[]): Summary {
  const rows = perDay(days);
  const summary: Summary = {
    runs: days.reduce((sum, d) => sum + d.tries, 0),
    daysPracticed: rows.length,
    firstDay: rows[0]?.day,
    median: days.length ? Math.round(mergedMedian(days) ?? 0) : undefined,
  };
  for (const d of days) {
    if (!summary.best || d.best > summary.best.score)
      summary.best = { score: d.best, weapon: d.setup.weapon, day: d.day };
  }
  if (rows.length >= 2) {
    const first = rows[0].day;
    const last = rows[rows.length - 1].day;
    if (last >= addDays(first, 13)) {
      const firstWeek = rows.filter((r) => r.day <= addDays(first, 6)).map((r) => r.median);
      const lastWeek = rows.filter((r) => r.day >= addDays(last, -6)).map((r) => r.median);
      summary.trend = Math.round(mean(lastWeek) - mean(firstWeek));
    }
  }
  return summary;
}

export interface WeaponProgress {
  weapon: string;
  runs: number;
  best: number;
  median: number;
}

/** Each weapon's runs, best and median, the most practiced first */
export function byWeapon(days: SetupDay[]): WeaponProgress[] {
  const groups = new Map<string, SetupDay[]>();
  for (const d of days) groups.set(d.setup.weapon, [...(groups.get(d.setup.weapon) ?? []), d]);
  return [...groups]
    .map(([weapon, group]) => ({
      weapon,
      runs: group.reduce((sum, d) => sum + d.tries, 0),
      best: Math.max(...group.map((d) => d.best)),
      median: Math.round(mergedMedian(group) ?? 0),
    }))
    .sort((a, b) => b.runs - a.runs || b.best - a.best);
}

/** Rows as CSV (RFC 4180): fields quoted when they need it, CRLF between lines */
export function toCsv(rows: (string | number)[][]): string {
  const field = (value: string | number) => {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return rows.map((row) => row.map(field).join(',')).join('\r\n') + '\r\n';
}
