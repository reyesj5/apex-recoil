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

// Recoil pattern editing on the Konva stage: bullet holes and edges, undo/redo, the legacy image
// import with automatic target detection, and drawing the selected weapon's spec.
import Konva from 'konva';
import { MagInfo, Weapon } from '../../game';
import { layer, stage } from '../../stage';
import { watch } from '../../storage';
import { PlainPoint, Point } from '../../point';
import specs from '../../specs.json';
import { Edge } from '../types';
import {
  points,
  anchors,
  weapons,
  aDistance,
  aWeapon,
  aStock,
  aBarrel,
  aPoints,
  aEdges,
  aImageData,
  aAnchors,
  aThreshold,
  aSens,
  aTargetFrom,
  aTargetTo,
  aEnableThreshold,
  aAutoTargets,
  aComment,
  activeSessionData,
  activeBgImageScale,
  currentBgImageObj,
  correctionExpectedShots,
  setActiveSessionData,
  setActiveBgImageScale,
  setActiveBgImageOffset,
  setCurrentBgImageObj
} from './state';
import { syncStageSize } from './layout';
import { isMoveAllActive, isPatternVisible, patternOpacity } from './toolbar';
import {
  getActiveOpticZoom,
  getMouseToPixelScale,
  getActiveCaptureDecals,
  computeCaptureToSpecScale
} from './calibration';
import { loadedSpecsList } from './weapon_manager';

let edges: Edge[] = [];
let img: Konva.Image | null = null;
let auto_points: Konva.Circle[] = [];
let edgeStartName = '';
let idxCounter = 0;
let imageMask = new Array<Array<number>>();

export function acceptAuto() {
  saveUndoState();
  auto_points.forEach(p => {
    insertBulletHole(p.position());
    p.remove();
  });
  auto_points = [];
  updateShapes();
  stage.batchDraw();
}

export function initImage() {
  watch([aThreshold, aEnableThreshold, aAutoTargets, aTargetTo, aTargetFrom], () => {
    // Re-cache image to apply updated filter parameters to canvas, then batch-draw stage
    if (img && img.isCached()) {
      img.cache();
      stage.batchDraw();
    }
  });
  aImageData.watch((s: string) => {
    if (s === '' || s === '[]') {
      if (img != null) {
        img.remove();
        img = null;
        stage.batchDraw();
      }
      return;
    }
    Konva.Image.fromURL(s, function (x: Konva.Image) {
      if (img != null && img !== x) {
        img.remove();
      }
      if (currentBgImageObj != null && currentBgImageObj !== x) {
        currentBgImageObj.remove();
      }
      img = x;
      setCurrentBgImageObj(x);
      layer.add(img);
      img.moveToBottom();

      const { width: stageW, height: stageH } = syncStageSize();
      const padding = 20;
      const s = Math.min((stageW - padding * 2) / img.width(), (stageH - padding * 2) / img.height(), 1.0);
      const offsetX = Math.max(0, (stageW - img.width() * s) / 2);
      const offsetY = Math.max(0, (stageH - img.height() * s) / 2);

      setActiveBgImageScale(s);
      setActiveBgImageOffset({ x: offsetX, y: offsetY });

      img.scale({ x: s, y: s });
      img.position({ x: offsetX, y: offsetY });
      img.zIndex(0);
      img.cache();
      img.filters([autoFilter]);
      imageMask = new Array<Array<number>>(img.width());
      for (let i = 0; i < img.width(); i++) {
        imageMask[i] = new Array<number>(img.height());
        for (let j = 0; j < img.height(); j++) imageMask[i][j] = 0;
      }
      stage.batchDraw();
    });
  });
}

export function clear() {
  saveUndoState();
  clearCanvasForOverlay();
  if (img != null) {
    img.remove();
    img = null;
  }
  if (currentBgImageObj != null) {
    currentBgImageObj.remove();
    setCurrentBgImageObj(null);
  }
  setActiveSessionData(null);
  updateShapes();
  stage.batchDraw();
};

