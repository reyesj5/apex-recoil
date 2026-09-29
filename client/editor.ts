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

import Konva from "konva";
import { MagInfo, Weapon, getWeaponModeConfig } from "./game";
import { cursor, layer, stage } from "./main";
import { NumericAttribute, StringAttribute, BooleanAttribute, watch, initAttributes } from './storage';
import { PlainPoint, Point } from "./point";
import specs from './specs.json';

interface Edge {
  from: string;
  to: string;
  line: Konva.Line;
};
let points = new Map<string, Konva.Circle>();
let edges: Edge[] = [];
const anchors = new Set<string>();
let img: Konva.Image | null = null;
const weapons = new Map<string, Weapon>();
let auto_points: Konva.Circle[] = [];
let edgeStartName = '';
let idxCounter = 0;
let imageMask = new Array<Array<number>>();
const NS = 'editor';
const aDistance = new NumericAttribute('distance', NS, 100);
const aWeapon = new StringAttribute('weapon', NS, 'r301');
const aStock = new NumericAttribute('stock', NS, 0);
const aBarrel = new NumericAttribute('barrel', NS, 0);
const aPoints = new StringAttribute('points', NS, '[]');
const aEdges = new StringAttribute('edges', NS, '[]');
const aImageData = new StringAttribute('imagedata', NS, '[]');
const aAnchors = new StringAttribute('anchors', NS, '[]');
const aThreshold = new NumericAttribute('threshold', NS, 0);
const aSens = new NumericAttribute('sens', NS, 5);
const aTargetFrom = new NumericAttribute('target-from', NS, 0);
const aTargetTo = new NumericAttribute('target-to', NS, 0);
const aEnableThreshold = new BooleanAttribute('enable-threshold', NS, true);
const aAutoTargets = new BooleanAttribute('auto-targets', NS, true);
const aConnectHover = new BooleanAttribute('connect-hover', NS, true);
const aComment =  new StringAttribute('comment', NS, '');

interface SessionTrialData {
  source: string;
  shots: number;
  x: number[];
  y: number[];
  raw_x?: number[];
  raw_y?: number[];
  frame_points?: [number, number][];
  origin?: [number, number];
  frame_image?: string;
  frame_width?: number;
  frame_height?: number;
  rpm?: number;
}

interface ActiveSessionData {
  spec: any;
  preview_image?: string;
  preview_points?: [number, number][];
  preview_origin?: [number, number];
  frame_width?: number;
  frame_height?: number;
  individual_trials?: SessionTrialData[];
  zoom: number;
  multiplier?: number;
}

interface BatchScreenshotItem {
  id: string;
  name: string;
  dataUrl: string;
  source: string;
  sourceUrl?: string;
  status: 'pending' | 'analyzing' | 'done' | 'error';
  shots?: number;
}

let batchScreenshots: BatchScreenshotItem[] = [];
let savedScreenshotsLibrary: any[] = [];
let cachedSessionsList: any[] = [];

let activeSessionData: ActiveSessionData | null = null;
let activeBgImageScale = 1.0;
let activeBgImageOffset = { x: 0, y: 0 };
let activeOpticZoom = 1.0;
let isMoveAllActive = false;
let currentBgImageObj: Konva.Image | null = null;

let isSpacePressed = false;
let isPanModeActive = false;
let isPanning = false;
let panStart = { x: 0, y: 0 };

function syncStageSize(): { width: number; height: number } {
  const stageContainer = document.getElementById('stage-container');
  const toolbar = document.getElementById('stage-toolbar');
  const stageEl = document.getElementById('stage');

  const toolbarH = toolbar?.offsetHeight || 0;
  const availW = stageContainer?.clientWidth || (stageEl?.clientWidth || (window.innerWidth - 380));
  const availH = (stageContainer?.clientHeight ? (stageContainer.clientHeight - toolbarH) : 0) || (stageEl?.clientHeight || (window.innerHeight - 50));

  if (availW > 50 && availH > 50) {
    if (stage.width() !== availW || stage.height() !== availH) {
      stage.width(availW);
      stage.height(availH);
    }
  }
  return { width: stage.width(), height: stage.height() };
}

function fitAndCenterCanvas() {
  stage.position({ x: 0, y: 0 });
  stage.scale({ x: 1, y: 1 });
  const { width: stageW, height: stageH } = syncStageSize();

  const previewSelect = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
  if (activeSessionData && previewSelect) {
    renderSelectedOverlay(previewSelect.value);
    return;
  }

  if (currentBgImageObj) {
    const imgW = currentBgImageObj.width() || 1920;
    const imgH = currentBgImageObj.height() || 1080;
    const padding = 20;
    const scale = Math.min((stageW - padding * 2) / imgW, (stageH - padding * 2) / imgH, 1.0);
    const offsetX = Math.max(0, (stageW - imgW * scale) / 2);
    const offsetY = Math.max(0, (stageH - imgH * scale) / 2);

    const oldScale = (activeBgImageScale && activeBgImageScale > 0) ? activeBgImageScale : (currentBgImageObj.scaleX() || 1.0);
    const oldOffset = activeBgImageOffset || { x: currentBgImageObj.x(), y: currentBgImageObj.y() };

    if (points.size > 0 && oldScale > 0) {
      points.forEach((circle) => {
        const relX = (circle.x() - oldOffset.x) / oldScale;
        const relY = (circle.y() - oldOffset.y) / oldScale;
        circle.position({
          x: offsetX + relX * scale,
          y: offsetY + relY * scale
        });
      });
      updateShapes();
    }

    activeBgImageScale = scale;
    activeBgImageOffset = { x: offsetX, y: offsetY };

    currentBgImageObj.scale({ x: scale, y: scale });
    currentBgImageObj.position({ x: offsetX, y: offsetY });
    stage.batchDraw();
    return;
  }

  if (points.size > 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach((p) => {
      minX = Math.min(minX, p.x());
      maxX = Math.max(maxX, p.x());
      minY = Math.min(minY, p.y());
      maxY = Math.max(maxY, p.y());
    });
    const curCenterX = (minX + maxX) / 2;
    const curCenterY = (minY + maxY) / 2;
    const targetCenterX = stageW / 2;
    const targetCenterY = stageH / 2;
    const dx = targetCenterX - curCenterX;
    const dy = targetCenterY - curCenterY;
    points.forEach((p) => {
      p.position({ x: p.x() + dx, y: p.y() + dy });
    });
    updateShapes();
    stage.batchDraw();
    return;
  }

  stage.batchDraw();
}

let stageResizeDebounce: any = null;
function handleStageResize() {
  syncStageSize();
  if (stageResizeDebounce) {
    cancelAnimationFrame(stageResizeDebounce);
  }
  stageResizeDebounce = requestAnimationFrame(() => {
    fitAndCenterCanvas();
  });
}

function setupSidebarToggle() {
  const toggleBtn = document.getElementById('toggle-sidebar-btn');
  const toolsEl = document.getElementById('tools');
  if (!toggleBtn || !toolsEl) return;

  const btn = toggleBtn;
  const panel = toolsEl;

  function setSidebarCollapsed(collapsed: boolean) {
    panel.classList.toggle('collapsed', collapsed);
    btn.innerText = collapsed ? '▶ Sidebar' : '◀ Sidebar';
    btn.title = collapsed ? 'Expand Sidebar Menu [M]' : 'Collapse Sidebar Menu [M]';
    try {
      localStorage.setItem('editor_sidebar_collapsed', collapsed ? 'true' : 'false');
    } catch (e) {}
    setTimeout(() => {
      handleStageResize();
    }, 260);
  }

  toggleBtn.addEventListener('click', () => {
    const isCollapsed = toolsEl.classList.contains('collapsed');
    setSidebarCollapsed(!isCollapsed);
  });

  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      const isCollapsed = toolsEl.classList.contains('collapsed');
      setSidebarCollapsed(!isCollapsed);
    }
  });

  let savedCollapsed = false;
  try {
    savedCollapsed = localStorage.getItem('editor_sidebar_collapsed') === 'true';
  } catch (e) {}
  if (savedCollapsed) {
    setSidebarCollapsed(true);
  }
}

function setupRecordingMethodTabs() {
  const tabs = document.querySelectorAll<HTMLButtonElement>('.method-tab-btn');
  const panels = document.querySelectorAll<HTMLElement>('.method-panel');
  if (!tabs.length) return;

  function selectMethod(method: string) {
    tabs.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.method === method);
    });
    panels.forEach(p => {
      p.classList.toggle('hidden', p.id !== `method-panel-${method}`);
    });
    try {
      localStorage.setItem('editor_recording_method', method);
    } catch (e) {}
  }

  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.method;
      if (m) selectMethod(m);
    });
  });

  let savedMethod = 'live';
  try {
    savedMethod = localStorage.getItem('editor_recording_method') || 'live';
  } catch (e) {}
  selectMethod(savedMethod);
}

interface AnalysisConfirmOptions {
  actionTitle: string;
  defaultWeapon: string;
  defaultMode: string;
  defaultSave: boolean;
  onConfirm: (weapon: string, mode: string, saveCapture: boolean) => void;
}

let activeAnalysisConfirmCallback: ((weapon: string, mode: string, saveCapture: boolean) => void) | null = null;

function setupAnalysisConfirmModal() {
  const modal = document.getElementById('analysis-confirm-modal');
  const closeBtn = document.getElementById('close-confirm-modal-btn');
  const cancelBtn = document.getElementById('cancel-analysis-btn');
  const proceedBtn = document.getElementById('proceed-analysis-btn');
  const weaponSel = document.getElementById('modal-weapon-select') as HTMLSelectElement | null;
  const modeSel = document.getElementById('modal-mode-select') as HTMLSelectElement | null;

  function closeModal() {
    modal?.classList.add('hidden');
    activeAnalysisConfirmCallback = null;
  }

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  weaponSel?.addEventListener('change', () => {
    if (!weaponSel || !modeSel) return;
    const wName = weaponSel.value;
    const cfg = getWeaponModeConfig(wName);
    modeSel.innerHTML = '';
    cfg.modes.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.text = m.toUpperCase();
      modeSel.appendChild(opt);
    });
    modeSel.value = cfg.defaultMode;
  });

  proceedBtn?.addEventListener('click', () => {
    if (!activeAnalysisConfirmCallback || !weaponSel || !modeSel) return;
    const chosenWeapon = weaponSel.value;
    const chosenMode = modeSel.value;
    const saveCheck = document.getElementById('modal-save-capture') as HTMLInputElement | null;
    const shouldSave = saveCheck ? saveCheck.checked : true;

    // Synchronize the main weapon manager UI so it matches the confirmed weapon and mode
    const mainWeaponSel = document.getElementById('weapon-select') as HTMLSelectElement | null;
    if (mainWeaponSel && mainWeaponSel.value !== chosenWeapon) {
      mainWeaponSel.value = chosenWeapon;
      loadWeaponIntoManager(chosenWeapon);
    }
    const mainModeSel = document.getElementById('weapon-mode-select') as HTMLSelectElement | null;
    if (mainModeSel) {
      mainModeSel.value = chosenMode;
    }

    const cb = activeAnalysisConfirmCallback;
    closeModal();
    cb(chosenWeapon, chosenMode, shouldSave);
  });
}

function promptAnalysisConfirmation(opts: AnalysisConfirmOptions) {
  const modal = document.getElementById('analysis-confirm-modal');
  const weaponSel = document.getElementById('modal-weapon-select') as HTMLSelectElement | null;
  const modeSel = document.getElementById('modal-mode-select') as HTMLSelectElement | null;
  const saveCheck = document.getElementById('modal-save-capture') as HTMLInputElement | null;
  if (!modal || !weaponSel || !modeSel) return;

  weaponSel.innerHTML = '';
  loadedSpecsList.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.name;
    opt.text = s.name.toUpperCase();
    if (s.name === opts.defaultWeapon) opt.selected = true;
    weaponSel.appendChild(opt);
  });

  const cfg = getWeaponModeConfig(opts.defaultWeapon);
  modeSel.innerHTML = '';
  cfg.modes.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.text = m.toUpperCase();
    if (m === opts.defaultMode) opt.selected = true;
    modeSel.appendChild(opt);
  });

  if (saveCheck) {
    saveCheck.checked = opts.defaultSave;
  }

  activeAnalysisConfirmCallback = opts.onConfirm;
  modal.classList.remove('hidden');
}

export function setupEditor() {
  syncStageSize();
  const stageContainer = document.getElementById('stage-container');
  if (typeof ResizeObserver !== 'undefined' && stageContainer) {
    const ro = new ResizeObserver(() => {
      handleStageResize();
    });
    ro.observe(stageContainer);
  } else {
    window.addEventListener('resize', handleStageResize);
  }
  initAttributes(NS);
  setupControls();
  setupStageToolbarControls();
  setupSidebarToggle();
  setupRecordingMethodTabs();
  setupAnalysisConfirmModal();
  setupOfflineScreenshotAnalysis();
  setupPastSessionsManager();
  initImage();
  loadSpecs();
  initWeaponManagerUI();
  aComment.watch((v: string) => {
    const comment = document.getElementById('comment');
    if (comment != null) (comment as HTMLTextAreaElement).value = v;
  });
  stage.on('mousedown', function (e: Konva.KonvaEventObject<MouseEvent>) {
    if (e.evt.button === 1 || e.evt.button === 2 || e.evt.altKey || isSpacePressed || isPanModeActive || (e.evt.shiftKey && e.target === stage)) {
      return;
    }
    if (e.target === stage || e.target === currentBgImageObj) {
      addPoint(cursor().plain(), `${idxCounter}`);
      syncSpecFromPoints();
    }
  });
  watch([aSens, aDistance, aWeapon, aBarrel, aStock, aComment], updateSpec);
  (document.getElementById('accept-auto') as HTMLButtonElement)?.addEventListener('click', acceptAuto);
  (document.getElementById('clear') as HTMLButtonElement)?.addEventListener('click', clear);
  const attAnchors = JSON.parse(aAnchors.get());
  const attPoints = JSON.parse(aPoints.get());
  const attEdges = JSON.parse(aEdges.get());
  attAnchors.forEach((x: string) => anchors.add(x));
  attPoints.forEach((p: [string, number, number]) => addPoint({ x: p[1], y: p[2] }, p[0]));
  attEdges.forEach((v: [string, string]) => addEdge(v[0], v[1]));
  updateShapes();
  stage.batchDraw();
}

