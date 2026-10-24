import type { FireMode } from '@/engine/weapons';
import type { Practice } from './loadout';

// The runs the trainer saves, one entry each with its time, kept under game::runs for the Progress
// page's recent runs. The score history (game::stats) keeps only daily figures per setup, so runs
// saved before this log existed don't appear in it. The newest runs come last.

export interface LoggedRun {
  /** When it ended (ms since 1970) */
  t: number;
  weapon: string;
  /** The magazine's index, and the rounds it held */
  mag: number;
  size: number;
  practice: Practice;
  fire: FireMode;
  /** Out of 100 */
  score: number;
}

/** How many runs the log keeps */
export const runLogSize = 200;

function isRun(value: unknown): value is LoggedRun {
  const r = value as LoggedRun;
  return (
    typeof r === 'object' &&
    r !== null &&
    typeof r.t === 'number' &&
    typeof r.weapon === 'string' &&
    typeof r.mag === 'number' &&
    typeof r.size === 'number' &&
    typeof r.score === 'number'
  );
}

/** The stored log; anything unreadable is left out */
export function readRuns(raw: string): LoggedRun[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isRun) : [];
  } catch {
    return [];
  }
}

/** The stored log with a run added (the oldest go past runLogSize), as the JSON to store */
export function withRun(raw: string, run: LoggedRun): string {
  return JSON.stringify([...readRuns(raw), run].slice(-runLogSize));
}
