import { describe, expect, it } from 'vitest';
import { captureToSpecScale, mouseToPixelScale } from './calibration';
import { discrepancyReport } from './discrepancy';
import recorded from './editor-parity.fixture.json';
import { candidates, decalCases, reportSettings, scaleGrid, type FixturePattern } from './parity.cases';

// The Studio's calibration and discrepancy math against the Recoil Editor's results, recorded from
// client/modules/analysis/DiscrepancyInspector.ts on 2026-10-24 (parity.cases.ts has the cases)

const patterns = recorded.patterns as FixturePattern[];

describe('parity with the Recoil Editor', () => {
  it('works out the optic scale the same way', () => {
    const scales: number[] = [];
    for (const h of scaleGrid.heights)
      for (const z of scaleGrid.zooms)
        for (const f of scaleGrid.fovs) for (const s of scaleGrid.factors) scales.push(mouseToPixelScale(h, z, f, s));
    expect(scales).toEqual(recorded.scales);
  });

  it('measures a screenshot scale from its decals the same way', () => {
    const cases = decalCases(patterns);
    expect(cases).toHaveLength(Object.keys(recorded.captureScales).length);
    for (const c of cases) {
      const pattern = patterns.find((p) => p.name === c.pattern);
      expect(captureToSpecScale(c.decals, pattern), c.id).toBe(
        recorded.captureScales[c.id as keyof typeof recorded.captureScales],
      );
    }
  });

  it('reports the same discrepancies', () => {
    let count = 0;
    for (const p of patterns) {
      for (const c of candidates(p)) {
        for (const { zoom, pxPerCount } of reportSettings) {
          const id = `${p.name}:${c.id}:${zoom}`;
          const report = discrepancyReport(p, c.pattern, zoom, pxPerCount);
          const { warnings, ...figures } = report;
          const expected = recorded.reports[id as keyof typeof recorded.reports];
          expect({ ...figures, warnings: warnings.map((w) => w.kind) }, id).toEqual(expected);
          count++;
        }
      }
    }
    expect(count).toBe(Object.keys(recorded.reports).length);
  });
});