function setupStageToolbarControls() {
  const toggleBg = document.getElementById('toggle-bg-img') as HTMLInputElement | null;
  const opacitySlider = document.getElementById('bg-opacity-slider') as HTMLInputElement | null;
  const opacityVal = document.getElementById('bg-opacity-val');
  const previewSelect = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
  const moveAllBtn = document.getElementById('move-all-toggle-btn') as HTMLButtonElement | null;
  const recenterBtn = document.getElementById('recenter-stage-btn') as HTMLButtonElement | null;
  const clearBgBtn = document.getElementById('clear-stage-bg-btn') as HTMLButtonElement | null;
  const panModeBtn = document.getElementById('pan-mode-toggle-btn') as HTMLButtonElement | null;

  toggleBg?.addEventListener('change', () => {
    if (currentBgImageObj) {
      currentBgImageObj.visible(toggleBg.checked);
      stage.batchDraw();
    }
  });

  opacitySlider?.addEventListener('input', () => {
    const v = Number(opacitySlider.value);
    if (opacityVal) opacityVal.innerText = `${v}%`;
    if (currentBgImageObj) {
      currentBgImageObj.opacity(v / 100);
      stage.batchDraw();
    }
  });

  previewSelect?.addEventListener('change', () => {
    if (!activeSessionData) return;
    renderSelectedOverlay(previewSelect.value);
  });

  const prevBtn = document.getElementById('prev-stage-img-btn') as HTMLButtonElement | null;
  const nextBtn = document.getElementById('next-stage-img-btn') as HTMLButtonElement | null;

  prevBtn?.addEventListener('click', () => {
    switchBatchScreenshot(activeBatchIndex - 1);
  });

  nextBtn?.addEventListener('click', () => {
    switchBatchScreenshot(activeBatchIndex + 1);
  });

  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      return;
    }
    if (e.key === '[' || e.key === '{') {
      switchBatchScreenshot(activeBatchIndex - 1);
    } else if (e.key === ']' || e.key === '}') {
      switchBatchScreenshot(activeBatchIndex + 1);
    }
  });

  moveAllBtn?.addEventListener('click', () => {
    isMoveAllActive = !isMoveAllActive;
    if (moveAllBtn) {
      moveAllBtn.classList.toggle('active', isMoveAllActive);
      moveAllBtn.innerText = isMoveAllActive ? '✥ Move All: ON' : '✥ Move All (Align)';
    }
  });

  panModeBtn?.addEventListener('click', () => {
    isPanModeActive = !isPanModeActive;
    if (panModeBtn) {
      panModeBtn.classList.toggle('active', isPanModeActive);
      panModeBtn.innerText = isPanModeActive ? '✋ Pan Canvas: ON' : '✋ Pan Canvas';
    }
    const stageContainer = document.getElementById('stage');
    if (stageContainer) stageContainer.style.cursor = isPanModeActive ? 'grab' : 'crosshair';
  });

  recenterBtn?.addEventListener('click', () => {
    fitAndCenterCanvas();
  });

  clearBgBtn?.addEventListener('click', () => {
    if (currentBgImageObj) {
      currentBgImageObj.remove();
      currentBgImageObj = null;
    }
    if (activeSessionData) {
      activeSessionData = null;
      const previewSelect = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
      if (previewSelect) previewSelect.innerHTML = '<option value="spec">📐 Weapon Spec</option>';
    }
    const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
    if (sel && sel.value) {
      const w = loadedSpecsList.find(s => s.name === sel.value);
      if (w) displayWeaponOnCanvas(w);
    }
    stage.batchDraw();
  });

  // Spacebar pan mode
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && (e.target === document.body || (e.target as HTMLElement)?.id === 'stage' || (e.target as HTMLElement)?.closest('#stage-container'))) {
      isSpacePressed = true;
      const stageContainer = document.getElementById('stage');
      if (stageContainer) stageContainer.style.cursor = 'grab';
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      isSpacePressed = false;
      const stageContainer = document.getElementById('stage');
      if (stageContainer) stageContainer.style.cursor = isPanModeActive ? 'grab' : 'crosshair';
    }
  });

  // Mouse wheel zoom centered on cursor
  stage.on('wheel', (e) => {
    e.evt.preventDefault();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const scaleBy = 1.1;
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
    if (newScale < 0.2 || newScale > 8.0) return;

    stage.scale({ x: newScale, y: newScale });
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
    stage.batchDraw();
  });

  // Canvas Panning: Right-click (button 2), Middle-click (button 1), Alt+drag, Space+drag, or Pan Mode
  stage.on('mousedown', (e) => {
    if (e.evt.button === 1 || e.evt.button === 2 || e.evt.altKey || isSpacePressed || isPanModeActive) {
      isPanning = true;
      panStart = { x: e.evt.clientX - stage.x(), y: e.evt.clientY - stage.y() };
      const stageContainer = document.getElementById('stage');
      if (stageContainer) stageContainer.style.cursor = 'grabbing';
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (isPanning) {
      stage.position({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      stage.batchDraw();
    }
  });

  window.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      const stageContainer = document.getElementById('stage');
      if (stageContainer) {
        stageContainer.style.cursor = (isSpacePressed || isPanModeActive) ? 'grab' : 'crosshair';
      }
    }
  });
}

function acceptAuto() {
  auto_points.forEach(p => {
    addPoint(p.position(), `${idxCounter}`);
    p.remove();
  });
  auto_points = [];
  updateShapes();
  stage.batchDraw();
}

