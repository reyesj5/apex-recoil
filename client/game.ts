/**
* Copyright 2021 Mikhail Goncharov
* Modified by [OWNER NAME], 2025-2026.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://w.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

import { Howl } from "howler";
import Konva from "konva";
import { cursor, layer, stage } from "./stage";
import { resumeAttrUpdates, suspendAttrUpdates, BooleanAttribute, NumericAttribute, StringAttribute, watch, initAttributes } from './storage';
import { Point } from "./engine/point";
import specs from './specs.json';
import theme from '../theme.json';
import { addStat, aStats, loadStats, percentile, statsForSetup, TrialSetup } from "./stats";
import { numberToDate, today } from "./utils";
import assertExists from "ts-assert-exists";
import hotkeys from "hotkeys-js";
// The engine: weapons, patterns, runs and the target, shared with the new trainer (client/engine)
import { runSetup, type LoadoutSettings } from './engine/loadout';
import { clamp, hintPath, onScreen, patternBox as measurePattern, recoilPattern, sensitivityScale } from './engine/pattern';
import { Run, type Recoil, type RunResult, type Shot } from './engine/run';
import { Target as TargetMotion, type Rect } from './engine/target';
import {
  formatMods, getWeaponModeConfig, isSingleShellShotgun, magSize, nextFireMode, parseMods, resolveFireMode,
  soundFile, weaponUsesStock, withMods, type FireMode, type MagInfo, type Weapon,
} from './engine/weapons';
export {
  WEAPON_FIRE_MODES, getWeaponModeConfig, isSingleFireWeapon, isSingleShellShotgun, weaponUsesStock,
} from './engine/weapons';
export type { FireMode, MagInfo, Weapon, WeaponModeConfig } from './engine/weapons';

let sound: Howl | null = null;
let pings: Howl[] = [new Howl({ src: `./audio/ping0.wav` }), new Howl({ src: `./audio/ping1.wav`})];
let soundPath = '';
const weapons = new Map<string, Weapon>();
const colorStartCircle = theme.colorStartCircle;
const colorHintPath = theme.colorHintPath;
const scoreGradient = theme.scoreGradient;
let tracePreview: TracePreview | null = null;
const traceShapeTypes = 3;
const pingOffset = 100;
let dev = false;

let startRectangle = new Konva.Rect({
  stroke: theme.foreground,
  strokeWidth: 0.5,
  dash: [1, 9],
});
let startRect: Rect = {
  topLeft: new Point(0, 0),
  bottomRight: new Point(10, 10),
};
let pattern: Point[] = [];
let patternBox: [Point, Point] = [new Point(), new Point()];
let animation: Konva.Animation | null = null;
const NS = 'game:';
const aRecoilWeapon = new BooleanAttribute('stationary-target', NS, true);
const aShowDetailedStats = new BooleanAttribute('show-detailed-stats', NS, false);
const aShowSensitivityWarn = new BooleanAttribute('show-sensitivity-warn', NS, false);
const aShowInstructions = new BooleanAttribute('show-instructions', NS, true);
const aMovingTarget = new BooleanAttribute('moving-target', NS, false);
const aTargetSpeed = new NumericAttribute('target-speed', NS, 100);
const aSens = new NumericAttribute('sens', NS, 5);
const aWeapon = new StringAttribute('weapon', NS, 'r99');
const aMag = new NumericAttribute('mag', NS, 0);
const aVolume = new NumericAttribute('volume', NS, 20);
const aMute = new BooleanAttribute('mute', NS, false);
const aInvertY = new BooleanAttribute('invert-y', NS, false);
const aHint = new BooleanAttribute('hint', NS, true);
const aTraceMode = new NumericAttribute('trace-mode', NS, 1);
const aFireSpeed = new NumericAttribute('speed', NS, 100);
const aMods = new StringAttribute('mods', NS, '');
const aScaleX = new NumericAttribute('scale-x', NS, 1);
const aScaleY = new NumericAttribute('scale-y', NS, 1);
const aCorruptedStock = new BooleanAttribute('corrupted-stock', NS, false);
export const aFireMode = new StringAttribute('fire-mode', NS, 'default');

export function currentFireMode(): FireMode {
  return resolveFireMode(selectedWeapon().name, aFireMode.get());
}

export function toggleFireMode() {
  const next = nextFireMode(selectedWeapon().name, currentFireMode());
  if (next) aFireMode.set(next);
}

export function updateFireModeUI() {
  const w = selectedWeapon();
  const cfg = getWeaponModeConfig(w.name);
  const curMode = currentFireMode();

  const row = document.getElementById('fire-mode-select');
  if (!row) return;

  const autoBtn = row.querySelector('.fire-mode-auto') as HTMLElement | null;
  const burstBtn = row.querySelector('.fire-mode-burst') as HTMLElement | null;
  const singleBtn = row.querySelector('.fire-mode-single') as HTMLElement | null;
  const hintElem = row.querySelector('.fire-mode-hint') as HTMLElement | null;

  if (autoBtn) {
    setClass(autoBtn, 'hidden', !cfg.modes.includes('auto'));
    setClass(autoBtn, 'selected', curMode === 'auto');
  }
  if (burstBtn) {
    setClass(burstBtn, 'hidden', !cfg.modes.includes('burst'));
    setClass(burstBtn, 'selected', curMode === 'burst');
  }
  if (singleBtn) {
    setClass(singleBtn, 'hidden', !cfg.modes.includes('single'));
    setClass(singleBtn, 'selected', curMode === 'single');
  }
  if (hintElem) {
    setClass(hintElem, 'hidden', cfg.modes.length <= 1);
  }
}

export function updateMagTooltips() {
  const w = selectedWeapon();
  const usesStock = weaponUsesStock(w.name);
  const stockActive = aCorruptedStock.get() && usesStock;
  const isShotgun = isSingleShellShotgun(w.name);
  const penalty = isShotgun ? 1 : 4;

  const path = window.location.pathname;
  const isRu = path.startsWith('/ru');
  const isZh = path.startsWith('/zh-CN');

  const unit = isShotgun ? (isRu ? 'патронов' : isZh ? '发' : 'shells') :
               (w.name === 'bocek') ? (isRu ? 'стрел' : isZh ? '支箭' : 'arrows') :
               (isRu ? 'патронов' : isZh ? '发' : 'rounds');

  for (let i = 0; i <= 4; i++) {
    const tooltipElem = document.querySelector(`#mag-select .mag-${i} .tooltiptext`) as HTMLElement | null;
    if (tooltipElem && i < w.mags.length) {
      const raw = w.mags[i].size;
      const count = stockActive ? Math.max(1, raw - penalty) : raw;
      const penaltyNote = stockActive ? ` (-${penalty})` : '';

      let baseLabel = '';
      if (isRu) {
        if (i === 0) baseLabel = 'Без магазина';
        else if (i === 4) baseLabel = 'Искаженный магазин';
        else baseLabel = `Ур. ${i}`;
      } else if (isZh) {
        if (i === 0) baseLabel = '无扩容';
        else if (i === 4) baseLabel = '异变弹匣';
        else baseLabel = `等级${i}`;
      } else {
        if (i === 0) baseLabel = 'No magazine';
        else if (i === 4) baseLabel = 'Corrupted Magazine';
        else baseLabel = `Level ${i}`;
      }
      tooltipElem.innerText = `${baseLabel} (${count} ${unit}${penaltyNote})`;
    }
    const capElem = document.querySelector(`#mag-select .mag-${i} .mag-cap`) as HTMLElement | null;
    if (capElem) {
      if (i < w.mags.length) {
        const raw = w.mags[i].size;
        const count = stockActive ? Math.max(1, raw - penalty) : raw;
        capElem.innerText = `${count}`;
        capElem.style.display = 'block';
        if (stockActive) {
          capElem.classList.add('penalty');
        } else {
          capElem.classList.remove('penalty');
        }
      } else {
        capElem.style.display = 'none';
      }
    }
  }

  const dropTooltipElem = document.querySelector(`#mag-select .mag-drop .tooltiptext`) as HTMLElement | null;
  if (dropTooltipElem) {
    const raw = w.mags[0]?.size || 1;
    const count = stockActive ? Math.max(1, raw - penalty) : raw;
    const penaltyNote = stockActive ? ` (-${penalty})` : '';
    let label = isRu ? 'Фиксированный магазин' : isZh ? '固定弹容量' : 'Standard Capacity';
    dropTooltipElem.innerText = `${label} (${count} ${unit}${penaltyNote})`;
  }
  const dropCapElem = document.querySelector(`#mag-select .mag-drop .mag-cap`) as HTMLElement | null;
  if (dropCapElem) {
    const raw = w.mags[0]?.size || 1;
    const count = stockActive ? Math.max(1, raw - penalty) : raw;
    dropCapElem.innerText = `${count}`;
  }

  const stockTooltipElem = document.querySelector('.mod-corrupted_stock .tooltiptext') as HTMLElement | null;
  if (stockTooltipElem) {
    if (isRu) {
      stockTooltipElem.innerText = isShotgun
        ? 'Искаженный приклад (-1 патрон для дробовиков)'
        : 'Искаженный приклад (-4 патрона)';
    } else if (isZh) {
      stockTooltipElem.innerText = isShotgun
        ? '异变枪托 (霰弹枪容量 -1发)'
        : '异变枪托 (弹匣容量 -4发)';
    } else {
      stockTooltipElem.innerText = isShotgun
        ? 'Corrupted Stock (-1 shell capacity)'
        : 'Corrupted Stock (-4 ammo capacity)';
    }
  }
}

export function currentMagSize(): number {
  return magSize(selectedWeapon(), aMag.get(), aCorruptedStock.get());
}

interface Frame {
  timeDiff: number;
  frameRate: number;
}

class Target {
  circle: Konva.Circle;
  shapes: Konva.Shape[] = [];
  private motion = new TargetMotion();
  private _offset = new Point();
  private dirty = false;
  constructor() {
    this.circle = new Konva.Circle({
      radius: 6,
      stroke: colorStartCircle,
      strokeWidth: 2,
      position: this.motion.position(),
    });
    // As it's called before layer is created.
    window.setTimeout(() => {
      this.addShape(this.circle);
    });
  }
  addShape(s: Konva.Shape) {
    layer.add(s);
    this.shapes.push(s);
  }
  clear() {
    this.shapes.forEach(s => s.destroy());
  }
  onSettingsUpdated() {
    this.motion.configure(startRect, aMovingTarget.get(), aTargetSpeed.get(), scale());
    this.circle.radius(6); // Head radius from 40m is ~6px.
    this.dirty = true;
  }
  frame(f: Frame): boolean {
    let update = this.dirty;
    if (this.motion.step(f.timeDiff)) update = true;
    if (update) {
      this.circle.position(this.motion.position());
      this.circle.offset(screen(this._offset));
      this.dirty = false;
    }
    return update;
  }
  position(p?: Point): Point {
    if (p) this.dirty = true;
    return this.motion.position(p);
  }
  offset(p?: Point): Point {
    if (p) {
      this._offset = p.clone();
      this.dirty = true;
    }
    return this._offset;
  }
}

let target: Target = new Target();

export function trialSetup(): TrialSetup {
  const weapon = aWeapon.get();
  const w = selectedWeapon();
  let mag = Math.min(aMag.get(), w.mags.length - 1);
  return {
    weapon,
    mag,
    hint: aHint.get(),
    moving: aMovingTarget.get(),
  };
}

function instructionsControls() {
  aShowInstructions.watch((v: boolean) => {
    const e = document.getElementById('instructions');
    if (!e) return;
    if (!v) {
      e.classList.add('hidden');
    } else {
      e.classList.remove('hidden');
      aShowDetailedStats.set(false);
    }
  });
  {
    const e = document.getElementById('dismiss-instructions');
    e?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      aShowInstructions.set(false);
      return false;
    });
  }

  {
    const e = document.getElementById('show-instructions-btn');
    e?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      aShowInstructions.set(true);
      return false;
    });
  }
}

function selectedWeapon(): Weapon {
  const w = weapons.get(aWeapon.get());
  if (w == null) throw Error("weapon not found");
  return withMods(w, activeMods());
}

function updateSound() {
  if (aMute.get()) return;
  const newPath = soundFile(selectedWeapon(), aMag.get(), currentFireMode());
  if (soundPath != newPath) {
    soundPath = newPath;
    sound = new Howl({ src: [soundPath] });
  }
}

function soundControls() {
  watch([aWeapon, aMag, aMute, aMods, aFireMode], updateSound);
  const mute = (document.getElementById('muted') as HTMLImageElement);
  const unmute = (document.getElementById('unmuted') as HTMLImageElement);
  if (mute != null || unmute != null) {
    aMute.watch((v: boolean) => {
      if (v) {
        unmute.classList.add('hidden');
        mute.classList.remove('hidden');
      } else {
        unmute.classList.remove('hidden');
        mute.classList.add('hidden');
      }
    });
    unmute.addEventListener('click', () => aMute.set(true));
    mute.addEventListener('click', () => aMute.set(false));
  }
}

function scale() {
  return sensitivityScale(aSens.get());
}

function gradientColor(x: number) {
  x = Math.min(1, Math.max(0, x));
  // Make gradient more pronounced around 1..0.9.
  x = 1 - Math.sqrt(1 - x * x);
  const idx = Math.round(x * 10);
  return scoreGradient[idx];
}

function drawPattern(pattern: Point[], mag: number, start: Point, sc: number): [Konva.Group, Konva.Circle[], Konva.Text[]] {
  const mode = currentFireMode();
  const path = hintPath(pattern, mag, mode, getWeaponModeConfig(selectedWeapon().name), start);
  const group = new Konva.Group();
  const circles: Konva.Circle[] = [];
  const texts: Konva.Text[] = [];
  // Single shots draw thicker kicks and number from 1; bursts and full auto number from 0
  const width = mode === 'auto' ? 1 : 1.5;
  const dot = mode === 'single'
    ? { radius: 2, strokeWidth: 1.5, label: new Point(3, -6) }
    : { radius: 1.5, strokeWidth: 1, label: mode === 'burst' ? new Point(2, -5) : new Point() };
  path.lines.forEach(line => {
    const points = line.points.flatMap(p => [p.x, p.y]);
    group.add(line.reset
      ? new Konva.Line({ points, stroke: 'rgba(255, 255, 255, 0.55)', strokeWidth: 1, dash: [3, 3] })
      : new Konva.Line({ points, stroke: colorHintPath, strokeWidth: width }));
  });
  if (sc > 0.3) {
    path.dots.forEach(d => {
      circles.push(new Konva.Circle({
        radius: dot.radius,
        stroke: colorHintPath,
        strokeWidth: dot.strokeWidth,
        position: d.at,
      }));
      texts.push(new Konva.Text({
        text: `${d.label}`,
        fontSize: 10,
        fill: 'white',
        position: d.at.clone().add(dot.label),
      }));
    });
  }
  return [group, circles, texts];
}

function screen(p: Point): Point {
  return onScreen(p, { scaleX: aScaleX.get(), scaleY: aScaleY.get() });
}

function scaledPattern(): Point[] {
  return unscaledPattern().map(screen);
}

function unscaledPattern(): Point[] {
  return recoilPattern(selectedWeapon(), currentMagSize(), { sens: aSens.get(), invertY: aInvertY.get() });
}

/** The settings a run is set up from (the engine's runSetup) */
function loadoutSettings(): LoadoutSettings {
  return {
    mag: aMag.get(),
    fireMode: aFireMode.get(),
    mods: aMods.get(),
    corruptedStock: aCorruptedStock.get(),
    sens: aSens.get(),
    invertY: aInvertY.get(),
    speed: aFireSpeed.get(),
  };
}

