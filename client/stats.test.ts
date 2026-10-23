import { describe, expect, it } from 'vitest';
import { distanceScore, percentile } from './stats';

// Pins down the trainer's scoring math so the engine port (docs/ui-migration-plan.md, Phase 2.1)
// can be checked against the current behavior.

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