function initImage() {
  watch([aThreshold, aEnableThreshold, aAutoTargets, aTargetTo, aTargetFrom], () => {
    // TODO: all of that is needed?
    img?.cache();
    img?.draw();
    stage.batchDraw();
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
      currentBgImageObj = x;
      layer.add(img);
      img.moveToBottom();

      const { width: stageW, height: stageH } = syncStageSize();
      const padding = 20;
      const s = Math.min((stageW - padding * 2) / img.width(), (stageH - padding * 2) / img.height(), 1.0);
      const offsetX = Math.max(0, (stageW - img.width() * s) / 2);
      const offsetY = Math.max(0, (stageH - img.height() * s) / 2);

      activeBgImageScale = s;
      activeBgImageOffset = { x: offsetX, y: offsetY };

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

function clear() {
  clearCanvasForOverlay();
  if (img != null) {
    img.remove();
    img = null;
  }
  if (currentBgImageObj != null) {
    currentBgImageObj.remove();
    currentBgImageObj = null;
  }
  activeSessionData = null;
  updateShapes();
  stage.batchDraw();
};

function setupControls() {
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

function updateShapes() {
  points.forEach((c, i) => {
    const isShotZero = c.name() === '0';
    c.stroke(anchors.has(c.name()) ? '#f44336' : (isShotZero ? '#4caf50' : 'white'));
    c.strokeWidth(c.name() == edgeStartName ? 3 : (isShotZero ? 2.5 : 1.5));
  });
  edges = edges.filter(e => {
    const z = points.has(e.from) && points.has(e.to);
    if (!z) e.line.remove();
    return z;
  });
  edges.forEach(e => {
    const a = points.get(e.from)!;
    const b = points.get(e.to)!;
    e.line.points([a.x(), a.y(), b.x(), b.y()]);
    e.line.stroke('rgba(255, 171, 0, 0.85)');
    e.line.strokeWidth(2);
  });
  updateSpec();
}

function addPoint(p: PlainPoint, name: string) {
  idxCounter = Math.max(idxCounter, Number(name) + 1);
  const c = new Konva.Circle({
    radius: 8,
    stroke: `white`,
    strokeWidth: 1,
    position: p,
    draggable: true,
    name,
  });
  let dragStartPos = { x: 0, y: 0 };
  c.on('dragstart', function () {
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
      updateShapes();
      stage.batchDraw();
    }
  });
  c.on('dragend', function () {
    edgeStartName = '';
    updateShapes();
    syncSpecFromPoints();
    stage.batchDraw();
  });
  c.on('mouseover', function (e) {
    if (!aConnectHover.get()) return;
    if (edgeStartName == '') return;
    if (edges.find(e => e.from == c.name() || e.to == c.name())) return;
    addEdge(edgeStartName, c.name());
    edgeStartName = c.name();
    updateShapes();
    stage.batchDraw();
  });
  c.on('mousedown', function (e) {
    e.cancelBubble = true;
    window.setTimeout(() => {
      updateShapes();
      stage.batchDraw();
    }, 0);
    if (e.evt.button == 0) {
      if (edgeStartName == c.name()) {
        edgeStartName = '';
        return;
      }
      if (edgeStartName == '') {
        edgeStartName = c.name();
        return;
      }
      const a = points.get(edgeStartName);
      if (a == null) {
        edgeStartName = c.name();
        return;
      }
      addEdge(edgeStartName, c.name());
      edgeStartName = c.name();
      return;
    }
    if (e.evt.button == 1) {
      if (anchors.has(name)) {
        anchors.delete(name);
      } else {
        anchors.add(name);
      }
      return;
    }
    if (e.evt.button == 2) {
      points.delete(c.name());
      c.remove();
      updateShapes();
      syncSpecFromPoints();
      stage.batchDraw();
      return;
    }
  });
  points.set(name, c);
  updateShapes();
  layer.add(c);
  stage.batchDraw();
}

function syncSpecFromPoints() {
  if (points.size === 0) return;
  const sortedNames = Array.from(points.keys()).sort((a, b) => Number(a) - Number(b));
  const p0 = points.get(sortedNames[0]);
  if (!p0) return;

  const scale = (activeBgImageScale && activeBgImageScale > 0) ? activeBgImageScale : 1.5;
  const zoom = (activeOpticZoom && activeOpticZoom > 0) ? activeOpticZoom : 1.0;

  const newX: number[] = [];
  const newY: number[] = [];
  for (const name of sortedNames) {
    const p = points.get(name)!;
    const dx = (p.x() - p0.x()) / (scale * zoom);
    const dy = (p.y() - p0.y()) / (scale * zoom);
    newX.push(Math.round(dx * 100) / 100);
    newY.push(Math.round(dy * 100) / 100);
  }

  const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
  if (!sel) return;
  const targetW = loadedSpecsList.find(s => s.name === sel.value);
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
}

function clearCanvasForOverlay() {
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

let activeBatchIndex: number = 0;

function updateBatchNavUI() {
  const navGroup = document.getElementById('batch-nav-group');
  const indicator = document.getElementById('stage-img-indicator');
  const count = activeSessionData?.individual_trials?.length || (typeof batchScreenshots !== 'undefined' ? batchScreenshots.length : 0);
  if (!navGroup) return;

  if (count > 1) {
    navGroup.classList.remove('hidden');
    if (indicator) {
      indicator.innerText = `🖼️ ${activeBatchIndex + 1}/${count}`;
    }
  } else {
    navGroup.classList.add('hidden');
  }

  const cards = document.querySelectorAll('.batch-screenshot-card');
  cards.forEach((card, idx) => {
    if (idx === activeBatchIndex) card.classList.add('active');
    else card.classList.remove('active');
  });
}

function switchBatchScreenshot(idx: number) {
  const count = activeSessionData?.individual_trials?.length || batchScreenshots.length;
  if (count === 0) return;
  if (idx < 0) idx = count - 1;
  if (idx >= count) idx = 0;

  activeBatchIndex = idx;
  updateBatchNavUI();

  if (activeSessionData && activeSessionData.individual_trials) {
    const previewSelect = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
    const trialKey = `trial-${idx}`;
    if (previewSelect) {
      if (Array.from(previewSelect.options).some(o => o.value === trialKey)) {
        previewSelect.value = trialKey;
      }
    }
    renderSelectedOverlay(trialKey);
  } else if (batchScreenshots[idx]) {
    loadSampleScreenshotOnCanvas(batchScreenshots[idx].dataUrl);
  }
}

function populateStagePreviewDropdown() {
  const sel = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
  if (!sel || !activeSessionData) return;

  const currentVal = sel.value;
  sel.innerHTML = '';

  const specOpt = document.createElement('option');
  specOpt.value = 'spec';
  const weaponName = activeSessionData.spec?.name ? String(activeSessionData.spec.name).toUpperCase() : 'WEAPON';
  const shotCount = activeSessionData.spec?.x?.length || 0;
  specOpt.innerText = `📐 Saved Spec: ${weaponName} (${shotCount} shots)`;
  sel.appendChild(specOpt);

  if (activeSessionData.individual_trials && activeSessionData.individual_trials.length > 1) {
    const medianOpt = document.createElement('option');
    medianOpt.value = 'median';
    medianOpt.innerText = `🎯 Median Aggregated (${shotCount} shots across ${activeSessionData.individual_trials.length} sprays)`;
    sel.appendChild(medianOpt);

    activeSessionData.individual_trials.forEach((t, idx) => {
      const opt = document.createElement('option');
      opt.value = `trial-${idx}`;
      const name = t.source || `Image ${idx + 1}`;
      opt.innerText = `🖼️ Image ${idx + 1}: ${name} (${t.shots} shots)`;
      sel.appendChild(opt);
    });
  } else if (activeSessionData.preview_points && activeSessionData.preview_points.length > 0) {
    const analyzedOpt = document.createElement('option');
    analyzedOpt.value = 'analyzed';
    analyzedOpt.innerText = `🎯 Detected Decals (${activeSessionData.preview_points.length} shots)`;
    sel.appendChild(analyzedOpt);
  }

  if (currentVal && Array.from(sel.options).some(o => o.value === currentVal)) {
    sel.value = currentVal;
  }
  updateBatchNavUI();
}

function switchToTrialPreview(idx: number) {
  const sel = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
  if (sel) {
    sel.value = `trial-${idx}`;
  }
  activeBatchIndex = idx;
  updateBatchNavUI();
  renderSelectedOverlay(`trial-${idx}`);
}

function renderSelectedOverlay(key: string) {
  if (!activeSessionData) return;

  // Purge canvas shapes immediately before loading or rendering new overlay
  clearCanvasForOverlay();

  let imgUrl: string | undefined = undefined;
  let origin: [number, number] = [0, 0];
  let pts: { x: number, y: number }[] = [];

  const zoom = activeSessionData.zoom || 1.0;
  activeOpticZoom = zoom;

  if (key === 'spec') {
    imgUrl = activeSessionData.preview_image;
    let baseOrigin = activeSessionData.preview_origin;

    if (activeBatchIndex !== null && activeSessionData.individual_trials?.[activeBatchIndex]) {
      const curTrial = activeSessionData.individual_trials[activeBatchIndex];
      if (curTrial.frame_image) imgUrl = curTrial.frame_image;
      if (curTrial.origin && (curTrial.origin[0] > 0 || curTrial.origin[1] > 0)) {
        baseOrigin = curTrial.origin;
      }
    }

    if (!baseOrigin || (baseOrigin[0] === 0 && baseOrigin[1] === 0)) {
      if (activeSessionData.preview_points && activeSessionData.preview_points.length > 0) {
        baseOrigin = [activeSessionData.preview_points[0][0], activeSessionData.preview_points[0][1]];
      } else {
        const imgW = activeSessionData.frame_width || 1920;
        const imgH = activeSessionData.frame_height || 1080;
        baseOrigin = [imgW / 2, imgH * 0.75];
      }
    }
    origin = baseOrigin;
    const spec = activeSessionData.spec;
    const mult = spec?.multiplier || activeSessionData.multiplier || 0.73;
    if (spec && spec.x && spec.y) {
      const len = Math.min(spec.x.length, spec.y.length);
      for (let i = 0; i < len; i++) {
        // If raw_1x coordinates are provided from the pipeline, use directly * zoom
        // Otherwise, convert mouse counts (spec) to screen pixel displacement: (spec / mult) * zoom
        const raw1xX = (spec.raw_1x_x && spec.raw_1x_x[i] !== undefined)
          ? spec.raw_1x_x[i]
          : (spec.multiplier ? spec.x[i] / mult : spec.x[i]);
        const raw1xY = (spec.raw_1x_y && spec.raw_1x_y[i] !== undefined)
          ? spec.raw_1x_y[i]
          : (spec.multiplier ? spec.y[i] / mult : spec.y[i]);
        pts.push({
          x: origin[0] + raw1xX * zoom,
          y: origin[1] + raw1xY * zoom
        });
      }
    }
  } else if (key === 'median') {
    imgUrl = activeSessionData.preview_image;
    origin = activeSessionData.preview_origin || [0, 0];
    const spec = activeSessionData.spec;
    const mult = spec?.multiplier || activeSessionData.multiplier || 0.73;
    if (spec && spec.x && spec.y) {
      const len = Math.min(spec.x.length, spec.y.length);
      for (let i = 0; i < len; i++) {
        const raw1xX = (spec.raw_1x_x && spec.raw_1x_x[i] !== undefined)
          ? spec.raw_1x_x[i]
          : (spec.multiplier ? spec.x[i] / mult : spec.x[i]);
        const raw1xY = (spec.raw_1x_y && spec.raw_1x_y[i] !== undefined)
          ? spec.raw_1x_y[i]
          : (spec.multiplier ? spec.y[i] / mult : spec.y[i]);
        pts.push({
          x: origin[0] + raw1xX * zoom,
          y: origin[1] + raw1xY * zoom
        });
      }
    }
  } else if (key === 'analyzed') {
    imgUrl = activeSessionData.preview_image;
    if (activeSessionData.preview_points && activeSessionData.preview_points.length > 0) {
      pts = activeSessionData.preview_points.map(p => ({ x: p[0], y: p[1] }));
    }
  } else if (key.startsWith('trial-')) {
    const trialIdx = parseInt(key.replace('trial-', ''), 10);
    activeBatchIndex = trialIdx;
    updateBatchNavUI();
    const trial = activeSessionData.individual_trials?.[trialIdx];
    if (trial) {
      imgUrl = trial.frame_image || activeSessionData.preview_image;
      origin = trial.origin || [0, 0];
      if (trial.frame_points && trial.frame_points.length > 0) {
        pts = trial.frame_points.map(p => ({ x: p[0], y: p[1] }));
      } else if (trial.x && trial.y) {
        const len = Math.min(trial.x.length, trial.y.length);
        for (let i = 0; i < len; i++) {
          pts.push({
            x: origin[0] + trial.x[i] * zoom,
            y: origin[1] + trial.y[i] * zoom
          });
        }
      }
    }
  }

  const toggleBg = document.getElementById('toggle-bg-img') as HTMLInputElement | null;
  const opacitySlider = document.getElementById('bg-opacity-slider') as HTMLInputElement | null;
  const opacity = opacitySlider ? Number(opacitySlider.value) / 100 : 0.8;
  const isBgVisible = toggleBg ? toggleBg.checked : true;

  if (imgUrl) {
    const renderPointsOnImage = (konvaImg: Konva.Image) => {
      stage.position({ x: 0, y: 0 });
      stage.scale({ x: 1, y: 1 });
      const { width: stageW, height: stageH } = syncStageSize();
      const imgW = konvaImg.width() || 1920;
      const imgH = konvaImg.height() || 1080;

      const padding = 20;
      const scale = Math.min((stageW - padding * 2) / imgW, (stageH - padding * 2) / imgH, 1.0);
      const offsetX = Math.max(0, (stageW - imgW * scale) / 2);
      const offsetY = Math.max(0, (stageH - imgH * scale) / 2);

      activeBgImageScale = scale;
      activeBgImageOffset = { x: offsetX, y: offsetY };

      konvaImg.position({ x: offsetX, y: offsetY });
      konvaImg.scale({ x: scale, y: scale });
      konvaImg.opacity(opacity);
      konvaImg.visible(isBgVisible);
      konvaImg.zIndex(0);
      konvaImg.listening(false);

      for (let i = 0; i < pts.length; i++) {
        const cx = offsetX + pts[i].x * scale;
        const cy = offsetY + pts[i].y * scale;
        addPoint({ x: cx, y: cy }, `${i}`);
        if (i > 0) {
          addEdge(`${i - 1}`, `${i}`);
        }
      }
      updateShapes();
      stage.batchDraw();
    };

    if (currentBgImageObj && (currentBgImageObj as any)._customSrc === imgUrl) {
      renderPointsOnImage(currentBgImageObj);
    } else {
      Konva.Image.fromURL(imgUrl, (konvaImg) => {
        if (currentBgImageObj && currentBgImageObj !== konvaImg) {
          currentBgImageObj.destroy();
        }
        (konvaImg as any)._customSrc = imgUrl;
        currentBgImageObj = konvaImg;
        layer.add(konvaImg);
        konvaImg.moveToBottom();
        renderPointsOnImage(konvaImg);
      });
    }
  } else {
    clearCanvasForOverlay();
    stage.position({ x: 0, y: 0 });
    stage.scale({ x: 1, y: 1 });
    const { width: stageW, height: stageH } = syncStageSize();
    const startX = stageW / 2;
    const startY = stageH * 0.75;
    activeBgImageScale = 1.5;
    activeBgImageOffset = { x: startX, y: startY };

    if (key === 'spec' && activeSessionData?.spec) {
      const spec = activeSessionData.spec;
      const len = Math.min(spec.x.length, spec.y.length);
      for (let i = 0; i < len; i++) {
        addPoint({ x: startX + spec.x[i] * 1.5, y: startY + spec.y[i] * 1.5 }, `${i}`);
        if (i > 0) addEdge(`${i - 1}`, `${i}`);
      }
    }
    updateShapes();
    stage.batchDraw();
  }
}

function addEdge(a: string, b: string) {
  if (b < a) [b, a] = [a, b];
  const e: Edge = {
    from: a,
    to: b,
    line: new Konva.Line({
      stroke: 'white',
      strokeWidth: 1,
      points: [],
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

function updateSpec(_?: string) {
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
  let x = edgeStartName;
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
    c.innerText = `points: ${points.size} graph: ${pp.length} mag: ${w.mags[w.mags.length - 1].size}`;
  }
  console.log('points', points, anchors, anchorIndexes);
  idx = Array.from(anchors.values())
  // TODO: warn about anchors length != 2.
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

function loadSpecs() {
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
      stroke: 'blue',
      strokeWidth: 1,
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

let loadedSpecsList: any[] = JSON.parse(JSON.stringify(specs));

function initWeaponManagerUI() {
  const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
  if (!sel) return;

  const populateDropdown = () => {
    sel.innerHTML = '';
    loadedSpecsList.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.text = s.name.toUpperCase();
      sel.appendChild(opt);
    });
  };

  populateDropdown();

  sel.addEventListener('change', () => {
    loadWeaponIntoManager(sel.value);
  });

  document.getElementById('save-weapon-btn')?.addEventListener('click', saveCurrentWeaponSpec);
  document.getElementById('reload-specs-btn')?.addEventListener('click', reloadSpecsFromServer);
  document.getElementById('apply-json-btn')?.addEventListener('click', applyJsonToWeapon);

  initGameCaptureStudio();

  // Load initial weapon
  if (loadedSpecsList.length > 0) {
    loadWeaponIntoManager(loadedSpecsList[0].name);
  }
}

function loadWeaponIntoManager(name: string) {
  const w = loadedSpecsList.find(s => s.name === name);
  if (!w) return;

  const modeSelect = document.getElementById('weapon-mode-select') as HTMLSelectElement | null;
  if (modeSelect) {
    const cfg = getWeaponModeConfig(name);
    modeSelect.innerHTML = '';
    cfg.modes.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.text = m.toUpperCase();
      modeSelect.appendChild(opt);
    });
    modeSelect.value = cfg.defaultMode;
  }

  const rpmInput = document.getElementById('weapon-rpm') as HTMLInputElement | null;
  const multInput = document.getElementById('weapon-multiplier') as HTMLInputElement | null;
  const mag0 = document.getElementById('mag-0') as HTMLInputElement | null;
  const mag1 = document.getElementById('mag-1') as HTMLInputElement | null;
  const mag2 = document.getElementById('mag-2') as HTMLInputElement | null;
  const mag3 = document.getElementById('mag-3') as HTMLInputElement | null;
  const mag4 = document.getElementById('mag-4') as HTMLInputElement | null;
  const shotInfo = document.getElementById('spec-shot-info');
  const intervalInfo = document.getElementById('spec-interval-info');
  const statusMsg = document.getElementById('save-status-msg');

  if (rpmInput) rpmInput.value = String(w.rpm || 600);
  if (multInput) multInput.value = String(w.multiplier || 0.73);

  const mags = w.mags || [];
  if (mag0) mag0.value = mags[0] ? String(mags[0].size) : '';
  if (mag1) mag1.value = mags[1] ? String(mags[1].size) : (mags[0] ? String(mags[0].size) : '');
  if (mag2) mag2.value = mags[2] ? String(mags[2].size) : '';
  if (mag3) mag3.value = mags[3] ? String(mags[3].size) : (mags[mags.length - 1] ? String(mags[mags.length - 1].size) : '');
  if (mag4) mag4.value = mags[4] ? String(mags[4].size) : '';

  const shotCount = w.x ? w.x.length : 0;
  if (shotInfo) shotInfo.innerText = `Shots: ${shotCount}`;
  const interval = w.rpm ? Math.round(60000 / w.rpm) : 0;
  if (intervalInfo) intervalInfo.innerText = `Interval: ${interval} ms`;

  if (statusMsg) {
    statusMsg.innerText = '';
    statusMsg.className = '';
  }

  displayWeaponOnCanvas(w);
}

function displayWeaponOnCanvas(w: any) {
  clearCanvasForOverlay();
  if (!w || !w.x || !w.y) return;

  const minLen = Math.min(w.x.length, w.y.length);
  const { width: stageW, height: stageH } = syncStageSize();

  if (activeSessionData) {
    activeSessionData.spec = w;
    populateStagePreviewDropdown();
    const previewSelect = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
    if (previewSelect) {
      previewSelect.value = 'spec';
    }
    renderSelectedOverlay('spec');
    return;
  }

  if (currentBgImageObj) {
    const scale = (activeBgImageScale && activeBgImageScale > 0) ? activeBgImageScale : 1.0;
    const offset = activeBgImageOffset || { x: (stageW - currentBgImageObj.width() * scale) / 2, y: (stageH - currentBgImageObj.height() * scale) / 2 };
    const startX = offset.x + (currentBgImageObj.width() * scale) / 2;
    const startY = offset.y + (currentBgImageObj.height() * scale) * 0.75;
    const mult = w.multiplier || 0.73;
    const zoom = activeOpticZoom || 1.0;
    for (let i = 0; i < minLen; i++) {
      const raw1xX = (w.raw_1x_x && w.raw_1x_x[i] !== undefined)
        ? w.raw_1x_x[i]
        : (w.multiplier ? w.x[i] / mult : w.x[i]);
      const raw1xY = (w.raw_1x_y && w.raw_1x_y[i] !== undefined)
        ? w.raw_1x_y[i]
        : (w.multiplier ? w.y[i] / mult : w.y[i]);
      addPoint({ x: startX + raw1xX * zoom * scale, y: startY + raw1xY * zoom * scale }, `${i}`);
      if (i > 0) {
        addEdge(`${i - 1}`, `${i}`);
      }
    }
    updateShapes();
    stage.batchDraw();
    return;
  }

  const startX = stageW / 2;
  const startY = stageH * 0.75;
  for (let i = 0; i < minLen; i++) {
    addPoint({ x: startX + w.x[i] * 1.5, y: startY + w.y[i] * 1.5 }, `${i}`);
    if (i > 0) {
      addEdge(`${i - 1}`, `${i}`);
    }
  }
  updateShapes();
  stage.batchDraw();
}

function saveCurrentWeaponSpec() {
  const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
  const statusMsg = document.getElementById('save-status-msg');
  if (!sel) return;

  const name = sel.value;
  const w = loadedSpecsList.find(s => s.name === name);
  if (!w) return;

  const rpmInput = document.getElementById('weapon-rpm') as HTMLInputElement | null;
  const multInput = document.getElementById('weapon-multiplier') as HTMLInputElement | null;
  const mag0 = document.getElementById('mag-0') as HTMLInputElement | null;
  const mag1 = document.getElementById('mag-1') as HTMLInputElement | null;
  const mag2 = document.getElementById('mag-2') as HTMLInputElement | null;
  const mag3 = document.getElementById('mag-3') as HTMLInputElement | null;
  const mag4 = document.getElementById('mag-4') as HTMLInputElement | null;

  const newRpm = rpmInput ? Number(rpmInput.value) : (w.rpm || 600);
  const newMult = multInput ? Number(multInput.value) : (w.multiplier || 0.73);

  const mags = [];
  if (mag0 && mag0.value) mags.push({ size: Number(mag0.value), audio: `${name}_${mag0.value}` });
  if (mag1 && mag1.value) mags.push({ size: Number(mag1.value), audio: `${name}_${mag1.value}` });
  if (mag2 && mag2.value) mags.push({ size: Number(mag2.value), audio: `${name}_${mag2.value}` });
  if (mag3 && mag3.value) mags.push({ size: Number(mag3.value), audio: `${name}_${mag3.value}` });
  if (mag4 && mag4.value) mags.push({ size: Number(mag4.value), audio: `${name}_${mag4.value}` });

  w.rpm = newRpm;
  w.multiplier = newMult;
  if (mags.length > 0) w.mags = mags;

  // Recalculate time points based on updated RPM
  const interval = 60000 / newRpm;
  w.time_points = (w.x || []).map((_: any, idx: number) => Math.round(idx * interval));

  if (statusMsg) {
    statusMsg.innerText = 'Saving...';
    statusMsg.className = '';
  }

  fetch('/api/specs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weapon: w })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      if (statusMsg) {
        statusMsg.innerText = `✅ Saved ${name.toUpperCase()} to specs.json!`;
        statusMsg.className = 'success';
      }
      loadWeaponIntoManager(name);
    } else {
      if (statusMsg) {
        statusMsg.innerText = `❌ Error: ${data.error || 'Failed to save'}`;
        statusMsg.className = 'error';
      }
    }
  })
  .catch(err => {
    if (statusMsg) {
      statusMsg.innerText = `❌ Request failed: ${err.message}`;
      statusMsg.className = 'error';
    }
  });
}

function reloadSpecsFromServer() {
  const statusMsg = document.getElementById('save-status-msg');
  if (statusMsg) {
    statusMsg.innerText = 'Reloading specs from server...';
    statusMsg.className = '';
  }

  fetch('/api/specs')
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data)) {
        loadedSpecsList = data;
        const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
        if (sel) {
          const curr = sel.value;
          sel.innerHTML = '';
          loadedSpecsList.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.name;
            opt.text = s.name.toUpperCase();
            if (s.name === curr) opt.selected = true;
            sel.appendChild(opt);
          });
          loadWeaponIntoManager(sel.value);
        }
        if (statusMsg) {
          statusMsg.innerText = '✅ Reloaded specs successfully!';
          statusMsg.className = 'success';
        }
      }
    })
    .catch(err => {
      if (statusMsg) {
        statusMsg.innerText = `❌ Reload failed: ${err.message}`;
        statusMsg.className = 'error';
      }
    });
}

