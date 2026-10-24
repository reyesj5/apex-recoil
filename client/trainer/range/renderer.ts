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

// The practice range while a run goes on: a Konva stage over the range's dot grid that drives the
// engine's Run (client/engine/run.ts) from animation frames and the mouse, and draws the aim, the
// target, the path, the shots and, once the run ends, its trails in the chosen result style. It
// follows the Shooting and Target classes of client/game.ts step for step, so a run scores exactly as
// on the current page (e2e/trainer-next.spec.ts replays recorded runs to check); only the drawing
// changed, to the redesign's colors. No React here: RangeCanvas mounts it and passes the settings in,
// and nothing in React renders while a run goes on.

import Konva from 'konva';
import { runSetup, type LoadoutSettings } from '@/engine/loadout';
import { clamp, hintPath, onScreen, patternBox, sensitivityScale, type ScreenScale } from '@/engine/pattern';
import { Point } from '@/engine/point';
import { Run, type Recoil, type RunResult, type Shot } from '@/engine/run';
import type { TrialSetup } from '@/engine/stats';
import { Target, type Rect } from '@/engine/target';
import {
  getWeaponModeConfig,
  parseMods,
  resolveFireMode,
  soundFile,
  withMods,
  type FireMode,
  type Weapon,
} from '@/engine/weapons';
import { tokenColor } from './colors';
import { SoundPlayer } from './sound';

export interface RangeSettings {
  /** The weapon as in client/specs.json; runSetup applies its attachments */
  weapon: Weapon;
  /** The run's settings, with the effective sensitivity (sensitivity × ADS) */
  loadout: LoadoutSettings;
  scale: ScreenScale;
  /** Follow path: the path to follow shows during the run */
  hint: boolean;
  moving: boolean;
  /** The recoil moves the target instead of the aim, closer to the game (game::stationary-target false) */
  recoilTarget: boolean;
  /** The moving target's speed (game::target-speed) */
  targetSpeed: number;
  /** How a finished run shows: 0 around the target, 1 as dots, 2 as lines (game::trace-mode) */
  trace: number;
  /** 0 to 100 */
  volume: number;
  mute: boolean;
  /** The score history's key for runs with these settings */
  trial: TrialSetup;
}

export interface RunEnd {
  result: RunResult;
  shots: Shot[];
  mode: FireMode;
  /** Rounds in the magazine */
  mag: number;
  settings: RangeSettings;
}

export interface RangeEvents {
  /** A run started; the page hides what covers the range, without rendering */
  runStart?(): void;
  runEnd?(end: RunEnd): void;
  /** The middle button shows results the next way */
  cycleTrace?(): void;
  /** Whether the range is too small to start a spray with the whole pattern on it */
  areaChange?(tooSmall: boolean): void;
}

declare global {
  interface Window {
    /** What the last run scored, shot by shot, for the parity checks (as the current page sets it) */
    __spraydownLastRun?: { finishedAt: number; score: number; shots: number; hitTimes: number[]; hitScores: number[] };
  }
}

const color = {
  ink: tokenColor('pattern-ink'),
  volt: tokenColor('volt'),
  target: tokenColor('target'),
  aim: tokenColor('text'),
};

// The floating toolbar covers the top of the range; a spray started under it would hide its first rounds
const toolbarBand = 64;

// The target: the engine's motion and the ring that shows it, offset by the recoil when the recoil
// moves the target (Target in client/game.ts)
class TargetView {
  readonly ring = new Konva.Circle({
    radius: 6,
    stroke: color.target,
    strokeWidth: 2,
    visible: false,
    listening: false,
  });
  private readonly motion = new Target();
  private offsetBy = new Point();
  private scale: ScreenScale = { scaleX: 1, scaleY: 1 };
  private dirty = true;

  configure(area: Rect, moving: boolean, targetSpeed: number, sensScale: number, scale: ScreenScale) {
    this.motion.configure(area, moving, targetSpeed, sensScale);
    this.scale = scale;
    this.dirty = true;
  }

  get moving() {
    return this.motion.moving;
  }

  /** Moves a moving target by `dt` ms and places the ring; returns whether anything moved */
  frame(dt: number): boolean {
    let update = this.dirty;
    if (this.motion.step(dt)) update = true;
    if (update) {
      this.ring.position(this.motion.position());
      this.ring.offset(onScreen(this.offsetBy, this.scale));
      this.dirty = false;
    }
    return update;
  }