export function setupControls() {
  const fileSelector = document.getElementById('file-selector') as HTMLInputElement;
  fileSelector?.addEventListener('change', () => {
    const fileList = fileSelector.files;
    if (fileList == null) return;
    const file = fileList.item(0);
    if (!file) return;
    aComment.set(file.name);
    const mm = file.name.match(/(?:.* )?([0-9.]+)\.png/)
    if (mm != null) {
      console.log(mm);
      aDistance.set(Number(mm[1]));
    }
    const reader = new FileReader();
    reader.addEventListener('load', (event) => {
      clear();
      aImageData.set((event.target?.result as string) || '');
    });
    reader.readAsDataURL(file);
  });

  const clearBgBtn = document.getElementById('clear-bg-img-btn') as HTMLButtonElement | null;
  clearBgBtn?.addEventListener('click', () => {
    aImageData.set('');
    if (img != null) {
      img.remove();
      img = null;
    }
    layer.children.forEach(child => {
      if (child instanceof Konva.Image) child.remove();
    });
    stage.batchDraw();
  });
}

export function getAdaptiveMarkerRadius(): number {
  const s = stage.scaleX() || 1.0;
  // Pinpoint marker: target visual screen radius of ~4.5px regardless of stage zoom level
  return Math.max(0.8, 4.5 / s);
}

export function getAdaptiveStrokeWidth(isSpecial: boolean = false): number {
  const s = stage.scaleX() || 1.0;
  return (isSpecial ? 2.0 : 1.2) / s;
}

export function getAdaptiveLineWidth(): number {
  const s = stage.scaleX() || 1.0;
  return Math.max(0.5, 1.8 / s);
}

export function updateMarkerScales() {
  const r = getAdaptiveMarkerRadius();
  const swNormal = getAdaptiveStrokeWidth(false);
  const swSpecial = getAdaptiveStrokeWidth(true);
  const hitW = Math.max(2.0, 3.5 / (stage.scaleX() || 1.0));
  points.forEach((c) => {
    const isShotZero = c.name() === '0';
    c.radius(r);
    c.strokeWidth(isShotZero || anchors.has(c.name()) ? swSpecial : swNormal);
    (c as any).hitStrokeWidth?.(hitW);
  });
  const lw = getAdaptiveLineWidth();
  edges.forEach((e) => {
    e.line.strokeWidth(lw);
  });
  stage.batchDraw();
}

interface EditorHistorySnapshot {
  coords: PlainPoint[];
  anchors: string[];
}

const MAX_UNDO_STACK_SIZE = 50;
const undoStack: EditorHistorySnapshot[] = [];
const redoStack: EditorHistorySnapshot[] = [];
let isApplyingHistory = false;

function getCurrentEditorSnapshot(): EditorHistorySnapshot {
  const currentPts = getOrderedPoints();
  return {
    coords: currentPts.map(c => ({ x: c.x(), y: c.y() })),
    anchors: Array.from(anchors)
  };
}

export function saveUndoState() {
  if (isApplyingHistory) return;
  const snap = getCurrentEditorSnapshot();
  undoStack.push(snap);
  if (undoStack.length > MAX_UNDO_STACK_SIZE) {
    undoStack.shift();
  }
  redoStack.length = 0;
  updateUndoRedoUI();
}

export function updateUndoRedoUI() {
  const undoBtn = document.getElementById('undo-stage-btn') as HTMLButtonElement | null;
  const redoBtn = document.getElementById('redo-stage-btn') as HTMLButtonElement | null;
  if (undoBtn) {
    undoBtn.disabled = undoStack.length === 0;
    undoBtn.title = undoStack.length > 0 ? `Undo last action [Ctrl+Z] (${undoStack.length} states)` : 'Undo last action [Ctrl+Z]';
  }
  if (redoBtn) {
    redoBtn.disabled = redoStack.length === 0;
    redoBtn.title = redoStack.length > 0 ? `Redo [Ctrl+Y / Ctrl+Shift+Z] (${redoStack.length} states)` : 'Redo [Ctrl+Y / Ctrl+Shift+Z]';
  }
}