function applyJsonToWeapon() {
  const jsonText = (document.getElementById('json-import') as HTMLTextAreaElement | null)?.value;
  const statusMsg = document.getElementById('save-status-msg');
  if (!jsonText) return;

  try {
    const parsed = JSON.parse(jsonText);
    const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
    const name = sel?.value;
    if (!name) return;
    const w = loadedSpecsList.find(s => s.name === name);
    if (!w) return;

    if (parsed.x && parsed.y) {
      w.x = parsed.x;
      w.y = parsed.y;
    }
    if (parsed.rpm) w.rpm = parsed.rpm;
    if (parsed.time_points) w.time_points = parsed.time_points;
    if (parsed.mags) w.mags = parsed.mags;

    loadWeaponIntoManager(name);
    if (statusMsg) {
      statusMsg.innerText = `✅ Applied JSON to ${name.toUpperCase()}! Click 'Save' to persist.`;
      statusMsg.className = 'success';
    }
  } catch (e) {
    if (statusMsg) {
      statusMsg.innerText = '❌ Invalid JSON format!';
      statusMsg.className = 'error';
    }
  }
}

interface RecordedSample {
  id: string;
  name: string;
  blob: Blob;
  objectUrl: string;
  durationSec: number;
  timestamp: Date;
  screenshotData?: string;
  screenshotUrl?: string;
}

let captureStream: MediaStream | null = null;
let activeAudioStream: MediaStream | null = null;
let audioSourceNode: MediaStreamAudioSourceNode | null = null;
let currentAudioSourceId: string = 'display';
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let isRecordingSpray = false;
let isBufferingReAim = false;
let reaimBufferMs = 4500;
let reaimStartTime = 0;
let bufferCountdownTimer: any = null;
const silenceLeadTimeMs = 700;
let pendingScreenshotData: string = '';
let sprayStartTime = 0;
let lastGunfireTime = 0;
let audioMonitorTimer: any = null;
let isPreviewPlaying = false;
let audioPreviewCooldownTimer: any = null;

function setAudioPreviewPlaying(isPlaying: boolean) {
  if (isPlaying) {
    if (audioPreviewCooldownTimer) {
      clearTimeout(audioPreviewCooldownTimer);
      audioPreviewCooldownTimer = null;
    }
    isPreviewPlaying = true;
    const trigBadge = document.getElementById('trigger-status-badge');
    if (trigBadge && !isRecordingSpray) {
      trigBadge.innerText = '🔇 Playback (Sensor Muted)';
      trigBadge.className = 'badge badge-off';
    }
  } else {
    if (audioPreviewCooldownTimer) clearTimeout(audioPreviewCooldownTimer);
    audioPreviewCooldownTimer = setTimeout(() => {
      isPreviewPlaying = false;
      const trigBadge = document.getElementById('trigger-status-badge');
      if (trigBadge && !isRecordingSpray) {
        trigBadge.innerText = 'Trigger Idle';
        trigBadge.className = 'badge badge-off';
      }
    }, 1500);
  }
}

let reRecordSlotIndex: number | null = null;
const capturedSamples: RecordedSample[] = [];

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function showAudioDeviceAlert(message: string) {
  const alertBox = document.getElementById('audio-device-alert');
  const alertText = document.getElementById('audio-device-alert-text');
  if (alertBox && alertText) {
    alertText.innerText = message;
    alertBox.classList.remove('hidden');
  }
}

function hideAudioDeviceAlert() {
  const alertBox = document.getElementById('audio-device-alert');
  if (alertBox) {
    alertBox.classList.add('hidden');
  }
}

async function populateAudioSources() {
  const sourceSelect = document.getElementById('audio-source-select') as HTMLSelectElement | null;
  if (!sourceSelect) return;

  const previousVal = sourceSelect.value || currentAudioSourceId;
  sourceSelect.innerHTML = '';

  const optDisplay = document.createElement('option');
  optDisplay.value = 'display';
  optDisplay.text = '🖥️ System Audio (Screen Share)';
  sourceSelect.appendChild(optDisplay);

  const optDefault = document.createElement('option');
  optDefault.value = 'mic-default';
  optDefault.text = '🎤 Default Microphone / Line-In';
  sourceSelect.appendChild(optDefault);

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === 'audioinput');

    audioInputs.forEach((dev, idx) => {
      if (dev.deviceId && dev.deviceId !== 'default') {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.text = `🎤 ${dev.label || `Audio Input ${idx + 1}`}`;
        sourceSelect.appendChild(opt);
      }
    });
  } catch (e) {
    console.warn('[CaptureStudio] enumerateDevices error:', e);
  }

  if (Array.from(sourceSelect.options).some(o => o.value === previousVal)) {
    sourceSelect.value = previousVal;
  } else {
    sourceSelect.value = currentAudioSourceId;
  }
}

function setupAudioProcessing(stream: MediaStream | null) {
  const trigBadge = document.getElementById('trigger-status-badge');

  if (audioSourceNode) {
    try {
      audioSourceNode.disconnect();
    } catch (_) {}
    audioSourceNode = null;
  }

  if (!stream || stream.getAudioTracks().length === 0) {
    if (trigBadge) {
      trigBadge.innerText = '⚠️ No Audio Track (Use Manual Spray)';
      trigBadge.className = 'badge badge-off';
    }
    return;
  }

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    audioCtx.onstatechange = () => {
      if (audioCtx?.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    };

    audioSourceNode = audioCtx.createMediaStreamSource(stream);
    if (!analyser) {
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
    }
    audioSourceNode.connect(analyser);

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.onmute = () => {
        showAudioDeviceAlert('⚠️ Audio track muted by Windows (output speaker changed). Click 🔄 Reconnect or switch Audio Input.');
      };
      audioTrack.onunmute = () => {
        hideAudioDeviceAlert();
      };
      audioTrack.onended = () => {
        showAudioDeviceAlert('⚠️ Audio device disconnected. Please click 🔄 Reconnect or select an input.');
      };
    }

    if (trigBadge) {
      trigBadge.innerText = '🟡 Trigger Listening (Audio)';
      trigBadge.className = 'badge badge-active';
    }

    startAudioMonitorLoop();
  } catch (e) {
    console.warn('[CaptureStudio] Web Audio setup error:', e);
    if (trigBadge) {
      trigBadge.innerText = '🟡 Audio Sensor Warning (Use Manual)';
      trigBadge.className = 'badge badge-off';
    }
  }
}

async function changeAudioSource(sourceId: string) {
  currentAudioSourceId = sourceId;

  if (sourceId === 'display') {
    if (captureStream && captureStream.getAudioTracks().length > 0) {
      if (activeAudioStream && activeAudioStream !== captureStream) {
        activeAudioStream.getTracks().forEach(t => t.stop());
      }
      activeAudioStream = new MediaStream(captureStream.getAudioTracks());
      setupAudioProcessing(activeAudioStream);
      hideAudioDeviceAlert();
    } else {
      showAudioDeviceAlert('⚠️ No audio track in screen share. Click 🔄 Reconnect to share with audio, or pick a Microphone.');
    }
  } else {
    try {
      const constraints: MediaStreamConstraints = {
        audio: sourceId === 'mic-default' ? true : { deviceId: { exact: sourceId } }
      };
      const micStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (activeAudioStream && activeAudioStream !== captureStream) {
        activeAudioStream.getTracks().forEach(t => t.stop());
      }
      activeAudioStream = micStream;
      setupAudioProcessing(activeAudioStream);
      hideAudioDeviceAlert();
      await populateAudioSources();
    } catch (err: any) {
      console.error('[CaptureStudio] Error switching audio device:', err);
      showAudioDeviceAlert(`⚠️ Failed to access audio device: ${err.message || err}`);
    }
  }
}

async function reconnectAudio() {
  const sourceSelect = document.getElementById('audio-source-select') as HTMLSelectElement | null;
  const currentSource = sourceSelect?.value || currentAudioSourceId;

  if (currentSource === 'display') {
    try {
      const newShare = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      newShare.getVideoTracks().forEach(t => t.stop());
      const newAudioTracks = newShare.getAudioTracks();
      if (newAudioTracks.length > 0) {
        if (activeAudioStream && activeAudioStream !== captureStream) {
          activeAudioStream.getTracks().forEach(t => t.stop());
        }
        activeAudioStream = new MediaStream(newAudioTracks);
        setupAudioProcessing(activeAudioStream);
        hideAudioDeviceAlert();
      } else {
        showAudioDeviceAlert('⚠️ No audio selected. Make sure "Share system audio" is checked in the browser dialog, or pick a Microphone.');
      }
    } catch (e: any) {
      console.warn('[CaptureStudio] Re-sharing display audio cancelled or failed:', e);
    }
  } else {
    await changeAudioSource(currentSource);
  }

  if (audioCtx && audioCtx.state === 'suspended') {
    await audioCtx.resume().catch(() => {});
  }
}