  position(p?: Point): Point {
    if (p) this.dirty = true;
    return this.motion.position(p);
  }

  offset(p: Point) {
    this.offsetBy = p.clone();
    this.dirty = true;
  }
}

interface RunContext {
  layer: Konva.Layer;
  target: TargetView;
  sound: SoundPlayer;
  /** The pointer, as last seen */
  cursor(): Point;
  finished(end: RunEnd): void;
}

// One run, from the first press to its trails (Shooting in client/game.ts)
class RunView {
  readonly run: Run;
  readonly settings: RangeSettings;
  readonly shots: Shot[] = [];
  running = true;
  private readonly ctx: RunContext;
  private readonly group = new Konva.Group();
  private readonly hintGroup = new Konva.Group();
  private readonly wallGroup = new Konva.Group();
  private readonly trailGroup = new Konva.Group();
  private readonly aim: Konva.Circle;
  private readonly startPos: Point;
  private readonly startT: number;
  private readonly mode: FireMode;
  private readonly mag: number;
  /** The pattern the run scores against, and as drawn (stretched by the screen scale) */
  private readonly pattern: Point[];
  private readonly displayPattern: Point[];
  private readonly showHint: boolean;
  /** Per round, for each result style: where it landed around the target, the aim as a dot, the miss as a line */
  private readonly markers: Konva.Circle[] = [];
  private readonly dots: Konva.Circle[] = [];
  private readonly lines: Konva.Line[] = [];
  private dotsLine: Konva.Line | null = null;
  private dotsPoints: number[] = [];
  private trace = 1;
  private finishTimer: number | null = null;
  private replayStart: number | null = null;
  private replaySpeed = 1;

  constructor(ctx: RunContext, settings: RangeSettings, t: number, cursor: Point) {
    this.ctx = ctx;
    this.settings = settings;
    this.startT = t;
    this.startPos = cursor.clone();
    const setup = runSetup(settings.weapon, settings.loadout);
    this.mode = setup.mode;
    this.mag = setup.mag;
    this.pattern = setup.pattern;
    this.displayPattern = setup.pattern.map((p) => onScreen(p, settings.scale));
    this.showHint = settings.hint && !settings.moving;

    if (this.mode === 'auto') ctx.sound.spray(clamp(settings.loadout.speed / 100, 0.1, 1));
    this.hintGroup.visible(this.showHint);
    if (!settings.moving) {
      ctx.target.position(this.startPos.clone());
      ctx.target.offset(new Point());
    }
    this.drawPath(0.22, 0.6);
    // The aim replaces the cursor, which hides during the run
    this.aim = new Konva.Circle({ radius: 2, fill: color.aim, position: this.startPos, listening: false });
    this.group.add(this.hintGroup, this.wallGroup, this.trailGroup, this.aim);
    ctx.layer.add(this.group);
    ctx.target.ring.visible(true);
    ctx.target.ring.moveToTop();

    // The run fires the first round of a single or burst shot at once, then takes its first frame
    this.run = new Run(setup, t, this.startPos, ctx.target.position(), {
      onShot: (shot) => this.onShot(shot),
      onFinish: (result) => this.finish(result),
    });
    if (this.run.recoil) this.showRecoil(this.run.recoil);
    this.scheduleFinish();
  }

  get replaying() {
    return this.replayStart !== null;
  }

  /** The path to follow from the start point: faint while running, fainter behind a finished run */
  private drawPath(line: number, dot: number) {
    this.hintGroup.destroyChildren();
    const cfg = getWeaponModeConfig(this.settings.weapon.name);
    const path = hintPath(this.displayPattern, this.mag, this.mode, cfg, this.startPos);
    for (const l of path.lines) {
      this.hintGroup.add(
        new Konva.Line({
          points: l.points.flatMap((p) => [p.x, p.y]),
          stroke: color.ink,
          strokeWidth: l.reset ? 1 : 2,
          dash: l.reset ? [3, 3] : undefined,
          opacity: line,
          lineJoin: 'round',
          lineCap: 'round',
          listening: false,
        }),
      );
    }
    for (const d of path.dots) {
      this.hintGroup.add(
        new Konva.Circle({ radius: 2.5, fill: color.ink, opacity: dot, position: d.at, listening: false }),
      );
    }
  }

