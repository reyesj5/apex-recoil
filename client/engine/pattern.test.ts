import { describe, expect, it } from 'vitest';
import specs from '../specs.json';
import { hintPath, onScreen, patternBox, recoilPattern, sensitivityScale } from './pattern';
import { Point } from './point';
import { getWeaponModeConfig, type Weapon } from './weapons';

const r301 = (specs as unknown as Weapon[]).find((w) => w.name === 'r301')!;

describe('patterns', () => {
  it('shrinks with the sensitivity, within limits', () => {
    expect(sensitivityScale(5)).toBe(0.2);
    expect(sensitivityScale(0.05)).toBe(10);
    expect(sensitivityScale(0)).toBe(0.1);
  });

  it('scales each round for the sensitivity and flips it for inverted Y', () => {
    const pattern = recoilPattern(r301, 3, { sens: 5, invertY: false });
    expect(pattern).toHaveLength(3);
    expect(pattern[2]).toEqual(new Point(r301.x[2] * 0.2, r301.y[2] * 0.2));
    expect(recoilPattern(r301, 3, { sens: 5, invertY: true })[2].y).toBe(-r301.y[2] * 0.2);
  });

  it('stretches only what is drawn with the screen scale', () => {
    expect(onScreen(new Point(10, 10), { scaleX: 2, scaleY: 0.5 })).toEqual(new Point(20, 5));
  });

  it('measures the pattern around its first round', () => {
    const [topLeft, bottomRight] = patternBox([new Point(0, 0), new Point(5, -40), new Point(-3, -60)]);
    expect(topLeft).toEqual(new Point(-5, 0));
    expect(bottomRight).toEqual(new Point(3, 60));
  });
});

describe('the path to follow', () => {
  const pattern = recoilPattern(r301, 6, { sens: 5, invertY: false });
  const start = new Point(100, 100);

  it('is one line through the spray in full auto', () => {
    const path = hintPath(pattern, 6, 'auto', getWeaponModeConfig('r301'), start);
    expect(path.lines).toHaveLength(1);
    expect(path.lines[0].points[1]).toEqual(start.clone().sub(pattern[1]));
    expect(path.dots.map((d) => d.label)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('is a line per burst, each with its way back', () => {
    const path = hintPath(pattern, 6, 'burst', { modes: ['burst'], defaultMode: 'burst', burstSize: 3 }, start);
    expect(path.lines.filter((l) => !l.reset)).toHaveLength(2);
    expect(path.lines.filter((l) => l.reset).every((l) => l.points[1].closeTo(start))).toBe(true);
  });

  it('is each single shot’s kick and its way back, numbered from 1', () => {
    const path = hintPath(pattern, 6, 'single', getWeaponModeConfig('r301'), start);
    expect(path.lines).toHaveLength(12);
    expect(path.dots.map((d) => d.label)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