function initGameCaptureStudio() {
  const startBtn = document.getElementById('start-capture-btn');
  const stopBtn = document.getElementById('stop-capture-btn');
  const manualBtn = document.getElementById('manual-record-btn');
  const clearBtn = document.getElementById('clear-samples-btn');
  const processBtn = document.getElementById('process-session-btn');
  const thresholdSlider = document.getElementById('trigger-threshold-slider') as HTMLInputElement | null;
  const thresholdLine = document.getElementById('trigger-threshold-line') as HTMLDivElement | null;
  const sourceSelect = document.getElementById('audio-source-select') as HTMLSelectElement | null;
  const reconnectBtn = document.getElementById('reconnect-audio-btn');
  const dismissAlertBtn = document.getElementById('dismiss-audio-alert-btn');

  if (thresholdSlider && thresholdLine) {
    thresholdSlider.addEventListener('input', () => {
      thresholdLine.style.left = `${thresholdSlider.value}%`;
    });
    thresholdLine.style.left = `${thresholdSlider.value}%`;
  }

  const bufferSlider = document.getElementById('reaim-buffer-slider') as HTMLInputElement | null;
  const bufferVal = document.getElementById('reaim-buffer-val');
  if (bufferSlider && bufferVal) {
    bufferSlider.addEventListener('input', () => {
      reaimBufferMs = Number(bufferSlider.value) * 1000;
      bufferVal.innerText = Number(bufferSlider.value).toFixed(1);
    });
    reaimBufferMs = Number(bufferSlider.value) * 1000;
  }

  const snapWallBtn = document.getElementById('snap-wall-btn');
  snapWallBtn?.addEventListener('click', () => {
    snapWallScreenshotAndFinish();
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      const activeEl = document.activeElement;
      const tag = activeEl ? activeEl.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (isRecordingSpray || isBufferingReAim) {
        e.preventDefault();
        snapWallScreenshotAndFinish();
      }
    }
  });

  startBtn?.addEventListener('click', startGameCapture);
  stopBtn?.addEventListener('click', stopGameCapture);
  manualBtn?.addEventListener('click', toggleManualRecord);
  clearBtn?.addEventListener('click', clearAllSamples);
  processBtn?.addEventListener('click', processSessionSprays);

  const capDist = document.getElementById('capture-distance-input') as HTMLInputElement | null;
  const staticDist = document.getElementById('static-distance-input') as HTMLInputElement | null;
  const capOptic = document.getElementById('capture-optic-select') as HTMLSelectElement | null;
  const staticOptic = document.getElementById('static-optic-select') as HTMLSelectElement | null;

  if (capDist && staticDist) {
    capDist.addEventListener('change', () => { staticDist.value = capDist.value; });
    staticDist.addEventListener('change', () => { capDist.value = staticDist.value; });
  }
  if (capOptic && staticOptic) {
    capOptic.addEventListener('change', () => { staticOptic.value = capOptic.value; });
    staticOptic.addEventListener('change', () => { capOptic.value = staticOptic.value; });
  }

  sourceSelect?.addEventListener('change', () => {
    if (sourceSelect.value) {
      changeAudioSource(sourceSelect.value);
    }
  });

  reconnectBtn?.addEventListener('click', reconnectAudio);
  dismissAlertBtn?.addEventListener('click', hideAudioDeviceAlert);

  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      console.log('[CaptureStudio] Windows audio device change detected');
      await populateAudioSources();
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      showAudioDeviceAlert('⚠️ Windows audio device changed. If gunfire sensor is quiet, click 🔄 Reconnect or switch Audio Input.');
    });
  }
}

async function startGameCapture() {
  const previewVideo = document.getElementById('capture-preview-video') as HTMLVideoElement | null;
  const monitorPanel = document.getElementById('monitor-panel');
  const startBtn = document.getElementById('start-capture-btn');
  const stopBtn = document.getElementById('stop-capture-btn');
  const manualBtn = document.getElementById('manual-record-btn');
  const capBadge = document.getElementById('capture-status-badge');

  try {
    captureStream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'window' } as any,
      audio: true
    });

    if (previewVideo) {
      previewVideo.srcObject = captureStream;
      previewVideo.play().catch(() => {});
    }

    monitorPanel?.classList.remove('hidden');
    startBtn?.classList.add('hidden');
    stopBtn?.classList.remove('hidden');
    manualBtn?.classList.remove('hidden');

    if (capBadge) {
      capBadge.innerText = '🟢 Connected to Game';
      capBadge.className = 'badge badge-active';
    }

    captureStream.getVideoTracks().forEach(track => {
      track.onended = () => {
        stopGameCapture();
      };
    });

    // Audio setup
    const audioTracks = captureStream.getAudioTracks();
    if (audioTracks.length > 0) {
      activeAudioStream = new MediaStream(audioTracks);
      currentAudioSourceId = 'display';
      setupAudioProcessing(activeAudioStream);
    } else {
      setupAudioProcessing(null);
      showAudioDeviceAlert('⚠️ No system audio track in screen share. Select a Microphone / Line-In below or click Reconnect.');
    }

    await populateAudioSources();
  } catch (err: any) {
    console.error('getDisplayMedia error:', err);
    alert('Could not start screen capture: ' + (err.message || err));
  }
}

function stopGameCapture() {
  if (isRecordingSpray) {
    stopRecordingSpray();
  }

  if (audioMonitorTimer) {
    clearInterval(audioMonitorTimer);
    audioMonitorTimer = null;
  }

  if (activeAudioStream && activeAudioStream !== captureStream) {
    activeAudioStream.getTracks().forEach(t => t.stop());
    activeAudioStream = null;
  }

  if (audioSourceNode) {
    try { audioSourceNode.disconnect(); } catch (_) {}
    audioSourceNode = null;
  }

  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  analyser = null;

  if (captureStream) {
    captureStream.getTracks().forEach(t => t.stop());
    captureStream = null;
  }

  const previewVideo = document.getElementById('capture-preview-video') as HTMLVideoElement | null;
  if (previewVideo) {
    previewVideo.srcObject = null;
  }

  hideAudioDeviceAlert();

  document.getElementById('monitor-panel')?.classList.add('hidden');
  document.getElementById('start-capture-btn')?.classList.remove('hidden');
  document.getElementById('stop-capture-btn')?.classList.add('hidden');
  document.getElementById('manual-record-btn')?.classList.add('hidden');

  const capBadge = document.getElementById('capture-status-badge');
  const trigBadge = document.getElementById('trigger-status-badge');
  if (capBadge) {
    capBadge.innerText = 'Not Connected';
    capBadge.className = 'badge badge-off';
  }
  if (trigBadge) {
    trigBadge.innerText = 'Trigger Idle';
    trigBadge.className = 'badge badge-off';
  }
}

function startAudioMonitorLoop() {
  if (audioMonitorTimer) clearInterval(audioMonitorTimer);

  const levelFill = document.getElementById('audio-level-fill');
  const levelText = document.getElementById('audio-level-text');
  const thresholdSlider = document.getElementById('trigger-threshold-slider') as HTMLInputElement | null;

  const dataArray = new Uint8Array(analyser?.frequencyBinCount || 256);

  audioMonitorTimer = setInterval(() => {
    if (!analyser) return;

    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    analyser.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const pct = Math.min(100, Math.round(rms * 280));

    if (levelFill) {
      levelFill.style.width = `${pct}%`;
    }
    if (levelText) {
      levelText.innerText = `${pct}%`;
    }

    const currentTrack = activeAudioStream?.getAudioTracks()[0] || captureStream?.getAudioTracks()[0];
    if (currentTrack && currentTrack.muted) {
      showAudioDeviceAlert('⚠️ Windows audio track is muted (output speaker changed). Click 🔄 Reconnect or switch Audio Input.');
    }

    const thresholdPct = thresholdSlider ? Number(thresholdSlider.value) : 25;
    const isTriggered = pct >= thresholdPct && !isPreviewPlaying;

    if (levelFill) {
      if (isTriggered) {
        levelFill.classList.add('triggered');
      } else {
        levelFill.classList.remove('triggered');
      }
    }

    const now = performance.now();

    if (isTriggered) {
      lastGunfireTime = now;
      if (isBufferingReAim) {
        // Gunfire resumed before re-aim buffer expired (e.g. burst weapon like Hemlok or next burst)
        isBufferingReAim = false;
        if (bufferCountdownTimer) {
          clearInterval(bufferCountdownTimer);
          bufferCountdownTimer = null;
        }
        document.getElementById('reaim-indicator')?.classList.add('hidden');
        document.getElementById('reaim-status-badge')?.classList.add('hidden');
        const recInd = document.getElementById('rec-indicator');
        if (recInd) {
          recInd.innerText = '● REC (FIRING)';
          recInd.classList.remove('hidden');
        }
        const trigBadge = document.getElementById('trigger-status-badge');
        if (trigBadge) {
          trigBadge.innerText = '● RECORDING SPRAY';
          trigBadge.className = 'badge badge-rec';
        }
      } else if (!isRecordingSpray) {
        startRecordingSpray();
      }
    } else if (isRecordingSpray) {
      if (!isBufferingReAim) {
        if (now - lastGunfireTime > silenceLeadTimeMs) {
          startReAimBuffer();
        }
      }
      if (now - sprayStartTime > 20000) {
        snapWallScreenshotAndFinish();
      }
    }
  }, 25);
}

function captureCurrentVideoFrame(): string {
  const previewVideo = document.getElementById('capture-preview-video') as HTMLVideoElement | null;
  if (!previewVideo || !previewVideo.videoWidth || !previewVideo.videoHeight) return '';
  const canvas = document.createElement('canvas');
  canvas.width = previewVideo.videoWidth;
  canvas.height = previewVideo.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(previewVideo, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.95);
}

function startReAimBuffer() {
  if (isBufferingReAim || !isRecordingSpray) return;
  isBufferingReAim = true;
  reaimStartTime = performance.now();

  document.getElementById('rec-indicator')?.classList.add('hidden');
  const reaimInd = document.getElementById('reaim-indicator');
  const reaimBadge = document.getElementById('reaim-status-badge');
  const trigBadge = document.getElementById('trigger-status-badge');
  const snapWallBtn = document.getElementById('snap-wall-btn');

  if (reaimInd) reaimInd.classList.remove('hidden');
  if (reaimBadge) reaimBadge.classList.remove('hidden');
  if (snapWallBtn) snapWallBtn.classList.remove('hidden');
  if (trigBadge) {
    trigBadge.innerText = '🔄 Re-Aiming (ADS)...';
    trigBadge.className = 'badge badge-reaim';
  }

  if (bufferCountdownTimer) clearInterval(bufferCountdownTimer);
  bufferCountdownTimer = setInterval(() => {
    const elapsed = performance.now() - reaimStartTime;
    const remainingMs = Math.max(0, reaimBufferMs - elapsed);
    const secStr = (remainingMs / 1000).toFixed(1);

    if (reaimInd) {
      reaimInd.innerText = `🔄 Reload finishing... Re-enter ADS at wall! (${secStr}s)`;
    }
    if (reaimBadge) {
      reaimBadge.innerText = `Re-Aim: ${secStr}s`;
    }

    if (remainingMs <= 0) {
      if (bufferCountdownTimer) {
        clearInterval(bufferCountdownTimer);
        bufferCountdownTimer = null;
      }
      snapWallScreenshotAndFinish();
    }
  }, 100);
}

function snapWallScreenshotAndFinish() {
  pendingScreenshotData = captureCurrentVideoFrame();
  stopRecordingSpray();
}

function toggleManualRecord() {
  const manualBtn = document.getElementById('manual-record-btn');
  if (!isRecordingSpray) {
    startRecordingSpray();
    if (manualBtn) manualBtn.innerText = '⏹ Finish Spray';
  } else {
    snapWallScreenshotAndFinish();
    if (manualBtn) manualBtn.innerText = '⏺ Manual Spray';
  }
}

function startRecordingSpray() {
  if (isRecordingSpray || !captureStream) return;
  isRecordingSpray = true;
  isBufferingReAim = false;
  pendingScreenshotData = '';
  sprayStartTime = performance.now();
  lastGunfireTime = sprayStartTime;
  recordedChunks = [];

  const recInd = document.getElementById('rec-indicator');
  if (recInd) {
    recInd.innerText = '● REC (FIRING)';
    recInd.classList.remove('hidden');
  }
  document.getElementById('reaim-indicator')?.classList.add('hidden');
  document.getElementById('reaim-status-badge')?.classList.add('hidden');
  document.getElementById('snap-wall-btn')?.classList.remove('hidden');

  const trigBadge = document.getElementById('trigger-status-badge');
  if (trigBadge) {
    trigBadge.innerText = '● RECORDING SPRAY';
    trigBadge.className = 'badge badge-rec';
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  try {
    const videoTrack = captureStream.getVideoTracks()[0];
    const audioTrack = activeAudioStream && activeAudioStream.getAudioTracks().length > 0
      ? activeAudioStream.getAudioTracks()[0]
      : (captureStream.getAudioTracks()[0] || null);

    const recordStream = new MediaStream([videoTrack, ...(audioTrack ? [audioTrack] : [])]);
    mediaRecorder = new MediaRecorder(recordStream, { mimeType });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };
    mediaRecorder.onstop = () => {
      const durationSec = (performance.now() - sprayStartTime) / 1000;
      if (durationSec >= 0.8) {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const shot = pendingScreenshotData || captureCurrentVideoFrame();
        addCapturedSample(blob, durationSec, shot);
      } else {
        console.warn(`Spray too brief (${durationSec.toFixed(2)}s). Ensure you fire the full spray.`);
      }
      pendingScreenshotData = '';
    };
    mediaRecorder.start(50);
  } catch (e) {
    console.error('Failed to start MediaRecorder:', e);
    isRecordingSpray = false;
  }
}

