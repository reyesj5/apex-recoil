/**
 * Copyright 2021 Mikhail Goncharov
 * Modified by [OWNER NAME], 2025-2026.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// The score history and the scoring curve. Moved from client/stats.ts, the previous trainer's storage
// around these functions; here the stored JSON (game::stats) and today's date come in as arguments,
// so the history can be read, updated and tested without a page.

export const statsDataVersion = 3;

export interface TrialSetup {
  weapon: string;
  mag: number;
  hint: boolean;
  moving: boolean;
}

// [day (2021-04-30 is represented as 20210430), count, median, best].
export type DayResults = [number, number, number, number];

export interface TrialStats {
  v: number;
  setup: TrialSetup;
  dayResults: DayResults[];
  bestAllTime: number;
  today: number;
  todayResults: number[];
}

export function percentile(values: number[], p: number) {
  const xx = values.map((x) => x);
  if (xx.length === 0 || p < 0) return NaN;
  if (p > 1) p = 1;
  xx.sort((a, b) => a - b);
  const i = (xx.length - 1) * p;
  if ((i | 0) === i) return xx[i];
  const int_part = i | 0;
  const f = i - int_part;
  return (1 - f) * xx[int_part] + f * xx[Math.min(int_part + 1, xx.length - 1)];
}

export function distanceScore(x: number) {
  // Reasoning:
  // 1. Small errors should not decrease the score a lot.
  // 2. Big errors should decrease the score almost to 0. In game it's
  //    a binary value that suddenly drops drops "hit" to "no hit" but
  //    that would not be useful for training.
  // Graph: https://www.desmos.com/calculator/j7vjbzvuly.
  return Math.exp(-0.0004 * Math.pow(x, 2));
}

/** A date as the history stores it: 2015-04-28 is 20150428 */
export function dateToNumber(d: Date) {
  return (d.getFullYear() * 100 + d.getMonth() + 1) * 100 + d.getDate();
}

/**
 * Reads the stored history, upgrading entries written by older versions, and moves each setup's
 * results from an earlier day into its day results. Unreadable data gives an empty history.
 */
export function parseStats(raw: string | null, today: number): TrialStats[] {
  let stats: TrialStats[] = [];
  try {
    if (!raw) return stats;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return stats;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stored data of several versions
    parsed.forEach((t: any) => {
      const s = t['setup'];
      if (s === undefined) return;
      let version = t['v'];
      if (version == null) {
        // Initial un-versioned storage.
        if (s['barrel'] != null && s['barrel'] != '0') return;
        if (s['stock'] != null && s['stock'] != '0') return;
        const setup: TrialSetup = {
          weapon: s['weapon'] || '',
          mag: s['mag'] || '0',
          hint: s['hint'] || 'true',
          moving: false,
        };
        const st: TrialStats = {
          v: statsDataVersion,
          setup,
          today: 20210423,
          dayResults: (t['days'] || []).map((d: number, i: number) => {
            const z: DayResults = [
              (Math.floor(d / 100) + 1) * 100 + (d % 100) + 1,
              0,
              t['medianByDay'] ? t['medianByDay'][i] : 0,
              t['bestByDay'] ? t['bestByDay'][i] : 0,
            ];
            return z;
          }),
          todayResults: t['todayResults'] || [],
          bestAllTime: t.bestAllTime || 0,
        };
        t = st;
        version = 1;
      }
      if (version == 1) {
        // Delete entries that have only "path visible" set.
        if (s['hint'] == 'true' && s['pacer'] == 'false') return;
        delete s['pacer'];
        version = 2;
      }
      if (version == 2) {
        s['moving'] = false;
        s['hint'] = s['hint'] == 'true';
        s['mag'] = Number(s['mag']);
      }
      t['v'] = statsDataVersion;
      stats.push(t);
    });
  } catch (err) {
    console.error('Failed to load stats from storage:', err);
    stats = [];
  }
  stats.forEach((s) => rollOver(s, today));
  return stats;
}

/** Moves the results of an earlier day into the day results, so todayResults only holds today */
export function rollOver(s: TrialStats, today: number) {
  if (s.today == today) return;
  if (s.todayResults.length > 0) {
    const r: DayResults = [
      s.today,
      s.todayResults.length,
      percentile(s.todayResults, 0.5),
      percentile(s.todayResults, 1),
    ];
    s.dayResults.push(r);
  }
  s.todayResults = [];
  s.today = today;
}

export function statsForSetup(stats: TrialStats[], c: TrialSetup): TrialStats | undefined {
  return stats.find((x) => {
    try {
      return x.setup.weapon == c.weapon && x.setup.mag == c.mag && x.setup.hint == c.hint && x.setup.moving == c.moving;
    } catch {
      return false;
    }
  });
}

/** Adds a run's score (0 to 100) to its setup's history, creating the setup's entry if needed */
export function addResult(stats: TrialStats[], v: number, setup: TrialSetup, today: number): TrialStats {
  let s = statsForSetup(stats, setup);
  if (s === undefined) {
    s = {
      v: statsDataVersion,
      setup,
      bestAllTime: 0,
      today,
      todayResults: [],
      dayResults: [],
    };
    stats.push(s);
  }
  rollOver(s, today);
  s.todayResults.push(v);
  s.bestAllTime = Math.max(s.bestAllTime, v);
  return s;
}
