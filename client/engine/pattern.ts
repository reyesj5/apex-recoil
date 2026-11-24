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

// Recoil patterns: scaled for the player's sensitivity, placed on screen, and the path the trainer
// shows to follow. Moved from client/game.ts; the drawing stays with the renderer.

import { Point } from './point';
import type { FireMode, Weapon, WeaponModeConfig } from './weapons';

export function clamp(x: number, from: number, to: number) {
  if (!Number.isFinite(x)) return from;
  return Math.max(from, Math.min(to, x));
}

/** How much the pattern shrinks or grows with the in-game sensitivity (5 is 0.2) */
export function sensitivityScale(sens: number): number {
  return clamp(1 / sens, 0.1, 10);
}

export interface PatternOptions {
  /** Mouse sensitivity times the ADS multiplier, as in the game */
  sens: number;
  invertY: boolean;
}

/** The first `count` rounds' recoil, scaled for the sensitivity: what runs are scored against */
export function recoilPattern(weapon: Weapon, count: number, { sens, invertY }: PatternOptions): Point[] {
  const sc = sensitivityScale(sens);
  const pattern = [];
  const my = invertY ? -1 : 1;
  for (let i = 0; i < count; i++) pattern.push(new Point(weapon.x[i], my * weapon.y[i]).s(sc));
  return pattern;
}

export interface ScreenScale {
  scaleX: number;
  scaleY: number;
}

/** A point stretched by the screen scale, which only changes what is drawn, never the score */
export function onScreen(p: Point, { scaleX, scaleY }: ScreenScale): Point {
  return p.clone().sx(scaleX).sy(scaleY);
}

/** The pattern's extent around its first round: [top left, bottom right] of first round minus each round */
export function patternBox(pattern: Point[]): [Point, Point] {
  const a = new Point();
  const b = new Point();
  pattern.forEach((p) => {
    const d = pattern[0].clone().sub(p);
    a.x = Math.min(a.x, d.x);
    a.y = Math.min(a.y, d.y);
    b.x = Math.max(b.x, d.x);
    b.y = Math.max(b.y, d.y);
  });
  return [a, b];
}

export interface HintPath {
  /** Lines to draw; a reset line shows the recoil going back between shots or bursts */
  lines: { points: Point[]; reset: boolean }[];
  /** A dot per round, with its number */
  dots: { at: Point; label: number }[];
}

/**
 * The path a player follows, drawn from `start`: one line through the spray in full auto, a line per
 * burst with the way back, or each single shot's kick and its way back.
 */
export function hintPath(pattern: Point[], mag: number, mode: FireMode, cfg: WeaponModeConfig, start: Point): HintPath {
  const lines: HintPath['lines'] = [];
  const dots: HintPath['dots'] = [];
  if (mode === 'single') {
    // Single-fire: each shot kicks up from center and recovers back to center
    for (let i = 0; i < mag; i++) {
      let kick: Point;
      if (i === 0) {
        kick = pattern.length > 1 ? pattern[1].clone().sub(pattern[0]) : pattern[0]?.clone() || new Point();
      } else {
        kick = pattern[i].clone().sub(pattern[i - 1]);
      }
      if (kick.length() < 1 && pattern.length > 1) {
        kick = pattern[1].clone();
      }
      const xy = start.clone().sub(kick);
      lines.push({ points: [start.clone(), xy], reset: false });
      lines.push({ points: [xy.clone(), start.clone()], reset: true });
      dots.push({ at: xy, label: i + 1 });
    }
  } else if (mode === 'burst') {
    // Burst mode: segmented burst curves with recovery lines between bursts
    const B = cfg.burstSize || 3;
    const numBursts = Math.ceil(mag / B);
    for (let b = 0; b < numBursts; b++) {
      const burstStartIdx = b * B;
      const burstEndIdx = Math.min((b + 1) * B - 1, mag - 1);
      if (burstStartIdx > burstEndIdx) break;
      const basePoint = pattern[burstStartIdx];
      const burstPoints: Point[] = [];
      let lastXy: Point = start.clone();
      for (let i = burstStartIdx; i <= burstEndIdx; i++) {
        const relKick = pattern[i].clone().sub(basePoint);
        const xy = start.clone().sub(relKick);
        burstPoints.push(xy);
        lastXy = xy;
        dots.push({ at: xy, label: i });
      }
      if (burstPoints.length >= 2) lines.push({ points: burstPoints, reset: false });
      if (lastXy.distance(start) > 2) lines.push({ points: [lastXy.clone(), start.clone()], reset: true });
    }
  } else {
    // Full auto: single continuous polyline
    const points: Point[] = [];
    pattern.forEach((p, i) => {
      if (i >= mag) return;
      const xy = start.clone().sub(p);
      points.push(xy);
      dots.push({ at: xy, label: i });
    });
    lines.push({ points, reset: false });
  }
  return { lines, dots };
}
