import { describe, expect, it } from 'vitest';
import specs from '../specs.json';
import { runSetup, type LoadoutSettings } from './loadout';
import { Point } from './point';
import recorded from './recorded-runs.fixture.json';
import { Run, type RunResult } from './run';
import type { Weapon } from './weapons';

// The engine against the current trainer: each recorded run (recorded-runs.fixture.json) is replayed
// event by event the way the old page handled them (a press starts a run or presses the trigger
// again, a release lets go, a frame advances the run), and every shot must fire at the same time
// with the same score.

type Event = [type: 'move' | 'down' | 'up', t: number, x: number, y: number] | [type: 'frame', t: number];

interface RecordedRun {
  name: string;
  settings: Record<string, string>;
  events: Event[];
  result: { score: number; shots: number; finishedAt: number; hitTimes: number[]; hitScores: number[] };
  stored: number | null;
}

const runs = recorded.runs as unknown as RecordedRun[];
const weapons = specs as unknown as Weapon[];

function settingsOf(stored: Record<string, string>): LoadoutSettings {
  return {
    mag: Number(stored['game::mag'] ?? 0),
    fireMode: stored['game::fire-mode'] ?? 'default',
    mods: stored['game::mods'] ?? '',
    corruptedStock: stored['game::corrupted-stock'] === 'true',
    sens: Number(stored['game::sens'] ?? 5),
    invertY: stored['game::invert-y'] === 'true',
    speed: Number(stored['game::speed'] ?? 100),
  };
}

function replay(run: RecordedRun): { run: Run; result: RunResult } {
  const weapon = weapons.find((w) => w.name === run.settings['game::weapon'])!;
  const setup = runSetup(weapon, settingsOf(run.settings));
  let cursor = new Point();
  let target = new Point();
  let current: Run | undefined;
  for (const event of run.events) {
    const [type, t] = event;
    if (type !== 'frame') cursor = new Point(event[2], event[3]);
    if (type === 'down') {
      if (!current) {
        // A still target sits where the spray starts
        target = cursor.clone();
        current = new Run(setup, t, cursor, target);
      } else if (!current.press(t, cursor, target)) {
        break;
      }
    } else if (type === 'up') {
      current?.release(t);
    } else if (type === 'frame') {
      current?.frame(t, cursor, target);
    }
  }
  // A run whose last round has fired ends once the recoil settles, with or without a frame then
  if (current?.running && current.finishAt !== null) current.frame(current.finishAt, cursor, target);
  return { run: current!, result: current!.result! };
}

describe('Run, against runs recorded from the current trainer', () => {
  it.each(runs.map((r) => [r.name, r] as const))('%s', (_name, recordedRun) => {
    const { run, result } = replay(recordedRun);
    expect(run.shots.map((s) => s.t)).toEqual(recordedRun.result.hitTimes);
    // Chrome's and Node's Math.exp and Math.pow can differ in the last bit, so scores match to 15 places
    run.shots.forEach((shot, i) => expect(shot.score).toBeCloseTo(recordedRun.result.hitScores[i], 15));
    expect(result.shots).toBe(recordedRun.result.shots);
    expect(result.score).toBeCloseTo(recordedRun.result.score, 15);
    expect(result.finishedAt).toBe(recordedRun.result.finishedAt);
    expect(result.counted).toBe(recordedRun.stored !== null);
    if (recordedRun.stored !== null) expect(result.points).toBe(recordedRun.stored);
  });
});