class TracePreview {
  shapes: (Konva.Shape | Konva.Group)[] = [];
  constructor() {
    const sc = scale();
    const n = currentMagSize();
    pattern = scaledPattern();
    patternBox = measurePattern(pattern);
    // Explicit pattern, shot count, start coordinate offset, and scale factor are required for isolated preview rendering
    const [line, circles, texts] = drawPattern(pattern, n, patternBox[0].clone().s(-1).add(new Point(50, 50)), sc);
    this.addShape(line);
    if (dev) (texts as Konva.Text[]).forEach(t => this.addShape(t));
    (circles as Konva.Circle[]).forEach(c => this.addShape(c));
    redraw();
  }
  addShape(s: Konva.Shape | Konva.Group) {
    layer.add(s);
    this.shapes.push(s);
  }
  clear() {
    this.shapes.forEach(s => s.destroy());
    this.shapes = [];
  }
}

let redrawTimeout: number | null;
function redraw() {
  if (redrawTimeout) return;
  redrawTimeout = window.setTimeout(() => {
    stage.batchDraw();
    redrawTimeout = null;
  }, 0);
}

function redrawStartRectangle() {
  if (patternBox.length < 2) return;
  const r = stage.container().getBoundingClientRect();
  const p = patternBox[0].clone();
  let bottomRight = new Point(
    window.innerWidth - r.left - patternBox[1].x - 50,
    window.innerHeight - r.top - patternBox[1].y - 50);
  const topLeft = p.clone().s(-1);
  const wh = bottomRight.sub(topLeft);
  wh.x = Math.max(1, wh.x);
  wh.y = Math.max(1, wh.y);
  bottomRight = topLeft.clone().add(wh);
  aShowSensitivityWarn.set(wh.x < 100 || wh.y < 100);
  startRectangle.x(Math.max(1, topLeft.x));
  startRectangle.y(Math.max(1, topLeft.y));
  startRectangle.width(wh.x);
  startRectangle.height(wh.y);
  startRect = {
    topLeft,
    bottomRight
  };
  target.onSettingsUpdated();
}

