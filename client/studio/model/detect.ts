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

import type { Pt } from './spec';

// The Manual tab's decal finder, from the original apex-recoil editor: pixels darker than the
// threshold (red channel) are marked, and each blob of marked pixels whose size is within the target
// range becomes a target at its darkest pixel. Moved from client/modules/editor/canvas.ts (autoFilter),
// with the recursive flood fill replaced by a loop that visits the pixels in the same order, so a
// large dark area no longer overflows the call stack.

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, row by row, as ImageData holds it */
  data: Uint8ClampedArray;
}

export interface Detection {
  targets: Pt[];
  /** More blobs than this were found, so none are offered (the threshold is probably too high) */
  tooMany: boolean;
}

export const MAX_TARGETS = 100;

const UNMARKED = 1000;

// The eight neighbours and the pixel itself, in the order the original flood fill tried them
const steps: [number, number][] = [];
for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) steps.push([i, j]);

/** Finds the targets: blobs of pixels darker than `threshold` with `from` to `to` pixels each */
export function detectTargets(pixels: Pixels, threshold: number, from: number, to: number): Detection {
  const { width: w, height: h, data } = pixels;
  // Marked pixels hold their darkness (0 to 255); others, and visited ones, UNMARKED
  const mask = new Int16Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const v = data[(y * w + x) * 4];
      mask[x * h + y] = v < threshold ? v : UNMARKED;
    }
  }

  const targets: Pt[] = [];
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (mask[x * h + y] > 255) continue;
      const blob = fill(mask, w, h, x, y);
      if (blob.size >= from && blob.size <= to) targets.push({ x: blob.x, y: blob.y });
    }
  }
  return targets.length > MAX_TARGETS ? { targets: [], tooMany: true } : { targets, tooMany: false };
}

/**
 * Visits the blob at (x, y) depth first, as the original recursion did, and returns its size and its
 * first darkest pixel in that order.
 */
function fill(mask: Int16Array, w: number, h: number, x: number, y: number) {
  let size = 0;
  let best = { x, y, v: mask[x * h + y] };
  const stack: { x: number; y: number; step: number }[] = [];
  const enter = (px: number, py: number) => {
    const v = mask[px * h + py];
    mask[px * h + py] = UNMARKED;
    size++;
    if (v < best.v) best = { x: px, y: py, v };
    stack.push({ x: px, y: py, step: 0 });
  };
  enter(x, y);
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    if (frame.step === steps.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = steps[frame.step++];
    const nx = frame.x + dx;
    const ny = frame.y + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h || mask[nx * h + ny] > 255) continue;
    enter(nx, ny);
  }
  return { size, x: best.x, y: best.y };
}

/** The marked pixels as a red overlay (the Threshold switch), transparent elsewhere */
export function thresholdOverlay(pixels: Pixels, threshold: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(pixels.data.length);
  for (let p = 0; p < pixels.data.length; p += 4) {
    if (pixels.data[p] < threshold) {
      out[p] = 255;
      out[p + 3] = 255;
    }
  }
  return out;
}