export function performUndo() {
  if (undoStack.length === 0) return;
  const currentState = getCurrentEditorSnapshot();
  redoStack.push(currentState);
  const prevState = undoStack.pop()!;
  applyEditorSnapshot(prevState);
  updateUndoRedoUI();
}

export function performRedo() {
  if (redoStack.length === 0) return;
  const currentState = getCurrentEditorSnapshot();
  undoStack.push(currentState);
  const nextState = redoStack.pop()!;
  applyEditorSnapshot(nextState);
  updateUndoRedoUI();
}

function applyEditorSnapshot(snap: EditorHistorySnapshot) {
  isApplyingHistory = true;
  try {
    const anchorSet = new Set(snap.anchors.map(Number));
    rebuildSequencePattern(snap.coords, anchorSet);
  } finally {
    isApplyingHistory = false;
  }
}

export function getOrderedPoints(): Konva.Circle[] {
  return Array.from(points.keys())
    .map(Number)
    .sort((a, b) => a - b)
    .map(k => points.get(String(k))!)
    .filter(Boolean);
}

export function rebuildSequencePattern(orderedCoords: PlainPoint[], preserveAnchors: Set<number> = new Set()) {
  points.forEach(p => p.destroy());
  points.clear();
  edges.forEach(e => e.line.destroy());
  edges = [];
  anchors.clear();
  idxCounter = 0;

  for (let i = 0; i < orderedCoords.length; i++) {
    addPoint(orderedCoords[i], `${i}`);
    if (preserveAnchors.has(i)) {
      anchors.add(`${i}`);
    }
    if (i > 0) {
      addEdge(`${i - 1}`, `${i}`);
    }
  }
  updateShapes();
  updateMarkerScales();
  syncSpecFromPoints();
  updateShotCorrectionStatus();
  stage.batchDraw();
}

export function insertBulletHole(newPos: PlainPoint) {
  saveUndoState();
  const currentPts = getOrderedPoints();
  if (currentPts.length === 0) {
    rebuildSequencePattern([newPos]);
    return;
  }
  if (currentPts.length === 1) {
    const p0 = { x: currentPts[0].x(), y: currentPts[0].y() };
    rebuildSequencePattern([p0, newPos]);
    return;
  }

  const coords: PlainPoint[] = currentPts.map(c => ({ x: c.x(), y: c.y() }));
  const N = coords.length;
  let bestIdx = N;
  let minCost = Infinity;

  // Option A: Prepend at start (index 0)
  const dStart = Math.hypot(newPos.x - coords[0].x, newPos.y - coords[0].y);
  const vFirst = { x: coords[1].x - coords[0].x, y: coords[1].y - coords[0].y };
  const toNewStart = { x: coords[0].x - newPos.x, y: coords[0].y - newPos.y };
  const dotFirst = toNewStart.x * vFirst.x + toNewStart.y * vFirst.y;
  const costStart = dStart * (dotFirst > 0 ? 0.75 : 1.0);
  if (costStart < minCost) {
    minCost = costStart;
    bestIdx = 0;
  }

  // Option B: Append at end (index N)
  const dEnd = Math.hypot(newPos.x - coords[N - 1].x, newPos.y - coords[N - 1].y);
  const vLast = { x: coords[N - 1].x - coords[N - 2].x, y: coords[N - 1].y - coords[N - 2].y };
  const toNewEnd = { x: newPos.x - coords[N - 1].x, y: newPos.y - coords[N - 1].y };
  const dotLast = toNewEnd.x * vLast.x + toNewEnd.y * vLast.y;
  const costEnd = dEnd * (dotLast > 0 ? 0.75 : 1.0);
  if (costEnd < minCost) {
    minCost = costEnd;
    bestIdx = N;
  }

  // Option C: Insert between coords[i] and coords[i+1] (index i + 1)
  for (let i = 0; i < N - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const lenSq = vx * vx + vy * vy;
    if (lenSq < 1e-4) continue;
    const t = ((newPos.x - a.x) * vx + (newPos.y - a.y) * vy) / lenSq;
    const tClamped = Math.max(0, Math.min(1, t));
    const projX = a.x + tClamped * vx;
    const projY = a.y + tClamped * vy;
    const dist = Math.hypot(newPos.x - projX, newPos.y - projY);
    const isInterior = t >= 0.05 && t <= 0.95;
    const costSeg = dist + (isInterior ? 0 : 15);
    if (costSeg < minCost) {
      minCost = costSeg;
      bestIdx = i + 1;
    }
  }

  coords.splice(bestIdx, 0, newPos);
  rebuildSequencePattern(coords);
}