function stopRecordingSpray() {
  if (!isRecordingSpray) return;
  isRecordingSpray = false;
  isBufferingReAim = false;

  if (bufferCountdownTimer) {
    clearInterval(bufferCountdownTimer);
    bufferCountdownTimer = null;
  }

  document.getElementById('rec-indicator')?.classList.add('hidden');
  document.getElementById('reaim-indicator')?.classList.add('hidden');
  document.getElementById('reaim-status-badge')?.classList.add('hidden');
  document.getElementById('snap-wall-btn')?.classList.add('hidden');

  const trigBadge = document.getElementById('trigger-status-badge');
  if (trigBadge) {
    trigBadge.innerText = '🟡 Trigger Listening';
    trigBadge.className = 'badge badge-active';
  }

  const manualBtn = document.getElementById('manual-record-btn');
  if (manualBtn) manualBtn.innerText = '⏺ Manual Spray';

  if (!pendingScreenshotData) {
    pendingScreenshotData = captureCurrentVideoFrame();
  }

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

function addCapturedSample(blob: Blob, durationSec: number, screenshotData?: string) {
  const objectUrl = URL.createObjectURL(blob);
  const sampleObj: RecordedSample = {
    id: 'sample_' + Date.now(),
    name: `Spray #${capturedSamples.length + 1}`,
    blob,
    objectUrl,
    durationSec: Math.round(durationSec * 10) / 10,
    timestamp: new Date(),
    screenshotData: screenshotData || '',
    screenshotUrl: screenshotData || ''
  };

  if (reRecordSlotIndex !== null && reRecordSlotIndex >= 0 && reRecordSlotIndex < capturedSamples.length) {
    URL.revokeObjectURL(capturedSamples[reRecordSlotIndex].objectUrl);
    sampleObj.name = capturedSamples[reRecordSlotIndex].name;
    capturedSamples[reRecordSlotIndex] = sampleObj;
    reRecordSlotIndex = null;
  } else {
    capturedSamples.push(sampleObj);
  }

  renderSamplesList();
}

function discardSample(index: number) {
  if (index < 0 || index >= capturedSamples.length) return;
  URL.revokeObjectURL(capturedSamples[index].objectUrl);
  capturedSamples.splice(index, 1);
  capturedSamples.forEach((s, idx) => s.name = `Spray #${idx + 1}`);
  if (reRecordSlotIndex === index) reRecordSlotIndex = null;
  renderSamplesList();
}

function markReRecordSample(index: number) {
  if (index < 0 || index >= capturedSamples.length) return;
  reRecordSlotIndex = (reRecordSlotIndex === index) ? null : index;
  renderSamplesList();
}

function clearAllSamples() {
  capturedSamples.forEach(s => URL.revokeObjectURL(s.objectUrl));
  capturedSamples.length = 0;
  reRecordSlotIndex = null;
  renderSamplesList();
}

function renderSamplesList() {
  const listContainer = document.getElementById('samples-list');
  const counterLabel = document.getElementById('samples-counter-label');
  const processBtn = document.getElementById('process-session-btn') as HTMLButtonElement | null;

  if (counterLabel) {
    counterLabel.innerText = `Collected Samples (${capturedSamples.length})`;
  }

  if (processBtn) {
    processBtn.disabled = capturedSamples.length === 0;
  }

  if (!listContainer) return;

  if (capturedSamples.length === 0) {
    listContainer.innerHTML = '<p class="empty-msg">No sprays recorded yet. Connect your game window and fire your weapon!</p>';
    return;
  }

  listContainer.innerHTML = '';
  capturedSamples.forEach((s, idx) => {
    const isTarget = reRecordSlotIndex === idx;
    const card = document.createElement('div');
    card.className = `sample-card${isTarget ? ' slot-target' : ''}`;

    const top = document.createElement('div');
    top.className = 'sample-top';

    const titleWrap = document.createElement('span');
    titleWrap.innerHTML = `<strong>${s.name}</strong> <span class="sample-meta">(${s.durationSec}s)${isTarget ? ' [Next spray will replace]' : ''}</span>`;

    const actions = document.createElement('div');
    actions.className = 'sample-actions';

    const viewCanvasBtn = document.createElement('button');
    viewCanvasBtn.className = 'small-btn';
    viewCanvasBtn.type = 'button';
    viewCanvasBtn.innerText = '👁️ Canvas';
    viewCanvasBtn.title = 'View this spray wall frame and points on canvas';
    viewCanvasBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeSessionData && activeSessionData.individual_trials) {
        switchToTrialPreview(idx);
      } else if (s.screenshotData) {
        loadSampleScreenshotOnCanvas(s.screenshotData);
      }
    });

    const resnapBtn = document.createElement('button');
    resnapBtn.className = 'small-btn';
    resnapBtn.type = 'button';
    resnapBtn.innerText = '📷 Re-snap Wall';
    resnapBtn.title = 'Capture current game window view as new wall decal screenshot (3s countdown to ADS)';
    resnapBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resnapSampleScreenshot(idx, resnapBtn);
    });

    const saveImgBtn = document.createElement('button');
    saveImgBtn.className = 'small-btn';
    saveImgBtn.type = 'button';
    saveImgBtn.innerText = '💾 Save Image';
    saveImgBtn.title = 'Download / save high-resolution wall screenshot';
    saveImgBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadSampleScreenshot(idx);
    });

    const audioBtn = document.createElement('button');
    audioBtn.className = 'small-btn';
    audioBtn.type = 'button';
    audioBtn.innerText = '🔊 Audio';
    audioBtn.title = 'Listen to recorded gunfire audio';
    audioBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playSampleAudio(idx);
    });

    const enlargeBtn = document.createElement('button');
    enlargeBtn.className = 'small-btn';
    enlargeBtn.type = 'button';
    enlargeBtn.innerText = '🔍 Enlarge';
    enlargeBtn.title = 'View enlarged video to inspect spray quality';
    enlargeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openVideoModal(s.name, s.objectUrl);
    });

    const discardBtn = document.createElement('button');
    discardBtn.className = 'small-btn danger-btn';
    discardBtn.type = 'button';
    discardBtn.innerText = '🗑 Discard';
    discardBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      discardSample(idx);
    });

    actions.appendChild(viewCanvasBtn);
    actions.appendChild(resnapBtn);
    actions.appendChild(saveImgBtn);
    actions.appendChild(audioBtn);
    actions.appendChild(enlargeBtn);
    actions.appendChild(discardBtn);
    top.appendChild(titleWrap);
    top.appendChild(actions);

    const mediaRow = document.createElement('div');
    mediaRow.className = 'sample-media-row';

    // Left: Video
    const videoCol = document.createElement('div');
    videoCol.className = 'media-col';
    const videoLabel = document.createElement('div');
    videoLabel.className = 'col-label';
    videoLabel.innerText = '🎥 Spray Video (RPM / Sound)';
    const video = document.createElement('video');
    video.src = s.objectUrl;
    video.controls = true;
    video.preload = 'metadata';
    video.muted = true; // Muted by default so playback does NOT trigger the gunfire sensor!
    video.addEventListener('play', () => { setAudioPreviewPlaying(true); });
    video.addEventListener('pause', () => { setAudioPreviewPlaying(false); });
    video.addEventListener('ended', () => { setAudioPreviewPlaying(false); });
    videoCol.appendChild(videoLabel);
    videoCol.appendChild(video);

    // Right: Wall Screenshot
    const shotCol = document.createElement('div');
    shotCol.className = 'media-col';
    const shotLabel = document.createElement('div');
    shotLabel.className = 'col-label';
    shotLabel.innerText = '🎯 Wall Decal Screenshot (ADS)';
    const shotImg = document.createElement('img');
    shotImg.src = s.screenshotUrl || s.screenshotData || '';
    shotImg.alt = 'Wall Screenshot';
    shotImg.title = 'Click to inspect wall on canvas';
    shotImg.addEventListener('click', () => {
      if (s.screenshotData) loadSampleScreenshotOnCanvas(s.screenshotData);
    });
    shotCol.appendChild(shotLabel);
    shotCol.appendChild(shotImg);

    mediaRow.appendChild(videoCol);
    mediaRow.appendChild(shotCol);

    card.appendChild(top);
    card.appendChild(mediaRow);
    listContainer.appendChild(card);
  });
}

function playCountdownTone(freq: number, durationSec: number = 0.1) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationSec);
  } catch (_) {}
}

let resnapCountdownTimer: any = null;

function resnapSampleScreenshot(index: number, btnElement?: HTMLButtonElement | null) {
  if (index < 0 || index >= capturedSamples.length) return;
  if (resnapCountdownTimer) {
    clearInterval(resnapCountdownTimer);
    resnapCountdownTimer = null;
  }

  let remaining = 3;
  if (btnElement) {
    btnElement.disabled = true;
    btnElement.innerText = `⏳ 3s [ADS!]`;
  }
  playCountdownTone(440, 0.12);

  const statusBox = document.getElementById('session-process-status');
  if (statusBox) {
    statusBox.className = '';
    statusBox.innerHTML = `<strong>⏳ Re-snapping in 3 seconds...</strong> Tab into game, hold ADS, and aim at bullet decals!`;
  }

  resnapCountdownTimer = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      if (btnElement) btnElement.innerText = `⏳ ${remaining}s [ADS!]`;
      playCountdownTone(440, 0.12);
      if (statusBox) {
        statusBox.innerHTML = `<strong>⏳ Re-snapping in ${remaining}s...</strong> Tab into game, hold ADS, and aim at bullet decals!`;
      }
    } else {
      clearInterval(resnapCountdownTimer);
      resnapCountdownTimer = null;
      playCountdownTone(880, 0.25);

      const freshShot = captureCurrentVideoFrame();
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.innerText = '📷 Re-snap Wall';
      }
      if (!freshShot) {
        alert('Cannot grab screenshot: ensure game window is connected and visible.');
        return;
      }
      capturedSamples[index].screenshotData = freshShot;
      capturedSamples[index].screenshotUrl = freshShot;
      renderSamplesList();
      loadSampleScreenshotOnCanvas(freshShot);

      if (statusBox) {
        statusBox.className = 'success';
        statusBox.innerHTML = `<strong>✅ Wall Re-snapped!</strong> Screenshot updated for Spray ${index + 1}.`;
      }
    }
  }, 1000);
}

function downloadSampleScreenshot(index: number) {
  if (index < 0 || index >= capturedSamples.length) return;
  const s = capturedSamples[index];
  const dataUrl = s.screenshotUrl || s.screenshotData;
  if (!dataUrl) {
    alert('No wall screenshot recorded for this spray.');
    return;
  }
  const weaponSelect = document.getElementById('weapon-select') as HTMLSelectElement | null;
  const weapon = weaponSelect ? weaponSelect.value : 'weapon';
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${weapon}_spray_${index + 1}_wall.jpg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function playSampleAudio(index: number) {
  if (index < 0 || index >= capturedSamples.length) return;
  const s = capturedSamples[index];
  const audio = new Audio(s.objectUrl);
  setAudioPreviewPlaying(true);
  audio.play().catch(() => {});
  audio.onended = () => { setAudioPreviewPlaying(false); };
  audio.onpause = () => { setAudioPreviewPlaying(false); };
}

function loadSampleScreenshotOnCanvas(imgDataUrl: string) {
  if (!imgDataUrl) return;
  stage.position({ x: 0, y: 0 });
  stage.scale({ x: 1, y: 1 });
  const { width: stageW, height: stageH } = syncStageSize();
  Konva.Image.fromURL(imgDataUrl, (konvaImg) => {
    clearCanvasForOverlay();
    if (currentBgImageObj) {
      currentBgImageObj.remove();
    }
    currentBgImageObj = konvaImg;
    layer.add(konvaImg);

    const imgW = konvaImg.width() || 1920;
    const imgH = konvaImg.height() || 1080;

    const padding = 20;
    const scale = Math.min((stageW - padding * 2) / imgW, (stageH - padding * 2) / imgH, 1.0);
    const offsetX = Math.max(0, (stageW - imgW * scale) / 2);
    const offsetY = Math.max(0, (stageH - imgH * scale) / 2);

    activeBgImageScale = scale;
    activeBgImageOffset = { x: offsetX, y: offsetY };

    konvaImg.scale({ x: scale, y: scale });
    konvaImg.position({ x: offsetX, y: offsetY });
    konvaImg.opacity(0.85);
    konvaImg.zIndex(0);

    const toggleBg = document.getElementById('toggle-bg-img') as HTMLInputElement | null;
    if (toggleBg) toggleBg.checked = true;

    layer.batchDraw();
    stage.batchDraw();
  });
}

async function processSessionSprays() {
  if (capturedSamples.length === 0) return;
  const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
  const curWeapon = sel?.value || 'havoc';
  const modeSelect = document.getElementById('weapon-mode-select') as HTMLSelectElement | null;
  const curMode = modeSelect?.value || 'auto';

  promptAnalysisConfirmation({
    actionTitle: 'Live In-Game Spray Analysis',
    defaultWeapon: curWeapon,
    defaultMode: curMode,
    defaultSave: true,
    onConfirm: (weapon, mode, saveCapture) => {
      executeProcessSessionSprays(weapon, mode, saveCapture);
    }
  });
}

async function executeProcessSessionSprays(weapon: string, mode: string, saveCapture: boolean) {
  const rpmInput = document.getElementById('weapon-rpm') as HTMLInputElement | null;
  const multInput = document.getElementById('weapon-multiplier') as HTMLInputElement | null;
  const statusBox = document.getElementById('session-process-status');
  const procBtn = document.getElementById('process-session-btn') as HTMLButtonElement | null;

  if (procBtn) procBtn.disabled = true;
  if (statusBox) {
    statusBox.className = 'info';
    statusBox.innerText = `Preparing ${capturedSamples.length} spray video(s) for analysis (${weapon.toUpperCase()} - ${mode.toUpperCase()})...`;
  }

  try {
    const samplesPayload = [];
    for (let i = 0; i < capturedSamples.length; i++) {
      const b = capturedSamples[i].blob;
      const base64 = await blobToBase64(b);
      samplesPayload.push({
        name: `spray_${i + 1}.webm`,
        data: base64,
        screenshot: capturedSamples[i].screenshotData || ''
      });
    }

    if (statusBox) {
      statusBox.innerText = `Tracking bullet decals and calculating median pattern...`;
    }

    let shotsToRequest: number | undefined = undefined;
    const mag4 = document.getElementById('mag-4') as HTMLInputElement | null;
    const mag3 = document.getElementById('mag-3') as HTMLInputElement | null;
    if (mag4 && mag4.value) {
      shotsToRequest = Number(mag4.value);
    } else if (mag3 && mag3.value) {
      shotsToRequest = Number(mag3.value);
    }

    const distInput = document.getElementById('capture-distance-input') as HTMLInputElement | null;
    const distVal = distInput && distInput.value ? Number(distInput.value) : 20.0;
    const opticSelect = document.getElementById('capture-optic-select') as HTMLSelectElement | null;
    const zoomVal = opticSelect && opticSelect.value ? Number(opticSelect.value) : 2.0;

    const res = await fetch('/api/discovery/process-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weapon,
        mode,
        save_capture: saveCapture,
        shots: shotsToRequest,
        rpm: rpmInput && rpmInput.value ? Number(rpmInput.value) : undefined,
        multiplier: multInput && multInput.value ? Number(multInput.value) : 0.73,
        distance: distVal,
        zoom: zoomVal,
        samples: samplesPayload
      })
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Session processing failed');
    }

    const spec = data.spec;
    const conv = data.convergence || {};
    const measuredRpm = data.measured_rpm || spec.rpm;
    const shotCount = spec.x ? spec.x.length : 0;
    const convScore = conv.convergence_score !== undefined ? conv.convergence_score : 'N/A';

    if (statusBox) {
      statusBox.className = 'success';
      statusBox.innerHTML = `
        <strong>✅ Analysis Complete!</strong><br/>
        • Target Weapon: <strong>${weapon.toUpperCase()}</strong> (${mode.toUpperCase()})<br/>
        • Sprays Analyzed: ${data.trials_count}<br/>
        • Detected Shots: ${shotCount} shots<br/>
        • Measured RPM: ${measuredRpm} RPM<br/>
        • Convergence Score: ${convScore} / 100<br/>
        • Saved to Captures: ${data.saved_to_disk ? 'Yes (processing/captures/)' : 'No (Analyzed in-memory)'}<br/>
        <em>Pattern plotted on canvas. Click Save to commit!</em>
      `;
    }

    if (rpmInput) rpmInput.value = String(measuredRpm);

    const targetW = loadedSpecsList.find(s => s.name === weapon);
    if (targetW) {
      targetW.x = spec.x;
      targetW.y = spec.y;
      targetW.rpm = spec.rpm;
      targetW.time_points = spec.time_points;
    }

    activeSessionData = {
      spec: targetW || spec,
      preview_image: data.preview_image,
      preview_points: data.preview_points,
      preview_origin: data.preview_origin,
      frame_width: data.frame_width,
      frame_height: data.frame_height,
      individual_trials: data.individual_trials,
      zoom: zoomVal
    };
    activeOpticZoom = zoomVal;

    populateStagePreviewDropdown();
    const previewSelect = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
    const initialKey = (data.preview_points && data.preview_points.length > 0) ? 'analyzed' : 'spec';
    if (previewSelect) previewSelect.value = initialKey;
    renderSelectedOverlay(initialKey);
  } catch (err: any) {
    if (statusBox) {
      statusBox.className = 'error';
      statusBox.innerText = `Error: ${err.message}`;
    }
  } finally {
    if (procBtn) procBtn.disabled = false;
  }
}