  // A round fired: its sound in single and burst fire, and its marker where it landed
  private onShot(shot: Shot) {
    if (this.mode !== 'auto') this.ctx.sound.shot();
    const scale = this.settings.scale;
    const p = this.pattern[shot.index];
    this.shots.push(shot);
    const hit = this.settings.recoilTarget
      ? this.startPos.clone().add(new Point(this.wallGroup.offset()))
      : this.startPos
          .clone()
          .add(onScreen(shot.cursor.clone().sub(this.startPos), scale))
          .add(onScreen(p, scale));
    const marker = new Konva.Circle({ radius: 3, fill: color.volt, position: hit, listening: false });
    this.markers.push(marker);
    (this.settings.recoilTarget ? this.wallGroup : this.trailGroup).add(marker);
  }

  /** The trigger pressed again during the run: the next single shot, or the next burst */
  press(t: number) {
    if (!this.running) return;
    this.run.press(t, this.ctx.cursor(), this.ctx.target.position());
    this.scheduleFinish();
  }

  /** The trigger let go: ends a full-auto spray */
  release(t: number) {
    if (!this.running) return;
    this.run.release(t);
  }

  // Once the last single shot or burst has fired, the run ends when its recoil settles, frame or not
  private scheduleFinish() {
    const run = this.run as Run | undefined;
    if (this.finishTimer != null || run == null || run.finishAt == null) return;
    const at = run.finishAt;
    this.finishTimer = window.setTimeout(
      () => {
        if (this.running) run.frame(at, this.ctx.cursor(), this.ctx.target.position());
      },
      Math.max(0, at - Date.now()),
    );
  }

  /** One animation frame of the run; returns whether something moved */
  frame(now: number): boolean {
    if (!this.running) return false;
    const recoil = this.run.frame(now, this.ctx.cursor(), this.ctx.target.position());
    this.scheduleFinish();
    if (recoil == null) return false;
    this.showRecoil(recoil);
    return true;
  }

  // Moves the wall, the target, the path and the aim with the recoil and the cursor
  private showRecoil(recoil: Recoil) {
    const scale = this.settings.scale;
    const dCur = this.ctx.cursor().clone().sub(this.startPos);
    const dCurScaled = onScreen(dCur, scale);
    const vRecoilCompensated = recoil.now.clone().add(dCur);
    if (this.settings.recoilTarget) {
      this.hintGroup.offset(dCurScaled);
    } else if (this.showHint) {
      this.aim.offset(dCurScaled.clone().s(-1));
    } else {
      this.aim.offset(vRecoilCompensated.clone().s(-1));
    }
    this.wallGroup.offset(onScreen(vRecoilCompensated, scale));
    if (this.settings.recoilTarget) {
      this.ctx.target.offset(vRecoilCompensated);
    } else if (this.showHint && !this.settings.moving) {
      this.ctx.target.offset(recoil.next);
    }
  }

  private finish(result: RunResult) {
    this.running = false;
    if (this.finishTimer != null) window.clearTimeout(this.finishTimer);
    this.ctx.sound.stop();
    window.__spraydownLastRun = {
      finishedAt: result.finishedAt,
      score: result.score,
      shots: result.shots,
      hitTimes: this.shots.map((s) => s.t),
      hitScores: this.shots.map((s) => s.score),
    };
    const scale = this.settings.scale;
    this.drawPath(0.16, 0.35);
    this.hintGroup.visible(true);
    this.shots.forEach((shot, i) => {
      const p = this.displayPattern[i] ?? new Point();
      const vd = onScreen(shot.aim, scale);
      const aimed = this.startPos.clone().add(vd);
      // Around the target: where the round landed on it
      const marker = this.markers[i];
      marker.radius(2.5);
      marker.moveTo(this.trailGroup);
      marker.position(vd.clone().add(p).add(this.startPos));
      // As dots: where the aim was, over the path it should have followed
      this.dots.push(new Konva.Circle({ radius: 2.5, fill: color.volt, position: aimed, listening: false }));
      this.dotsPoints.push(aimed.x, aimed.y);
      // As lines: from where the aim was to where it should have been
      const should = this.startPos.clone().sub(p);
      this.lines.push(
        new Konva.Line({
          points: [aimed.x, aimed.y, should.x, should.y],
          stroke: color.volt,
          strokeWidth: 1.5,
          opacity: 0.85,
          listening: false,
        }),
      );
    });
    this.dotsLine = new Konva.Line({
      points: this.dotsPoints,
      stroke: color.volt,
      strokeWidth: 1.6,
      opacity: 0.7,
      lineJoin: 'round',
      listening: false,
    });
    this.trailGroup.add(this.dotsLine, ...this.dots, ...this.lines);
    this.trailGroup.add(new Konva.Circle({ radius: 9, stroke: color.volt, strokeWidth: 2, position: this.startPos }));
    this.hintGroup.offset(new Point());
    this.wallGroup.offset(new Point());
    this.ctx.target.offset(new Point());
    this.aim.visible(false);
    this.showTrace(this.settings.trace);
    this.ctx.finished({ result, shots: this.shots, mode: this.mode, mag: this.mag, settings: this.settings });
  }