export function deleteBulletHole(targetIdx: number) {
  saveUndoState();
  const currentPts = getOrderedPoints();
  if (targetIdx < 0 || targetIdx >= currentPts.length) return;
  const coords: PlainPoint[] = [];
  for (let i = 0; i < currentPts.length; i++) {
    if (i !== targetIdx) {
      coords.push({ x: currentPts[i].x(), y: currentPts[i].y() });
    }
  }
  rebuildSequencePattern(coords);
}

function updateEdgePoints() {
  edges.forEach(e => {
    const a = points.get(e.from);
    const b = points.get(e.to);
    if (a && b) {
      e.line.points([a.x(), a.y(), b.x(), b.y()]);
    }
  });
}

export function updateShapes() {
  const swNormal = getAdaptiveStrokeWidth(false);
  const swSpecial = getAdaptiveStrokeWidth(true);
  points.forEach((c) => {
    const isShotZero = c.name() === '0';
    c.stroke(anchors.has(c.name()) ? '#ef4444' : (isShotZero ? '#22c55e' : '#f8fafc'));
    c.strokeWidth(isShotZero || anchors.has(c.name()) ? swSpecial : swNormal);
  });
  edges = edges.filter(e => {
    const z = points.has(e.from) && points.has(e.to);
    if (!z) e.line.remove();
    return z;
  });
  const lw = getAdaptiveLineWidth();
  edges.forEach(e => {
    const a = points.get(e.from)!;
    const b = points.get(e.to)!;
    e.line.points([a.x(), a.y(), b.x(), b.y()]);
    e.line.stroke('#f59e0b');
    e.line.strokeWidth(lw);
  });
  updateSpec();
}

export function addPoint(p: PlainPoint, name: string) {
  idxCounter = Math.max(idxCounter, Number(name) + 1);
  const isShotZero = name === '0';
  const r = getAdaptiveMarkerRadius();
  const sw = getAdaptiveStrokeWidth(isShotZero);

  const c = new Konva.Circle({
    radius: r,
    fill: isShotZero ? 'rgba(34, 197, 94, 0.45)' : 'rgba(14, 165, 233, 0.35)',
    stroke: isShotZero ? '#22c55e' : '#f8fafc',
    strokeWidth: sw,
    hitStrokeWidth: Math.max(2.0, 3.5 / (stage.scaleX() || 1.0)),
    position: p,
    draggable: true,
    name,
    visible: isPatternVisible,
    opacity: patternOpacity,
  });
  let dragStartPos = { x: 0, y: 0 };
  c.on('dragstart', function () {
    saveUndoState();
    c.moveToTop();
    dragStartPos = { x: c.x(), y: c.y() };
  });
  c.on('dragmove', function () {
    if (isMoveAllActive) {
      const dx = c.x() - dragStartPos.x;
      const dy = c.y() - dragStartPos.y;
      dragStartPos = { x: c.x(), y: c.y() };
      points.forEach((otherPoint) => {
        if (otherPoint !== c) {
          otherPoint.position({
            x: otherPoint.x() + dx,
            y: otherPoint.y() + dy
          });
        }
      });
    }
    updateEdgePoints();
    stage.batchDraw();
  });
  c.on('dragend', function () {
    updateShapes();
    syncSpecFromPoints();
    updateShotCorrectionStatus();
    stage.batchDraw();
  });
  c.on('mousedown', function (e) {
    if (e.evt.button === 2) {
      e.cancelBubble = true;
      e.evt.preventDefault();
      deleteBulletHole(Number(c.name()));
      return;
    }
    if (e.evt.button === 1) {
      e.cancelBubble = true;
      if (anchors.has(name)) {
        anchors.delete(name);
      } else {
        anchors.add(name);
      }
      updateShapes();
      stage.batchDraw();
      return;
    }
  });
  points.set(name, c);
  updateShapes();
  layer.add(c);
  stage.batchDraw();
}

