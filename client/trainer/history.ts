import {
  addResult,
  dateToNumber,
  parseStats,
  percentile,
  statsForSetup,
  type TrialSetup,
  type TrialStats,
} from '@/engine/stats';

// The score history in game::stats, as the previous trainer kept it: per setup (weapon, magazine,
// mode), today's scores and a median and best for each earlier day. Only a full magazine at full
// speed is saved.

export function today() {
  return dateToNumber(new Date());
}

let cache: { raw: string; day: number; stats: TrialStats[] } | null = null;

/** The stored history, read once per change (and per day, as earlier days roll over) */
export function readHistory(raw: string): TrialStats[] {
  const day = today();
  if (cache?.raw !== raw || cache.day !== day) cache = { raw, day, stats: parseStats(raw, day) };
  return cache.stats;
}

/** The stored history with a run's score added, as the JSON to store */
export function withResult(raw: string, points: number, setup: TrialSetup): string {
  const day = today();
  const stats = parseStats(raw, day);
  addResult(stats, points, setup, day);
  return JSON.stringify(stats);
}

export interface SetupSummary {
  /** Today's scores, oldest first */
  today: number[];
  median?: number;
  bestToday?: number;
  bestAllTime?: number;
}

/** Today's numbers and the all-time best for one setup, as the session panel shows them */
export function summarize(stats: TrialStats[], setup: TrialSetup): SetupSummary {
  const s = statsForSetup(stats, setup);
  if (!s) return { today: [] };
  const results = s.todayResults;
  return {
    today: results,
    median: results.length ? Math.round(percentile(results, 0.5)) : undefined,
    bestToday: results.length ? percentile(results, 1) : undefined,
    bestAllTime: s.bestAllTime || undefined,
  };
}

export function sameSetup(a: TrialSetup, b: TrialSetup) {
  return a.weapon === b.weapon && a.mag === b.mag && a.hint === b.hint && a.moving === b.moving;
}