  /** Shows the trails in a result style (0 around the target, 1 dots, 2 lines) */
  showTrace(style: number) {
    this.trace = ((style % 3) + 3) % 3;
    this.replayStart = null;
    this.reveal(this.shots.length);
  }

  private reveal(shown: number) {
    [this.markers, this.dots, this.lines].forEach((shapes, style) =>
      shapes.forEach((shape, i) => shape.visible(style === this.trace && i < shown)),
    );
    this.dotsLine?.visible(this.trace === 1);
    this.dotsLine?.points(this.dotsPoints.slice(0, shown * 2));
  }

  /** Shows the rounds again in the order and at the pace they fired, `speed` times as fast */
  replay(now: number, speed: number) {
    if (this.running) return;
    this.replayStart = now;
    this.replaySpeed = speed;
    this.reveal(0);
  }

  /** One frame of a replay; returns whether it changed what shows */
  replayFrame(now: number): boolean {
    if (this.replayStart === null) return false;
    const elapsed = (now - this.replayStart) * this.replaySpeed;
    const shown = this.shots.filter((s) => s.t - this.startT <= elapsed).length;
    this.reveal(shown);
    if (shown >= this.shots.length) this.replayStart = null;
    return true;
  }

  destroy() {
    if (this.finishTimer != null) window.clearTimeout(this.finishTimer);
    if (this.running) this.ctx.sound.stop();
    this.running = false;
    this.group.destroy();
  }
}

/** The range's canvas; mount it in an empty element that fills the range */
export class RangeRenderer {
  private readonly container: HTMLDivElement;
  private readonly events: RangeEvents;
  private readonly stage: Konva.Stage;
  private readonly layer = new Konva.Layer({ listening: false });
  private readonly sound = new SoundPlayer();
  private readonly target = new TargetView();
  private readonly resizeObserver: ResizeObserver | null;
  private settings: RangeSettings | null = null;
  private view: RunView | null = null;
  private cursor = new Point();
  private width: number;
  private height: number;
  private frameId = 0;
  private lastTimestamp: number | null = null;
  private tooSmall: boolean | null = null;
  private readonly context: RunContext = {
    layer: this.layer,
    target: this.target,
    sound: this.sound,
    cursor: () => this.cursor,
    finished: (end) => this.finished(end),
  };

  constructor(container: HTMLDivElement, events: RangeEvents = {}) {
    this.container = container;
    this.events = events;
    this.width = container.clientWidth;
    this.height = container.clientHeight;
    this.stage = new Konva.Stage({ container, width: Math.max(1, this.width), height: Math.max(1, this.height) });
    this.stage.add(this.layer);
    this.layer.add(this.target.ring);
    container.addEventListener('pointerdown', this.onPointerDown);
    container.addEventListener('pointermove', this.onPointerMove);
    container.addEventListener('pointerup', this.onPointerUp);
    container.addEventListener('contextmenu', this.onContextMenu);
    this.resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(container);
  }

  /** New settings; a run going on keeps the ones it started with */
  configure(settings: RangeSettings) {
    const previous = this.settings;
    this.settings = settings;
    const weapon = withMods(settings.weapon, parseMods(settings.loadout.mods));
    const mode = resolveFireMode(weapon.name, settings.loadout.fireMode);
    this.sound.use(settings.mute ? null : soundFile(weapon, settings.loadout.mag, mode), settings.volume / 100);
    this.updateArea();
    if (!this.view?.running) this.target.ring.visible(settings.moving);
    if (this.view && !this.view.running && previous?.trace !== settings.trace) this.view.showTrace(settings.trace);
    this.layer.batchDraw();
    this.requestFrame();
  }