export function syncSpecFromPoints() {
  if (points.size === 0) return;
  const sortedNames = Array.from(points.keys()).sort((a, b) => Number(a) - Number(b));
  const p0 = points.get(sortedNames[0]);
  if (!p0) return;

  const hasBg = !!currentBgImageObj;
  const scale = (activeBgImageScale && activeBgImageScale > 0) ? activeBgImageScale : (hasBg ? 1.0 : 0.65);
  const zoom = getActiveOpticZoom();
  const imgH = currentBgImageObj?.height() || 1080;
  const captureDecals = getActiveCaptureDecals();
  const empiricalScale = hasBg ? computeCaptureToSpecScale(captureDecals) : null;
  const mouseToPx = hasBg ? ((empiricalScale && empiricalScale > 0) ? empiricalScale : getMouseToPixelScale(imgH, zoom)) : 1.0;

  const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
  const targetW = sel
    ? loadedSpecsList.find(s => s.name === sel.value || (sel.value === 'havoc' && s.name === 'havoc_tc') || (sel.value === 'havoc_tc' && s.name === 'havoc'))
    : null;
  const mult = targetW?.multiplier || 1.0;

  const newX: number[] = [];
  const newY: number[] = [];
  for (const name of sortedNames) {
    const p = points.get(name)!;
    const dx = hasBg
      ? ((p.x() - p0.x()) / (scale * mouseToPx)) * mult
      : (p.x() - p0.x()) / scale;
    const dy = hasBg
      ? ((p.y() - p0.y()) / (scale * mouseToPx)) * mult
      : (p.y() - p0.y()) / scale;
    newX.push(Math.round(dx * 100) / 100);
    newY.push(Math.round(dy * 100) / 100);
  }

  if (targetW) {
    targetW.x = newX;
    targetW.y = newY;
    const rpm = targetW.rpm || 600;
    const interval = 60000 / rpm;
    targetW.time_points = newX.map((_, idx) => Math.round(idx * interval));

    const shotInfo = document.getElementById('spec-shot-info');
    if (shotInfo) shotInfo.innerText = `Shots: ${newX.length}`;

    const jsonImport = document.getElementById('json-import') as HTMLTextAreaElement | null;
    if (jsonImport) jsonImport.value = JSON.stringify(targetW, null, 2);
  }
  updateShotCorrectionStatus();
}

/**
 * Returns the expected magazine size (highest tier) for the currently selected weapon.
 * Used to compare against detected shot counts to flag mismatches.
 */
export function getExpectedMagSize(): number {
  const mag4 = document.getElementById('mag-4') as HTMLInputElement | null;
  const mag3 = document.getElementById('mag-3') as HTMLInputElement | null;
  const mag2 = document.getElementById('mag-2') as HTMLInputElement | null;
  const mag1 = document.getElementById('mag-1') as HTMLInputElement | null;
  const mag0 = document.getElementById('mag-0') as HTMLInputElement | null;
  // Use highest available tier (Corrupted > L3 > L2 > L1 > Base)
  if (mag4 && mag4.value && Number(mag4.value) > 0) return Number(mag4.value);
  if (mag3 && mag3.value && Number(mag3.value) > 0) return Number(mag3.value);
  if (mag2 && mag2.value && Number(mag2.value) > 0) return Number(mag2.value);
  if (mag1 && mag1.value && Number(mag1.value) > 0) return Number(mag1.value);
  if (mag0 && mag0.value && Number(mag0.value) > 0) return Number(mag0.value);
  return 0;
}

/**
 * Updates the shot correction status panel in the stage toolbar.
 * Shows expected vs actual shot count and highlights mismatches.
 */
