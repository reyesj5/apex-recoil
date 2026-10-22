/**
* Copyright 2021 Mikhail Goncharov
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

// Capture-to-spec scaling (optic zoom, FOV, mouse-to-pixel) and discrepancy reports. The math lives in
// modules/analysis/DiscrepancyInspector.ts; these wrappers supply the editor's current settings.
import { DiscrepancyReport } from '../types';
import {
  computeCaptureToSpecScale as computeCaptureScaleUtil,
  computeDiscrepancyReport as computeReportUtil
} from '../analysis/DiscrepancyInspector';
import { activeSessionData, activeOpticZoom, currentBgImageObj, activeBatchIndex } from './state';
import { activeScaleFactor } from './toolbar';

/**
 * Calibration constant converting Source Engine in-game mouse counts (mickeys)
 * to 1080p 1x screen pixels on a wall screenshot.
 * Derived from Source Engine sensitivity coefficient (0.022 deg/count) and
 * Apex Legends ADS Field of View geometry (1 count = ~0.2976 px @ 1080p 1x, or 3.36 counts/px).
 */
export const CALIBRATION_MOUSE_TO_1080P_PX = 1.0 / 3.36; // ~0.2976

export function getActiveOpticZoom(): number {
  const staticOptic = document.getElementById('static-optic-select') as HTMLSelectElement | null;
  const liveOptic = document.getElementById('capture-optic-select') as HTMLSelectElement | null;
  if (staticOptic && staticOptic.value) return parseFloat(staticOptic.value) || 2.0;
  if (liveOptic && liveOptic.value) return parseFloat(liveOptic.value) || 2.0;
  return activeOpticZoom || 2.0;
}

export function getActiveFOV(): number {
  const staticFov = document.getElementById('static-fov-input') as HTMLInputElement | null;
  const liveFov = document.getElementById('capture-fov-input') as HTMLInputElement | null;
  if (staticFov && staticFov.value) return parseFloat(staticFov.value) || 104.0;
  if (liveFov && liveFov.value) return parseFloat(liveFov.value) || 104.0;
  return (activeSessionData as any)?.fov || 104.0;
}

export function getMouseToPixelScale(imgHeight?: number, zoom?: number, fov?: number): number {
  const z = (zoom && zoom > 0) ? zoom : getActiveOpticZoom();
  const h = (imgHeight && imgHeight > 0)
    ? imgHeight
    : (currentBgImageObj?.height() || activeSessionData?.frame_height || 1080);
  const f = (fov && fov > 0) ? fov : getActiveFOV();
  // Source Engine perspective projection: focal length scales with 1.0 / tan(fov / 2)
  // At reference FOV 90 deg: tan(45 deg) = 1.0 -> fovFactor = 1.0
  // At FOV 104 deg: tan(52 deg) = 1.2799 -> fovFactor = 0.78128
  const fovFactor = 1.0 / Math.tan((f * Math.PI) / 360);
  return (z / 3.36) * (h / 1080) * fovFactor * activeScaleFactor;
}

/**
 * Retrieves the ground-truth decal points [x, y] in screenshot pixel coordinates
 * for the currently active trial or preview session.
 */
export function getActiveCaptureDecals(trialIndex?: number | null): { points: [number, number][], origin: [number, number] } | null {
  if (!activeSessionData) return null;

  const idx = (trialIndex !== undefined && trialIndex !== null) ? trialIndex : activeBatchIndex;

  // 1. Try specified or active batch trial
  if (idx !== null && activeSessionData.individual_trials?.[idx]) {
    const trial = activeSessionData.individual_trials[idx];
    if (trial.frame_points && trial.frame_points.length > 0) {
      const orig = (trial.origin && (trial.origin[0] > 0 || trial.origin[1] > 0))
        ? trial.origin
        : trial.frame_points[0];
      return { points: trial.frame_points, origin: [orig[0], orig[1]] };
    }
  }

  // 2. Try session preview_points
  if (activeSessionData.preview_points && activeSessionData.preview_points.length > 0) {
    const orig = (activeSessionData.preview_origin && (activeSessionData.preview_origin[0] > 0 || activeSessionData.preview_origin[1] > 0))
      ? activeSessionData.preview_origin
      : activeSessionData.preview_points[0];
    return { points: activeSessionData.preview_points, origin: [orig[0], orig[1]] };
  }

  // 3. Fallback: try any trial that has frame_points
  if (activeSessionData.individual_trials) {
    for (const trial of activeSessionData.individual_trials) {
      if (trial.frame_points && trial.frame_points.length > 0) {
        const orig = (trial.origin && (trial.origin[0] > 0 || trial.origin[1] > 0))
          ? trial.origin
          : trial.frame_points[0];
        return { points: trial.frame_points, origin: [orig[0], orig[1]] };
      }
    }
  }

  return null;
}

/**
 * Computes the empirical scaling factor (in screenshot pixels per 1x spec unit)
 * mapping canonical spec coordinates directly to the screenshot wall decals.
 * Defaults to the active session's spec; the math lives in modules/analysis/DiscrepancyInspector.ts.
 */
export function computeCaptureToSpecScale(
  captureDecals: { points: [number, number][], origin: [number, number] } | null,
  referenceSpec?: any
): number | null {
  const spec = referenceSpec || activeSessionData?.candidate_spec || activeSessionData?.spec || activeSessionData?.baseline_spec;
  return computeCaptureScaleUtil(captureDecals, spec);
}

/**
 * Discrepancy report using the editor's current optic zoom, background height, FOV and
 * canvas scale (see modules/analysis/DiscrepancyInspector.ts).
 */
export function computeDiscrepancyReport(
  baselineSpec: any,
  candidateSpec: any,
  zoom?: number,
  imgH?: number,
  captureScaleOverride?: number
): DiscrepancyReport {
  const z = zoom || activeOpticZoom || 2.0;
  const h = imgH || currentBgImageObj?.height() || 1080;
  const mouseToPx = (captureScaleOverride && captureScaleOverride > 0)
    ? captureScaleOverride
    : getMouseToPixelScale(h, z);
  return computeReportUtil(baselineSpec, candidateSpec, z, h, mouseToPx, activeSessionData?.merge_strategy ?? '');
}