function weaponControls() {
  specs.forEach(s => {
    weapons.set(s.name, {
      name: s.name,
      rpm: s.rpm,
      mags: s.mags.map(m => {
        var z: MagInfo = { size: m.size, audio: m.audio };
        return z;
      }),
      time_points: s.time_points,
      x: s.x,
      y: s.y,
      mods: (s as any).mods,
      ping_points: (s as any).ping_points,
    });
    const d = (document.querySelector(`#weapon-select [data-weapon="${s.name}"]`) ||
               document.querySelector(`#weapon-select .${CSS.escape(s.name)}`)) as HTMLDivElement;
    if (d != null) d.addEventListener('click', () => aWeapon.set(s.name));
  });

  // Weapon Search & Category Filtering
  const searchInput = document.getElementById('weapon-search-input') as HTMLInputElement | null;
  const categoryPills = document.querySelectorAll('.cat-pill');
  let activeCategory = 'all';

  function filterWeapons() {
    const query = (searchInput?.value || '').toLowerCase().trim();
    const weaponButtons = document.querySelectorAll('#weapon-select > .btn');
    weaponButtons.forEach(btn => {
      const el = btn as HTMLElement;
      const wName = (el.getAttribute('data-weapon') || '').toLowerCase();
      const wCategory = (el.getAttribute('data-category') || '').toLowerCase();
      const displayName = (el.querySelector('.name')?.textContent || '').toLowerCase();

      const matchesCat = activeCategory === 'all' || wCategory === activeCategory;
      const matchesQuery = !query || wName.includes(query) || displayName.includes(query);

      if (matchesCat && matchesQuery) {
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });
  }

  searchInput?.addEventListener('input', filterWeapons);
  categoryPills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      categoryPills.forEach(p => p.classList.remove('active'));
      const target = e.currentTarget as HTMLElement;
      target.classList.add('active');
      activeCategory = target.getAttribute('data-category') || 'all';
      filterWeapons();
    });
  });

  aWeapon.watch((v: string) => {
    const s = document.querySelector(`#weapon-select .selected`) as HTMLDivElement;
    if (s != null) s.classList.remove('selected');
    const d = (document.querySelector(`#weapon-select [data-weapon="${v}"]`) ||
               document.querySelector(`#weapon-select .${CSS.escape(v)}`)) as HTMLDivElement;
    if (d == null) return;
    d.classList.add('selected');
    const w = selectedWeapon();
    console.log('mags', w.mags.length);
    for (let i = 0; i <= 4; i++) {
      const magElem = document.querySelector(`#mag-select .mag-${i}`) as HTMLElement | null;
      if (magElem) {
        setClass(magElem, 'hidden', w.mags.length == 1 || i >= w.mags.length);
      }
    }
    setClass(document.querySelector(`#mag-select .mag-drop`), 'hidden', w.mags.length != 1);
    document.querySelectorAll(".mod").forEach(e => {
      setClass(e as HTMLElement, 'hidden', true);
    });
    console.log(w);
    for (const v in w.mods) {
      console.log('show mod', v)
      setClass(document.querySelector(`.mod-${v}`), 'hidden', false);
    }
    const stockElem = document.querySelector('.mod-corrupted_stock') as HTMLElement | null;
    if (stockElem != null) {
      setClass(stockElem, 'hidden', !weaponUsesStock(w.name));
    }
    const cfg = getWeaponModeConfig(v);
    const curVal = aFireMode.get();
    if (!curVal || !cfg.modes.includes(curVal as FireMode)) {
      aFireMode.set(cfg.defaultMode);
    }
    updateFireModeUI();
    updateMagTooltips();
  });
  {
    const row = document.getElementById('fire-mode-select');
    if (row != null) {
      row.querySelectorAll('.fire-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const m = btn.getAttribute('data-mode');
          if (m) aFireMode.set(m);
        });
      });
    }
  }
  aFireMode.watch(() => {
    updateFireModeUI();
    updateSound();
  });
  for (let i = 0; i <= 4; i++) {
    const d = document.querySelector(`#mag-select .mag-${i}`) as HTMLDivElement;
    if (d != null) {
      d.addEventListener('click', () => aMag.set(i));
    }
  }
  aMag.watch((v: number) => {
    const s = document.querySelector(`#mag-select .selected`) as HTMLDivElement;
    if (s != null) s.classList.remove('selected');
    const d = document.querySelector(`#mag-select .mag-${v}`) as HTMLDivElement;
    if (d == null) return;
    d.classList.add('selected');
  });
  {
    const revved = document.querySelector('.mod-revved_up') as HTMLElement;
    if (revved != null) {
      (revved as HTMLDivElement).addEventListener('click', () => {
        const k = 'revved_up';
        setMod(k, !activeMods().has(k));
      });
    }
  }
  {
    const stockElem = document.querySelector('.mod-corrupted_stock') as HTMLElement | null;
    if (stockElem != null) {
      stockElem.addEventListener('click', () => {
        aCorruptedStock.set(!aCorruptedStock.get());
      });
    }
  }
  aCorruptedStock.watch((active: boolean) => {
    const stockElem = document.querySelector('.mod-corrupted_stock') as HTMLElement | null;
    if (stockElem != null) {
      setClass(stockElem, 'selected', active);
    }
    updateMagTooltips();
  });
  aMods.watch(() => {
    document.querySelectorAll(".mod").forEach(e => {
      setClass(e as HTMLElement, 'selected', false);
    });
    activeMods().forEach(s => {
      setClass(document.querySelector(`.mod-${s}`), 'selected', true);
    });
  });
  updateMagTooltips();
}

