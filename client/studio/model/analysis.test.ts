import { describe, expect, it } from 'vitest';
import specs from '@/specs.json';
import { analysisParams, applyAnalysis, describeIntegration, sessionFrames } from './analysis';
import { discrepancyReport } from './discrepancy';
import { analysisResult } from './session';
import type { Spec } from './spec';

const all = specs as Spec[];
const spec = (name: string) => structuredClone(all.find((s) => s.name === name)!);

/** A copy of `object` without `keys` */
function without<T extends object>(object: T, ...keys: (keyof T)[]) {
  const copy = { ...object };
  for (const key of keys) delete copy[key];
  return copy;
}

/** An analysis result as process_clips_session prints it, accumulated onto a saved spec */
function accumulated(base: Spec) {
  const x = base.x.map((v, i) => Math.round((v + (i % 2)) * 100) / 100);
  const raw = x.map((v) => Math.round((v / 0.73) * 100) / 100);
  return {
    success: true,
    spec: {
      name: base.name,
      rpm: 1075,
      multiplier: 0.73,
      mags: base.mags,
      mods: {},
      x,
      y: base.y,
      raw_1x_x: raw,
      raw_1x_y: base.y.map((v) => Math.round((v / 0.73) * 100) / 100),
      time_points: base.x.map((_, i) => Math.round((i * 60000) / 1075)),
      ping_points: [],
      sample_count: 4,
      standalone_batch_spec: {
        ...base,
        rpm: 1075,
        mags: [{ size: base.x.length, audio: `${base.name}_${base.x.length}` }],
      },
      existing_sample_count: 3,
      new_sample_count: 1,
      total_sample_count: 4,
      merge_strategy: 'accumulate',
    },
    convergence: { convergence_score: 87.5, outlier_trials: [] },
    trials_count: 1,
    measured_rpm: 1075.4,
    zoom: 2,
    fov: 104,
    preview_image: 'data:image/jpeg;base64,AAA',
    preview_points: [
      [960, 540],
      [962, 520],
    ],
    preview_origin: [960, 540],
    frame_width: 1920,
    frame_height: 1080,
    individual_trials: [
      {
        source: 'spray_01.webm',
        shots: 31,
        x: [0, 1],
        y: [0, -20],
        raw_x: [0, 1],
        raw_y: [0, -20],
        frame_points: [
          [960, 540],
          [962, 520],
        ],
        origin: [960, 540],
        frame_image: 'data:image/jpeg;base64,BBB',
        frame_width: 1920,
        frame_height: 1080,
        rpm: 1075.4,
      },
    ],
    diff_report: {},
    distance: 20,
    saved_to_disk: true,
  };
}

describe('analysis requests', () => {
  it('send the setup and the spec as it stands', () => {
    const r99 = { ...spec('r99'), sample_count: 3 };
    const choice = { weapon: 'r99', mode: 'auto', saveCapture: true, strategy: 'accumulate' as const };
    const setup = { distance: 20, zoom: 2, fov: 104, hdr: 'hdr-standard' as const };
    expect(analysisParams(choice, setup, r99)).toEqual({
      weapon: 'r99',
      mode: 'auto',
      save_capture: true,
      strategy: 'accumulate',
      existing_samples: 3,
      distance: 20,
      zoom: 2,
      fov: 104,
      hdr: 'hdr-standard',
      shots: 33,
      rpm: 1080,
      multiplier: 0.73,
    });
    expect(analysisParams(choice, setup, undefined)).toEqual({
      weapon: 'r99',
      mode: 'auto',
      save_capture: true,
      strategy: 'accumulate',
      existing_samples: 1,
      distance: 20,
      zoom: 2,
      fov: 104,
      hdr: 'hdr-standard',
    });
  });
});