export function updateShotCorrectionStatus() {
  const statusEl = document.getElementById('shot-correction-status');
  if (!statusEl) return;

  const currentShots = points.size;
  const expected = correctionExpectedShots || getExpectedMagSize();

  if (expected <= 0 || !activeSessionData) {
    statusEl.classList.add('hidden');
    return;
  }

  statusEl.classList.remove('hidden');
  const diff = currentShots - expected;

  if (diff === 0) {
    statusEl.className = 'shot-correction-status match';
    statusEl.innerHTML = `<span class="correction-icon">\u2705</span> <span class="correction-label">${currentShots}/${expected} shots</span>`;
  } else if (diff < 0) {
    statusEl.className = 'shot-correction-status deficit';
    statusEl.innerHTML = `<span class="correction-icon">\u26a0\ufe0f</span> <span class="correction-label">${currentShots}/${expected} shots</span> <span class="correction-detail">(${Math.abs(diff)} missing)</span>`;
  } else {
    statusEl.className = 'shot-correction-status excess';
    statusEl.innerHTML = `<span class="correction-icon">\u26a0\ufe0f</span> <span class="correction-label">${currentShots}/${expected} shots</span> <span class="correction-detail">(${diff} extra)</span>`;
  }
}

export function clearCanvasForOverlay() {
  points.forEach(p => p.destroy());
  points.clear();
  edges.forEach(e => e.line.destroy());
  edges = [];
  anchors.clear();
  auto_points.forEach(p => p.destroy());
  auto_points = [];
  const children = [...layer.children];
  for (const c of children) {
    if (c !== currentBgImageObj) {
      c.destroy();
    }
  }
  edgeStartName = '';
  idxCounter = 0;
  stage.batchDraw();
}

export function addEdge(a: string, b: string) {
  if (b < a) [b, a] = [a, b];
  const e: Edge = {
    from: a,
    to: b,
    line: new Konva.Line({
      stroke: '#f59e0b',
      strokeWidth: 1.5,
      points: [],
      visible: isPatternVisible,
      opacity: patternOpacity,
    })
  };
  const ex = edges.find((t: Edge) => t.from == e.from && t.to == e.to);
  if (ex) {
    ex.line.remove();
    edges = edges.filter((t: Edge) => t.from != e.from || t.to != e.to);
  } else {
    edges.push(e);
    layer.add(e.line);
  }
}

function selectedWeapon(): Weapon {
  const w = weapons.get(aWeapon.get());
  if (w == null) throw Error("weapon not found");
  return w;
}

export function updateSpec(_?: string) {
  aPoints.set(JSON.stringify(Array.from(points.entries())
    .map((v: [string, Konva.Circle]) => [v[0], v[1].x(), v[1].y()])));
  aAnchors.set(JSON.stringify(Array.from(anchors.values())));
  aEdges.set(JSON.stringify(edges.map(e => [e.from, e.to])));
  let sens = aSens.get();
  let distance = aDistance.get();
  if (isNaN(sens) || isNaN(distance)) {
    setText('invalid value of one of the params');
    return;
  }
  const w = selectedWeapon();
  let idx = Array.from(anchors.values());
  idx.forEach(x => {
    if (!points.has(x)) anchors.delete(x);
  });
  // Traverse the path.
  const sortedPointKeys = Array.from(points.keys()).sort((a, b) => Number(a) - Number(b));
  let x = points.has('0') ? '0' : (edgeStartName || (sortedPointKeys.length > 0 ? sortedPointKeys[0] : ''));
  let pp: Point[] = [];
  const visited = new Set<string>();
  let i = 0;
  let anchorIndexes = [];
  while (true) {
    const p = points.get(x);
    if (p == null) break;
    pp.push(new Point(p.position()));
    if (anchors.has(p.name())) anchorIndexes.push(i);
    visited.add(x);
    const e = edges.find(e => {
      return (e.from == x && !visited.has(e.to)) ||
        (e.to == x && !visited.has(e.from));
    });
    if (e == null) break;
    x = (x == e.from) ? e.to : e.from;
    i++;
  }
  const c = document.getElementById("count");
  if (c) {
    let msg = `points: ${points.size} graph: ${pp.length} mag: ${w.mags[w.mags.length - 1].size}`;
    if (anchors.size > 0 && anchors.size !== 2) {
      msg += ` | ⚠️ Warning: Exactly 2 anchors required for distance calibration (selected: ${anchors.size})`;
    }
    c.innerText = msg;
  }
  if (anchors.size > 0 && anchors.size !== 2) {
    console.warn(`[RecoilEditor] Distance calibration requires exactly 2 anchors, but ${anchors.size} were selected.`);
  }
  idx = Array.from(anchors.values());
  if (pp.length === 0) {
    const spec = {
      version: 2,
      weapon: aWeapon.get(),
      barrel: aBarrel.get(),
      stock: aStock.get(),
      comment: aComment.get(),
      x: [],
      y: [],
      anchor_indexes: [],
      anchor_in_game_distance: aDistance.get(),
    };
    setText(JSON.stringify(spec));
    return;
  }
  const ort = pp[0];
  pp = pp.map(p => p.clone().sub(ort));
  const spec = {
    version: 2,
    weapon: aWeapon.get(),
    barrel: aBarrel.get(),
    stock: aStock.get(),
    comment: aComment.get(),
    x: pp.map(p => Math.round(p.x)),
    y: pp.map(p => Math.round(p.y)),
    anchor_indexes: anchorIndexes,
    anchor_in_game_distance: aDistance.get(),
  };
  setText(JSON.stringify(spec));
};

