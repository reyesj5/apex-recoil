import { describe, expect, it, vi } from 'vitest';
import recorded from '../lib/storage/current-app.fixture.json';
import {
  addResult,
  dateToNumber,
  distanceScore,
  parseStats,
  percentile,
  statsForSetup,
  type TrialSetup,
} from './stats';

// The scoring math and the score history (game::stats), moved here from client/stats.ts.

describe('percentile', () => {
  it('interpolates between neighbouring ranks', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([5, 1, 3], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4], 1)).toBe(4);
    expect(percentile([1, 2, 3, 4], 0)).toBe(1);
  });

  it('returns NaN for no values or a negative p, and clamps p above 1', () => {
    expect(percentile([], 0.5)).toBeNaN();
    expect(percentile([1, 2], -0.1)).toBeNaN();
    expect(percentile([1, 2], 2)).toBe(2);
  });

  it('does not reorder the input', () => {
    const values = [3, 1, 2];
    percentile(values, 0.5);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe('distanceScore', () => {
  it('is 1 on target and falls off smoothly with distance', () => {
    expect(distanceScore(0)).toBe(1);
    expect(distanceScore(50)).toBeCloseTo(Math.exp(-1), 12);
    expect(distanceScore(100)).toBeLessThan(0.02);
    expect(distanceScore(-50)).toBe(distanceScore(50));
  });
});

describe('the score history', () => {
  const setup: TrialSetup = { weapon: 'r99', mag: 0, hint: false, moving: true };

  it('reads what the current trainer stored', () => {
    const stats = parseStats(recorded.trainer['game::stats'], 20261023);
    expect(stats).toHaveLength(1);
    expect(statsForSetup(stats, setup)).toMatchObject({ v: 3, todayResults: [0], bestAllTime: 0 });
  });

  it('moves an earlier day’s results into the day results', () => {
    const stats = parseStats(
      JSON.stringify([{ v: 3, setup, today: 20261022, todayResults: [80, 90, 70], dayResults: [], bestAllTime: 90 }]),
      20261023,
    );
    expect(stats[0].dayResults).toEqual([[20261022, 3, 80, 90]]);
    expect(stats[0]).toMatchObject({ today: 20261023, todayResults: [] });
  });

  it('upgrades entries written by older versions and drops path-only ones', () => {
    const stats = parseStats(
      JSON.stringify([
        {
          v: 2,
          setup: { weapon: 'r301', mag: '2', hint: 'true' },
          today: 20261023,
          todayResults: [50],
          dayResults: [],
          bestAllTime: 50,
        },
        {
          v: 1,
          setup: { weapon: 'r99', mag: '0', hint: 'true', pacer: 'false' },
          today: 20261023,
          todayResults: [],
          dayResults: [],
          bestAllTime: 0,
        },
      ]),
      20261023,
    );
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ v: 3, setup: { weapon: 'r301', mag: 2, hint: true, moving: false } });
  });

  it('starts empty for missing or unreadable data', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(parseStats(null, 20261023)).toEqual([]);
    expect(parseStats('{}', 20261023)).toEqual([]);
    expect(parseStats('not json', 20261023)).toEqual([]);
    expect(error).toHaveBeenCalledOnce();
  });

  it('adds a run to its setup, keeping the best', () => {
    const stats = parseStats('[]', 20261023);
    addResult(stats, 70, setup, 20261023);
    const entry = addResult(stats, 85, setup, 20261023);
    expect(stats).toHaveLength(1);
    expect(entry).toMatchObject({ todayResults: [70, 85], bestAllTime: 85 });
  });

  it('writes dates as numbers', () => {
    expect(dateToNumber(new Date(2026, 9, 23))).toBe(20261023);
  });
});