function setMod(name: string, on: boolean) {
  const m = activeMods();
  if (on) {
    m.add(name);
  } else {
    m.delete(name);
  }
  aMods.set(formatMods(m));
}

function activeMods(): Set<string> {
  return parseMods(aMods.get());
}

interface I18n {
  median: string;
  best: string;
  tries: string;
  score: string;
}

function getLocale(): I18n {
  const locale = (window as any).game_locale;
  switch (locale) {
    case 'ru':
      return {
        median: 'медиана',
        best: 'лучший',
        tries: 'попыток',
        score: 'очков',
      };
    case 'zh-CN':
      return {
        median: '中位数',
        best: '最高分',
        tries: '尝试次数',
        score: '得分',
      };
    default:
      return {
        median: 'median',
        best: 'best',
        tries: 'tries',
        score: 'score',
      };
  }
}

function statControls() {
  aShowDetailedStats.watch((v: boolean) => {
    const e = document.getElementById('detailed-stats');
    if (!e) return;
    if (v) {
      e.classList.remove('hidden');
      aShowInstructions.set(false);
      showStats();
    } else {
      e.classList.add('hidden');
    }
  });
  document.getElementById('hide-stats')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    aShowDetailedStats.set(false);
    return false;
  });
  {
    const btn = assertExists(document.getElementById('stats-graph-btn'));
    document.getElementById('stats-graph-btn')?.addEventListener('click', () => {
      aShowDetailedStats.set(!aShowDetailedStats.get());
    });
    aShowDetailedStats.watch((v: boolean) => setClass(btn, 'selected', v));
  }
}

