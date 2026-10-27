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

// One spray, from the first press to the score: when each round fires in full auto, burst or single
// fire, how far the recoil has kicked, and how close each round lands. Moved from the Shooting class
// in client/game.ts with the drawing, sound and clock taken out: the caller passes the time and the
// cursor on every frame and press, and draws what the run reports. Every step keeps the old order of
// operations, so a recorded run scores exactly as it did (run.test.ts).

import { clamp } from './pattern';
import { Point } from './point';
import { distanceScore } from './stats';
import type { FireMode, WeaponModeConfig } from './weapons';

export interface RunSetup {
  /** The recoil pattern for the player's sensitivity (recoilPattern), a point per round */
  pattern: Point[];
  /** When each round fires in full auto, in ms after the first (the weapon's time_points) */
  timePoints: number[];
  /** Rounds in the magazine */
  mag: number;
  mode: FireMode;
  /** The weapon's fire mode timings (getWeaponModeConfig) */
  fire: WeaponModeConfig;
  /** The weapon's rate of fire: the refire delay of single fire when the weapon names none */
  rpm?: number;
  /** Firing speed as stored (game::speed, 10 to 100 percent) */
  speedPercent: number;
  /** sensitivityScale(sens): distances are scored in the game's units */
  sensScale: number;
}

export interface Shot {
  /** The round's index in the magazine */
  index: number;
  /** When it fired */
  t: number;
  /** The cursor and the target when it fired */
  cursor: Point;
  target: Point;
  /** Where the player aimed relative to the target (cursor minus target) */
  aim: Point;
  /** How close it landed, 0 to 1 */
  score: number;
}

export interface RunResult {
  /** The average of the rounds' scores, 0 to 1 */
  score: number;
  /** The score out of 100, as shown and stored */
  points: number;
  shots: number;
  /** A full magazine at full speed goes into the history */
  counted: boolean;
  finishedAt: number;
}

export interface Recoil {
  /** How far the recoil has kicked the aim now, and where it will be on the next frame (24 ms on) */
  now: Point;
  next: Point;
}

export interface RunListener {
  onShot?(shot: Shot): void;
  onFinish?(result: RunResult): void;
}

export class Run {
  readonly shots: Shot[] = [];
  running = true;
  result: RunResult | null = null;
  readonly mode: FireMode;
  readonly speed: number;
  /** When a run whose last round has fired ends by itself (the recoil has settled) */
  finishAt: number | null = null;
  /** The recoil of the latest frame, the start's included; null once the run is over */
  recoil: Recoil | null = null;

  private readonly setup: RunSetup;
  private readonly listener: RunListener;
  private readonly startT: number;
  private score = 0;
  private hitIndex = -1; // Position in the pattern we already passed.
  private mouseDown = true;
  private burstSize: number;
  private burstDelayMs: number;
  private burstIntraMs: number;
  private refireDelayMs: number;
  private recoilResetMs: number;
  private lastShotTime = 0;
  private burstStartTime = 0;
  private burstEndTime = 0;
  private shotsInCurrentBurst = 0;
  private inBurstCooldown = false;
  private lastBurstPeak = new Point();

  /** Starts a run: the first press at time `t`, with the cursor and the target where they are */
  constructor(setup: RunSetup, t: number, cursor: Point, target: Point, listener: RunListener = {}) {
    this.setup = setup;
    this.listener = listener;
    this.startT = t;
    this.speed = clamp(setup.speedPercent / 100, 0.1, 1);
    this.mode = setup.mode;
    const cfg = setup.fire;
    this.burstSize = cfg.burstSize || 1;
    this.burstDelayMs = cfg.burstDelayMs || 200;
    this.burstIntraMs = cfg.burstIntraMs || 100;
    this.refireDelayMs = cfg.refireDelayMs || (setup.rpm ? 60000 / setup.rpm : 200);
    this.recoilResetMs = cfg.recoilResetMs || 150;

    if (this.mode === 'single') {
      this.lastShotTime = t;
      this.recordHit(0, t, cursor, target);
    } else if (this.mode === 'burst') {
      this.burstStartTime = t;
      this.shotsInCurrentBurst = 1;
      this.lastShotTime = t;
      this.recordHit(0, t, cursor, target);
    }
    this.frame(t, cursor, target);
  }

  /** Finishes the run if its last round's recoil has settled by time `t` */
  private settle(t: number) {
    if (this.running && this.finishAt !== null && t >= this.finishAt) this.finish(this.finishAt);
  }