function openVideoModal(title: string, objectUrl: string) {
  let modal = document.getElementById('video-modal') as HTMLDivElement | null;
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'video-modal';
    modal.className = 'video-modal-overlay';
    modal.innerHTML = `
      <div class="video-modal-content">
        <div class="video-modal-header">
          <h3 id="modal-video-title">Spray Inspection</h3>
          <button type="button" id="close-video-modal" class="small-btn danger-btn">✕ Close</button>
        </div>
        <div class="video-modal-body">
          <video id="modal-video-elem" controls autoplay playsinline></video>
        </div>
        <div class="video-modal-footer">
          <p class="modal-hint">💡 Inspect bullet decal clarity and check if camera or mouse nudged during spray.</p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#close-video-modal')?.addEventListener('click', closeVideoModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeVideoModal();
    });
  }

  const modalTitle = document.getElementById('modal-video-title');
  const modalVideo = document.getElementById('modal-video-elem') as HTMLVideoElement | null;
  if (modalTitle) modalTitle.innerText = `${title} (Full Size Inspection)`;
  if (modalVideo) {
    modalVideo.src = objectUrl;
    modalVideo.muted = true; // Muted by default so playback does not trip audio sensor
    modalVideo.play().catch(() => {});
    modalVideo.onplay = () => { setAudioPreviewPlaying(true); };
    modalVideo.onpause = () => { setAudioPreviewPlaying(false); };
    modalVideo.onended = () => { setAudioPreviewPlaying(false); };
  }

  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

function closeVideoModal() {
  const modal = document.getElementById('video-modal');
  const modalVideo = document.getElementById('modal-video-elem') as HTMLVideoElement | null;
  if (modalVideo) {
    modalVideo.pause();
    modalVideo.src = '';
  }
  setAudioPreviewPlaying(false);
  if (modal) {
    modal.style.display = 'none';
    modal.classList.add('hidden');
  }
}

function renderBatchScreenshotsList() {
  const container = document.getElementById('batch-screenshots-container');
  const listEl = document.getElementById('batch-screenshots-list');
  const counterLabel = document.getElementById('batch-counter-label');
  const analyzeBtn = document.getElementById('analyze-wall-file-btn') as HTMLButtonElement | null;

  if (counterLabel) {
    counterLabel.innerText = `Loaded Screenshots (${batchScreenshots.length})`;
  }
  if (analyzeBtn) {
    analyzeBtn.disabled = batchScreenshots.length === 0;
  }
  if (container) {
    container.classList.toggle('hidden', batchScreenshots.length === 0);
  }
  if (!listEl) return;

  listEl.innerHTML = '';
  batchScreenshots.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = `batch-screenshot-card${idx === activeBatchIndex ? ' active' : ''}`;
    
    let badgeHtml = '';
    if (item.status === 'analyzing') {
      badgeHtml = '<span class="batch-badge badge-analyzing">Analyzing...</span>';
    } else if (item.status === 'done' && item.shots !== undefined) {
      badgeHtml = `<span class="batch-badge badge-done">${item.shots} shots</span>`;
    } else if (item.status === 'error') {
      badgeHtml = '<span class="batch-badge badge-error">Failed</span>';
    } else {
      badgeHtml = '<span class="batch-badge badge-pending">Ready</span>';
    }

    card.innerHTML = `
      <img src="${item.dataUrl}" alt="${item.name}" class="batch-thumb" />
      <div class="batch-info">
        <span class="batch-title" title="${item.name}">#${idx + 1}: ${item.name}</span>
        <span class="batch-meta">${item.source}</span>
      </div>
      <div class="batch-badge-wrap">${badgeHtml}</div>
      <button type="button" class="batch-remove-btn" title="Remove screenshot">✕</button>
    `;

    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.batch-remove-btn')) return;
      activeBatchIndex = idx;
      updateBatchNavUI();
      if (activeSessionData && activeSessionData.individual_trials) {
        switchBatchScreenshot(idx);
      } else {
        loadSampleScreenshotOnCanvas(item.dataUrl);
      }
    });

    const removeBtn = card.querySelector('.batch-remove-btn');
    removeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      batchScreenshots.splice(idx, 1);
      if (activeBatchIndex >= batchScreenshots.length) {
        activeBatchIndex = Math.max(0, batchScreenshots.length - 1);
      }
      renderBatchScreenshotsList();
      updateBatchNavUI();
    });

    listEl.appendChild(card);
  });

  updateBatchNavUI();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setupOfflineScreenshotAnalysis() {
  const fileInput = document.getElementById('wall-screenshot-file-input') as HTMLInputElement | null;
  const analyzeBtn = document.getElementById('analyze-wall-file-btn') as HTMLButtonElement | null;
  const clearBtn = document.getElementById('clear-batch-screenshots-btn') as HTMLButtonElement | null;
  const refreshLibBtn = document.getElementById('refresh-saved-screenshots-btn') as HTMLButtonElement | null;
  const savedSelect = document.getElementById('saved-screenshot-select') as HTMLSelectElement | null;
  const loadSavedBtn = document.getElementById('load-saved-screenshot-btn') as HTMLButtonElement | null;
  const statusBox = document.getElementById('wall-file-status');

  fileInput?.addEventListener('change', async () => {
    if (!fileInput.files || fileInput.files.length === 0) return;
    const files = Array.from(fileInput.files);
    let addedCount = 0;
    let duplicateCount = 0;

    for (const f of files) {
      if (batchScreenshots.some(b => b.name === f.name)) {
        duplicateCount++;
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(f);
        if (batchScreenshots.some(b => b.dataUrl === dataUrl)) {
          duplicateCount++;
          continue;
        }
        batchScreenshots.push({
          id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: f.name,
          dataUrl,
          source: 'Disk Upload',
          status: 'pending'
        });
        addedCount++;
      } catch (err) {
        console.error('Failed reading file:', f.name, err);
      }
    }
    fileInput.value = '';
    renderBatchScreenshotsList();
    if (!currentBgImageObj && batchScreenshots.length > 0) {
      loadSampleScreenshotOnCanvas(batchScreenshots[0].dataUrl);
    }
    if (statusBox) {
      if (duplicateCount > 0 && addedCount === 0) {
        statusBox.className = 'error';
        statusBox.innerHTML = `⚠️ <strong>Duplicate:</strong> Selected screenshot(s) are already loaded in the list.`;
      } else if (duplicateCount > 0) {
        statusBox.className = 'info';
        statusBox.innerHTML = `ℹ️ Added ${addedCount} screenshot(s) (<strong>${duplicateCount} duplicate(s) omitted</strong>).`;
      } else if (addedCount > 0) {
        statusBox.className = 'success';
        statusBox.innerHTML = `✅ Added ${addedCount} screenshot(s) to batch.`;
      }
    }
  });

  clearBtn?.addEventListener('click', () => {
    batchScreenshots = [];
    activeBatchIndex = 0;
    renderBatchScreenshotsList();
    if (statusBox) statusBox.innerHTML = '';
  });

  async function refreshServerLibrary() {
    try {
      const res = await fetch('/api/discovery/screenshots');
      const data = await res.json();
      if (!data.success) return;
      savedScreenshotsLibrary = data.screenshots || [];
      if (savedSelect) {
        savedSelect.innerHTML = '<option value="">-- Select saved screenshot from server --</option>';
        savedScreenshotsLibrary.forEach((s: any) => {
          const opt = document.createElement('option');
          opt.value = s.url;
          opt.innerText = `${s.filename} (${s.date})`;
          savedSelect.appendChild(opt);
        });
      }
    } catch (e) {
      console.warn('Failed to refresh screenshot library:', e);
    }
  }

  savedSelect?.addEventListener('change', () => {
    if (loadSavedBtn) {
      loadSavedBtn.disabled = !savedSelect.value;
    }
  });

  refreshLibBtn?.addEventListener('click', () => {
    refreshServerLibrary();
  });

  loadSavedBtn?.addEventListener('click', async () => {
    if (!savedSelect || !savedSelect.value) return;
    const url = savedSelect.value;
    const item = savedScreenshotsLibrary.find((s: any) => s.url === url);
    const filename = item ? item.filename : (url.split('/').pop() || 'screenshot.jpg');

    if (batchScreenshots.some(b => b.name === filename || (b.sourceUrl && b.sourceUrl === url))) {
      if (statusBox) {
        statusBox.className = 'error';
        statusBox.innerHTML = `⚠️ <strong>Duplicate:</strong> Screenshot "<em>${filename}</em>" is already in the batch list.`;
      } else {
        alert(`Screenshot "${filename}" is already loaded in the batch.`);
      }
      return;
    }

    if (loadSavedBtn) loadSavedBtn.disabled = true;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const dataUrl = await blobToBase64(blob);

      if (batchScreenshots.some(b => b.dataUrl === dataUrl)) {
        if (statusBox) {
          statusBox.className = 'error';
          statusBox.innerHTML = `⚠️ <strong>Duplicate:</strong> This screenshot is already loaded in the batch.`;
        }
        return;
      }

      batchScreenshots.push({
        id: `lib_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: filename,
        dataUrl,
        source: 'Server Library',
        sourceUrl: url,
        status: 'pending'
      });
      renderBatchScreenshotsList();
      if (!currentBgImageObj && batchScreenshots.length > 0) {
        loadSampleScreenshotOnCanvas(dataUrl);
      }
      if (statusBox) {
        statusBox.className = 'success';
        statusBox.innerHTML = `✅ Added "<em>${filename}</em>" to batch.`;
      }
    } catch (err: any) {
      alert(`Failed to load screenshot from server: ${err.message}`);
    } finally {
      if (loadSavedBtn) loadSavedBtn.disabled = false;
    }
  });

  analyzeBtn?.addEventListener('click', async () => {
    if (batchScreenshots.length === 0) {
      alert('Please add at least one screenshot to the batch first.');
      return;
    }

    const weaponSelect = document.getElementById('weapon-select') as HTMLSelectElement | null;
    const curWeapon = weaponSelect ? weaponSelect.value : 'havoc';
    const modeSelect = document.getElementById('weapon-mode-select') as HTMLSelectElement | null;
    const curMode = modeSelect ? modeSelect.value : 'auto';

    promptAnalysisConfirmation({
      actionTitle: `Static Screenshot Analysis (${batchScreenshots.length} images)`,
      defaultWeapon: curWeapon,
      defaultMode: curMode,
      defaultSave: false,
      onConfirm: (weapon, mode, saveCapture) => {
        executeBatchScreenshotAnalysis(weapon, mode, saveCapture);
      }
    });
  });

  refreshServerLibrary();
}