export function loadSpecs() {
  weapons.clear();
  specs.forEach(s => {
    weapons.set(s.name, {
      name: s.name,
      mags: s.mags.map(m => {
        var z: MagInfo = { size: m.size, audio: m.audio };
        return z;
      }),
      time_points: s.time_points,
      x: s.x,
      y: s.y,
      mods: {},
      ping_points: [],
    });
  });
}

function autoFilter(imageData: ImageData) {
  auto_points.forEach(p => p.remove());
  auto_points = [];
  const showThreshold = aEnableThreshold.get();
  const th = aThreshold.get();
  const h = imageData.height;
  const w = imageData.width;

  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      const p = (j * w + i) * 4;
      const v = imageData.data[p + 0];
      if (v < th) {
        imageMask[i][j] = v;
        if (showThreshold) {
          imageData.data[p + 0] = 255;
          imageData.data[p + 1] = 0;
          imageData.data[p + 2] = 0;
        }
      } else {
        imageMask[i][j] = 1000;
      }
    }
  }
  if (!aAutoTargets.get()) return;
  const targetFrom = aTargetFrom.get();
  const targetTo = aTargetTo.get();
  const fill = (x: number, y: number): [number, number, number, number] => {
    if (x < 0 || x >= w || y < 0 || y >= h || imageMask[x][y] > 255) return [x, y, 1000, 0];
    let best: [number, number, number, number] = [x, y, imageMask[x][y], 1];
    imageMask[x][y] = 1000;
    let size = 1;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const t = fill(x + i, y + j);
        size += t[3];
        if (t[2] < best[2]) best = t;
      }
    }
    best[3] = size;
    return best;
  }

  let detected = new Array<Point>();

  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      if (imageMask[i][j] > 255) continue;
      const b = fill(i, j);
      if (b[3] < targetFrom || b[3] > targetTo) continue;
      detected.push(new Point(b[0], b[1]));
    }
  }
  if (detected.length > 100) {
    setText(`too many points detected: ${detected.length}`);
    return;
  }
  auto_points = detected.map(p => {
    const ip = p.clone().s(img?.scaleX() || 1).plain();
    const c = new Konva.Circle({
      radius: 10,
      stroke: '#00e5ff',
      strokeWidth: 1.5,
      position: ip,
    });
    c.on('mousedown', function (e) {
      e.cancelBubble = true;
      addPoint(ip, `${idxCounter}`);
      c.hide();
    });
    layer.add(c);
    return c;
  });
}

function setText(t: string) {
  const c = document.getElementById("text");
  if (c) {
    c.innerText = t;
  }
}
