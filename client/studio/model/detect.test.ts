import { describe, expect, it } from 'vitest';
import { captureDecals } from './calibration';
import { detectTargets, MAX_TARGETS, thresholdOverlay, type Pixels } from './detect';
import { emptyHistory, record, redo, undo } from './history';
import type { DecalSource, TrialResult } from './session';

/** The Recoil Editor's finder (client/modules/editor/canvas.ts, autoFilter), recursion and all */
function legacyDetect({ width: w, height: h, data }: Pixels, th: number, targetFrom: number, targetTo: number) {
  const imageMask: number[][] = [];
  for (let i = 0; i < w; i++) {
    imageMask[i] = [];
    for (let j = 0; j < h; j++) {
      const v = data[(j * w + i) * 4];
      imageMask[i][j] = v < th ? v : 1000;
    }
  }
  const fill = (x: number, y: number): [number, number, number, number] => {
    if (x < 0 || x >= w || y < 0 || y >= h || imageMask[x][y] > 255) return [x, y, 1000, 0];
    let best: [number, number, number, number] = [x, y, imageMask[x][y], 1];
    imageMask[x][y] = 1000;
    let size = 1;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const t = fill(x + i, y + j);
        size += t[3];
        if (t[2] < best[2]) best = t;
      }
    }
    best[3] = size;
    return best;
  };
  const detected: { x: number; y: number }[] = [];
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      if (imageMask[i][j] > 255) continue;
      const b = fill(i, j);
      if (b[3] < targetFrom || b[3] > targetTo) continue;
      detected.push({ x: b[0], y: b[1] });
    }
  }
  return detected.length > 100 ? [] : detected;
}

/** A grey image with dark discs, like the scenarios' drawn wall */
function image(width: number, height: number, discs: { x: number; y: number; r: number; v: number }[]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const disc = discs.find((d) => (x - d.x) ** 2 + (y - d.y) ** 2 <= d.r * d.r);
      const v = disc ? disc.v : x > 80 && x < 560 && y > 40 && y < 320 ? 235 : 70;
      data.set([v, v, v, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

describe('the decal finder', () => {
  const discs = Array.from({ length: 6 }, (_, i) => ({ x: 320 + 12 * i, y: 280 - 28 * i, r: 5, v: 25 }));

  it('finds each decal at its first darkest pixel', () => {
    const found = detectTargets(image(640, 360, discs), 50, 10, 200);
    expect(found.tooMany).toBe(false);
    // Discs of one shade: the first pixel the column-by-column scan meets
    expect(found.targets).toEqual(discs.map((d) => ({ x: d.x - 5, y: d.y })));
  });

  it('finds what the Recoil Editor found', () => {
    // Shaded and overlapping blobs: which darkest pixel wins depends on the order the fill visits them
    const shaded = [
      image(100, 60, [
        { x: 50, y: 30, r: 1, v: 5 },
        { x: 50, y: 30, r: 4, v: 30 },
      ]),
      image(
        160,
        90,
        Array.from({ length: 30 }, (_, i) => ({
          x: 10 + ((i * 37) % 140),
          y: 8 + ((i * 53) % 75),
          r: 1 + (i % 5),
          v: 5 + ((i * 7) % 40),
        })),
      ),
    ];
    for (const pixels of shaded) {
      for (const [threshold, from, to] of [
        [50, 1, 100],
        [30, 2, 40],
        [45, 1, 1000],
      ]) {
        expect(detectTargets(pixels, threshold, from, to).targets).toEqual(legacyDetect(pixels, threshold, from, to));
      }
    }
  });

  it('keeps blobs within the size range', () => {
    expect(detectTargets(image(640, 360, discs), 50, 100, 200).targets).toEqual([]);
    expect(detectTargets(image(640, 360, discs), 20, 10, 200).targets).toEqual([]);
  });

  it('offers nothing when it finds too many', () => {
    const many = Array.from({ length: MAX_TARGETS + 1 }, (_, i) => ({
      x: 10 + (i % 25) * 20,
      y: 10 + Math.floor(i / 25) * 20,
      r: 2,
      v: 10,
    }));
    expect(detectTargets(image(520, 120, many), 50, 1, 50)).toEqual({ targets: [], tooMany: true });
  });

  it('survives a large dark area', () => {
    // The recursive fill of the Recoil Editor ran out of stack here
    const dark = { width: 1200, height: 800, data: new Uint8ClampedArray(1200 * 800 * 4) };
    expect(detectTargets(dark, 50, 1, 100)).toEqual({ targets: [], tooMany: false });
  });

  it('marks the pixels under the threshold in red', () => {
    const overlay = thresholdOverlay(image(4, 1, [{ x: 0, y: 0, r: 0, v: 10 }]), 50);
    expect(Array.from(overlay.slice(0, 8))).toEqual([255, 0, 0, 255, 0, 0, 0, 0]);
  });
});

function trial(points: [number, number][], origin: [number, number]): TrialResult {
  return {
    source: '',
    shots: points.length,
    x: [],
    y: [],
    frame_points: points,
    origin,
    frame_width: 0,
    frame_height: 0,
  };
}

describe('the decals of a session', () => {
  const session: DecalSource = {
    trials: [
      trial([], [0, 0]),
      trial(
        [
          [10, 20],
          [12, 30],
        ],
        [0, 0],
      ),
      trial([[5, 5]], [400, 300]),
    ],
    previewPoints: [],
    previewOrigin: [0, 0],
  };

  it("takes the spray's own decals, with its origin or its first decal", () => {
    expect(captureDecals(session, 2)).toEqual({ points: [[5, 5]], origin: [400, 300] });
    expect(captureDecals(session, 1)).toEqual({
      points: [
        [10, 20],
        [12, 30],
      ],
      origin: [10, 20],
    });
  });

  it("falls back to the preview's, then any spray's", () => {
    const preview = {
      ...session,
      previewPoints: [[1, 2]] as [number, number][],
      previewOrigin: [7, 8] as [number, number],
    };
    expect(captureDecals(preview, 0)).toEqual({ points: [[1, 2]], origin: [7, 8] });
    expect(captureDecals(session, 0)).toEqual({
      points: [
        [10, 20],
        [12, 30],
      ],
      origin: [10, 20],
    });
    expect(captureDecals(session, null)).toEqual({
      points: [
        [10, 20],
        [12, 30],
      ],
      origin: [10, 20],
    });
    expect(captureDecals({ ...session, trials: [] }, 0)).toBeNull();
    expect(captureDecals(null, 0)).toBeNull();
  });
});

describe('undo and redo', () => {
  it('walks back and forth through the changes', () => {
    let history = record(emptyHistory<number>(), 1);
    history = record(history, 2);
    const back = undo(history, 3)!;
    expect(back.state).toBe(2);
    const again = undo(back.history, 2)!;
    expect(again.state).toBe(1);
    const forward = redo(again.history, 1)!;
    expect(forward.state).toBe(2);
    expect(redo(redo(forward.history, 2)!.history, 3)).toBeNull();
    expect(undo(emptyHistory<number>(), 0)).toBeNull();
    // A new change drops what could be redone
    expect(record(again.history, 1).future).toEqual([]);
  });

  it('keeps the last 50 states', () => {
    let history = emptyHistory<number>();
    for (let i = 0; i < 60; i++) history = record(history, i);
    expect(history.past).toHaveLength(50);
    expect(history.past[0]).toBe(10);
  });
});
