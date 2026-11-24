import { describe, expect, it } from 'vitest';
import specs from '@/specs.json';
import { captureToSpecScale, mouseToPixelScale } from './calibration';
import { discrepancyReport } from './discrepancy';
import { canvasShots, measureShots, moveShot } from './pattern';
import {
  boundsOf,
  compareInSpecUnits,
  compareOnFrame,
  defaultOrigin,
  deltaOf,
  detectedPoints,
  fitView,
  framePlacement,
  patternToWorld,
  plainPlacement,
  shotToWorld,
  worldToShot,
  zoomAt,
  type Placement,
} from './placement';
import type { Session, TrialResult } from './session';
import { shotsOf, unitShot, type Spec } from './spec';

const all = specs as Spec[];
const spec = (name: string) => structuredClone(all.find((s) => s.name === name)!);
const optics = { zoom: 2, fov: 104, scaleFactor: 1 };
const size = { width: 1920, height: 1080 };

function trial(points: [number, number][], origin: [number, number] = [0, 0]): TrialResult {
  return {
    source: 'spray_01.webm',
    shots: points.length,
    x: [],
    y: [],
    frame_points: points,
    origin,
    frame_width: 1920,
    frame_height: 1080,
  };
}

function session(over: Partial<Session> = {}): Session {
  const r301 = spec('r301');
  return {
    weapon: 'r301',
    mode: 'auto',
    baseline: r301,
    candidate: r301,
    strategy: 'overwrite',
    sampleCount: 1,
    newSamples: 1,
    previewPoints: [],
    previewOrigin: [0, 0],
    frameWidth: 1920,
    frameHeight: 1080,
    trials: [],
    zoom: 2,
    ...over,
  };
}