function setClass(element: HTMLElement | null, name: string, v: boolean) {
  if (element == null) return;
  if (v) {
    element.classList.add(name);
  } else {
    element.classList.remove(name);
  }
}

function showStats() {
  const s = statsForSetup(trialSetup());
  if (aShowDetailedStats.get()) {
    const x: string[] = [];
    const median: number[] = [];
    const best: number[] = [];
    const count: number[] = [];
    if (s) {
      s.dayResults.forEach(dayResults => {
        x.push(numberToDate(dayResults[0]));
        median.push(dayResults[2]);
        best.push(dayResults[3]);
        count.push(dayResults[1]);
      });
      if (s.todayResults.length > 0) {
        x.push(numberToDate(today()));
        median.push(percentile(s.todayResults, 0.5));
        best.push(percentile(s.todayResults, 1));
        count.push(s.todayResults.length);
      }
    }
    (window as any).updateGraph(x, median, best, count, getLocale());
  }
  const b = document.getElementById('score-stats');

  if (b) {
    let todayCount = '-';
    let todayMedian = '-';
    let todayBest = '-';
    let allTimeBest = '-';
    if (s) {
      allTimeBest = `${s.bestAllTime}`;
      if (s.todayResults.length > 0) {
        todayCount = `${s.todayResults.length}`;
        todayMedian = `${Math.round(percentile(s.todayResults, 0.5))}`;
        todayBest = `${percentile(s.todayResults, 1)}`;
      }
    }
    const locale = (window as any).game_locale;
    switch (locale) {
      case 'ru':
        b.innerText = `Сегодня: ${todayCount} попытки, ${todayMedian} медиана,\n${todayBest} лучший результат.\nЛучший за все время ${allTimeBest}.`;
        break;
      case 'zh-CN':
        b.innerText = `今天尝试: ${todayCount} 次, 平均分 ${todayMedian}, 最高分\n${todayBest}.\n历史最高分 ${allTimeBest}.`;
        break;
      default:
        b.innerText = `Today's tries ${todayCount}, median ${todayMedian}, best ${todayBest}\nAll time best ${allTimeBest}`;
        break;
    }
  }
}

class Shooting {
  startPos: Point; // Starting position.
  totalFrames = 0;
  mag = 1;
  speed = 1;
  hitMarker = new Konva.Circle();
  hitVectors: Point[] = [];
  displayPattern: Point[] = [];
  pattern: Point[] = [];
  hitScores: number[] = [];
  hitTimes: number[] = [];
  showHint = true;
  start_t = 0;
  weapon: Weapon = { name: '', mags: [], x: [], y: [], time_points: [], mods: {}, ping_points: [] };
  pingIndex = -1; // Position in weapon pings.
  hitMarkers: Konva.Circle[] = [];
  crossHair?: Konva.Group;
  hintGroup: Konva.Group;
  wallGroup: Konva.Group;
  recoilGroup: Konva.Group;
  recoilTarget: boolean = false;
  traceShapes: Konva.Shape[][] = [];
  running: boolean = false;
  shapes: (Konva.Shape | Konva.Group)[] = [];
  movingTarget: boolean = false;
  mode: FireMode = 'auto';
  // When rounds fire and how they score: the engine's run (client/engine/run.ts)
  run: Run | null = null;
  private finishTimer: number | null = null;

