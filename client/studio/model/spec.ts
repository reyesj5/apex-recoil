import { z } from 'zod';
import { magazine, type Magazine, type WeaponSpec } from '@/lib/api';

// Weapon specs as the Studio edits them: the pattern shot by shot, the magazines, the shot times.
// The Recoil Editor this replaces rewrote parts of a spec it didn't mean to on every save: each
// magazine's sound became '<weapon>_<size>', a single magazine became three, and the shot times
// became even intervals (the Devotion's spin-up and the burst weapons' timing were lost). Here a
// save changes only what was edited.

export interface Pt {
  x: number;
  y: number;
}

/** A spec as the API sends it, the analysis' fields included */
export type Spec = WeaponSpec;

/** What drawing a pattern needs: a spec, or an analyzed spray's x and y */
export type Pattern = Pick<Spec, 'x' | 'y'> & Partial<Pick<Spec, 'multiplier' | 'raw_1x_x' | 'raw_1x_y'>>;

/** One shot of a pattern, as the spec stores it: x and y at the weapon's multiplier, raw at 1x */
export interface Shot {
  x: number;
  y: number;
  /** The shot in mouse counts at 1x; only specs that came from an analysis keep these */
  raw?: Pt;
}

/** Rounds to 2 decimals, as specs store values (never -0) */
export const round2 = (value: number) => Math.round(value * 100) / 100 || 0;

/**
 * The spec named `name`. Captures name the Havoc 'havoc' and the specs 'havoc_tc' (or the other way
 * round), so either finds it.
 */
export function findSpec<S extends { name: string }>(specs: readonly S[], name: string): S | undefined {
  const alias = name === 'havoc' ? 'havoc_tc' : name === 'havoc_tc' ? 'havoc' : undefined;
  return specs.find((s) => s.name === name) ?? (alias ? specs.find((s) => s.name === alias) : undefined);
}

export const multiplierOf = (spec: Pick<Pattern, 'multiplier'>) => spec.multiplier || 1;

export const shotCount = (spec: Pick<Pattern, 'x' | 'y'>) => Math.min(spec.x.length, spec.y.length);

/** Shot `i` in mouse counts at 1x: the analysis' raw values where the spec has them, else the pattern over the multiplier */
export function unitShot(spec: Pattern, i: number): Pt {
  const mult = multiplierOf(spec);
  return { x: spec.raw_1x_x?.[i] ?? spec.x[i] / mult, y: spec.raw_1x_y?.[i] ?? spec.y[i] / mult };
}

/** The pattern as a list of shots */
export function shotsOf(spec: Spec): Shot[] {
  const raw = spec.raw_1x_x && spec.raw_1x_y;
  return Array.from({ length: shotCount(spec) }, (_, i) => ({
    x: spec.x[i],
    y: spec.y[i],
    ...(raw ? { raw: unitShot(spec, i) } : {}),
  }));
}

/** Milliseconds between shots at `rpm`, as the inspector shows it */
export const shotInterval = (rpm: number) => (rpm > 0 ? Math.round(60000 / rpm) : 0);

/** Even shot times at `rpm` */
export function idealTimePoints(count: number, rpm: number): number[] {
  const interval = 60000 / rpm;
  return Array.from({ length: count }, (_, i) => Math.round(i * interval));
}

const isIdeal = (times: number[], rpm: number) =>
  idealTimePoints(times.length, rpm).every((t, i) => Math.abs(t - times[i]) <= 1);

/**
 * Shot times for a pattern of `count` shots: the spec's own times for the shots it had (bursts and
 * spin-up stay), then one interval at `rpm` per added shot.
 */
export function fitTimePoints(times: number[], count: number, rpm: number): number[] {
  if (times.length >= count) return times.slice(0, count);
  const interval = 60000 / rpm;
  const fitted = times.slice();
  while (fitted.length < count) fitted.push(Math.round((fitted.at(-1) ?? -interval) + interval));
  return fitted;
}

/** Shot times after the fire rate changes: even times stay even, others (bursts, spin-up) scale */
export function retime(times: number[], fromRpm: number, toRpm: number): number[] {
  if (!(fromRpm > 0) || !(toRpm > 0) || fromRpm === toRpm) return times;
  if (isIdeal(times, fromRpm)) return idealTimePoints(times.length, toRpm);
  return times.map((t) => Math.round((t * fromRpm) / toRpm));
}

/** The spec with a new pattern; the shot times follow its length, and raw values are kept where the spec has them */
export function withShots(spec: Spec, shots: Shot[]): Spec {
  const mult = multiplierOf(spec);
  const next: Spec = {
    ...spec,
    x: shots.map((s) => s.x),
    y: shots.map((s) => s.y),
    time_points: fitTimePoints(spec.time_points, shots.length, spec.rpm),
  };
  if (spec.raw_1x_x && spec.raw_1x_y) {
    next.raw_1x_x = shots.map((s) => s.raw?.x ?? round2(s.x / mult));
    next.raw_1x_y = shots.map((s) => s.raw?.y ?? round2(s.y / mult));
  }
  return next;
}