  private recordHit(idx: number, t: number, cur: Point, target: Point) {
    this.hitIndex = idx;
    const sc = this.setup.sensScale;
    const p = this.setup.pattern[this.hitIndex];
    const aim = cur.clone().sub(target);
    const hit = cur.clone().add(p);
    const rawDistance = hit.distance(target) / sc;
    const s = distanceScore(rawDistance);
    this.score += s;
    const shot: Shot = { index: idx, t, cursor: cur.clone(), target: target.clone(), aim, score: s };
    this.shots.push(shot);
    this.listener.onShot?.(shot);
  }

  /** A press of the trigger while the run goes on: the next single shot, or the next burst */
  press(t: number, cursor: Point, target: Point): boolean {
    this.settle(t);
    if (!this.running) return false;
    if (this.mode === 'single') {
      this.mouseDown = true;
      if (t - this.lastShotTime < this.refireDelayMs) return true; // Refire cooldown in effect
      if (this.hitIndex + 1 < this.setup.mag) {
        this.lastShotTime = t;
        this.recordHit(this.hitIndex + 1, t, cursor, target);
        if (this.hitIndex + 1 >= this.setup.mag) this.finishAt = t + Math.min(this.recoilResetMs, 400);
      }
    } else if (this.mode === 'burst') {
      this.mouseDown = true;
      if (this.inBurstCooldown) {
        if ((t - this.burstEndTime) * this.speed >= this.burstDelayMs && this.hitIndex + 1 < this.setup.mag) {
          this.inBurstCooldown = false;
          this.burstStartTime = t;
          this.shotsInCurrentBurst = 1;
          this.lastShotTime = t;
          this.recordHit(this.hitIndex + 1, t, cursor, target);
          if (this.hitIndex + 1 >= this.setup.mag) {
            this.inBurstCooldown = true;
            this.burstEndTime = t;
            this.finishAt = t + Math.min(this.recoilResetMs, 300);
          }
        }
      }
    }
    return true;
  }

  /** The trigger let go: ends a full-auto spray */
  release(t: number) {
    this.settle(t);
    if (!this.running) return;
    this.mouseDown = false;
    if (this.mode === 'auto') this.finish(t);
  }

  private recoilVector(t: number, i: number): [Point, number] {
    const { pattern, timePoints, mag } = this.setup;
    while (i + 1 < mag && t > timePoints[i + 1]) i++;
    if (i == -1) return [new Point(), i];
    if (i + 1 >= mag) return [pattern[mag - 1].clone(), i];
    const dt = timePoints[i + 1] - timePoints[i];
    const progress = Math.max(Math.min((t - timePoints[i]) / dt, 1), 0);
    const p = pattern[i];
    return [pattern[i + 1].clone().sub(p).s(progress).add(p), i];
  }

  /**
   * Advances the run to time `t`: fires the rounds that are due and returns the recoil to draw, or
   * null once the run is over.
   */
  frame(t: number, cursor: Point, target: Point): Recoil | null {
    this.recoil = this.advance(t, cursor, target);
    return this.recoil;
  }

