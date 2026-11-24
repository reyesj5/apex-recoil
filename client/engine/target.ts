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

// The target. Still, it stays where the spray starts; moving, it glides at a steady speed from one
// random point of the start area to the next. Moved from the Target class in client/game.ts with the
// drawing taken out; the random numbers come from outside, so tests can fix them.

import { Point } from './point';

export interface Rect {
  topLeft: Point;
  bottomRight: Point;
}

export function pointInRect(p: Point, r: Rect) {
  return p.x >= r.topLeft.x && p.x <= r.bottomRight.x && p.y >= r.topLeft.y && p.y <= r.bottomRight.y;
}

export class Target {
  moving = false;
  /** Where it is heading */
  next = new Point();
  /** The start area it moves in */
  area: Rect = { topLeft: new Point(0, 0), bottomRight: new Point(10, 10) };
  private pos = new Point(-10, -10);
  private v = 1;
  private targetSpeed = 100;
  private sensScale = 0.2;
  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  /** Applies the settings: moving or not, the target speed (game::target-speed) and the sensitivity's scale */
  configure(area: Rect, moving: boolean, targetSpeed: number, sensScale: number) {
    this.area = area;
    this.moving = moving;
    this.targetSpeed = targetSpeed;
    this.sensScale = sensScale;
    this.v = (targetSpeed * sensScale) / 1000;
    if (this.moving && !pointInRect(this.pos, area)) {
      this.pos.x = Math.max(0, (area.topLeft.x + area.bottomRight.x) / 2);
      this.pos.y = Math.max(0, (area.topLeft.y + area.bottomRight.y) / 2);
    }
    this.pickNext();
  }

  pickNext() {
    const d = this.area.bottomRight.clone().sub(this.area.topLeft);
    d.x *= this.random();
    d.y *= this.random();
    d.add(this.area.topLeft);
    this.next = d;
    this.v = (this.targetSpeed * this.sensScale) / 1000;
  }

  /** Moves a moving target by `dt` ms; returns whether it moved */
  step(dt: number): boolean {
    if (!this.moving) return false;
    const d = this.next.clone().sub(this.pos);
    const move = dt * this.v;
    if (d.length() < move) {
      this.pickNext();
    } else {
      this.pos.add(d.s(move / d.length()));
    }
    return true;
  }

  position(p?: Point): Point {
    if (p) this.pos = p.clone();
    return this.pos.clone();
  }
}