  constructor() {
    this.startPos = new Point();
    this.hintGroup = new Konva.Group();
    this.wallGroup = new Konva.Group();
    this.recoilGroup = new Konva.Group();
  }

  start() {
    this.weapon = selectedWeapon();
    this.running = true;
    this.addShape(this.hintGroup);
    this.addShape(this.wallGroup);
    this.addShape(this.recoilGroup);
    suspendAttrUpdates();
    this.recoilTarget = !aRecoilWeapon.get();
    this.movingTarget = aMovingTarget.get();
    this.start_t = Date.now();
    this.startPos = cursor();
    const sc = scale();
    const setup = runSetup(assertExists(weapons.get(aWeapon.get())), loadoutSettings());
    this.speed = clamp(aFireSpeed.get() / 100, 0.1, 1);
    this.mag = setup.mag;
    this.mode = setup.mode;

    if (this.mode === 'auto') {
      if (!aMute.get() && sound != null) {
        sound.volume(aVolume.get() / 100);
        pings.forEach(p => {
          p.volume(sound!.volume());
          p.mute(false);
        });
        sound.rate(this.speed);
        sound.play();
      } else {
        pings.forEach(p => p.mute(true));
      }
    } else {
      if (!aMute.get() && sound != null) {
        sound.volume(aVolume.get() / 100);
      }
    }

    for (let i = 0; i < traceShapeTypes; i++) this.traceShapes.push([]);
    this.showHint = aHint.get() && !this.movingTarget;
    this.hintGroup.visible(this.showHint);
    // Target.
    if (!this.movingTarget) {
      target.position(this.startPos.clone());
      target.offset(new Point());
    }
    this.displayPattern = scaledPattern();
    this.pattern = setup.pattern;
    {
      const [group, circles, texts] = drawPattern(this.displayPattern, this.mag, this.startPos.clone(), sc);
      this.hintGroup.add(group);
      (circles as Konva.Circle[]).forEach(c => this.hintGroup.add(c));
    }
    // Replace cursor with a fixed point.
    this.crossHair = new Konva.Group();
    const sp = this.startPos;
    this.crossHair.add(new Konva.Circle({
      fill: 'cyan',
      position: sp,
      radius: 2,
    }));
    this.addShape(this.crossHair);
    stage.container().classList.add('no-cursor');

    // The run fires the first round of a single or burst shot at once, then takes its first frame
    this.run = new Run(setup, this.start_t, this.startPos, target.position(), {
      onShot: (shot) => this.onShot(shot),
      onFinish: (result) => this.finish(result),
    });
    this.totalFrames++;
    if (this.run.recoil) this.showRecoil(this.run.recoil);
    this.scheduleFinish();
    stage.batchDraw();
    stage.listening(false);
  }

  // A round fired: its sound in single and burst fire, and its marker.
  onShot(shot: Shot) {
    const sc = scale();
    const isSingleOrBurst = (this.mode === 'single' || this.mode === 'burst');

    if (isSingleOrBurst && !aMute.get() && sound != null) {
      sound.stop();
      sound.play();
    }

    const p = this.pattern[shot.index];
    this.hitVectors.push(shot.aim);
    this.hitScores.push(shot.score);
    this.hitTimes.push(shot.t);
    this.hitMarker.radius(2);
    let hitScreen: Point;
    if (this.recoilTarget) {
      hitScreen = this.startPos.clone().add(new Point(this.wallGroup.offset()));
    } else {
      const dCur = shot.cursor.clone().sub(this.startPos);
      const dCurScaled = screen(dCur);
      hitScreen = this.startPos.clone().add(dCurScaled).add(screen(p));
    }
    this.hitMarker = new Konva.Circle({
      radius: Math.max(4 * sc, 2),
      fill: gradientColor(this.hitScores[this.hitScores.length - 1]),
      position: hitScreen,
    });
    this.hitMarkers.push(this.hitMarker);
    if (this.recoilTarget) {
      this.wallGroup.add(this.hitMarker);
    } else {
      this.addShape(this.hitMarker);
    }
    this.traceShapes[0].push(this.hitMarker);
    this.hitMarker.zIndex(0); // To put behind the scope.
  }

  // The trigger pressed again during the run: the next single shot, or the next burst.
  press() {
    if (!this.running || this.run == null) return;
    this.run.press(Date.now(), cursor(), target.position());
    this.scheduleFinish();
  }

  // The trigger let go: ends a full-auto spray.
  release() {
    if (!this.running || this.run == null) return;
    this.run.release(Date.now());
  }

  // Once the last single shot or burst has fired, the run ends when its recoil settles, frame or not.
  scheduleFinish() {
    const run = this.run;
    if (this.finishTimer != null || run == null || run.finishAt == null) return;
    const at = run.finishAt;
    this.finishTimer = window.setTimeout(() => {
      if (this.running) run.frame(at, cursor(), target.position());
    }, Math.max(0, at - Date.now()));
  }

  frame(): boolean {
    if (!this.running || this.run == null) return false;
    this.totalFrames++;
    const now = Date.now();
    const recoil = this.run.frame(now, cursor(), target.position());
    this.scheduleFinish();
    if (dev && this.mode === 'auto') {
      const frame_t = (now - this.start_t) * this.speed + 8;
      while (this.pingIndex + 1 < this.weapon.ping_points.length &&
        frame_t + pingOffset >= this.weapon.ping_points[this.pingIndex + 1]) {
          this.pingIndex += 1;
          pings[this.pingIndex % 2].play();
      }
    }
    if (recoil == null) return false;
    this.showRecoil(recoil);
    return true;
  }

