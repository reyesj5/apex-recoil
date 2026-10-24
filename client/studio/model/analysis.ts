/**
 * Copyright 2021 Mikhail Goncharov
 * Modified by [OWNER NAME], 2025-2026.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { AnalysisParams } from '@/lib/api';
import { discrepancyReport, type Report } from './discrepancy';
import type { AnalysisResult, Session } from './session';
import { expectedShots, type Spec } from './spec';

// Analyses from the Studio's side: the settings a request carries, and what a result changes. The
// weapon's working spec takes the measured pattern (its magazines, multiplier and attachments stay),
// and the session keeps the saved spec, the candidate and each spray's frame for the canvas. Moved
// from client/modules/editor/screenshots.ts and capture_studio.ts.

export type Strategy = 'accumulate' | 'overwrite';

export type HdrMode = 'hdr-standard' | 'hdr-vibrant' | 'off';

/** The Setup panel's values */
export interface Setup {
  /** Meters to the wall */
  distance: number;
  zoom: number;
  fov: number;
  hdr: HdrMode;
}

export interface AnalysisChoice {
  weapon: string;
  mode: string;
  saveCapture: boolean;
  strategy: Strategy;
}

/** The request's settings: the choices, the setup, and the weapon's spec as it stands (fire rate, multiplier, full magazine) */
export function analysisParams(choice: AnalysisChoice, setup: Setup, spec: Spec | undefined): AnalysisParams {
  const shots = spec ? expectedShots(spec.mags) : 0;
  return {
    weapon: choice.weapon,
    mode: choice.mode,
    save_capture: choice.saveCapture,
    strategy: choice.strategy,
    existing_samples: spec?.sample_count || 1,
    distance: setup.distance,
    zoom: setup.zoom,
    fov: setup.fov,
    hdr: setup.hdr,
    ...(shots > 0 ? { shots } : {}),
    ...(spec ? { rpm: spec.rpm } : {}),
    ...(spec?.multiplier ? { multiplier: spec.multiplier } : {}),
  };
}

export interface AnalysisContext {
  choice: AnalysisChoice;
  /** The weapon's saved spec (Compare and the checkpoint measure against it) */
  saved: Spec | undefined;
  /** The weapon's working spec before the analysis */
  draft: Spec | undefined;
  /** How many sprays or screenshots were sent */
  sent: number;
  /** The optic's zoom the analysis ran with */
  zoom: number;
  /** Image pixels per mouse count at 1x for the report; the default is a 1080p screenshot at `zoom` */
  pxPerCount?: number;
}

export interface AnalysisOutcome {
  session: Session;
  /** The weapon's working spec with the measured pattern */
  draft: Spec;
  /** The candidate against the saved spec */
  report: Report;
  trials: number;
  shots: number;
  /** What a full spray should have: the largest magazine */
  expected: number;
  /** Sprays with fewer shots than expected */
  shortTrials: number[];
  measuredRpm?: number;
  convergence?: number;
  savedToDisk: boolean;
}

/** The analysis' bookkeeping, which a spec saved from it doesn't keep */
const analysisFields = [
  'standalone_batch_spec',
  'merge_strategy',
  'existing_sample_count',
  'new_sample_count',
  'total_sample_count',
];

export function applyAnalysis(
  result: AnalysisResult,
  { choice, saved, draft, sent, zoom, pxPerCount }: AnalysisContext,
): AnalysisOutcome {
  const spec = result.spec;
  const trials = result.trials_count || sent;
  const existing = draft?.sample_count || 1;
  const sampleCount =
    spec.total_sample_count || spec.sample_count || (choice.strategy === 'accumulate' ? existing + trials : trials);
  const baseline = structuredClone(saved ?? draft ?? spec);

  const next: Spec = draft
    ? {
        ...draft,
        x: spec.x,
        y: spec.y,
        rpm: spec.rpm,
        time_points: spec.time_points,
        sample_count: sampleCount,
        ...(spec.raw_1x_x && spec.raw_1x_y ? { raw_1x_x: spec.raw_1x_x, raw_1x_y: spec.raw_1x_y } : {}),
      }
    : { ...spec, sample_count: sampleCount };
  for (const key of analysisFields) delete (next as Record<string, unknown>)[key];
  // Raw values from before would draw the old pattern on a screenshot
  if (!(spec.raw_1x_x && spec.raw_1x_y)) {
    delete next.raw_1x_x;
    delete next.raw_1x_y;
  }

  const expected = expectedShots(next.mags);
  const session: Session = {
    weapon: choice.weapon,
    mode: choice.mode,
    baseline,
    candidate: structuredClone(spec),
    ...(spec.standalone_batch_spec ? { batch: spec.standalone_batch_spec } : {}),
    strategy: spec.merge_strategy ?? choice.strategy,
    sampleCount,
    ...(spec.existing_sample_count !== undefined ? { existingSamples: spec.existing_sample_count } : {}),
    newSamples: spec.new_sample_count || trials,
    ...(result.preview_image ? { previewImage: result.preview_image } : {}),
    previewPoints: result.preview_points,
    previewOrigin: result.preview_origin,
    frameWidth: result.frame_width,
    frameHeight: result.frame_height,
    trials: result.individual_trials,
    zoom,
  };

  return {
    session,
    draft: next,
    report: discrepancyReport(baseline, next, zoom, pxPerCount),
    trials,
    shots: spec.x.length,
    expected,
    shortTrials: result.individual_trials.flatMap((t, i) => (expected > 0 && t.shots < expected ? [i] : [])),
    ...(result.measured_rpm ? { measuredRpm: result.measured_rpm } : {}),
    ...(typeof result.convergence?.convergence_score === 'number'
      ? { convergence: result.convergence.convergence_score }
      : {}),
    savedToDisk: Boolean(result.saved_to_disk),
  };
}

/** How the new samples went into the spec, in words */
export function describeIntegration(
  session: Pick<Session, 'strategy' | 'existingSamples' | 'newSamples' | 'sampleCount'>,
) {
  const plural = (n: number) => `${n} sample${n === 1 ? '' : 's'}`;
  if (session.strategy === 'accumulate' && session.existingSamples) {
    return `Blended: ${session.existingSamples} saved + ${session.newSamples} new = ${plural(session.sampleCount)}`;
  }
  return `New baseline from ${plural(session.newSamples)}`;
}

/** The frames a session can show, one per spray (its frame, or the preview for a spray without one) */
export function sessionFrames(session: Session): { name: string; src?: string; shots: number }[] {
  if (session.trials.length === 0) {
    return session.previewImage
      ? [{ name: 'Preview', src: session.previewImage, shots: session.previewPoints.length }]
      : [];
  }
  return session.trials.map((t, i) => ({
    name: t.source || `Spray ${i + 1}`,
    src: t.frame_image ?? session.previewImage,
    shots: t.shots,
  }));
}
