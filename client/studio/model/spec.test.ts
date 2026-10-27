import { describe, expect, it } from 'vitest';
import specs from '@/specs.json';
import {
  cleanWeaponName,
  expectedShots,
  findSpec,
  fitTimePoints,
  idealTimePoints,
  importDiscoveryJson,
  newWeaponSpec,
  retime,
  sameSpec,
  shotInterval,
  shotsOf,
  unitShot,
  withMagazineSize,
  withRpm,
  withShots,
  type Spec,
} from './spec';

const all = specs as Spec[];
const spec = (name: string) => structuredClone(all.find((s) => s.name === name)!);

describe('specs', () => {
  it('finds the Havoc under either name', () => {
    expect(findSpec(all, 'r99')?.name).toBe('r99');
    expect(findSpec(all, 'havoc')?.name).toBe('havoc_tc');
    expect(findSpec([{ name: 'havoc' }], 'havoc_tc')?.name).toBe('havoc');
    expect(findSpec(all, 'nope')).toBeUndefined();
  });

  it('reads a shot at 1x from the raw values, else from the pattern over the multiplier', () => {
    const havoc = spec('havoc_tc');
    expect(unitShot(havoc, 1)).toEqual({ x: havoc.raw_1x_x![1], y: havoc.raw_1x_y![1] });
    const r99 = spec('r99');
    expect(unitShot(r99, 1)).toEqual({ x: r99.x[1] / 0.73, y: r99.y[1] / 0.73 });
    // No multiplier: the pattern is already at 1x
    expect(unitShot({ x: [0, 5], y: [0, -7] }, 1)).toEqual({ x: 5, y: -7 });
    expect(shotsOf(havoc)[1]).toEqual({
      x: havoc.x[1],
      y: havoc.y[1],
      raw: { x: havoc.raw_1x_x![1], y: havoc.raw_1x_y![1] },
    });
    expect(shotsOf(r99)[1]).toEqual({ x: r99.x[1], y: r99.y[1] });
  });

  it('times shots', () => {
    expect(shotInterval(1080)).toBe(56);
    expect(idealTimePoints(4, 1080)).toEqual([0, 56, 111, 167]);
    // The times a spec has stay (the Devotion's spin-up too), and new shots follow at the fire rate
    expect(fitTimePoints([0, 55, 111], 5, 1080)).toEqual([0, 55, 111, 167, 223]);
    expect(fitTimePoints([], 2, 600)).toEqual([0, 100]);
    const devotion = spec('devotion_tc');
    const longer = fitTimePoints(devotion.time_points, devotion.time_points.length + 2, devotion.rpm);
    expect(longer.slice(0, -2)).toEqual(devotion.time_points);
    expect(longer.slice(-2)).toEqual([
      Math.round(devotion.time_points.at(-1)! + 60000 / devotion.rpm),
      Math.round(Math.round(devotion.time_points.at(-1)! + 60000 / devotion.rpm) + 60000 / devotion.rpm),
    ]);
    expect(fitTimePoints(devotion.time_points, 3, devotion.rpm)).toEqual(devotion.time_points.slice(0, 3));
  });

  it('moves shot times with the fire rate', () => {
    expect(retime(idealTimePoints(5, 600), 600, 1200)).toEqual(idealTimePoints(5, 1200));
    // Bursts keep their shape
    expect(retime([0, 64, 129, 193, 335], 600, 1200)).toEqual([0, 32, 65, 97, 168]);
    expect(retime([0, 100], 600, 600)).toEqual([0, 100]);
    const r301 = spec('r301');
    expect(withRpm(r301, 900)).toMatchObject({ rpm: 900, time_points: idealTimePoints(r301.x.length, 900) });
  });

  it('sets a new pattern with its shot times', () => {
    const r99 = spec('r99');
    const shots = [...shotsOf(r99), { x: 30, y: -600 }];
    const next = withShots(r99, shots);
    expect(next.x).toHaveLength(r99.x.length + 1);
    expect(next.time_points.slice(0, -1)).toEqual(r99.time_points);
    expect(next.raw_1x_x).toBeUndefined();

    // A spec from an analysis keeps raw values, worked out for shots that have none
    const havoc = spec('havoc_tc');
    const edited = withShots(havoc, [...shotsOf(havoc), { x: 7.3, y: -14.6 }]);
    expect(edited.raw_1x_x!.slice(0, -1)).toEqual(havoc.raw_1x_x);
    expect([edited.raw_1x_x!.at(-1), edited.raw_1x_y!.at(-1)]).toEqual([10, -20]);
  });

  it('edits magazine sizes without touching their sounds', () => {
    const r99 = spec('r99');
    expect(withMagazineSize(r99, 0, 19).mags).toEqual([{ size: 19, audio: 'r99_0' }, ...r99.mags.slice(1)]);
    // A tier added after the last takes its sound; tiers can't be skipped
    const devotion = spec('devotion_tc');
    expect(withMagazineSize(devotion, 4, 54).mags.at(-1)).toEqual({ size: 54, audio: 'devotion_tc_3' });
    expect(withMagazineSize(spec('peacekeeper'), 3, 9).mags).toEqual([{ size: 5, audio: 'shotgun_shot' }]);
    // Only the last tier clears, and Base stays
    expect(withMagazineSize(r99, 4, undefined).mags).toEqual(r99.mags.slice(0, 4));
    expect(withMagazineSize(r99, 2, undefined).mags).toEqual(r99.mags);
    expect(withMagazineSize(spec('peacekeeper'), 0, undefined).mags).toEqual([{ size: 5, audio: 'shotgun_shot' }]);
    expect(withMagazineSize(r99, 1, 0).mags).toEqual(r99.mags);
    expect(withMagazineSize(r99, 1, 2.5).mags).toEqual(r99.mags);
    expect(expectedShots(r99.mags)).toBe(33);
    expect(expectedShots([])).toBe(0);
  });

  it('makes new weapons', () => {
    expect(cleanWeaponName('  Car SMG!')).toBe('car_smg_');
    expect(newWeaponSpec('car_smg')).toMatchObject({
      name: 'car_smg',
      rpm: 600,
      multiplier: 0.73,
      sample_count: 1,
      mags: [
        { size: 20, audio: 'car_smg_20' },
        { size: 24, audio: 'car_smg_24' },
        { size: 27, audio: 'car_smg_27' },
        { size: 30, audio: 'car_smg_30' },
      ],
      mods: {},
      x: [0],
      y: [0],
      time_points: [0],
    });
  });

  it('applies a pasted discovery JSON', () => {
    const r301 = spec('r301');
    const pattern = { x: [0, 1, 2], y: [0, -10, -20], raw_1x_x: [0, 1.37, 2.74], raw_1x_y: [0, -13.7, -27.4] };
    const fromSpec = importDiscoveryJson(r301, JSON.stringify(pattern));
    expect(fromSpec).toEqual({
      spec: { ...r301, ...pattern, time_points: idealTimePoints(3, r301.rpm) },
    });
    // The analysis' whole answer works too, with its fire rate and times
    const answer = { success: true, spec: { x: [0, 1], y: [0, -5], rpm: 600, time_points: [0, 90] } };
    expect(importDiscoveryJson(r301, JSON.stringify(answer))).toEqual({
      spec: { ...r301, x: [0, 1], y: [0, -5], rpm: 600, time_points: [0, 90] },
    });
    // A fire rate alone moves the times; raw values that don't fit the new pattern go
    expect(importDiscoveryJson(r301, '{"rpm": 600}')).toEqual({ spec: withRpm(r301, 600) });
    const havoc = spec('havoc_tc');
    const replaced = importDiscoveryJson(havoc, '{"x": [0, 2], "y": [0, -4]}');
    expect('spec' in replaced && replaced.spec.raw_1x_x).toBeUndefined();

    expect(importDiscoveryJson(r301, '{nope')).toEqual({ error: 'This is not valid JSON.' });
    expect(importDiscoveryJson(r301, '{"x": [0, 1], "y": [0]}')).toEqual({
      error: 'x and y must have the same length.',
    });
    expect(importDiscoveryJson(r301, '{"x": [0, 1], "y": [0, 1], "time_points": [0]}')).toEqual({
      error: 'time_points must have one time per shot.',
    });
    expect(importDiscoveryJson(r301, '{"rpm": "fast"}')).toHaveProperty('error');
  });

  it('tells saved and unsaved specs apart', () => {
    const r99 = spec('r99');
    expect(sameSpec(r99, structuredClone(r99))).toBe(true);
    expect(sameSpec(r99, { ...r99, sample_count: 1 })).toBe(true);
    expect(sameSpec(r99, { ...r99, rpm: 1000 })).toBe(false);
    expect(sameSpec(r99, withShots(r99, shotsOf(r99).slice(0, -1)))).toBe(false);
  });
});