  /** Shows the last run's rounds again, `speed` times as fast as they fired */
  replay(speed: number) {
    if (!this.view || this.view.running) return;
    this.view.replay(Date.now(), speed);
    this.requestFrame();
  }

  /** Back to the ready state: the last run's drawing goes */
  clear() {
    if (this.view?.running) return;
    this.view?.destroy();
    this.view = null;
    this.target.ring.visible(Boolean(this.settings?.moving));
    this.layer.batchDraw();
  }

  destroy() {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.view?.destroy();
    this.view = null;
    this.resizeObserver?.disconnect();
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('contextmenu', this.onContextMenu);
    this.sound.destroy();
    this.stage.destroy();
  }

  private startRun() {
    const settings = this.settings;
    if (!settings) return;
    this.view?.destroy();
    this.events.runStart?.();
    this.container.style.cursor = 'none';
    this.view = new RunView(this.context, settings, Date.now(), this.cursor.clone());
    this.layer.batchDraw();
    this.requestFrame();
  }

  private finished(end: RunEnd) {
    this.container.style.cursor = '';
    this.target.ring.visible(end.settings.moving);
    this.layer.batchDraw();
    this.events.runEnd?.(end);
  }

  private readonly tick = (timestamp: number) => {
    this.frameId = 0;
    const dt = this.lastTimestamp === null ? 0 : timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;
    let changed = this.target.frame(dt);
    const view = this.view;
    if (view?.running && view.frame(Date.now())) changed = true;
    if (view?.replaying && view.replayFrame(Date.now())) changed = true;
    if (changed) this.layer.draw();
    if (this.view?.running || this.view?.replaying || this.target.moving) this.requestFrame();
    else this.lastTimestamp = null;
  };

  private requestFrame() {
    if (!this.frameId) this.frameId = requestAnimationFrame(this.tick);
  }

  private readonly onPointerMove = (e: PointerEvent) => {
    this.cursor = this.toStage(e);
  };

  private readonly onPointerDown = (e: PointerEvent) => {
    this.cursor = this.toStage(e);
    if (e.button === 1) {
      e.preventDefault();
      this.events.cycleTrace?.();
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    // Keep receiving the pointer when it leaves the range during a spray
    if (this.container.setPointerCapture) {
      try {
        this.container.setPointerCapture(e.pointerId);
      } catch {
        // not every pointer can be captured; the run goes on without it
      }
    }
    // A press during a run fires its next shot or burst; one after it ends starts the next run
    if (this.view?.running) this.view.press(Date.now());
    if (!this.view?.running) this.startRun();
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    this.cursor = this.toStage(e);
    if (e.button === 0 && this.view?.running) this.view.release(Date.now());
  };

  private readonly onContextMenu = (e: Event) => e.preventDefault();

  private toStage(e: PointerEvent): Point {
    const r = this.container.getBoundingClientRect();
    return new Point(e.clientX - r.left, e.clientY - r.top);
  }

  private resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    if (!width || !height) return;
    this.stage.size({ width, height });
    this.updateArea();
    this.layer.batchDraw();
    this.requestFrame();
  }

  // The start area: where a spray can start with the whole pattern on the range (the current page's
  // start rectangle), which the moving target glides around in
  private updateArea() {
    const s = this.settings;
    if (!s || !this.width || !this.height) return;
    const display = runSetup(s.weapon, s.loadout).pattern.map((p) => onScreen(p, s.scale));
    const [min, max] = patternBox(display);
    const topLeft = min.clone().s(-1).add(new Point(0, toolbarBand));
    let bottomRight = new Point(this.width - max.x - 50, this.height - max.y - 50);
    const size = bottomRight.clone().sub(topLeft);
    size.x = Math.max(1, size.x);
    size.y = Math.max(1, size.y);
    bottomRight = topLeft.clone().add(size);
    const tooSmall = size.x < 100 || size.y < 100;
    if (tooSmall !== this.tooSmall) {
      this.tooSmall = tooSmall;
      this.events.areaChange?.(tooSmall);
    }
    const sensScale = sensitivityScale(s.loadout.sens);
    this.target.configure({ topLeft, bottomRight }, s.moving, s.targetSpeed, sensScale, s.scale);
  }
}
