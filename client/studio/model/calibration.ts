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

import type { DecalSource } from './session';
import { unitShot, type Pattern } from './spec';

// How far one mouse count at 1x moves the aim on a screenshot, in image pixels: worked out from the
// optic, the field of view and the image height (Source's perspective projection), or measured from
// the decals an analysis found. Moved from client/modules/analysis/DiscrepancyInspector.ts and
// client/modules/editor/calibration.ts.

/**
 * Mouse counts per screen pixel at 1x on a 1080p screen: Source's 0.022° per count over Apex's ADS
 * field of view (1 count is about 0.2976 px).
 */
export const COUNTS_PER_PIXEL_1080P = 3.36;

/** Image pixels per mouse count at 1x. Missing or invalid values take the defaults (1080 px, 2x, 104°) */
export function mouseToPixelScale(imageHeight = 1080, zoom = 2, fov = 104, scaleFactor = 1): number {
  const z = zoom > 0 ? zoom : 2;
  const h = imageHeight > 0 ? imageHeight : 1080;
  const f = fov > 0 ? fov : 104;
  // The focal length scales with 1 / tan(fov / 2): 1 at 90°, 0.78128 at 104°
  const fovFactor = 1 / Math.tan((f * Math.PI) / 360);
  return (z / COUNTS_PER_PIXEL_1080P) * (h / 1080) * fovFactor * scaleFactor;
}

/** Decals found on a frame, in image pixels, and where the spray starts */
export interface Decals {
  points: [number, number][];
  origin: [number, number];
}

const isSet = (p: [number, number] | undefined): p is [number, number] => !!p && (p[0] > 0 || p[1] > 0);

/**
 * The decals of spray `index`, else the preview's, else any spray's that has some. The origin is the
 * one the analysis reported, or the first decal when it reported none.
 */
export function captureDecals(session: DecalSource | null | undefined, index: number | null): Decals | null {
  if (!session) return null;
  const fromTrial = (t: DecalSource['trials'][number]): Decals => ({
    points: t.frame_points,
    origin: isSet(t.origin) ? [t.origin[0], t.origin[1]] : [t.frame_points[0][0], t.frame_points[0][1]],
  });
  const trial = index === null ? undefined : session.trials[index];
  if (trial && trial.frame_points.length > 0) return fromTrial(trial);
  if (session.previewPoints.length > 0) {
    const origin = isSet(session.previewOrigin) ? session.previewOrigin : session.previewPoints[0];
    return { points: session.previewPoints, origin: [origin[0], origin[1]] };
  }
  const any = session.trials.find((t) => t.frame_points.length > 0);
  return any ? fromTrial(any) : null;
}

/**
 * Image pixels per mouse count at 1x, measured: the least-squares fit of the decals' offsets from the
 * origin onto the pattern's shots (or the ratio of their summed lengths when that fails). Null with
 * fewer than two shots on either side.
 */
export function captureToSpecScale(decals: Decals | null | undefined, spec: Pattern | null | undefined): number | null {
  if (!decals || decals.points.length < 2) return null;
  if (!spec || spec.x.length < 2) return null;
  const n = Math.min(decals.points.length, spec.x.length);

  let dot = 0;
  let specNormSq = 0;
  let capturedLength = 0;
  let specLength = 0;
  for (let i = 1; i < n; i++) {
    const cx = decals.points[i][0] - decals.origin[0];
    const cy = decals.points[i][1] - decals.origin[1];
    const s = unitShot(spec, i);
    dot += cx * s.x + cy * s.y;
    specNormSq += s.x * s.x + s.y * s.y;
    capturedLength += Math.hypot(cx, cy);
    specLength += Math.hypot(s.x, s.y);
  }
  if (specNormSq > 0.0001 && dot > 0.0001) return dot / specNormSq;
  if (specLength > 0.0001 && capturedLength > 0.0001) return capturedLength / specLength;
  return null;
}
