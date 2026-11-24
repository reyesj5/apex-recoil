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

import { shotToWorld, worldToShot, type Placement } from './placement';
import { shotsOf, type Pt, type Shot, type Spec } from './spec';

// Editing a pattern on the canvas: shots are added where they fit the sequence, moved, removed, and
// marked as anchors. The canvas holds each shot's position and, while it hasn't moved, its spec
// values; measureShots turns the canvas back into the spec's shots. Moved from
// client/modules/editor/canvas.ts.

/** A shot on the canvas: where it is, and the spec values it had while it hasn't moved */
export interface CanvasShot {
  at: Pt;
  spec?: Shot;
}

export function canvasShots(spec: Spec, placement: Placement): CanvasShot[] {
  return shotsOf(spec).map((shot, i) => ({ at: shotToWorld(spec, i, placement), spec: shot }));
}

const atZero = (shot: Shot | undefined) => !!shot && shot.x === 0 && shot.y === 0;

/**
 * The spec's shots for the canvas. A pattern starts at (0, 0), so while shot 0 stays where it was the
 * unmoved shots keep their values and the others are measured from it; once shot 0 has moved (or was
 * removed) every shot is measured from the new shot 0.
 */
export function measureShots(shots: CanvasShot[], placement: Placement, spec: Spec): Shot[] {
  if (shots.length === 0) return [];
  const first = shots[0];
  if (atZero(first.spec)) return shots.map((s) => s.spec ?? worldToShot(s.at, first.at, placement, spec));
  return shots.map((s, i) => (i === 0 ? zeroShot(spec) : worldToShot(s.at, first.at, placement, spec)));
}

const zeroShot = (spec: Spec): Shot => ({
  x: 0,
  y: 0,
  ...(spec.raw_1x_x && spec.raw_1x_y ? { raw: { x: 0, y: 0 } } : {}),
});

/**
 * Where a shot added at `p` goes in the sequence: before the first shot or after the last when it
 * lies beyond that end (cheaper when it continues the pattern's direction), otherwise into the segment
 * it is nearest, preferring a segment's middle to its ends.
 */
export function insertionIndex(points: Pt[], p: Pt): number {
  const n = points.length;
  if (n < 2) return n;
  let best = n;
  let minCost = Infinity;

  // Before the first shot: cheaper when the pattern runs away from the new one
  const first = points[0];
  const toFirst = { x: first.x - p.x, y: first.y - p.y };
  const firstDir = { x: points[1].x - first.x, y: points[1].y - first.y };
  const startCost =
    Math.hypot(p.x - first.x, p.y - first.y) * (toFirst.x * firstDir.x + toFirst.y * firstDir.y > 0 ? 0.75 : 1);
  if (startCost < minCost) {
    minCost = startCost;
    best = 0;
  }

  // After the last shot: cheaper when the new one continues the pattern
  const last = points[n - 1];
  const lastDir = { x: last.x - points[n - 2].x, y: last.y - points[n - 2].y };
  const fromLast = { x: p.x - last.x, y: p.y - last.y };
  const endCost = Math.hypot(fromLast.x, fromLast.y) * (fromLast.x * lastDir.x + fromLast.y * lastDir.y > 0 ? 0.75 : 1);
  if (endCost < minCost) {
    minCost = endCost;
    best = n;
  }

  // Between two shots: the distance to the segment, plus 15 near its ends
  for (let i = 0; i < n - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const lengthSq = vx * vx + vy * vy;
    if (lengthSq < 1e-4) continue;
    const t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / lengthSq;
    const clamped = Math.max(0, Math.min(1, t));
    const distance = Math.hypot(p.x - (a.x + clamped * vx), p.y - (a.y + clamped * vy));
    const cost = distance + (t >= 0.05 && t <= 0.95 ? 0 : 15);
    if (cost < minCost) {
      minCost = cost;
      best = i + 1;
    }
  }
  return best;
}

export interface Edit {
  shots: CanvasShot[];
  anchors: number[];
}

/** Adds a shot at `at` where it fits the sequence; anchors after it move along */
export function addShot({ shots, anchors }: Edit, at: Pt): Edit & { index: number } {
  const index = insertionIndex(
    shots.map((s) => s.at),
    at,
  );
  return {
    shots: [...shots.slice(0, index), { at }, ...shots.slice(index)],
    anchors: anchors.map((a) => (a >= index ? a + 1 : a)),
    index,
  };
}

export function moveShot({ shots, anchors }: Edit, index: number, at: Pt): Edit {
  return { shots: shots.map((s, i) => (i === index ? { at } : s)), anchors };
}

export function removeShot({ shots, anchors }: Edit, index: number): Edit {
  return {
    shots: shots.filter((_, i) => i !== index),
    anchors: anchors.filter((a) => a !== index).map((a) => (a > index ? a - 1 : a)),
  };
}

/** Marks a shot as an anchor for the legacy distance calibration, or unmarks it */
export const toggleAnchor = (anchors: number[], index: number) =>
  anchors.includes(index) ? anchors.filter((a) => a !== index) : [...anchors, index].sort((a, b) => a - b);

/**
 * The pattern as the original apex-recoil editor exported it (version 2): shot offsets from shot 0 in
 * canvas pixels, rounded, with the anchors and their in-game distance. The Manual tab shows it.
 */
export function legacySpec({
  weapon,
  points,
  anchors,
  barrel,
  stock,
  comment,
  distance,
}: {
  weapon: string;
  points: Pt[];
  anchors: number[];
  barrel: number;
  stock: number;
  comment: string;
  distance: number;
}) {
  const first = points[0] ?? { x: 0, y: 0 };
  return {
    version: 2,
    weapon,
    barrel,
    stock,
    comment,
    x: points.map((p) => Math.round(p.x - first.x)),
    y: points.map((p) => Math.round(p.y - first.y)),
    anchor_indexes: points.length ? anchors.filter((a) => a < points.length) : [],
    anchor_in_game_distance: distance,
  };
}
