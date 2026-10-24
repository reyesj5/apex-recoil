import type { Pattern } from './spec';

// The cases that compare the Studio's calibration and discrepancy math with the Recoil Editor's
// (client/modules/analysis/DiscrepancyInspector.ts). The editor's results were recorded into
// editor-parity.fixture.json on 2026-10-24, with six weapons' patterns frozen alongside them;
// parity.test.ts runs the same cases on the new modules and expects the same numbers.

export type FixturePattern = Pattern & { name: string };

/** A repeatable pseudo-random value in [-1, 1] */
export const noise = (i: number, seed: number) => {
  const v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
};

export const scaleGrid = {
  heights: [360, 1080, 1440, 2160, 0],
  zooms: [1, 2, 3, 4, 0],
  fovs: [70, 90, 104, 120, 0],
  factors: [0.8, 1, 1.2],
};

const unit = (p: Pattern, i: number) => {
  const mult = p.multiplier || 1;
  return [p.raw_1x_x?.[i] ?? p.x[i] / mult, p.raw_1x_y?.[i] ?? p.y[i] / mult];
};

export interface DecalCase {
  id: string;
  pattern: string;
  decals: { points: [number, number][]; origin: [number, number] } | null;
}

/** Decals as a screenshot would show each pattern: at three scales, with and without jitter, some cut short */
export function decalCases(patterns: FixturePattern[]): DecalCase[] {
  const cases: DecalCase[] = [];
  for (const p of patterns) {
    for (const k of [0.5, 1.7, 2.37, -1.2]) {
      for (const [jitter, take] of [
        [0, p.x.length],
        [2, p.x.length],
        [1, 5],
      ]) {
        const origin: [number, number] = [960 + 3 * noise(1, k), 540 + 3 * noise(2, k)];
        const points = Array.from({ length: Math.min(take, p.x.length) }, (_, i): [number, number] => {
          const [ux, uy] = unit(p, i);
          return [origin[0] + ux * k + jitter * noise(i, 7), origin[1] + uy * k + jitter * noise(i, 11)];
        });
        cases.push({ id: `${p.name}:${k}:${jitter}:${take}`, pattern: p.name, decals: { points, origin } });
      }
    }
    cases.push({ id: `${p.name}:one`, pattern: p.name, decals: { points: [[960, 540]], origin: [960, 540] } });
    cases.push({ id: `${p.name}:none`, pattern: p.name, decals: null });
  }
  return cases;
}

/** Candidates for each saved pattern: the same, nudged, noisy, cut short, longer, upside down, scaled */
export function candidates(p: FixturePattern): { id: string; pattern: Pattern }[] {
  const n = p.x.length;
  const map = (f: (x: number, y: number, i: number) => [number, number], length = n): Pattern => {
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < length; i++) {
      const [nx, ny] = f(p.x[i % n], p.y[i % n], i);
      x.push(nx);
      y.push(ny);
    }
    return { x, y, ...(p.multiplier ? { multiplier: p.multiplier } : {}) };
  };
  return [
    { id: 'same', pattern: p },
    { id: 'nudged', pattern: map((x, y) => [x + 0.02, y]) },
    { id: 'noisy', pattern: map((x, y, i) => [x + 1.5 * noise(i, 3), y + 1.5 * noise(i, 5)]) },
    { id: 'very noisy', pattern: map((x, y, i) => [x + 12 * noise(i, 3), y + 12 * noise(i, 5)]) },
    { id: 'one short', pattern: map((x, y) => [x, y], Math.max(n - 1, 1)) },
    { id: 'three short', pattern: map((x, y) => [x, y], Math.max(n - 3, 1)) },
    { id: 'six short', pattern: map((x, y) => [x, y], Math.max(n - 6, 1)) },
    { id: 'two more', pattern: map((x, y, i) => (i < n ? [x, y] : [x * 1.1, y * 1.1]), n + 2) },
    { id: 'inverted', pattern: map((x, y) => [x, -y]) },
    { id: 'scaled', pattern: map((x, y) => [x * 1.4, y * 1.4]) },
  ];
}

/** The zoom and measured scale each report runs with */
export const reportSettings: { zoom: number; pxPerCount?: number }[] = [{ zoom: 2 }, { zoom: 3, pxPerCount: 1.7 }];