  // Moves the wall, the target, the hint and the crosshair with the recoil and the cursor.
  showRecoil(recoil: Recoil) {
    const dCur = cursor().clone().sub(this.startPos);
    const dCurScaled = screen(dCur);
    const vRecoil = recoil.now;
    const vRecoilNextFrame = recoil.next;
    this.recoilGroup.offset(screen(vRecoilNextFrame));
    const vRecoilCompensated = vRecoil.clone().add(dCur);
    if (this.recoilTarget) {
      this.hintGroup.offset(dCurScaled);
    } else {
      if (this.showHint) {
        this.crossHair?.offset(dCurScaled.clone().s(-1));
      } else {
        this.crossHair?.offset(vRecoilCompensated.clone().s(-1));
      }
    }
    this.wallGroup.offset(screen(vRecoilCompensated));
    if (this.recoilTarget) {
      target.offset(vRecoilCompensated);
    } else {
      if (this.showHint && !this.movingTarget) {
        target.offset(vRecoilNextFrame);
      }
    }
  }

  finish(result: RunResult) {
    this.running = false;
    if (this.finishTimer != null) window.clearTimeout(this.finishTimer);
    stage.listening(true);
    sound?.stop();
    resumeAttrUpdates();
    // What this run scored, shot by shot, for the engine's parity tests (client/engine)
    (window as any).__spraydownLastRun = {
      finishedAt: result.finishedAt,
      score: result.score,
      shots: result.shots,
      hitTimes: this.hitTimes,
      hitScores: this.hitScores,
    };
    const x = result.points;
    if (result.counted) addStat(x, trialSetup());
    this.hintGroup.visible(true);
    this.hitMarkers.forEach(m => m.radius(2));
    const txt = new Konva.Text({
      text: `${x}`,
      fontSize: 20,
      fill: gradientColor(result.score),
      shadowColor: theme.background,
      shadowBlur: 0,
      shadowOffset: { x: 1, y: 1 },
      shadowOpacity: 1,
    });
    txt.position(new Point(20, -10).add(this.startPos).plain());
    this.addShape(txt);
    // Display trail.
    this.hitVectors.forEach((v, idx) => {
      const p = this.displayPattern[idx] || new Point();
      const vd = screen(v);
      const hit = this.startPos.clone().add(vd);
      let traceTarget = this.startPos.clone().sub(p);
      const clr = gradientColor(this.hitScores[idx] || 0);
      const b = new Konva.Circle({
        radius: 2,
        fill: clr,
        position: this.startPos.clone().add(vd),
        visible: false,
      });
      if (this.traceShapes[0] && this.traceShapes[0][idx]) {
        (this.traceShapes[0][idx] as Konva.Circle).position(vd.clone().add(p).add(this.startPos));
      }
      this.hintGroup.add(b);
      this.traceShapes[1].push(b);
      const ln = new Konva.Line({
        points: [hit.x, hit.y, traceTarget.x, traceTarget.y],
        stroke: clr,
        strokeWidth: 1,
        visible: false,
      });
      this.traceShapes[2].push(ln);
      this.hintGroup.add(ln);
    });
    this.displayTrace();
    this.hintGroup.offset(new Point());
    this.wallGroup.offset(new Point());
    this.recoilGroup.offset(new Point());
    target.offset(new Point());
    this.crossHair?.visible(false);
    stage.container().classList.remove('no-cursor');
    redraw();
  }
  displayTrace() {
    const d = aTraceMode.get() % traceShapeTypes;
    this.traceShapes.forEach((sh, i) => sh.forEach(s => s.visible(i == d)));
  }
  clear() {
    this.shapes.forEach(s => s.destroy());
    this.shapes = [];
  }
  addShape(s: Konva.Shape | Konva.Group) {
    this.shapes.push(s);
    layer.add(s);
  }
}
let shooting = new Shooting();

