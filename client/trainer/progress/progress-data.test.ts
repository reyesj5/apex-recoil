import { describe, expect, it } from 'vitest';
import type { TrialStats } from '@/engine/stats';
import { readRuns, runLogSize, withRun, type LoggedRun } from '../run-log';
import {
  addDays,
  byWeapon,
  chartPoints,
  dayToDate,
  mergedMedian,
  perDay,
  select,
  setupDays,
  summarize,
  toCsv,
} from './progress-data';

const today = 20261023;
const r301 = { weapon: 'r301', mag: 2, hint: true, moving: false };
const r99 = { weapon: 'r99', mag: 0, hint: false, moving: true };
// Two setups as the history stores them: earlier days as [day, tries, median, best], today's scores
const stats: TrialStats[] = [
  {
    v: 3,
    setup: r301,
    bestAllTime: 93,
    today,
    todayResults: [80, 91, 85],
    dayResults: [
      [20260920, 4, 70, 78],
      [20261001, 6, 76, 88],
      [20261022, 5, 82, 93],
    ],
  },
  { v: 3, setup: r99, bestAllTime: 90, today, todayResults: [], dayResults: [[20261022, 3, 72, 90]] },
];

describe('progress figures', () => {
  it('counts days on the calendar', () => {
    expect(addDays(20261023, 10)).toBe(20261102);
    expect(addDays(20260301, -1)).toBe(20260228);
    expect(dayToDate(20261023).getDate()).toBe(23);
  });

  it('reads every setup’s days, today’s from its scores', () => {
    expect(setupDays(stats, today).map((d) => [d.day, d.setup.weapon, d.tries, d.median, d.best])).toEqual([
      [20260920, 'r301', 4, 70, 78],
      [20261001, 'r301', 6, 76, 88],
      [20261022, 'r301', 5, 82, 93],
      [20261022, 'r99', 3, 72, 90],
      [20261023, 'r301', 3, 85, 91],
    ]);
  });

  it('selects a weapon and a period ending today', () => {
    const days = setupDays(stats, today);
    expect(select(days, 'all', 7, today).map((d) => d.day)).toEqual([20261022, 20261022, 20261023]);
    expect(select(days, 'r99', 30, today).map((d) => d.day)).toEqual([20261022]);
    expect(select(days, 'r301', 'all', today)).toHaveLength(4);
  });

  it('weighs each setup’s median by its tries', () => {
    expect(mergedMedian([{ tries: 5, median: 82 }])).toBe(82);
    expect(
      mergedMedian([
        { tries: 5, median: 82 },
        { tries: 3, median: 72 },
      ]),
    ).toBe(82);
    expect(
      mergedMedian([
        { tries: 1, median: 60 },
        { tries: 3, median: 72 },
      ]),
    ).toBe(72);
    expect(mergedMedian([])).toBeUndefined();
  });

  it('sums up the days, the weapons and the trend', () => {
    const days = setupDays(stats, today);
    expect(perDay(days)).toEqual([
      { day: 20260920, tries: 4, median: 70, best: 78 },
      { day: 20261001, tries: 6, median: 76, best: 88 },
      { day: 20261022, tries: 8, median: 82, best: 93 },
      { day: 20261023, tries: 3, median: 85, best: 91 },
    ]);
    // The last week's medians (82, 85) against the first week's (70)
    expect(summarize(days)).toEqual({
      runs: 21,
      daysPracticed: 4,
      firstDay: 20260920,
      median: 76,
      best: { score: 93, weapon: 'r301', day: 20261022 },
      trend: 14,
    });
    expect(summarize(select(days, 'all', 7, today)).trend).toBeUndefined();
    expect(byWeapon(days)).toEqual([
      { weapon: 'r301', runs: 18, best: 93, median: 76 },
      { weapon: 'r99', runs: 3, best: 90, median: 72 },
    ]);
  });

  it('lays out the chart’s days, with gaps on days without practice', () => {
    const rows = perDay(setupDays(stats, today));
    const week = chartPoints(rows, 7, today);
    expect(week.map((p) => p.day)).toEqual([20261017, 20261018, 20261019, 20261020, 20261021, 20261022, 20261023]);
    expect(week[0]).toEqual({ day: 20261017, tries: 0 });
    expect(week[5]).toEqual({ day: 20261022, tries: 8, median: 82, best: 93 });
    expect(chartPoints(rows, 'all', today)).toBe(rows);
  });

  it('writes CSV with fields quoted when they need it', () => {
    expect(
      toCsv([
        ['Date', 'Weapon', 'Best'],
        ['2026-10-23', 'C.A.R., "fast"', 91],
      ]),
    ).toBe('Date,Weapon,Best\r\n2026-10-23,"C.A.R., ""fast""",91\r\n');
  });
});

describe('run log', () => {
  const run: LoggedRun = { t: 1, weapon: 'r99', mag: 0, size: 18, practice: 'path', fire: 'auto', score: 90 };

  it('ignores what it cannot read', () => {
    expect(readRuns('not json')).toEqual([]);
    expect(readRuns('{}')).toEqual([]);
    expect(readRuns(`[{"t":"x"},${JSON.stringify(run)}]`)).toEqual([run]);
  });

  it('keeps the last runs, newest last', () => {
    let raw = '[]';
    for (let i = 0; i < runLogSize + 5; i++) raw = withRun(raw, { ...run, t: i });
    const runs = readRuns(raw);
    expect(runs).toHaveLength(runLogSize);
    expect([runs[0].t, runs.at(-1)?.t]).toEqual([5, runLogSize + 4]);
  });
});