describe('placing a pattern', () => {
  it('draws a spec in its own units without a screenshot, and at 1x counts on one', () => {
    const r99 = spec('r99');
    expect(shotToWorld(r99, 3, plainPlacement)).toEqual({ x: r99.x[3], y: r99.y[3] });
    const placement: Placement = { origin: { x: 900, y: 500 }, pxPerCount: 1.5 };
    const u = unitShot(r99, 3);
    expect(shotToWorld(r99, 3, placement)).toEqual({ x: 900 + u.x * 1.5, y: 500 + u.y * 1.5 });
  });

  it('gives back every spec unchanged when nothing moved', () => {
    const placements: Placement[] = [plainPlacement, { origin: { x: 931.4, y: 512.7 }, pxPerCount: 1.237 }];
    for (const s of all) {
      for (const placement of placements) {
        // Kept values come back as they were
        expect(measureShots(canvasShots(s, placement), placement, s), s.name).toEqual(shotsOf(s));
        // Measured again from the canvas, a spec without raw values comes back exactly as it is saved
        // (JSON writes the -0 some specs hold as 0)
        const measured = measureShots(
          canvasShots(s, placement).map(({ at }) => ({ at })),
          placement,
          s,
        );
        if (!s.raw_1x_x) expect(JSON.stringify(measured), s.name).toBe(JSON.stringify(shotsOf(s)));
        else for (const [i, shot] of measured.entries()) expect(Math.abs(shot.x - s.x[i])).toBeLessThanOrEqual(0.0101);
      }
    }
  });

  it('keeps a tall pattern at its scale when one shot moves without a screenshot', () => {
    // The Recoil Editor drew such a pattern shrunk to fit and read it back unshrunk, so an edit scaled it
    const devotion = spec('devotion_tc');
    const shots = canvasShots(devotion, plainPlacement);
    const moved = moveShot({ shots, anchors: [] }, 5, { x: shots[5].at.x + 10, y: shots[5].at.y });
    const next = measureShots(moved.shots, plainPlacement, devotion);
    expect(next.map((s) => s.x)).toEqual(devotion.x.map((x, i) => (i === 5 ? Math.round((x + 10) * 100) / 100 : x)));
    expect(next.map((s) => s.y)).toEqual(devotion.y);
  });

  it('measures a moved shot on a screenshot in counts at the multiplier, raw values at 1x', () => {
    const havoc = spec('havoc_tc');
    const placement: Placement = { origin: { x: 950, y: 520 }, pxPerCount: 2 };
    const first = shotToWorld(havoc, 0, placement);
    expect(worldToShot({ x: first.x + 20, y: first.y - 40 }, first, placement, havoc)).toEqual({
      x: Math.round(10 * 0.73 * 100) / 100,
      y: Math.round(-20 * 0.73 * 100) / 100,
      raw: { x: 10, y: -20 },
    });
  });

  it('places a spec on a screenshot without a session at the crosshair, at the optic scale', () => {
    const r99 = spec('r99');
    const placement = framePlacement({
      spec: r99,
      session: null,
      index: 0,
      size: { width: 1280, height: 720 },
      optics,
    });
    expect(placement).toEqual({
      origin: defaultOrigin({ width: 1280, height: 720 }),
      pxPerCount: mouseToPixelScale(720, 2, 104, 1),
    });
    const fine = framePlacement({ spec: r99, session: null, index: 0, size, optics: { ...optics, scaleFactor: 1.1 } });
    expect(fine.pxPerCount).toBeCloseTo(mouseToPixelScale(1080, 2, 104, 1) * 1.1, 12);
  });

  it('places a spec on a spray at the decals, at the scale they measure', () => {
    const r99 = spec('r99');
    const points = Array.from({ length: 8 }, (_, i): [number, number] => {
      const u = unitShot(r99, i);
      return [1000 + u.x * 1.8, 600 + u.y * 1.8];
    });
    const s = session({ trials: [trial(points, [1000, 600])], zoom: 3 });
    const placement = framePlacement({ spec: r99, session: s, index: 0, size, optics });
    expect(placement.origin).toEqual({ x: 1000, y: 600 });
    expect(placement.pxPerCount).toBeCloseTo(1.8, 10);

    // No origin reported: the first decal
    const unset = session({ trials: [trial(points)] });
    expect(framePlacement({ spec: r99, session: unset, index: 0, size, optics }).origin).toEqual({ x: 1000, y: 600 });

    // No decals: the reported origin at the session's optic
    const bare = session({ trials: [{ ...trial([], [700, 400]) }], previewOrigin: [10, 10], zoom: 3 });
    expect(framePlacement({ spec: r99, session: bare, index: 0, size, optics })).toEqual({
      origin: { x: 700, y: 400 },
      pxPerCount: mouseToPixelScale(1080, 3, 104, 1),
    });
    const preview = session({ trials: [trial([])], previewOrigin: [300, 200] });
    expect(framePlacement({ spec: r99, session: preview, index: 0, size, optics }).origin).toEqual({ x: 300, y: 200 });
  });

  it('lists the decals found on a spray', () => {
    const s = session({
      trials: [trial([[5, 6]]), { ...trial([], [100, 100]), x: [0, 2], y: [0, -4] }],
      previewPoints: [[1, 2]],
    });
    expect(detectedPoints(s, 0, size, optics)).toEqual([{ x: 5, y: 6 }]);
    // A spray without frame points, from its origin at the optic scale
    const scale = mouseToPixelScale(1080, 2, 104, 1);
    expect(detectedPoints(s, 1, size, optics)).toEqual([
      { x: 100, y: 100 },
      { x: 100 + 2 * scale, y: 100 - 4 * scale },
    ]);
    expect(detectedPoints(session({ previewPoints: [[1, 2]] }), 0, size, optics)).toEqual([{ x: 1, y: 2 }]);
  });
});