describe('analysis results', () => {
  it('are checked as they arrive', () => {
    const parsed = analysisResult.parse(accumulated(spec('r99')));
    expect(parsed.individual_trials[0].frame_points).toHaveLength(2);
    // Missing optional parts take their defaults
    const bare = analysisResult.parse({
      ...accumulated(spec('r99')),
      individual_trials: undefined,
      preview_points: null,
    });
    expect(bare.individual_trials).toEqual([]);
    expect(bare.preview_points).toEqual([]);
    expect(analysisResult.safeParse({ spec: {} }).success).toBe(false);
  });

  it('take a result that found no shots', () => {
    // The pipeline reports an empty pattern with a magazine of 0 shots
    const empty = { name: 'r301', rpm: 810, multiplier: 0.73, mags: [{ size: 0, audio: 'r301_0' }], mods: {} };
    const result = analysisResult.parse({
      ...accumulated(spec('r301')),
      spec: { ...empty, x: [], y: [], time_points: [], raw_1x_x: [], raw_1x_y: [] },
      individual_trials: [],
    });
    const choice = { weapon: 'r301', mode: 'auto', saveCapture: true, strategy: 'overwrite' as const };
    const outcome = applyAnalysis(result, { choice, saved: spec('r301'), draft: spec('r301'), sent: 1, zoom: 2 });
    expect(outcome.shots).toBe(0);
    expect(outcome.draft.mags).toEqual(spec('r301').mags);
  });

  it("put the measured pattern into the weapon's spec and keep the rest", () => {
    const saved = spec('r99');
    const draft = { ...saved, sample_count: 3, mags: saved.mags.slice(0, 4) };
    const result = analysisResult.parse(accumulated(saved));
    const choice = { weapon: 'r99', mode: 'auto', saveCapture: true, strategy: 'accumulate' as const };
    const outcome = applyAnalysis(result, { choice, saved, draft, sent: 1, zoom: 2 });

    expect(outcome.draft).toEqual({
      ...draft,
      x: result.spec.x,
      y: result.spec.y,
      rpm: 1075,
      time_points: result.spec.time_points,
      raw_1x_x: result.spec.raw_1x_x,
      raw_1x_y: result.spec.raw_1x_y,
      sample_count: 4,
    });
    expect(outcome.session).toMatchObject({
      weapon: 'r99',
      baseline: saved,
      strategy: 'accumulate',
      sampleCount: 4,
      existingSamples: 3,
      newSamples: 1,
      previewImage: 'data:image/jpeg;base64,AAA',
      frameWidth: 1920,
      zoom: 2,
    });
    expect(outcome.session.batch?.mags).toEqual([{ size: 33, audio: 'r99_33' }]);
    expect(outcome.session.candidate.total_sample_count).toBe(4);
    expect(outcome.report).toEqual(discrepancyReport(saved, outcome.draft, 2));
    expect(outcome).toMatchObject({
      trials: 1,
      shots: 33,
      expected: 27,
      shortTrials: [],
      measuredRpm: 1075.4,
      convergence: 87.5,
      savedToDisk: true,
    });
  });

  it('count short sprays and samples when the server gives no totals', () => {
    const saved = spec('r301');
    const raw = accumulated(saved);
    const result = analysisResult.parse({
      ...raw,
      spec: without(raw.spec, 'total_sample_count', 'sample_count'),
      trials_count: 2,
      individual_trials: [raw.individual_trials[0], { ...raw.individual_trials[0], shots: 37 }],
    });
    const choice = { weapon: 'r301', mode: 'auto', saveCapture: false, strategy: 'accumulate' as const };
    const outcome = applyAnalysis(result, {
      choice,
      saved,
      draft: { ...saved, sample_count: 5 },
      sent: 2,
      zoom: 3,
      pxPerCount: 1.4,
    });
    expect(outcome.draft.sample_count).toBe(7);
    expect(outcome.shortTrials).toEqual([0]);
    expect(outcome.report).toEqual(discrepancyReport(saved, outcome.draft, 3, 1.4));

    // Without a spec of its own, the weapon takes the analysis' spec, without the analysis' bookkeeping
    const fresh = applyAnalysis(result, { choice, saved: undefined, draft: undefined, sent: 2, zoom: 2 });
    expect(fresh.draft).not.toHaveProperty('standalone_batch_spec');
    expect(fresh.draft).not.toHaveProperty('merge_strategy');
    expect(fresh.session.baseline.x).toEqual(result.spec.x);
  });

  it('drop raw values the new pattern has none of', () => {
    const havoc = spec('havoc_tc');
    const raw = accumulated(havoc);
    const result = analysisResult.parse({ ...raw, spec: without(raw.spec, 'raw_1x_x', 'raw_1x_y') });
    const choice = { weapon: 'havoc_tc', mode: 'auto', saveCapture: false, strategy: 'overwrite' as const };
    expect(applyAnalysis(result, { choice, saved: havoc, draft: havoc, sent: 1, zoom: 2 }).draft).not.toHaveProperty(
      'raw_1x_x',
    );
  });

  it('describe how the samples were merged', () => {
    expect(describeIntegration({ strategy: 'accumulate', existingSamples: 3, newSamples: 1, sampleCount: 4 })).toBe(
      'Blended: 3 saved + 1 new = 4 samples',
    );
    expect(describeIntegration({ strategy: 'overwrite', newSamples: 1, sampleCount: 1 })).toBe(
      'New baseline from 1 sample',
    );
  });

  it('list a frame per spray', () => {
    const outcome = applyAnalysis(analysisResult.parse(accumulated(spec('r99'))), {
      choice: { weapon: 'r99', mode: 'auto', saveCapture: true, strategy: 'accumulate' },
      saved: spec('r99'),
      draft: spec('r99'),
      sent: 1,
      zoom: 2,
    });
    expect(sessionFrames(outcome.session)).toEqual([
      { name: 'spray_01.webm', src: 'data:image/jpeg;base64,BBB', shots: 31 },
    ]);
    expect(sessionFrames({ ...outcome.session, trials: [] })).toEqual([
      { name: 'Preview', src: 'data:image/jpeg;base64,AAA', shots: 2 },
    ]);
  });
});