/** The spec at a new fire rate, its shot times moved with it */
export function withRpm(spec: Spec, rpm: number): Spec {
  return { ...spec, rpm, time_points: retime(spec.time_points, spec.rpm, rpm) };
}

/** Magazine tiers in game order (client/trainer/catalog.ts): the spec lists them from Base up */
export const tierNames = ['Base', 'Lv 1', 'Lv 2', 'Lv 3', 'Corrupted'] as const;

/** The shots a full spray has: the largest magazine's */
export const expectedShots = (mags: readonly Magazine[]) => mags.at(-1)?.size ?? 0;

/**
 * The magazines with tier `index` set to `size`. Each magazine keeps its sound set; a new tier takes
 * the one below it (as the specs give Corrupted the sound of Lv 3). Tiers fill in order, so a size
 * can be added only after the last tier and cleared (undefined) only from the last, and the Base
 * magazine always stays; anything else leaves the magazines as they are.
 */
export function withMagazineSize(spec: Spec, index: number, size: number | undefined): Spec {
  const mags = spec.mags;
  if (size === undefined) {
    return index === mags.length - 1 && index > 0 ? { ...spec, mags: mags.slice(0, -1) } : spec;
  }
  if (!Number.isInteger(size) || size <= 0) return spec;
  if (index < mags.length) return { ...spec, mags: mags.map((m, i) => (i === index ? { ...m, size } : m)) };
  if (index === mags.length && index < tierNames.length) {
    return { ...spec, mags: [...mags, { size, audio: mags.at(-1)?.audio ?? `${spec.name}_${size}` }] };
  }
  return spec;
}

/** A weapon id from what someone typed: lowercase letters, digits, '_' and '-' */
export const cleanWeaponName = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');

/** A new weapon's spec, as the Recoil Editor made it: one shot, four magazines, 600 RPM */
export function newWeaponSpec(name: string): Spec {
  return {
    name,
    rpm: 600,
    multiplier: 0.73,
    sample_count: 1,
    mags: [20, 24, 27, 30].map((size) => ({ size, audio: `${name}_${size}` })),
    mods: {},
    x: [0],
    y: [0],
    time_points: [0],
    ping_points: [],
  };
}

const numbers = z.array(z.number());
const importedSpec = z.looseObject({
  x: numbers.optional(),
  y: numbers.optional(),
  raw_1x_x: numbers.optional(),
  raw_1x_y: numbers.optional(),
  rpm: z.number().positive().optional(),
  time_points: numbers.optional(),
  mags: z.array(magazine).min(1).optional(),
});

/**
 * The spec with what a pasted discovery JSON gives: the pattern (x and y, with the raw values when it
 * has them), the fire rate, the shot times and the magazines. Takes the spec itself or the analysis'
 * whole answer ({ spec: ... }).
 */
export function importDiscoveryJson(spec: Spec, text: string): { spec: Spec } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'This is not valid JSON.' };
  }
  if (data && typeof data === 'object' && 'spec' in data && data.spec && typeof data.spec === 'object') {
    data = data.spec;
  }
  const parsed = importedSpec.safeParse(data);
  if (!parsed.success) return { error: `Unexpected JSON: ${parsed.error.issues[0]?.message ?? 'invalid'}.` };
  const { x, y, raw_1x_x, raw_1x_y, rpm, time_points, mags } = parsed.data;

  let next: Spec = rpm && !time_points ? withRpm(spec, rpm) : { ...spec, ...(rpm ? { rpm } : {}) };
  if (x && y) {
    if (x.length !== y.length) return { error: 'x and y must have the same length.' };
    next = { ...next, x, y, time_points: fitTimePoints(next.time_points, x.length, next.rpm) };
    // Raw values that don't belong to this pattern would draw the old one on a screenshot
    if (raw_1x_x?.length === x.length && raw_1x_y?.length === x.length) {
      next.raw_1x_x = raw_1x_x;
      next.raw_1x_y = raw_1x_y;
    } else {
      delete next.raw_1x_x;
      delete next.raw_1x_y;
    }
  }
  if (time_points) next = { ...next, time_points };
  if (mags) next = { ...next, mags };
  if (next.time_points.length !== next.x.length) return { error: 'time_points must have one time per shot.' };
  return { spec: next };
}

/** What the server stores for a spec, to tell whether a draft has unsaved changes */
function savedFields(spec: Spec) {
  const { name, rpm, multiplier, mags, x, y, time_points, raw_1x_x, raw_1x_y, sample_count } = spec;
  return JSON.stringify([name, rpm, multiplier, mags, x, y, time_points, raw_1x_x, raw_1x_y, sample_count ?? 1]);
}

export const sameSpec = (a: Spec, b: Spec) => savedFields(a) === savedFields(b);