describe('comparing', () => {
  it('measures the saved spec against what the screenshot shows', () => {
    const saved = spec('r301');
    const candidate = { ...saved, x: saved.x.map((x, i) => x + (i % 3)), y: saved.y.slice() };
    const decalCount = 10;
    const points = Array.from({ length: decalCount }, (_, i): [number, number] => {
      const u = unitShot(candidate, i);
      return [960 + u.x * 2, 540 + u.y * 2];
    });
    const s = session({ trials: [trial(points, [960, 540])] });
    const comparison = compareOnFrame({ saved, candidate, session: s, index: 0, size, optics });

    const px = captureToSpecScale({ points, origin: [960, 540] }, candidate)!;
    const placement = { origin: { x: 960, y: 540 }, pxPerCount: px };
    // The candidate is the decals, then its later shots from the origin
    expect(comparison.candidate.slice(0, decalCount)).toEqual(points.map(([x, y]) => ({ x, y })));
    expect(comparison.candidate.slice(decalCount)).toEqual(patternToWorld(candidate, placement).slice(decalCount));
    expect(comparison.saved).toEqual(patternToWorld(saved, placement));
    expect(comparison.report).toEqual(discrepancyReport(saved, candidate, 2, px));
    expect(comparison.deltas.every((d) => d.distance > 3)).toBe(true);
  });

  it('draws strays by length', () => {
    const o = { x: 0, y: 0 };
    expect(deltaOf(o, { x: 3, y: 0 })).toBeNull();
    expect(deltaOf(o, { x: 5, y: 0 })).toMatchObject({ tone: 'ok', distance: 5 });
    expect(deltaOf(o, { x: 11, y: 0 })).toMatchObject({ tone: 'warn' });
    expect(deltaOf(o, { x: 23, y: 0 })).toMatchObject({ tone: 'bad' });
    expect(deltaOf(o, { x: 23, y: 0 })).not.toHaveProperty('label');
    expect(deltaOf(o, { x: 30, y: 40 })).toMatchObject({ tone: 'bad', label: 'Δ50px' });
  });

  it('compares in spec units without a screenshot', () => {
    const saved = spec('wingman');
    const candidate = { ...saved, x: saved.x.map((x) => x + 5) };
    const report = discrepancyReport(saved, candidate);
    const comparison = compareInSpecUnits(saved, candidate, report);
    expect(comparison.saved[2]).toEqual({ x: saved.x[2], y: saved.y[2] });
    expect(comparison.deltas).toHaveLength(saved.x.length);
    expect(comparison.report).toBe(report);
  });
});

describe('the view', () => {
  it('fits a screenshot without enlarging it', () => {
    expect(fitView({ x: 0, y: 0, width: 1920, height: 1080 }, { width: 1000, height: 600 })).toEqual({
      scale: 0.5,
      x: 20,
      y: 30,
    });
    expect(fitView({ x: 0, y: 0, width: 640, height: 360 }, { width: 1000, height: 600 })).toEqual({
      scale: 1,
      x: 180,
      y: 120,
    });
  });

  it('centers a pattern', () => {
    const bounds = boundsOf([
      { x: -50, y: -400 },
      { x: 30, y: 0 },
    ]);
    expect(bounds).toEqual({ x: -50, y: -400, width: 80, height: 400 });
    expect(fitView(bounds, { width: 800, height: 600 }).scale).toBe(1);
    const view = fitView(bounds, { width: 800, height: 600 }, 20, 2);
    expect(view.scale).toBeCloseTo(560 / 400);
    // The pattern's center lands on the stage's
    expect(-10 * view.scale + view.x).toBeCloseTo(400);
    expect(-200 * view.scale + view.y).toBeCloseTo(300);
    expect(boundsOf([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('zooms around the pointer, within limits', () => {
    const view = { scale: 1, x: 100, y: 50 };
    const zoomed = zoomAt(view, 1.1, { x: 300, y: 250 });
    expect(zoomed.scale).toBeCloseTo(1.1);
    // The point under the pointer stays there
    expect((300 - zoomed.x) / zoomed.scale).toBeCloseTo(200);
    expect((250 - zoomed.y) / zoomed.scale).toBeCloseTo(200);
    expect(zoomAt({ scale: 7.9, x: 0, y: 0 }, 2, { x: 0, y: 0 }).scale).toBe(8);
    expect(zoomAt({ scale: 0.21, x: 0, y: 0 }, 0.5, { x: 0, y: 0 }).scale).toBe(0.2);
  });
});