  private advance(t: number, cursor: Point, target: Point): Recoil | null {
    this.settle(t);
    if (!this.running) return null;
    const { pattern, mag } = this.setup;
    const now = t;
    let vRecoil: Point;
    let vRecoilNextFrame: Point;

    if (this.mode === 'single') {
      // Check idle timeout
      if (now - this.lastShotTime > Math.max(2500, this.refireDelayMs + 1500)) {
        this.finish(now);
        return null;
      }
      const dt = (now - this.lastShotTime) * this.speed;
      let pKick: Point;
      if (this.hitIndex >= 0 && this.hitIndex < pattern.length) {
        if (this.hitIndex === 0) {
          pKick = pattern.length > 1 ? pattern[1].clone().sub(pattern[0]) : pattern[0].clone();
          if (pKick.length() < 1 && pattern.length > 1) pKick = pattern[1].clone();
        } else {
          pKick = pattern[this.hitIndex].clone().sub(pattern[this.hitIndex - 1]);
        }
      } else {
        pKick = pattern[0]?.clone() || new Point();
      }

      const kickDuration = 35;
      if (dt <= kickDuration) {
        vRecoil = pKick.clone().s(dt / kickDuration);
        const dtNext = dt + 24;
        vRecoilNextFrame =
          dtNext <= kickDuration
            ? pKick.clone().s(dtNext / kickDuration)
            : pKick
                .clone()
                .s(0.5 * (1 + Math.cos(((dtNext - kickDuration) / (this.recoilResetMs - kickDuration)) * Math.PI)));
      } else if (dt <= this.recoilResetMs) {
        const prog = (dt - kickDuration) / (this.recoilResetMs - kickDuration);
        const factor = 0.5 * (1 + Math.cos(prog * Math.PI));
        vRecoil = pKick.clone().s(factor);

        const dtNext = dt + 24;
        if (dtNext <= this.recoilResetMs) {
          const progNext = (dtNext - kickDuration) / (this.recoilResetMs - kickDuration);
          vRecoilNextFrame = pKick.clone().s(0.5 * (1 + Math.cos(progNext * Math.PI)));
        } else {
          vRecoilNextFrame = new Point();
        }
      } else {
        vRecoil = new Point();
        vRecoilNextFrame = new Point();
      }
    } else if (this.mode === 'burst') {
      // Check idle timeout if trigger not held
      if (!this.mouseDown && this.inBurstCooldown && now - this.burstEndTime > 2000) {
        this.finish(now);
        return null;
      }

      if (this.inBurstCooldown) {
        const dt = (now - this.burstEndTime) * this.speed;
        // Recoil smoothly resets back toward 0
        if (dt <= this.recoilResetMs) {
          const prog = dt / this.recoilResetMs;
          const factor = 0.5 * (1 + Math.cos(prog * Math.PI));
          vRecoil = this.lastBurstPeak.clone().s(factor);
          const dtNext = dt + 24;
          if (dtNext <= this.recoilResetMs) {
            const progNext = dtNext / this.recoilResetMs;
            vRecoilNextFrame = this.lastBurstPeak.clone().s(0.5 * (1 + Math.cos(progNext * Math.PI)));
          } else {
            vRecoilNextFrame = new Point();
          }
        } else {
          vRecoil = new Point();
          vRecoilNextFrame = new Point();
        }

        // Automatic refire of next burst if trigger held
        if (dt >= this.burstDelayMs && this.mouseDown && this.hitIndex + 1 < mag) {
          this.inBurstCooldown = false;
          this.burstStartTime = now;
          this.shotsInCurrentBurst = 1;
          this.lastShotTime = now;
          this.recordHit(this.hitIndex + 1, now, cursor, target);
          vRecoil = new Point();
          vRecoilNextFrame = new Point();
        }
      } else {
        // Firing within current burst
        const dtSinceShot = (now - this.lastShotTime) * this.speed;
        if (dtSinceShot >= this.burstIntraMs && this.shotsInCurrentBurst < this.burstSize && this.hitIndex + 1 < mag) {
          this.shotsInCurrentBurst++;
          this.lastShotTime = now;
          this.recordHit(this.hitIndex + 1, now, cursor, target);
        }

        const b = Math.floor(this.hitIndex / this.burstSize);
        const baseIdx = b * this.burstSize;
        const pBase = pattern[baseIdx];
        const pCurrent = pattern[this.hitIndex].clone().sub(pBase);

        if (this.shotsInCurrentBurst < this.burstSize && this.hitIndex + 1 < mag) {
          const pNext = pattern[this.hitIndex + 1].clone().sub(pBase);
          const intraProg = Math.min(1, Math.max(0, ((now - this.lastShotTime) * this.speed) / this.burstIntraMs));
          vRecoil = pNext.clone().sub(pCurrent).s(intraProg).add(pCurrent);
          vRecoilNextFrame = pNext;
        } else {
          vRecoil = pCurrent.clone();
          vRecoilNextFrame = pCurrent.clone();
        }

        if (this.shotsInCurrentBurst >= this.burstSize || this.hitIndex + 1 >= mag) {
          this.inBurstCooldown = true;
          this.burstEndTime = now;
          this.lastBurstPeak = vRecoil.clone();
          if (this.hitIndex + 1 >= mag) this.finishAt = now + Math.min(this.recoilResetMs, 300);
        }
      }
    } else {
      // Auto mode: original continuous timeline
      const frame_t = (now - this.startT) * this.speed + 8;
      const [v, i] = this.recoilVector(frame_t, this.hitIndex);
      const [vNext] = this.recoilVector(frame_t + 24, i);
      vRecoil = v;
      vRecoilNextFrame = vNext;

      while (this.hitIndex < i) {
        this.recordHit(this.hitIndex + 1, now, cursor, target);
      }
      if (this.hitIndex + 1 >= mag) this.finish(now);
    }
    return { now: vRecoil, next: vRecoilNextFrame };
  }

  private finish(t: number) {
    this.running = false;
    const shots = this.hitIndex + 1;
    const score = shots > 0 ? Math.max(0, Math.min(1, this.score / shots)) : 0;
    const points = Math.round(100 * score);
    this.result = {
      score,
      points,
      shots,
      counted: this.speed == 1 && shots >= this.setup.mag && shots > 0,
      finishedAt: t,
    };
    this.listener.onFinish?.(this.result);
  }
}