export function initGame() {
  const version = document.getElementById('version-value');
  if (version != null) version.innerText = '240915';
  initAttributes(NS);
  /* https://konvajs.org/docs/sandbox/Animation_Stress_Test.html#page-title
  * setting the listening property to false will improve
  * drawing performance because the rectangles won't have to be
  * drawn onto the hit graph */
  layer.listening(false);
  layer.add(startRectangle);
  loadStats();
  soundControls();
  instructionsControls();
  weaponControls();
  statControls();
  const urlSearchParams = new URLSearchParams(window.location.search);
  if (urlSearchParams.has('dev')) dev = true;
  {
    const d = document.querySelector(`#invert-y-btn`) as HTMLDivElement;
    if (d != null) {
      d.addEventListener('click', () => aInvertY.set(!aInvertY.get()));
      aInvertY.watch((v: boolean) => setClass(d, 'selected', v));
    }
  }
  watch([aWeapon, aMag, aSens, aInvertY, aMods, aScaleX, aScaleY, aCorruptedStock, aFireMode], () => {
    if (shooting.running) return;
    shooting.clear();
    tracePreview?.clear();
    tracePreview = new TracePreview();
    redrawStartRectangle();
  });
  // watch([aScaleX, aScaleY], () => {
  //   console.log('scale', aScaleX.get(), aScaleY.get());
  //   layer.scaleX(aScaleX.get());
  //   layer.scaleY(aScaleY.get());
  //   redraw(); 
  // });
  window.addEventListener('resize', () => {
    redrawStartRectangle();
  });
  aShowDetailedStats.watch(redrawStartRectangle);
  aShowInstructions.watch(redrawStartRectangle);
  watch([aStats, aMag, aWeapon, aHint, aMods, aCorruptedStock, aMovingTarget], showStats);
  {
    const b = document.getElementById('speed-value');
    if (b) aFireSpeed.watch((s: number) => {
      b.innerText = `x ${s / 100}`;
    });
  }
  aTraceMode.watch(() => {
    shooting.displayTrace();
    redraw();
  });
  aShowSensitivityWarn.watch((v: boolean) => {
    const w = document.getElementById('sensitivity-warning');
    if (w == null) return;
    if (v) {
      w.classList.remove('hidden');
    } else {
      w.classList.add('hidden');
    }
  });
  stage.on('mousedown', function (e: Konva.KonvaEventObject<MouseEvent>) {
    e.evt.preventDefault();
    switch (e.evt.button) {
      case 0:
        // A press during a run fires its next shot or burst; one after it ends starts the next run
        if (shooting.running) shooting.press();
        if (!shooting.running) {
          shooting.clear();
          shooting = new Shooting();
          tracePreview?.clear();
          tracePreview = null;
          shooting.start();
        }
        break;
      case 1:
        aTraceMode.set((aTraceMode.get() + 1) % traceShapeTypes);
        break;
      default:
        break;
    }
  });
  stage.on('mouseup', function (e: Konva.KonvaEventObject<MouseEvent>) {
    if (e.evt.button == 0 && shooting.running) {
      shooting.release();
    }
  });
  hotkeys('b', () => {
    toggleFireMode();
  });
  hotkeys('escape', () => {
    if (aShowInstructions.get()) {
      aShowInstructions.set(false);
    }
    const detailedStats = document.getElementById('detailed-stats');
    if (detailedStats && !detailedStats.classList.contains('hidden')) {
      detailedStats.classList.add('hidden');
    }
  });
  aMovingTarget.watch((v: boolean) => {
    target.onSettingsUpdated();
  });
  aTargetSpeed.watch((v: number) => {
    const e = document.getElementById("target-speed-value");
    if (e) e.innerText = `${v}`;
    target.onSettingsUpdated();
  });
  {
    const btnModeMoving = assertExists(document.getElementById('mode-moving'));
    const btnFixedPath = assertExists(document.getElementById('mode-fixed-path'));
    const btnFixed = assertExists(document.getElementById('mode-fixed'));
    watch([aHint, aMovingTarget], () => {
      btnFixed.classList.remove('selected');
      btnFixedPath.classList.remove('selected');
      btnModeMoving.classList.remove('selected');
      if (aMovingTarget.get()) {
        btnModeMoving.classList.add('selected');
        return;
      }
      if (aHint.get()) {
        btnFixedPath.classList.add('selected');
        return;
      }
      btnFixed.classList.add('selected');
    });
    btnFixedPath.addEventListener('click', () => {
      aHint.set(true);
      aMovingTarget.set(false);
    });
    hotkeys('a', () => {
      aHint.set(true);
      aMovingTarget.set(false);
    });
    btnFixed.addEventListener('click', () => {
      aHint.set(false);
      aMovingTarget.set(false);
    });
    hotkeys('s', () => {
      aHint.set(false);
      aMovingTarget.set(false);
    });
    btnModeMoving.addEventListener('click', () => {
      aHint.set(false);
      aMovingTarget.set(true);
    });
    hotkeys('d', () => {
      aHint.set(false);
      aMovingTarget.set(true);
    });
  }
  {
    const btnRecoilTarget = assertExists(document.getElementById('recoil-target'));
    const btnRecoilWeapon = assertExists(document.getElementById('recoil-weapon'));
    aRecoilWeapon.watch((v: boolean) => {
      if (v) {
        btnRecoilTarget.classList.remove('selected');
        btnRecoilWeapon.classList.add('selected');
      } else {
        btnRecoilTarget.classList.add('selected');
        btnRecoilWeapon.classList.remove('selected');
      }
    });
    btnRecoilWeapon.addEventListener('click', () => {
      aRecoilWeapon.set(true);
    });
    btnRecoilTarget.addEventListener('click', () => {
      aRecoilWeapon.set(false);
    });
  }
  {
    for (let i = 0; i < traceShapeTypes; i++) {
      const e = assertExists(document.getElementById(`trace-${i}`));
      e.addEventListener('click', () => aTraceMode.set(i));
    }
    aTraceMode.watch((v: number) => {
      for (let i = 0; i < traceShapeTypes; i++) {
        const e = assertExists(document.getElementById(`trace-${i}`));
        setClass(e, 'selected', i == v);
      }
    });
  }

  const fpsTxt = new Konva.Text({
    text: `FPS: -`,
    fontSize: 14,
    fill: theme.foreground,
    shadowBlur: 0,
    shadowOffset: { x: 1, y: 1 },
    shadowOpacity: 1,
    x: 10,
    y: 10,
  });
  layer.add(fpsTxt);
  const fps: number[] = [];
  for (let i = 0; i < 10; i++) fps.push(0);
  let fpsIdx = 0;
  let fpsSum = 0;
  animation = new Konva.Animation((f: any) => {
    const a = target.frame(f);
    const b = shooting.frame();
    if (a || b) {
      fpsIdx = (fpsIdx + 1) % 10;
      fpsSum += f.frameRate - fps[fpsIdx];
      fps[fpsIdx] = f.frameRate;
      fpsTxt.text(`FPS: ${Math.round(fpsSum / 10)}`);
    }
    return a || b;
  }, [layer]);
  animation.start();
}