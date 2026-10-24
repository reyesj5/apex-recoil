import { describe, expect, it } from 'vitest';
import { Point } from './point';
import { Target, pointInRect } from './target';

const area = { topLeft: new Point(100, 100), bottomRight: new Point(300, 200) };

/** Random numbers from a list, so the target's path is known */
const sequence =
  (...values: number[]) =>
  () =>
    values.shift() ?? 0.5;

describe('Target', () => {
  it('stays still unless it moves', () => {
    const target = new Target(sequence());
    target.configure(area, false, 100, 0.2);
    target.position(new Point(150, 150));
    expect(target.step(1000)).toBe(false);
    expect(target.position()).toEqual(new Point(150, 150));
  });

  it('starts from the middle of the start area and heads for a random point of it', () => {
    const target = new Target(sequence(0.5, 1));
    target.configure(area, true, 100, 0.2);
    expect(target.position()).toEqual(new Point(200, 150));
    expect(target.next).toEqual(new Point(200, 200));
  });

  it('glides at the target speed scaled for the sensitivity', () => {
    const target = new Target(sequence(0.5, 1));
    target.configure(area, true, 100, 0.2);
    // 100 × 0.2 / 1000 = 0.02 px per ms: 500 ms is 10 px toward (200, 200)
    expect(target.step(500)).toBe(true);
    expect(target.position()).toEqual(new Point(200, 160));
  });

  it('picks the next point when it gets there, and stays in the area', () => {
    const target = new Target(sequence(0.5, 0.6, 0, 0));
    target.configure(area, true, 1000, 1);
    target.step(1000);
    expect(target.next).toEqual(new Point(100, 100));
    expect(pointInRect(target.position(), area)).toBe(true);
  });
});