async function executeBatchScreenshotAnalysis(weapon: string, mode: string, saveCapture: boolean) {
  const analyzeBtn = document.getElementById('analyze-wall-file-btn') as HTMLButtonElement | null;
  const statusBox = document.getElementById('wall-file-status');

  let shotsToRequest: number | undefined = undefined;
  const mag4 = document.getElementById('mag-4') as HTMLInputElement | null;
  const mag3 = document.getElementById('mag-3') as HTMLInputElement | null;
  if (mag4 && mag4.value) {
    shotsToRequest = Number(mag4.value);
  } else if (mag3 && mag3.value) {
    shotsToRequest = Number(mag3.value);
  }

  const distInput = (document.getElementById('static-distance-input') || document.getElementById('capture-distance-input')) as HTMLInputElement | null;
  const distVal = distInput && distInput.value ? Number(distInput.value) : 20.0;
  const opticSelect = (document.getElementById('static-optic-select') || document.getElementById('capture-optic-select')) as HTMLSelectElement | null;
  const zoomVal = opticSelect && opticSelect.value ? Number(opticSelect.value) : 2.0;
  const rpmInput = document.getElementById('weapon-rpm') as HTMLInputElement | null;
  const multInput = document.getElementById('weapon-multiplier') as HTMLInputElement | null;

  batchScreenshots.forEach(b => b.status = 'analyzing');
  renderBatchScreenshotsList();

  if (statusBox) {
    statusBox.className = 'info';
    statusBox.innerText = `Analyzing batch of ${batchScreenshots.length} screenshot(s) for ${weapon.toUpperCase()} (${mode.toUpperCase()}) at ${distVal}m (${zoomVal}x zoom)...`;
  }
  if (analyzeBtn) analyzeBtn.disabled = true;

  try {
    const payloadImages = batchScreenshots.map(b => ({
      name: b.name,
      data: b.dataUrl
    }));

    const res = await fetch('/api/discovery/process-static-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weapon,
        mode,
        save_capture: saveCapture,
        images: payloadImages,
        shots: shotsToRequest,
        rpm: rpmInput && rpmInput.value ? Number(rpmInput.value) : undefined,
        multiplier: multInput && multInput.value ? Number(multInput.value) : 0.73,
        distance: distVal,
        zoom: zoomVal
      })
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Static image analysis failed');
    }

    const spec = data.spec;
    const shotCount = spec.x ? spec.x.length : 0;

    if (data.individual_trials && data.individual_trials.length > 0) {
      data.individual_trials.forEach((trial: any, idx: number) => {
        if (batchScreenshots[idx]) {
          batchScreenshots[idx].status = 'done';
          batchScreenshots[idx].shots = trial.shots;
        }
      });
    } else if (batchScreenshots.length === 1) {
      batchScreenshots[0].status = 'done';
      batchScreenshots[0].shots = shotCount;
    }
    renderBatchScreenshotsList();

    if (statusBox) {
      statusBox.className = 'success';
      statusBox.innerHTML = `
        <strong>✅ Batch Screenshot Analysis Complete!</strong><br/>
        • Target Weapon: <strong>${weapon.toUpperCase()}</strong> (${mode.toUpperCase()})<br/>
        • Screenshots Analyzed: ${data.trials_count || batchScreenshots.length}<br/>
        • Spec Shots (Median Aggregated): ${shotCount} shots<br/>
        • Storage: ${data.saved_to_disk ? 'Saved to captures library' : 'Analyzed in-memory (no duplicates)'}<br/>
        • <em>Use the stage toolbar ◀ Prev / Next ▶ (or [ and ]) to cycle through screenshots!</em>
      `;
    }

    const targetW = loadedSpecsList.find(s => s.name === weapon);
    if (targetW) {
      targetW.x = spec.x;
      targetW.y = spec.y;
      targetW.rpm = spec.rpm;
      targetW.time_points = spec.time_points;
    }

    clearCanvasForOverlay();
    activeSessionData = {
      spec: targetW || spec,
      preview_image: data.preview_image,
      preview_points: data.preview_points,
      preview_origin: data.preview_origin,
      frame_width: data.frame_width,
      frame_height: data.frame_height,
      individual_trials: data.individual_trials,
      zoom: zoomVal
    };
    activeOpticZoom = zoomVal;

    populateStagePreviewDropdown();
    activeBatchIndex = 0;
    updateBatchNavUI();

    const previewSelect = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
    if (data.individual_trials && data.individual_trials.length > 1) {
      if (previewSelect) previewSelect.value = 'trial-0';
      renderSelectedOverlay('trial-0');
    } else {
      const initialKey = (data.preview_points && data.preview_points.length > 0) ? 'analyzed' : 'spec';
      if (previewSelect) previewSelect.value = initialKey;
      renderSelectedOverlay(initialKey);
    }
  } catch (err: any) {
    batchScreenshots.forEach(b => {
      if (b.status === 'analyzing') b.status = 'error';
    });
    renderBatchScreenshotsList();
    if (statusBox) {
      statusBox.className = 'error';
      statusBox.innerText = `Error: ${err.message}`;
    }
  } finally {
    if (analyzeBtn) analyzeBtn.disabled = false;
  }
}

function setupPastSessionsManager() {
  const sessionSelect = document.getElementById('past-session-select') as HTMLSelectElement | null;
  const loadBtn = document.getElementById('load-past-session-btn') as HTMLButtonElement | null;
  const refreshBtn = document.getElementById('refresh-past-sessions-btn') as HTMLButtonElement | null;
  const importInput = document.getElementById('import-clips-input') as HTMLInputElement | null;
  const statusBox = document.getElementById('session-process-status');

  async function refreshPastSessions() {
    try {
      const res = await fetch('/api/discovery/sessions');
      const data = await res.json();
      if (!data.success) return;
      cachedSessionsList = data.sessions || [];
      if (sessionSelect) {
        sessionSelect.innerHTML = '<option value="">-- Select a saved session to load --</option>';
        cachedSessionsList.forEach((s: any) => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.innerText = s.label || `${s.weapon.toUpperCase()} (${s.mode.toUpperCase()}) - ${s.samplesCount} spray(s) - ${s.date}`;
          sessionSelect.appendChild(opt);
        });
      }
    } catch (e) {
      console.warn('Failed to load past sessions:', e);
    }
  }

  sessionSelect?.addEventListener('change', () => {
    if (loadBtn) {
      loadBtn.disabled = !sessionSelect.value;
    }
  });

  refreshBtn?.addEventListener('click', () => {
    refreshPastSessions();
  });

  loadBtn?.addEventListener('click', async () => {
    if (!sessionSelect || !sessionSelect.value) return;
    const sId = sessionSelect.value;
    const session = cachedSessionsList.find((s: any) => s.id === sId);
    if (!session) return;

    if (loadBtn) loadBtn.disabled = true;
    if (statusBox) {
      statusBox.className = 'info';
      statusBox.innerText = `Loading session '${session.id}' (${session.weapon.toUpperCase()} - ${session.mode.toUpperCase()})...`;
    }

    try {
      const mainWeaponSel = document.getElementById('weapon-select') as HTMLSelectElement | null;
      if (mainWeaponSel && session.weapon) {
        mainWeaponSel.value = session.weapon;
        loadWeaponIntoManager(session.weapon);
      }
      const mainModeSel = document.getElementById('weapon-mode-select') as HTMLSelectElement | null;
      if (mainModeSel && session.mode) {
        mainModeSel.value = session.mode;
      }

      capturedSamples.forEach(s => URL.revokeObjectURL(s.objectUrl));
      capturedSamples.length = 0;

      for (let i = 0; i < session.samples.length; i++) {
        const item = session.samples[i];
        let blob: Blob;
        try {
          const vidRes = await fetch(item.videoUrl);
          blob = await vidRes.blob();
        } catch (e) {
          blob = new Blob([], { type: 'video/webm' });
        }

        const objectUrl = URL.createObjectURL(blob);
        let screenshotDataUrl = '';
        if (item.screenshotUrl) {
          try {
            const shotRes = await fetch(item.screenshotUrl);
            const shotBlob = await shotRes.blob();
            screenshotDataUrl = await blobToBase64(shotBlob);
          } catch (e) {
            screenshotDataUrl = item.screenshotUrl;
          }
        }

        capturedSamples.push({
          id: `sample_${Date.now()}_${i}`,
          blob,
          objectUrl,
          name: `Spray #${i + 1} (${item.video || 'clip'})`,
          durationSec: 0,
          timestamp: new Date(),
          screenshotData: screenshotDataUrl,
          screenshotUrl: item.screenshotUrl || screenshotDataUrl
        });
      }

      renderSamplesList();

      if (capturedSamples.length > 0) {
        const previewUrl = capturedSamples[0].screenshotData || capturedSamples[0].screenshotUrl;
        if (previewUrl) {
          loadSampleScreenshotOnCanvas(previewUrl);
        }
      }

      if (statusBox) {
        statusBox.className = 'success';
        statusBox.innerHTML = `
          <strong>✅ Session Loaded!</strong><br/>
          • Weapon: <strong>${session.weapon.toUpperCase()}</strong> (${session.mode.toUpperCase()})<br/>
          • Loaded ${capturedSamples.length} spray(s) with companion wall screenshots.<br/>
          • Click <strong>⚡ Analyze Sprays & Calculate Recoil</strong> to re-run discovery!
        `;
      }
    } catch (err: any) {
      if (statusBox) {
        statusBox.className = 'error';
        statusBox.innerText = `Failed to load session: ${err.message}`;
      }
    } finally {
      if (loadBtn) loadBtn.disabled = false;
    }
  });

  importInput?.addEventListener('change', async () => {
    if (!importInput.files || importInput.files.length === 0) return;
    const files = Array.from(importInput.files);

    const videoFiles = files.filter(f => f.type.startsWith('video/') || f.name.endsWith('.webm') || f.name.endsWith('.mp4'));
    const imageFiles = files.filter(f => f.type.startsWith('image/') || f.name.endsWith('.jpg') || f.name.endsWith('.jpeg') || f.name.endsWith('.png'));

    if (videoFiles.length === 0 && imageFiles.length > 0) {
      let added = 0;
      let dups = 0;
      for (const imgF of imageFiles) {
        if (batchScreenshots.some(b => b.name === imgF.name)) {
          dups++;
          continue;
        }
        const dataUrl = await readFileAsDataUrl(imgF);
        if (batchScreenshots.some(b => b.dataUrl === dataUrl)) {
          dups++;
          continue;
        }
        batchScreenshots.push({
          id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: imgF.name,
          dataUrl,
          source: 'Imported Image',
          status: 'pending'
        });
        added++;
      }
      renderBatchScreenshotsList();
      importInput.value = '';
      if (dups > 0 && added === 0) {
        alert('All selected image(s) are already loaded in the batch list.');
      } else if (dups > 0) {
        alert(`Imported ${added} image(s) into Saved Wall Screenshot Analysis (${dups} duplicate(s) omitted).`);
      } else {
        alert(`Imported ${added} image(s) into Saved Wall Screenshot Analysis.`);
      }
      return;
    }

    if (statusBox) {
      statusBox.className = 'info';
      statusBox.innerText = `Importing ${videoFiles.length} local video clip(s)...`;
    }

    let addedClips = 0;
    let dupClips = 0;
    for (let i = 0; i < videoFiles.length; i++) {
      const vFile = videoFiles[i];
      if (capturedSamples.some(s => s.name.includes(vFile.name))) {
        dupClips++;
        continue;
      }
      const baseName = vFile.name.replace(/\.[^/.]+$/, '');

      const matchingImg = imageFiles.find(imgF => {
        const imgBase = imgF.name.replace(/\.[^/.]+$/, '');
        return imgBase === baseName || imgBase === `${baseName}_wall` || baseName.startsWith(imgBase);
      });

      let shotDataUrl = '';
      if (matchingImg) {
        shotDataUrl = await readFileAsDataUrl(matchingImg);
      }

      const objectUrl = URL.createObjectURL(vFile);
      capturedSamples.push({
        id: `imported_${Date.now()}_${i}`,
        blob: vFile,
        objectUrl,
        name: `Spray #${capturedSamples.length + 1} (${vFile.name})`,
        durationSec: 0,
        timestamp: new Date(),
        screenshotData: shotDataUrl,
        screenshotUrl: shotDataUrl
      });
      addedClips++;
    }

    importInput.value = '';
    renderSamplesList();

    if (capturedSamples.length > 0) {
      const lastSample = capturedSamples[capturedSamples.length - 1];
      const previewUrl = lastSample.screenshotData || lastSample.screenshotUrl;
      if (previewUrl) {
        loadSampleScreenshotOnCanvas(previewUrl);
      }
    }

    if (statusBox) {
      if (dupClips > 0 && addedClips === 0) {
        statusBox.className = 'error';
        statusBox.innerHTML = `⚠️ <strong>Duplicate:</strong> All selected video clip(s) are already imported.`;
      } else if (dupClips > 0) {
        statusBox.className = 'info';
        statusBox.innerHTML = `ℹ️ Imported ${addedClips} video clip(s) (<strong>${dupClips} duplicate(s) omitted</strong>).`;
      } else {
        statusBox.className = 'success';
        statusBox.innerHTML = `<strong>✅ Imported ${addedClips} video clip(s)!</strong> Ready to analyze.`;
      }
    }
  });

  refreshPastSessions();
}