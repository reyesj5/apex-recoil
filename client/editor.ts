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
const aHdrMode = new StringAttribute('hdr-mode', NS, 'hdr-standard');

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
  baseline_spec?: any;
  candidate_spec?: any;
  standalone_batch_spec?: any;
  merge_strategy?: string;
  sample_count?: number;
  existing_sample_count?: number;
  new_sample_count?: number;
  preview_image?: string;
  preview_points?: [number, number][];
  preview_origin?: [number, number];
  frame_width?: number;
  frame_height?: number;
  individual_trials?: SessionTrialData[];
  zoom: number;
  multiplier?: number;
}

interface DiscrepancyReport {
  weapon: string;
  baselineShots: number;
  candidateShots: number;
  shotCountMatches: boolean;
  shotCountDelta: number;
  meanDeviationPx: number;
  maxDeviationPx: number;
  maxDeviationShotIdx: number;
  meanDeviationMickeys: number;
  maxDeviationMickeys: number;
  hasMajorDiscrepancy: boolean;
  hasDifferences: boolean;
  warnings: string[];
  status: 'safe' | 'warning' | 'danger';
  savedSamplesText: string;
  candidateSamplesText: string;
}

interface BatchScreenshotItem {
  id: string;
  name: string;
  dataUrl: string;
  source: string;
  sourceUrl?: string;
  status: 'pending' | 'analyzing' | 'done' | 'error';
  shots?: number;
  expectedShots?: number;
}

let batchScreenshots: BatchScreenshotItem[] = [];
let savedScreenshotsLibrary: any[] = [];
let cachedSessionsList: any[] = [];

let activeSessionData: ActiveSessionData | null = null;
let activeBgImageScale = 1.0;
let activeBgImageOffset = { x: 0, y: 0 };
let activeOpticZoom = 2.0;
let activeScaleFactor = 1.0;
let isMoveAllActive = false;
let currentBgImageObj: Konva.Image | null = null;
let currentLoadedRawBgUrl = '';

function applyHdrToneMappingToCanvas(canvas: HTMLCanvasElement, mode: string): void {
  if (mode === 'off') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  const isVibrant = mode === 'hdr-vibrant';
  const gamma = isVibrant ? 1.75 : 1.6;
  const exposure = isVibrant ? 0.80 : 0.85;
  const contrast = isVibrant ? 1.30 : 1.20;
  const satBoost: number = isVibrant ? 1.40 : 1.25;

  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let f = (i / 255.0) * exposure;
    f = Math.pow(Math.min(1.0, Math.max(0.0, f)), gamma);
    f = (f - 0.5) * contrast + 0.5;
    lut[i] = Math.min(255, Math.max(0, Math.round(f * 255.0)));
  }

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    let r = lut[data[i]];
    let g = lut[data[i + 1]];
    let b = lut[data[i + 2]];

    if (satBoost !== 1.0) {
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      r = Math.min(255, Math.max(0, Math.round(y + (r - y) * satBoost)));
      g = Math.min(255, Math.max(0, Math.round(y + (g - y) * satBoost)));
      b = Math.min(255, Math.max(0, Math.round(y + (b - y) * satBoost)));
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  ctx.putImageData(imgData, 0, 0);
}

function toneMapImageIfNeeded(imgDataUrl: string, hdrMode: string): Promise<string> {
  return new Promise((resolve) => {
    if (hdrMode === 'off' || !imgDataUrl) {
      resolve(imgDataUrl);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imgDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);
      applyHdrToneMappingToCanvas(canvas, hdrMode);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = () => resolve(imgDataUrl);
    img.src = imgDataUrl;
  });
}

function updateVideoHdrFilter(): void {
  const previewVideo = document.getElementById('capture-preview-video') as HTMLVideoElement | null;
  const hdrSelect = (document.getElementById('capture-hdr-select') || document.getElementById('static-hdr-select')) as HTMLSelectElement | null;
  if (!previewVideo || !hdrSelect) return;
  const mode = hdrSelect.value;
  if (mode === 'hdr-standard') {
    previewVideo.style.filter = 'brightness(0.85) contrast(1.22) saturate(1.25)';
  } else if (mode === 'hdr-vibrant') {
    previewVideo.style.filter = 'brightness(0.78) contrast(1.35) saturate(1.40)';
  } else {
    previewVideo.style.filter = 'none';
  }
}

let isSpacePressed = false;
let isPanModeActive = false;
let isPanning = false;
let panStart = { x: 0, y: 0 };

// Shot correction mode: allows users to manually add/remove bullet holes
// to fix cases where the algorithm missed shots or made mistakes
let isCorrectionModeActive = false;
let correctionExpectedShots = 0;

// Recoil pattern overlay visibility and opacity controls
let isPatternVisible: boolean = true;
let patternOpacity: number = 1.0;

function syncStageSize(): { width: number; height: number; changed: boolean } {
  const stageContainer = document.getElementById('stage-container');
  const toolbar = document.getElementById('stage-toolbar');
  const stageEl = document.getElementById('stage');

  const toolbarH = toolbar?.offsetHeight || 0;
  const availW = stageContainer?.clientWidth || (stageEl?.clientWidth || (window.innerWidth - 380));
  const availH = (stageContainer?.clientHeight ? (stageContainer.clientHeight - toolbarH) : 0) || (stageEl?.clientHeight || (window.innerHeight - 50));

  let changed = false;
  if (availW > 50 && availH > 50) {
    if (Math.abs(stage.width() - availW) > 2 || Math.abs(stage.height() - availH) > 2) {
      stage.width(availW);
      stage.height(availH);
      changed = true;
    }
  }
  return { width: stage.width(), height: stage.height(), changed };
}

function fitAndCenterCanvas() {
  stage.position({ x: 0, y: 0 });
  stage.scale({ x: 1, y: 1 });
  const { width: stageW, height: stageH } = syncStageSize();

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
    updateMarkerScales();
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
    updateMarkerScales();
    stage.batchDraw();
    return;
  }

  updateMarkerScales();
  stage.batchDraw();
}

let stageResizeDebounce: any = null;
function handleStageResize() {
  const { changed } = syncStageSize();
  if (!changed) return;
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
  onConfirm: (weapon: string, mode: string, saveCapture: boolean, strategy: string) => void;
}

let activeAnalysisConfirmCallback: ((weapon: string, mode: string, saveCapture: boolean, strategy: string) => void) | null = null;

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

  function updateStrategyDesc() {
    if (!weaponSel) return;
    const wName = weaponSel.value;
    const w = loadedSpecsList.find(s => s.name === wName || (wName === 'havoc' && s.name === 'havoc_tc') || (wName === 'havoc_tc' && s.name === 'havoc'));
    const curSamples = w?.sample_count || 1;
    const desc = document.getElementById('strategy-accumulate-desc');
    if (desc) {
      desc.innerText = `Blends new captures proportionally with the existing ${wName.toUpperCase()} spec (currently built from ${curSamples} sample${curSamples === 1 ? '' : 's'}). Reduces noise and increases accuracy.`;
    }
  }

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
    updateStrategyDesc();
  });

  proceedBtn?.addEventListener('click', () => {
    if (!activeAnalysisConfirmCallback || !weaponSel || !modeSel) return;
    const chosenWeapon = weaponSel.value;
    const chosenMode = modeSel.value;
    const saveCheck = document.getElementById('modal-save-capture') as HTMLInputElement | null;
    const shouldSave = saveCheck ? saveCheck.checked : true;

    const stratRadios = document.getElementsByName('modal-analysis-strategy') as NodeListOf<HTMLInputElement>;
    let chosenStrategy = 'accumulate';
    for (let i = 0; i < stratRadios.length; i++) {
      if (stratRadios[i].checked) {
        chosenStrategy = stratRadios[i].value;
        break;
      }
    }

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
    cb(chosenWeapon, chosenMode, shouldSave, chosenStrategy);
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

  // Reset strategy radio to accumulate
  const stratRadios = document.getElementsByName('modal-analysis-strategy') as NodeListOf<HTMLInputElement>;
  stratRadios.forEach(r => {
    r.checked = r.value === 'accumulate';
  });

  const w = loadedSpecsList.find(s => s.name === opts.defaultWeapon || (opts.defaultWeapon === 'havoc' && s.name === 'havoc_tc') || (opts.defaultWeapon === 'havoc_tc' && s.name === 'havoc'));
  const curSamples = w?.sample_count || 1;
  const desc = document.getElementById('strategy-accumulate-desc');
  if (desc) {
    desc.innerText = `Blends new captures proportionally with the existing ${opts.defaultWeapon.toUpperCase()} spec (currently built from ${curSamples} sample${curSamples === 1 ? '' : 's'}). Reduces noise and increases accuracy.`;
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
  // Clear stale cached images and points from localStorage so editor always starts clean
  try {
    localStorage.removeItem('editor:imagedata');
    localStorage.removeItem('editor:points');
    localStorage.removeItem('editor:edges');
    localStorage.removeItem('editor:anchors');
  } catch (e) {}

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
  // Prevent context menu on stage so right-clicking to remove points doesn't open browser context menu
  stage.on('contentContextmenu', function (e) {
    e.evt.preventDefault();
  });
  stage.on('mousedown', function (e: Konva.KonvaEventObject<MouseEvent>) {
    if (e.evt.button === 1 || e.evt.button === 2 || e.evt.altKey || isSpacePressed || isPanModeActive || (e.evt.shiftKey && e.target === stage)) {
      return;
    }
    if (e.target === stage || e.target === currentBgImageObj) {
      insertBulletHole(cursor().plain());
    }
  });
  watch([aSens, aDistance, aWeapon, aBarrel, aStock, aComment], updateSpec);
  (document.getElementById('accept-auto') as HTMLButtonElement)?.addEventListener('click', acceptAuto);
  (document.getElementById('clear') as HTMLButtonElement)?.addEventListener('click', clear);
  updateShapes();
  stage.batchDraw();
}

export function applyPatternVisibilityAndOpacity() {
  const togglePattern = document.getElementById('toggle-pattern') as HTMLInputElement | null;
  const patternOpacitySlider = document.getElementById('pattern-opacity-slider') as HTMLInputElement | null;
  const patternOpacityVal = document.getElementById('pattern-opacity-val');

  if (togglePattern) isPatternVisible = togglePattern.checked;
  if (patternOpacitySlider) patternOpacity = Math.max(0, Math.min(100, Number(patternOpacitySlider.value))) / 100;
  if (patternOpacityVal) patternOpacityVal.innerText = `${Math.round(patternOpacity * 100)}%`;

  layer.children.forEach(child => {
    // Only adjust pattern/spec/comparison shapes, never the background wall image
    if (child !== currentBgImageObj && !(child instanceof Konva.Image)) {
      child.visible(isPatternVisible);
      child.opacity(patternOpacity);
    }
  });
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
  const undoBtn = document.getElementById('undo-stage-btn') as HTMLButtonElement | null;
  const redoBtn = document.getElementById('redo-stage-btn') as HTMLButtonElement | null;

  undoBtn?.addEventListener('click', () => performUndo());
  redoBtn?.addEventListener('click', () => performRedo());

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

  const togglePattern = document.getElementById('toggle-pattern') as HTMLInputElement | null;
  const patternOpacitySlider = document.getElementById('pattern-opacity-slider') as HTMLInputElement | null;

  togglePattern?.addEventListener('change', () => {
    applyPatternVisibilityAndOpacity();
  });

  patternOpacitySlider?.addEventListener('input', () => {
    applyPatternVisibilityAndOpacity();
  });

  previewSelect?.addEventListener('change', () => {
    const val = previewSelect.value;
    if (activeSessionData) {
      renderSelectedOverlay(val);
    } else if (val.startsWith('batch-')) {
      const idx = parseInt(val.replace('batch-', ''), 10);
      switchBatchScreenshot(idx);
    } else if (val === 'spec') {
      const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
      if (sel && sel.value) {
        const w = loadedSpecsList.find(s => s.name === sel.value || (sel.value === 'havoc' && s.name === 'havoc_tc') || (sel.value === 'havoc_tc' && s.name === 'havoc'));
        if (w) displayWeaponOnCanvas(w);
      }
    }
  });

  const stageSaveBtn = document.getElementById('save-stage-spec-btn') as HTMLButtonElement | null;
  stageSaveBtn?.addEventListener('click', () => {
    saveCurrentWeaponSpec();
  });

  const compareStageBtn = document.getElementById('compare-stage-btn') as HTMLButtonElement | null;
  compareStageBtn?.addEventListener('click', () => {
    toggleCompareOverlay();
  });

  document.getElementById('close-hud-btn')?.addEventListener('click', () => {
    setCompareOverlayActive(false);
  });

  const minHudBtn = document.getElementById('min-hud-btn');
  minHudBtn?.addEventListener('click', () => {
    const hud = document.getElementById('discrepancy-hud');
    const isMin = hud?.classList.toggle('minimized');
    if (minHudBtn) minHudBtn.innerText = isMin ? '□' : '─';
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
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      saveCurrentWeaponSpec();
      return;
    }
    if ((e.key === 'o' || e.key === 'O') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      toggleCompareOverlay();
      return;
    }
    if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const togglePattern = document.getElementById('toggle-pattern') as HTMLInputElement | null;
      if (togglePattern) {
        togglePattern.checked = !togglePattern.checked;
        applyPatternVisibilityAndOpacity();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      if (e.shiftKey) {
        e.preventDefault();
        performRedo();
      } else {
        e.preventDefault();
        performUndo();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      performRedo();
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

  // Correction mode: toggle button to manually add/remove bullet holes
  const correctionBtn = document.getElementById('correction-mode-btn') as HTMLButtonElement | null;
  correctionBtn?.addEventListener('click', () => {
    isCorrectionModeActive = !isCorrectionModeActive;
    correctionBtn.classList.toggle('active', isCorrectionModeActive);
    const correctSvg = '<svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>';
    correctionBtn.innerHTML = isCorrectionModeActive
      ? `<span class="btn-icon">${correctSvg}</span><span class="btn-label"> ON</span>`
      : `<span class="btn-icon">${correctSvg}</span><span class="btn-label"> Correct</span>`;
    const stageEl = document.getElementById('stage');
    if (stageEl && !isPanModeActive && !isSpacePressed) {
      stageEl.style.cursor = isCorrectionModeActive ? 'copy' : 'crosshair';
    }
    // Compute expected from the highest mag tier when entering correction mode
    if (isCorrectionModeActive) {
      correctionExpectedShots = getExpectedMagSize();
    }
    updateShotCorrectionStatus();
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

  // Shortcuts Help Modal controls
  const shortcutsBtn = document.getElementById('shortcuts-help-btn') as HTMLButtonElement | null;
  const shortcutsModal = document.getElementById('shortcuts-modal');
  const closeShortcutsBtn = document.getElementById('close-shortcuts-modal-btn') as HTMLButtonElement | null;
  const closeShortcutsFooterBtn = document.getElementById('close-shortcuts-modal-footer-btn') as HTMLButtonElement | null;

  const openShortcuts = () => shortcutsModal?.classList.remove('hidden');
  const closeShortcuts = () => shortcutsModal?.classList.add('hidden');

  shortcutsBtn?.addEventListener('click', openShortcuts);
  closeShortcutsBtn?.addEventListener('click', closeShortcuts);
  closeShortcutsFooterBtn?.addEventListener('click', closeShortcuts);

  // Close shortcuts modal on backdrop click
  shortcutsModal?.addEventListener('click', (e) => {
    if (e.target === shortcutsModal) closeShortcuts();
  });

  // ? key toggles shortcuts modal, Escape dismisses any active modal or overlay
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const activeModals = [
        document.getElementById('shortcuts-modal'),
        document.getElementById('analysis-confirm-modal'),
        document.getElementById('spec-checkpoint-modal'),
        document.getElementById('video-modal')
      ];
      let closedModal = false;
      for (const m of activeModals) {
        if (m && !m.classList.contains('hidden') && m.style.display !== 'none') {
          m.classList.add('hidden');
          m.style.display = 'none';
          closedModal = true;
        }
      }
      if (!closedModal) {
        const sel = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
        if (sel && sel.value === 'compare') {
          setCompareOverlayActive(false);
        } else if (isCorrectionModeActive) {
          correctionBtn?.click();
        }
      }
      return;
    }

    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      return;
    }
    if (e.key === '?') {
      if (shortcutsModal?.classList.contains('hidden')) {
        openShortcuts();
      } else {
        closeShortcuts();
      }
    }
  });

  // Scale Adjustment Slider controls (FOV / Optic fine-tune)
  const scaleSlider = document.getElementById('scale-adjust-slider') as HTMLInputElement | null;
  const scaleVal = document.getElementById('scale-adjust-val');
  const scaleResetBtn = document.getElementById('scale-reset-btn') as HTMLButtonElement | null;

  try {
    const savedScale = localStorage.getItem('editor:scale_factor');
    if (savedScale) {
      const parsed = parseFloat(savedScale);
      if (!isNaN(parsed) && parsed >= 0.8 && parsed <= 1.2) {
        activeScaleFactor = parsed;
        if (scaleVal) scaleVal.innerText = `${Math.round(parsed * 100)}%`;
        if (scaleSlider) scaleSlider.value = String(Math.round(parsed * 100));
      }
    }
  } catch (e) {}

  const applyScaleFactor = (factor: number) => {
    activeScaleFactor = factor;
    if (scaleVal) scaleVal.innerText = `${Math.round(factor * 100)}%`;
    if (scaleSlider) scaleSlider.value = String(Math.round(factor * 100));
    try {
      if (factor === 1.0) {
        localStorage.removeItem('editor:scale_factor');
      } else {
        localStorage.setItem('editor:scale_factor', String(factor));
      }
    } catch (e) {}

    if (activeSessionData) {
      renderSelectedOverlay(previewSelect?.value || 'spec');
    } else if (currentBgImageObj) {
      const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
      if (sel && sel.value) {
        const w = loadedSpecsList.find(s => s.name === sel.value || (sel.value === 'havoc' && s.name === 'havoc_tc') || (sel.value === 'havoc_tc' && s.name === 'havoc'));
        if (w) displayWeaponOnCanvas(w);
      }
    }
  };

  scaleSlider?.addEventListener('input', () => {
    const v = Number(scaleSlider.value);
    applyScaleFactor(v / 100);
  });

  scaleResetBtn?.addEventListener('click', () => {
    applyScaleFactor(1.0);
  });

  // Dynamic optic zoom listeners
  const staticOptic = document.getElementById('static-optic-select') as HTMLSelectElement | null;
  const liveOptic = document.getElementById('capture-optic-select') as HTMLSelectElement | null;
  const onOpticChange = () => {
    activeOpticZoom = getActiveOpticZoom();
    if (activeSessionData) {
      renderSelectedOverlay(previewSelect?.value || 'spec');
    } else if (currentBgImageObj) {
      const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
      if (sel && sel.value) {
        const w = loadedSpecsList.find(s => s.name === sel.value || (sel.value === 'havoc' && s.name === 'havoc_tc') || (sel.value === 'havoc_tc' && s.name === 'havoc'));
        if (w) displayWeaponOnCanvas(w);
      }
    }
  };
  staticOptic?.addEventListener('change', onOpticChange);
  liveOptic?.addEventListener('change', onOpticChange);

  // Dynamic FOV listeners
  const staticFov = document.getElementById('static-fov-input') as HTMLInputElement | null;
  const liveFov = document.getElementById('capture-fov-input') as HTMLInputElement | null;
  const onFovChange = () => {
    if (activeSessionData) {
      renderSelectedOverlay(previewSelect?.value || 'spec');
    } else if (currentBgImageObj) {
      const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
      if (sel && sel.value) {
        const w = loadedSpecsList.find(s => s.name === sel.value || (sel.value === 'havoc' && s.name === 'havoc_tc') || (sel.value === 'havoc_tc' && s.name === 'havoc'));
        if (w) displayWeaponOnCanvas(w);
      }
    }
  };
  staticFov?.addEventListener('input', onFovChange);
  liveFov?.addEventListener('input', onFovChange);

  // Mouse wheel zoom centered on cursor
  let wheelTimeout: any = null;
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

    if (wheelTimeout) clearTimeout(wheelTimeout);
    wheelTimeout = setTimeout(() => {
      updateMarkerScales();
    }, 40);
  });

  // Canvas Panning: Right-click (button 2), Middle-click (button 1), Alt+drag, Space+drag, or Pan Mode
  let panRaf: number | null = null;
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
      const nextX = e.clientX - panStart.x;
      const nextY = e.clientY - panStart.y;
      if (panRaf === null) {
        panRaf = requestAnimationFrame(() => {
          panRaf = null;
          if (isPanning) {
            stage.position({ x: nextX, y: nextY });
            stage.batchDraw();
          }
        });
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      if (panRaf !== null) {
        cancelAnimationFrame(panRaf);
        panRaf = null;
      }
      const stageContainer = document.getElementById('stage');
      if (stageContainer) {
        stageContainer.style.cursor = (isSpacePressed || isPanModeActive) ? 'grab' : 'crosshair';
      }
    }
  });
}

function acceptAuto() {
  saveUndoState();
  auto_points.forEach(p => {
    insertBulletHole(p.position());
    p.remove();
  });
  auto_points = [];
  updateShapes();
  stage.batchDraw();
}

function initImage() {
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
  saveUndoState();
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

function updateShapes() {
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

function addPoint(p: PlainPoint, name: string) {
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

/**
 * Calibration constant converting Source Engine in-game mouse counts (mickeys)
 * to 1080p 1x screen pixels on a wall screenshot.
 * Derived from Source Engine sensitivity coefficient (0.022 deg/count) and
 * Apex Legends ADS Field of View geometry (1 count = ~0.2976 px @ 1080p 1x, or 3.36 counts/px).
 */
export const CALIBRATION_MOUSE_TO_1080P_PX = 1.0 / 3.36; // ~0.2976

export function getActiveOpticZoom(): number {
  const staticOptic = document.getElementById('static-optic-select') as HTMLSelectElement | null;
  const liveOptic = document.getElementById('capture-optic-select') as HTMLSelectElement | null;
  if (staticOptic && staticOptic.value) return parseFloat(staticOptic.value) || 2.0;
  if (liveOptic && liveOptic.value) return parseFloat(liveOptic.value) || 2.0;
  return activeOpticZoom || 2.0;
}

export function getActiveFOV(): number {
  const staticFov = document.getElementById('static-fov-input') as HTMLInputElement | null;
  const liveFov = document.getElementById('capture-fov-input') as HTMLInputElement | null;
  if (staticFov && staticFov.value) return parseFloat(staticFov.value) || 104.0;
  if (liveFov && liveFov.value) return parseFloat(liveFov.value) || 104.0;
  return (activeSessionData as any)?.fov || 104.0;
}

export function getMouseToPixelScale(imgHeight?: number, zoom?: number, fov?: number): number {
  const z = (zoom && zoom > 0) ? zoom : getActiveOpticZoom();
  const h = (imgHeight && imgHeight > 0)
    ? imgHeight
    : (currentBgImageObj?.height() || activeSessionData?.frame_height || 1080);
  const f = (fov && fov > 0) ? fov : getActiveFOV();
  // Source Engine perspective projection: focal length scales with 1.0 / tan(fov / 2)
  // At reference FOV 90 deg: tan(45 deg) = 1.0 -> fovFactor = 1.0
  // At FOV 104 deg: tan(52 deg) = 1.2799 -> fovFactor = 0.78128
  const fovFactor = 1.0 / Math.tan((f * Math.PI) / 360);
  return (z / 3.36) * (h / 1080) * fovFactor * activeScaleFactor;
}

/**
 * Retrieves the ground-truth decal points [x, y] in screenshot pixel coordinates
 * for the currently active trial or preview session.
 */
export function getActiveCaptureDecals(trialIndex?: number | null): { points: [number, number][], origin: [number, number] } | null {
  if (!activeSessionData) return null;

  const idx = (trialIndex !== undefined && trialIndex !== null) ? trialIndex : activeBatchIndex;

  // 1. Try specified or active batch trial
  if (idx !== null && activeSessionData.individual_trials?.[idx]) {
    const trial = activeSessionData.individual_trials[idx];
    if (trial.frame_points && trial.frame_points.length > 0) {
      const orig = (trial.origin && (trial.origin[0] > 0 || trial.origin[1] > 0))
        ? trial.origin
        : trial.frame_points[0];
      return { points: trial.frame_points, origin: [orig[0], orig[1]] };
    }
  }

  // 2. Try session preview_points
  if (activeSessionData.preview_points && activeSessionData.preview_points.length > 0) {
    const orig = (activeSessionData.preview_origin && (activeSessionData.preview_origin[0] > 0 || activeSessionData.preview_origin[1] > 0))
      ? activeSessionData.preview_origin
      : activeSessionData.preview_points[0];
    return { points: activeSessionData.preview_points, origin: [orig[0], orig[1]] };
  }

  // 3. Fallback: try any trial that has frame_points
  if (activeSessionData.individual_trials) {
    for (const trial of activeSessionData.individual_trials) {
      if (trial.frame_points && trial.frame_points.length > 0) {
        const orig = (trial.origin && (trial.origin[0] > 0 || trial.origin[1] > 0))
          ? trial.origin
          : trial.frame_points[0];
        return { points: trial.frame_points, origin: [orig[0], orig[1]] };
      }
    }
  }

  return null;
}

/**
 * Computes the empirical scaling factor (in screenshot pixels per 1x spec unit)
 * mapping canonical spec coordinates directly to the screenshot wall decals.
 * Uses least-squares regression between capture decal displacements and spec displacements.
 */
export function computeCaptureToSpecScale(
  captureDecals: { points: [number, number][], origin: [number, number] } | null,
  referenceSpec?: any
): number | null {
  if (!captureDecals || !captureDecals.points || captureDecals.points.length < 2) {
    return null;
  }
  const spec = referenceSpec || activeSessionData?.candidate_spec || activeSessionData?.spec || activeSessionData?.baseline_spec;
  if (!spec || !spec.x || !spec.y || spec.x.length < 2) {
    return null;
  }

  const mult = spec.multiplier || 1.0;
  const numPoints = Math.min(captureDecals.points.length, spec.x.length);
  if (numPoints < 2) return null;

  let dotProduct = 0;
  let specNormSq = 0;
  let sumCapDist = 0;
  let sumSpecDist = 0;

  for (let i = 1; i < numPoints; i++) {
    const capDx = captureDecals.points[i][0] - captureDecals.origin[0];
    const capDy = captureDecals.points[i][1] - captureDecals.origin[1];

    const specDx = (spec.raw_1x_x && spec.raw_1x_x[i] !== undefined)
      ? spec.raw_1x_x[i]
      : (mult ? spec.x[i] / mult : spec.x[i]);
    const specDy = (spec.raw_1x_y && spec.raw_1x_y[i] !== undefined)
      ? spec.raw_1x_y[i]
      : (mult ? spec.y[i] / mult : spec.y[i]);

    dotProduct += (capDx * specDx + capDy * specDy);
    specNormSq += (specDx * specDx + specDy * specDy);

    sumCapDist += Math.hypot(capDx, capDy);
    sumSpecDist += Math.hypot(specDx, specDy);
  }

  if (specNormSq > 0.0001 && dotProduct > 0.0001) {
    return dotProduct / specNormSq;
  }
  if (sumSpecDist > 0.0001 && sumCapDist > 0.0001) {
    return sumCapDist / sumSpecDist;
  }
  return null;
}

function computeDiscrepancyReport(
  baselineSpec: any,
  candidateSpec: any,
  zoom?: number,
  imgH?: number,
  captureScaleOverride?: number
): DiscrepancyReport {
  const weapon = baselineSpec?.name || candidateSpec?.name || 'WEAPON';
  const baselineShots = baselineSpec?.x?.length || 0;
  const candidateShots = candidateSpec?.x?.length || 0;
  const shotCountDelta = candidateShots - baselineShots;
  const shotCountMatches = (baselineShots === candidateShots);

  const z = zoom || activeOpticZoom || 2.0;
  const h = imgH || currentBgImageObj?.height() || 1080;
  const mouseToPx = (captureScaleOverride && captureScaleOverride > 0)
    ? captureScaleOverride
    : getMouseToPixelScale(h, z);

  const bMult = baselineSpec?.multiplier || 1.0;
  const cMult = candidateSpec?.multiplier || 1.0;

  const commonLen = Math.min(baselineShots, candidateShots);
  let sumDevMickeys = 0;
  let maxDevMickeys = 0;
  let maxDevIdx = 0;
  let hasDifferences = (baselineShots !== candidateShots);

  for (let i = 0; i < commonLen; i++) {
    const bx = (baselineSpec.raw_1x_x && baselineSpec.raw_1x_x[i] !== undefined)
      ? baselineSpec.raw_1x_x[i]
      : (bMult ? baselineSpec.x[i] / bMult : baselineSpec.x[i]);
    const by = (baselineSpec.raw_1x_y && baselineSpec.raw_1x_y[i] !== undefined)
      ? baselineSpec.raw_1x_y[i]
      : (bMult ? baselineSpec.y[i] / bMult : baselineSpec.y[i]);

    const cx = (candidateSpec.raw_1x_x && candidateSpec.raw_1x_x[i] !== undefined)
      ? candidateSpec.raw_1x_x[i]
      : (cMult ? candidateSpec.x[i] / cMult : candidateSpec.x[i]);
    const cy = (candidateSpec.raw_1x_y && candidateSpec.raw_1x_y[i] !== undefined)
      ? candidateSpec.raw_1x_y[i]
      : (cMult ? candidateSpec.y[i] / cMult : candidateSpec.y[i]);

    const dM = Math.hypot(cx - bx, cy - by);
    if (dM > 0.05) hasDifferences = true;
    sumDevMickeys += dM;
    if (dM > maxDevMickeys) {
      maxDevMickeys = dM;
      maxDevIdx = i;
    }
  }

  const meanDevMickeys = commonLen > 0 ? (sumDevMickeys / commonLen) : 0;
  const meanDeviationPx = meanDevMickeys * mouseToPx;
  const maxDeviationPx = maxDevMickeys * mouseToPx;

  const warnings: string[] = [];

  if (baselineShots > 0 && candidateShots < baselineShots) {
    warnings.push(`⚠️ Shot count truncation: Candidate has ${candidateShots} shots, but saved spec has ${baselineShots} shots (${baselineShots - candidateShots} missing shots). Saving will shorten the compensation curve.`);
  } else if (baselineShots > 0 && candidateShots > baselineShots) {
    warnings.push(`⚠️ Extra shots detected: Candidate has ${candidateShots} shots, but saved spec has ${baselineShots} shots (${candidateShots - baselineShots} additional shots).`);
  }

  if (meanDeviationPx > 22.0) {
    warnings.push(`⚠️ High average deflection error: ${meanDeviationPx.toFixed(1)}px (${meanDevMickeys.toFixed(1)} mickeys). Pattern deviates heavily from baseline.`);
  }

  if (maxDeviationPx > 42.0) {
    warnings.push(`⚠️ Large outlier deflection at Shot #${maxDevIdx + 1}: ${maxDeviationPx.toFixed(1)}px (${maxDevMickeys.toFixed(1)} mickeys) deviation from baseline.`);
  }

  if (commonLen >= 5 && baselineSpec.y && candidateSpec.y) {
    const baseEndY = baselineSpec.y[commonLen - 1];
    const candEndY = candidateSpec.y[commonLen - 1];
    if ((baseEndY < 0 && candEndY > 0) || (baseEndY > 0 && candEndY < 0)) {
      warnings.push(`🚨 Inverted recoil direction! Vertical progression is opposite to saved baseline. Check camera tracking.`);
    }
  }

  let status: 'safe' | 'warning' | 'danger' = 'safe';
  const hasMajorDiscrepancy = warnings.length > 0 || !shotCountMatches || meanDeviationPx > 20;

  if (warnings.some(w => w.startsWith('🚨') || w.includes('truncation')) || meanDeviationPx > 30 || Math.abs(shotCountDelta) >= 3) {
    status = 'danger';
  } else if (hasMajorDiscrepancy) {
    status = 'warning';
  } else {
    status = 'safe';
  }

  const savedSamples = baselineSpec?.sample_count || 1;
  const candSamples = candidateSpec?.sample_count || (savedSamples + 1);
  const isAccumulate = activeSessionData?.merge_strategy === 'accumulate';

  const savedSamplesText = `${savedSamples} sample${savedSamples === 1 ? '' : 's'}`;
  const candidateSamplesText = isAccumulate
    ? `${candSamples} samples (Proportional Refinement)`
    : `${candidateSpec?.new_sample_count || 1} sample (Fresh Overwrite)`;

  return {
    weapon,
    baselineShots,
    candidateShots,
    shotCountMatches,
    shotCountDelta,
    meanDeviationPx,
    maxDeviationPx,
    maxDeviationShotIdx: maxDevIdx,
    meanDeviationMickeys: meanDevMickeys,
    maxDeviationMickeys: maxDevMickeys,
    hasMajorDiscrepancy,
    hasDifferences,
    warnings,
    status,
    savedSamplesText,
    candidateSamplesText
  };
}

function syncSpecFromPoints() {
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
function getExpectedMagSize(): number {
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
function updateShotCorrectionStatus() {
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

  const previewSelect = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
  if (activeSessionData && activeSessionData.individual_trials) {
    if (previewSelect && previewSelect.value === 'compare') {
      renderCompareOverlay();
    } else {
      const trialKey = `trial-${idx}`;
      if (previewSelect) {
        if (Array.from(previewSelect.options).some(o => o.value === trialKey)) {
          previewSelect.value = trialKey;
        }
      }
      renderSelectedOverlay(trialKey);
    }
  } else if (batchScreenshots[idx]) {
    const batchKey = `batch-${idx}`;
    if (previewSelect) {
      if (Array.from(previewSelect.options).some(o => o.value === batchKey)) {
        previewSelect.value = batchKey;
      }
    }
    loadSampleScreenshotOnCanvas(batchScreenshots[idx].dataUrl);
  }
}

function populateStagePreviewDropdown() {
  const sel = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
  if (!sel) return;

  const currentVal = sel.value;
  sel.innerHTML = '';

  const weaponSelect = document.getElementById('weapon-select') as HTMLSelectElement | null;
  const currentWeaponName = activeSessionData?.spec?.name || weaponSelect?.value || 'WEAPON';
  const currentSpecObj = loadedSpecsList.find(s => s.name === currentWeaponName || (currentWeaponName === 'havoc' && s.name === 'havoc_tc') || (currentWeaponName === 'havoc_tc' && s.name === 'havoc')) || activeSessionData?.spec;
  const shotCount = currentSpecObj?.x?.length || 0;

  const specOpt = document.createElement('option');
  specOpt.value = 'spec';
  const sampleBadge = (activeSessionData?.sample_count && activeSessionData.sample_count > 1) ? ` [N=${activeSessionData.sample_count} samples]` : '';
  specOpt.innerText = `📐 Saved Spec: ${String(currentWeaponName).toUpperCase()} (${shotCount} shots${sampleBadge})`;
  sel.appendChild(specOpt);

  if (activeSessionData) {
    if (activeSessionData.standalone_batch_spec && activeSessionData.merge_strategy === 'accumulate') {
      const batchOpt = document.createElement('option');
      batchOpt.value = 'batch_spec';
      const batchShots = activeSessionData.standalone_batch_spec.x?.length || 0;
      batchOpt.innerText = `🔬 New Batch Alone (${batchShots} shots, M=${activeSessionData.new_sample_count || 1})`;
      sel.appendChild(batchOpt);
    }

    if (activeSessionData.individual_trials && activeSessionData.individual_trials.length > 0) {
      if (activeSessionData.individual_trials.length > 1) {
        const medianOpt = document.createElement('option');
        medianOpt.value = 'median';
        medianOpt.innerText = `🎯 Median Aggregated (${shotCount} shots across ${activeSessionData.individual_trials.length} sprays)`;
        sel.appendChild(medianOpt);
      }

      activeSessionData.individual_trials.forEach((t, idx) => {
        const opt = document.createElement('option');
        opt.value = `trial-${idx}`;
        const name = t.source || `Image ${idx + 1}`;
        const expected = correctionExpectedShots || getExpectedMagSize();
        const mismatchLabel = (expected > 0 && t.shots < expected) ? ` ⚠️ (expected ${expected})` : '';
        opt.innerText = `🖼️ Image ${idx + 1}: ${name} (${t.shots} shots${mismatchLabel})`;
        sel.appendChild(opt);
      });
    } else if (activeSessionData.preview_points && activeSessionData.preview_points.length > 0) {
      const analyzedOpt = document.createElement('option');
      analyzedOpt.value = 'trial-0';
      analyzedOpt.innerText = `🎯 Detected Decals (${activeSessionData.preview_points.length} shots)`;
      sel.appendChild(analyzedOpt);
    }
    const compOpt = document.createElement('option');
    compOpt.value = 'compare';
    compOpt.innerText = `⚖️ Compare: Spec vs Candidate Overlay`;
    sel.appendChild(compOpt);
  } else if (batchScreenshots.length > 0) {
    batchScreenshots.forEach((item, idx) => {
      const opt = document.createElement('option');
      opt.value = `batch-${idx}`;
      opt.innerText = `🖼️ Image ${idx + 1}: ${item.name}`;
      sel.appendChild(opt);
    });
  }

  if (currentVal && Array.from(sel.options).some(o => o.value === currentVal)) {
    sel.value = currentVal;
  } else if (activeSessionData && activeBatchIndex !== null && Array.from(sel.options).some(o => o.value === `trial-${activeBatchIndex}`)) {
    sel.value = `trial-${activeBatchIndex}`;
  } else if (!activeSessionData && activeBatchIndex !== null && Array.from(sel.options).some(o => o.value === `batch-${activeBatchIndex}`)) {
    sel.value = `batch-${activeBatchIndex}`;
  } else if (sel.options.length > 0) {
    sel.value = sel.options[0].value;
  }
  updateBatchNavUI();
}

function switchToTrialPreview(idx: number) {
  const sel = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
  activeBatchIndex = idx;
  updateBatchNavUI();
  if (sel && sel.value === 'compare') {
    renderCompareOverlay();
  } else {
    if (sel) {
      sel.value = `trial-${idx}`;
    }
    renderSelectedOverlay(`trial-${idx}`);
  }
}

function renderSelectedOverlay(key: string) {
  if (!activeSessionData) return;

  if (key === 'compare') {
    renderCompareOverlay();
    return;
  }

  document.getElementById('discrepancy-hud')?.classList.add('hidden');
  document.getElementById('compare-stage-btn')?.classList.remove('active');

  // Purge canvas shapes immediately before loading or rendering new overlay
  clearCanvasForOverlay();

  let imgUrl: string | undefined = undefined;
  let origin: [number, number] = [0, 0];
  let pts: { x: number, y: number }[] = [];

  const zoom = (activeSessionData.zoom && activeSessionData.zoom > 0) ? activeSessionData.zoom : getActiveOpticZoom();
  activeOpticZoom = zoom;

  if (key === 'spec' || key === 'batch_spec') {
    imgUrl = activeSessionData.preview_image;
    let baseOrigin = activeSessionData.preview_origin;

    if (activeBatchIndex !== null && activeSessionData.individual_trials?.[activeBatchIndex]) {
      const curTrial = activeSessionData.individual_trials[activeBatchIndex];
      if (curTrial.frame_image) imgUrl = curTrial.frame_image;
      if (curTrial.origin && (curTrial.origin[0] > 0 || curTrial.origin[1] > 0)) {
        baseOrigin = curTrial.origin;
      }
    }

    const captureDecals = getActiveCaptureDecals();
    if (captureDecals) {
      baseOrigin = captureDecals.origin;
    } else if (!baseOrigin || (baseOrigin[0] === 0 && baseOrigin[1] === 0)) {
      if (activeSessionData.preview_points && activeSessionData.preview_points.length > 0) {
        baseOrigin = [activeSessionData.preview_points[0][0], activeSessionData.preview_points[0][1]];
      } else {
        const imgW = activeSessionData.frame_width || 1920;
        const imgH = activeSessionData.frame_height || 1080;
        baseOrigin = [imgW * 0.487, imgH * 0.495];
      }
    }
    origin = baseOrigin;
    const spec = (key === 'batch_spec' && activeSessionData.standalone_batch_spec)
      ? activeSessionData.standalone_batch_spec
      : activeSessionData.spec;
    const mult = spec?.multiplier || activeSessionData.multiplier || 1.0;
    const imgH = activeSessionData.frame_height || currentBgImageObj?.height() || 1080;
    const empiricalScale = computeCaptureToSpecScale(captureDecals, spec);
    const mouseToPx = (empiricalScale && empiricalScale > 0) ? empiricalScale : getMouseToPixelScale(imgH, zoom);
    if (spec && spec.x && spec.y) {
      const len = Math.min(spec.x.length, spec.y.length);
      for (let i = 0; i < len; i++) {
        // Convert mouse counts (spec) to screen pixel displacement: (spec / mult) * mouseToPx
        const mouse1xX = (spec.raw_1x_x && spec.raw_1x_x[i] !== undefined)
          ? spec.raw_1x_x[i]
          : (mult ? spec.x[i] / mult : spec.x[i]);
        const mouse1xY = (spec.raw_1x_y && spec.raw_1x_y[i] !== undefined)
          ? spec.raw_1x_y[i]
          : (mult ? spec.y[i] / mult : spec.y[i]);
        pts.push({
          x: origin[0] + mouse1xX * mouseToPx,
          y: origin[1] + mouse1xY * mouseToPx
        });
      }
    }
  } else if (key === 'median') {
    imgUrl = activeSessionData.preview_image;
    let baseOrigin = activeSessionData.preview_origin;
    const captureDecals = getActiveCaptureDecals();
    if (captureDecals) {
      baseOrigin = captureDecals.origin;
    } else if (!baseOrigin || (baseOrigin[0] === 0 && baseOrigin[1] === 0)) {
      if (activeSessionData.preview_points && activeSessionData.preview_points.length > 0) {
        baseOrigin = [activeSessionData.preview_points[0][0], activeSessionData.preview_points[0][1]];
      } else {
        const imgW = activeSessionData.frame_width || 1920;
        const imgH = activeSessionData.frame_height || 1080;
        baseOrigin = [imgW * 0.487, imgH * 0.495];
      }
    }
    origin = baseOrigin;
    const spec = activeSessionData.spec;
    const mult = spec?.multiplier || activeSessionData.multiplier || 1.0;
    const imgH = activeSessionData.frame_height || currentBgImageObj?.height() || 1080;
    const empiricalScale = computeCaptureToSpecScale(captureDecals, spec);
    const mouseToPx = (empiricalScale && empiricalScale > 0) ? empiricalScale : getMouseToPixelScale(imgH, zoom);
    if (spec && spec.x && spec.y) {
      const len = Math.min(spec.x.length, spec.y.length);
      for (let i = 0; i < len; i++) {
        const mouse1xX = (spec.raw_1x_x && spec.raw_1x_x[i] !== undefined)
          ? spec.raw_1x_x[i]
          : (mult ? spec.x[i] / mult : spec.x[i]);
        const mouse1xY = (spec.raw_1x_y && spec.raw_1x_y[i] !== undefined)
          ? spec.raw_1x_y[i]
          : (mult ? spec.y[i] / mult : spec.y[i]);
        pts.push({
          x: origin[0] + mouse1xX * mouseToPx,
          y: origin[1] + mouse1xY * mouseToPx
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
        const imgH = trial.frame_height || activeSessionData.frame_height || currentBgImageObj?.height() || 1080;
        const captureDecals = getActiveCaptureDecals(trialIdx);
        const empiricalScale = computeCaptureToSpecScale(captureDecals, trial);
        const mouseToPx = (empiricalScale && empiricalScale > 0) ? empiricalScale : getMouseToPixelScale(imgH, zoom);
        const len = Math.min(trial.x.length, trial.y.length);
        for (let i = 0; i < len; i++) {
          pts.push({
            x: origin[0] + trial.x[i] * mouseToPx,
            y: origin[1] + trial.y[i] * mouseToPx
          });
        }
      }
    } else if (trialIdx === 0 && activeSessionData.preview_points && activeSessionData.preview_points.length > 0) {
      imgUrl = activeSessionData.preview_image;
      pts = activeSessionData.preview_points.map(p => ({ x: p[0], y: p[1] }));
    }
  }

  const toggleBg = document.getElementById('toggle-bg-img') as HTMLInputElement | null;
  const opacitySlider = document.getElementById('bg-opacity-slider') as HTMLInputElement | null;
  const opacity = opacitySlider ? Number(opacitySlider.value) / 100 : 0.8;
  const isBgVisible = toggleBg ? toggleBg.checked : true;

  if (imgUrl) {
    const renderPointsOnImage = (konvaImg: Konva.Image) => {
      const hasCustomView = stage.scaleX() !== 1.0 || stage.x() !== 0 || stage.y() !== 0;
      if (!hasCustomView) {
        stage.position({ x: 0, y: 0 });
        stage.scale({ x: 1, y: 1 });
      }
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
      updateMarkerScales();
      stage.batchDraw();
      updateShotCorrectionStatus();
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
    const hasCustomView = stage.scaleX() !== 1.0 || stage.x() !== 0 || stage.y() !== 0;
    if (!hasCustomView) {
      stage.position({ x: 0, y: 0 });
      stage.scale({ x: 1, y: 1 });
    }
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
    updateMarkerScales();
    stage.batchDraw();
    updateShotCorrectionStatus();
  }
}

function renderCompareOverlay() {
  if (!activeSessionData) return;
  clearCanvasForOverlay();

  const compareStageBtn = document.getElementById('compare-stage-btn') as HTMLButtonElement | null;
  compareStageBtn?.classList.add('active');

  const hud = document.getElementById('discrepancy-hud');
  hud?.classList.remove('hidden');

  const weaponSelect = document.getElementById('weapon-select') as HTMLSelectElement | null;
  const currentWeaponName = activeSessionData?.spec?.name || weaponSelect?.value || 'WEAPON';
  const baselineSpec = activeSessionData?.baseline_spec || savedBaselineSpecs.get(currentWeaponName) || loadedSpecsList.find(s => s.name === currentWeaponName);
  const candSpec = activeSessionData?.candidate_spec || activeSessionData?.spec || baselineSpec;

  const zoom = (activeSessionData.zoom && activeSessionData.zoom > 0) ? activeSessionData.zoom : getActiveOpticZoom();
  activeOpticZoom = zoom;

  let imgUrl = activeSessionData.preview_image;
  let origin: [number, number] = [0, 0];

  if (activeBatchIndex !== null && activeSessionData.individual_trials?.[activeBatchIndex]) {
    const curTrial = activeSessionData.individual_trials[activeBatchIndex];
    if (curTrial.frame_image) imgUrl = curTrial.frame_image;
    if (curTrial.origin && (curTrial.origin[0] > 0 || curTrial.origin[1] > 0)) {
      origin = curTrial.origin;
    }
  }

  const captureDecals = getActiveCaptureDecals();
  if (captureDecals) {
    origin = captureDecals.origin;
  } else if (!origin || (origin[0] === 0 && origin[1] === 0)) {
    if (activeSessionData.preview_points && activeSessionData.preview_points.length > 0) {
      origin = [activeSessionData.preview_points[0][0], activeSessionData.preview_points[0][1]];
    } else {
      const imgW = activeSessionData.frame_width || 1920;
      const imgH = activeSessionData.frame_height || 1080;
      origin = [imgW * 0.487, imgH * 0.495];
    }
  }

  const imgH = activeSessionData.frame_height || currentBgImageObj?.height() || 1080;
  const empiricalScale = computeCaptureToSpecScale(captureDecals, candSpec)
    || computeCaptureToSpecScale(captureDecals, baselineSpec);
  const captureScale = (empiricalScale && empiricalScale > 0)
    ? empiricalScale
    : getMouseToPixelScale(imgH, zoom);

  const baselinePts: { x: number, y: number }[] = [];
  const candPts: { x: number, y: number }[] = [];

  // 1. Build Candidate points: directly match what the screenshot shows using detected decals
  if (captureDecals && captureDecals.points.length > 0) {
    for (let i = 0; i < captureDecals.points.length; i++) {
      candPts.push({
        x: captureDecals.points[i][0],
        y: captureDecals.points[i][1]
      });
    }
    // Extrapolate any extra candidate shots beyond capture decals using captureScale
    const cMult = candSpec?.multiplier || 1.0;
    const cLen = Math.min(candSpec?.x?.length || 0, candSpec?.y?.length || 0);
    for (let i = captureDecals.points.length; i < cLen; i++) {
      const mouse1xX = (candSpec.raw_1x_x && candSpec.raw_1x_x[i] !== undefined)
        ? candSpec.raw_1x_x[i]
        : (cMult ? candSpec.x[i] / cMult : candSpec.x[i]);
      const mouse1xY = (candSpec.raw_1x_y && candSpec.raw_1x_y[i] !== undefined)
        ? candSpec.raw_1x_y[i]
        : (cMult ? candSpec.y[i] / cMult : candSpec.y[i]);
      candPts.push({
        x: origin[0] + mouse1xX * captureScale,
        y: origin[1] + mouse1xY * captureScale
      });
    }
  } else {
    const cMult = candSpec?.multiplier || 1.0;
    const cLen = Math.min(candSpec?.x?.length || 0, candSpec?.y?.length || 0);
    for (let i = 0; i < cLen; i++) {
      const mouse1xX = (candSpec.raw_1x_x && candSpec.raw_1x_x[i] !== undefined)
        ? candSpec.raw_1x_x[i]
        : (cMult ? candSpec.x[i] / cMult : candSpec.x[i]);
      const mouse1xY = (candSpec.raw_1x_y && candSpec.raw_1x_y[i] !== undefined)
        ? candSpec.raw_1x_y[i]
        : (cMult ? candSpec.y[i] / cMult : candSpec.y[i]);
      candPts.push({
        x: origin[0] + mouse1xX * captureScale,
        y: origin[1] + mouse1xY * captureScale
      });
    }
  }

  // 2. Build Baseline points: scale baseline spec to match the capture's physical scale
  const bMult = baselineSpec?.multiplier || 1.0;
  const bLen = Math.min(baselineSpec?.x?.length || 0, baselineSpec?.y?.length || 0);
  for (let i = 0; i < bLen; i++) {
    const mouse1xX = (baselineSpec.raw_1x_x && baselineSpec.raw_1x_x[i] !== undefined)
      ? baselineSpec.raw_1x_x[i]
      : (bMult ? baselineSpec.x[i] / bMult : baselineSpec.x[i]);
    const mouse1xY = (baselineSpec.raw_1x_y && baselineSpec.raw_1x_y[i] !== undefined)
      ? baselineSpec.raw_1x_y[i]
      : (bMult ? baselineSpec.y[i] / bMult : baselineSpec.y[i]);
    baselinePts.push({
      x: origin[0] + mouse1xX * captureScale,
      y: origin[1] + mouse1xY * captureScale
    });
  }

  const report = computeDiscrepancyReport(baselineSpec, candSpec, zoom, imgH, captureScale);

  // Update Discrepancy HUD
  const hudShots = document.getElementById('hud-shots-val');
  const hudMean = document.getElementById('hud-mean-val');
  const hudMax = document.getElementById('hud-max-val');
  const hudBadge = document.getElementById('hud-status-badge');

  if (hudShots) {
    hudShots.innerText = `${report.baselineShots} vs ${report.candidateShots}`;
    hudShots.style.color = report.shotCountMatches ? '#69f0ae' : '#ff5252';
  }
  if (hudMean) {
    hudMean.innerText = `${report.meanDeviationPx.toFixed(1)} px (${report.meanDeviationMickeys.toFixed(1)} mickeys)`;
  }
  if (hudMax) {
    hudMax.innerText = `${report.maxDeviationPx.toFixed(1)} px (#${report.maxDeviationShotIdx + 1})`;
  }
  if (hudBadge) {
    hudBadge.className = `hud-badge ${report.status}`;
    hudBadge.innerText = report.status === 'safe'
      ? '🟢 Consistent'
      : (report.status === 'warning' ? '🟡 Moderate Drift' : '🔴 Major Discrepancy');
  }

  const toggleBg = document.getElementById('toggle-bg-img') as HTMLInputElement | null;
  const opacitySlider = document.getElementById('bg-opacity-slider') as HTMLInputElement | null;
  const opacity = opacitySlider ? Number(opacitySlider.value) / 100 : 0.8;
  const isBgVisible = toggleBg ? toggleBg.checked : true;

  const renderShapes = (offsetX: number, offsetY: number, scale: number) => {
    // 1. Draw Baseline Spec (Cyan dashed line + circles)
    const baseLinePoints: number[] = [];
    for (let i = 0; i < baselinePts.length; i++) {
      const cx = offsetX + baselinePts[i].x * scale;
      const cy = offsetY + baselinePts[i].y * scale;
      baseLinePoints.push(cx, cy);

      const circle = new Konva.Circle({
        x: cx,
        y: cy,
        radius: 4 / stage.scaleX(),
        fill: 'rgba(0, 229, 255, 0.35)',
        stroke: '#00e5ff',
        strokeWidth: 1.5 / stage.scaleX(),
        listening: false
      });
      layer.add(circle);
    }

    if (baseLinePoints.length >= 4) {
      const line = new Konva.Line({
        points: baseLinePoints,
        stroke: '#00e5ff',
        strokeWidth: 2 / stage.scaleX(),
        dash: [4, 4],
        opacity: 0.95,
        listening: false
      });
      layer.add(line);
      line.moveToBottom();
      if (currentBgImageObj) currentBgImageObj.moveToBottom();
    }

    // 2. Draw Candidate Spec (Orange solid line + circles)
    const candLinePoints: number[] = [];
    for (let i = 0; i < candPts.length; i++) {
      const cx = offsetX + candPts[i].x * scale;
      const cy = offsetY + candPts[i].y * scale;
      candLinePoints.push(cx, cy);

      const isFirst = (i === 0);
      const circle = new Konva.Circle({
        x: cx,
        y: cy,
        radius: 4.8 / stage.scaleX(),
        fill: 'rgba(255, 152, 0, 0.45)',
        stroke: isFirst ? '#00e676' : '#ff9800',
        strokeWidth: (isFirst ? 2.2 : 1.5) / stage.scaleX(),
        listening: false
      });
      layer.add(circle);
    }

    if (candLinePoints.length >= 4) {
      const line = new Konva.Line({
        points: candLinePoints,
        stroke: '#ff9800',
        strokeWidth: 2.2 / stage.scaleX(),
        opacity: 1.0,
        listening: false
      });
      layer.add(line);
      line.moveToBottom();
      if (currentBgImageObj) currentBgImageObj.moveToBottom();
    }

    // 3. Draw Discrepancy delta vectors between corresponding shots
    const minLen = Math.min(baselinePts.length, candPts.length);
    for (let i = 0; i < minLen; i++) {
      const bx = offsetX + baselinePts[i].x * scale;
      const by = offsetY + baselinePts[i].y * scale;
      const cx = offsetX + candPts[i].x * scale;
      const cy = offsetY + candPts[i].y * scale;
      const dist = Math.hypot(cx - bx, cy - by);

      if (dist > 3.0) {
        const deltaColor = dist > 22.0 ? '#ff1744' : (dist > 10.0 ? '#ffb300' : '#00e676');
        const deltaLine = new Konva.Line({
          points: [bx, by, cx, cy],
          stroke: deltaColor,
          strokeWidth: (dist > 22.0 ? 2.2 : 1.5) / stage.scaleX(),
          dash: dist > 22.0 ? [] : [3, 2],
          opacity: 0.95,
          listening: false
        });
        layer.add(deltaLine);

        const imgDist = Math.hypot(candPts[i].x - baselinePts[i].x, candPts[i].y - baselinePts[i].y);
        if (dist > 25.0) {
          const midX = (bx + cx) / 2;
          const midY = (by + cy) / 2;
          const label = new Konva.Text({
            x: midX + 4 / stage.scaleX(),
            y: midY - 6 / stage.scaleX(),
            text: `Δ${Math.round(imgDist)}px`,
            fontSize: Math.max(9, 11 / stage.scaleX()),
            fontFamily: 'monospace',
            fill: '#ffffff',
            stroke: '#000000',
            strokeWidth: 2 / stage.scaleX(),
            fillAfterStrokeEnabled: true,
            fontStyle: 'bold',
            listening: false
          });
          layer.add(label);
        }
      }
    }

    applyPatternVisibilityAndOpacity();
    stage.batchDraw();
  };

  if (imgUrl) {
    const renderOnKonvaImg = (konvaImg: Konva.Image) => {
      const hasCustomView = stage.scaleX() !== 1.0 || stage.x() !== 0 || stage.y() !== 0;
      if (!hasCustomView) {
        stage.position({ x: 0, y: 0 });
        stage.scale({ x: 1, y: 1 });
      }
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

      renderShapes(offsetX, offsetY, scale);
    };

    if (currentBgImageObj && (currentBgImageObj as any)._customSrc === imgUrl) {
      renderOnKonvaImg(currentBgImageObj);
    } else {
      Konva.Image.fromURL(imgUrl, (konvaImg) => {
        if (currentBgImageObj && currentBgImageObj !== konvaImg) {
          currentBgImageObj.destroy();
        }
        (konvaImg as any)._customSrc = imgUrl;
        currentBgImageObj = konvaImg;
        layer.add(konvaImg);
        konvaImg.moveToBottom();
        renderOnKonvaImg(konvaImg);
      });
    }
  } else {
    const { width: stageW, height: stageH } = syncStageSize();
    const startX = stageW / 2;
    const startY = stageH * 0.75;
    renderShapes(startX, startY, 1.5);
  }
}

function toggleCompareOverlay(forceActive?: boolean) {
  const sel = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
  if (!sel) return;
  const isCurrentlyCompare = sel.value === 'compare';
  const shouldBeActive = (forceActive !== undefined) ? forceActive : !isCurrentlyCompare;

  if (shouldBeActive) {
    if (!Array.from(sel.options).some(o => o.value === 'compare')) {
      populateStagePreviewDropdown();
    }
    sel.value = 'compare';
    renderSelectedOverlay('compare');
  } else {
    document.getElementById('discrepancy-hud')?.classList.add('hidden');
    document.getElementById('compare-stage-btn')?.classList.remove('active');
    sel.value = 'spec';
    renderSelectedOverlay('spec');
  }
}

function setCompareOverlayActive(active: boolean) {
  toggleCompareOverlay(active);
}


function addEdge(a: string, b: string) {
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

let loadedSpecsList: any[] = JSON.parse(JSON.stringify(specs));
const savedBaselineSpecs = new Map<string, any>();
loadedSpecsList.forEach(s => savedBaselineSpecs.set(s.name, JSON.parse(JSON.stringify(s))));

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

  document.getElementById('save-weapon-btn')?.addEventListener('click', () => saveCurrentWeaponSpec());
  document.getElementById('reload-specs-btn')?.addEventListener('click', reloadSpecsFromServer);
  document.getElementById('apply-json-btn')?.addEventListener('click', applyJsonToWeapon);
  document.getElementById('reset-samples-btn')?.addEventListener('click', () => {
    const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
    const name = sel?.value;
    const w = loadedSpecsList.find(s => s.name === name);
    if (w) {
      w.sample_count = 1;
      const samplesInfo = document.getElementById('spec-samples-info');
      if (samplesInfo) samplesInfo.innerText = 'Samples: 1';
      const statusMsg = document.getElementById('save-status-msg');
      if (statusMsg) {
        statusMsg.innerText = `Sample count reset to 1 for ${w.name.toUpperCase()}. Click 'Save' to commit.`;
        statusMsg.className = 'info';
      }
    }
  });

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
  const samplesInfo = document.getElementById('spec-samples-info');
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
  if (samplesInfo) samplesInfo.innerText = `Samples: ${w.sample_count || 1}`;

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
    const previewSelect = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
    const currentKey = previewSelect?.value || 'spec';
    populateStagePreviewDropdown();
    if (currentKey === 'spec') {
      renderSelectedOverlay('spec');
    } else {
      updateShapes();
      stage.batchDraw();
    }
    return;
  }

  if (currentBgImageObj) {
    const scale = (activeBgImageScale && activeBgImageScale > 0) ? activeBgImageScale : 1.0;
    const offset = activeBgImageOffset || { x: (stageW - currentBgImageObj.width() * scale) / 2, y: (stageH - currentBgImageObj.height() * scale) / 2 };
    const captureDecals = getActiveCaptureDecals();
    let startX: number;
    let startY: number;
    if (captureDecals && captureDecals.origin && (captureDecals.origin[0] > 0 || captureDecals.origin[1] > 0)) {
      startX = offset.x + captureDecals.origin[0] * scale;
      startY = offset.y + captureDecals.origin[1] * scale;
    } else {
      startX = offset.x + (currentBgImageObj.width() * scale) * 0.487;
      startY = offset.y + (currentBgImageObj.height() * scale) * 0.495;
    }
    const mult = w.multiplier || 1.0;
    const zoom = getActiveOpticZoom();
    const imgH = currentBgImageObj.height() || 1080;
    const empiricalScale = computeCaptureToSpecScale(captureDecals, w);
    const mouseToPx = (empiricalScale && empiricalScale > 0) ? empiricalScale : getMouseToPixelScale(imgH, zoom);
    for (let i = 0; i < minLen; i++) {
      const mouse1xX = (w.raw_1x_x && w.raw_1x_x[i] !== undefined)
        ? w.raw_1x_x[i]
        : (mult ? w.x[i] / mult : w.x[i]);
      const mouse1xY = (w.raw_1x_y && w.raw_1x_y[i] !== undefined)
        ? w.raw_1x_y[i]
        : (mult ? w.y[i] / mult : w.y[i]);
      addPoint({ x: startX + mouse1xX * mouseToPx * scale, y: startY + mouse1xY * mouseToPx * scale }, `${i}`);
      if (i > 0) {
        addEdge(`${i - 1}`, `${i}`);
      }
    }
    updateShapes();
    updateMarkerScales();
    stage.batchDraw();
    return;
  }

  // Standalone spec view without background image: dynamically scale to fit within 65% of viewport
  // and center pattern bounding box in the center of the stage so load and reload positions match identically
  let maxAbsY = 1;
  for (let i = 0; i < minLen; i++) {
    if (Math.abs(w.y[i]) > maxAbsY) maxAbsY = Math.abs(w.y[i]);
  }
  const standaloneScale = Math.min(1.0, (stageH * 0.65) / maxAbsY);

  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (let i = 0; i < minLen; i++) {
    const px = w.x[i] * standaloneScale;
    const py = w.y[i] * standaloneScale;
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }
  const patternCenterX = (minX + maxX) / 2;
  const patternCenterY = (minY + maxY) / 2;
  const startX = (stageW / 2) - patternCenterX;
  const startY = (stageH / 2) - patternCenterY;

  for (let i = 0; i < minLen; i++) {
    addPoint({ x: startX + w.x[i] * standaloneScale, y: startY + w.y[i] * standaloneScale }, `${i}`);
    if (i > 0) {
      addEdge(`${i - 1}`, `${i}`);
    }
  }
  updateShapes();
  updateMarkerScales();
  stage.batchDraw();
}

function showSpecCheckpointModal(report: DiscrepancyReport, onConfirm: () => void) {
  const modal = document.getElementById('spec-checkpoint-modal');
  if (!modal) {
    onConfirm();
    return;
  }

  const cpSavedShots = document.getElementById('cp-saved-shots');
  const cpCandShots = document.getElementById('cp-cand-shots');
  const cpSavedSamples = document.getElementById('cp-saved-samples');
  const cpCandSamples = document.getElementById('cp-cand-samples');
  const cpMatchStatus = document.getElementById('cp-match-status');
  const cpMeanStatus = document.getElementById('cp-mean-status');
  const cpMaxStatus = document.getElementById('cp-max-status');
  const alertBox = document.getElementById('checkpoint-alert-box');
  const warningsList = document.getElementById('checkpoint-warnings-list');
  const warningsUl = document.getElementById('cp-warnings-ul');

  if (cpSavedShots) cpSavedShots.innerText = `${report.baselineShots} shots`;
  if (cpCandShots) cpCandShots.innerText = `${report.candidateShots} shots`;
  if (cpSavedSamples) cpSavedSamples.innerText = report.savedSamplesText || '1 sample';
  if (cpCandSamples) cpCandSamples.innerText = report.candidateSamplesText || '1 sample';

  if (cpMatchStatus) {
    if (report.shotCountMatches) {
      cpMatchStatus.innerHTML = `<span class="status-badge safe">✅ ${report.candidateShots} / ${report.baselineShots} Matched</span>`;
    } else {
      cpMatchStatus.innerHTML = `<span class="status-badge danger">⚠️ ${report.candidateShots} vs ${report.baselineShots} (${Math.abs(report.shotCountDelta)} ${report.shotCountDelta < 0 ? 'missing' : 'extra'})</span>`;
    }
  }

  if (cpMeanStatus) {
    const badgeClass = report.meanDeviationPx < 12 ? 'safe' : (report.meanDeviationPx < 25 ? 'warning' : 'danger');
    cpMeanStatus.innerHTML = `<span class="status-badge ${badgeClass}">${report.meanDeviationPx.toFixed(1)} px (${report.meanDeviationMickeys.toFixed(1)} mickeys)</span>`;
  }

  if (cpMaxStatus) {
    const badgeClass = report.maxDeviationPx < 20 ? 'safe' : (report.maxDeviationPx < 40 ? 'warning' : 'danger');
    cpMaxStatus.innerHTML = `<span class="status-badge ${badgeClass}">${report.maxDeviationPx.toFixed(1)} px at Shot #${report.maxDeviationShotIdx + 1}</span>`;
  }

  if (alertBox) {
    alertBox.className = `checkpoint-alert-box ${report.status}`;
    if (report.status === 'safe') {
      alertBox.innerHTML = `<strong>✅ Verification Passed: Consistent Pattern!</strong><br/>The candidate pattern closely aligns with the saved baseline spec (mean delta ${report.meanDeviationPx.toFixed(1)}px). Safe to commit to <code>specs.json</code>.`;
    } else if (report.status === 'warning') {
      alertBox.innerHTML = `<strong>⚠️ Notice: Moderate Deviation Detected</strong><br/>The candidate pattern exhibits noticeable deflection variations from the saved baseline. Review before saving.`;
    } else {
      alertBox.innerHTML = `<strong>🚨 High Risk Discrepancy Detected!</strong><br/>Significant discrepancies were detected between the candidate and saved spec. This could indicate incomplete spray tracking, camera sway, or CV detection errors.`;
    }
  }

  if (warningsList && warningsUl) {
    if (report.warnings.length > 0) {
      warningsList.classList.remove('hidden');
      warningsUl.innerHTML = report.warnings.map(w => `<li>${w}</li>`).join('');
    } else {
      warningsList.classList.add('hidden');
      warningsUl.innerHTML = '';
    }
  }

  const inspectBtn = document.getElementById('inspect-overlay-btn');
  const cancelBtn = document.getElementById('cancel-checkpoint-btn');
  const closeBtn = document.getElementById('close-checkpoint-modal-btn');
  const confirmBtn = document.getElementById('confirm-checkpoint-save-btn');

  const closeModal = () => {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  };

  const handleInspect = () => {
    closeModal();
    toggleCompareOverlay(true);
  };

  const handleConfirm = () => {
    closeModal();
    onConfirm();
  };

  inspectBtn?.replaceWith(inspectBtn.cloneNode(true));
  cancelBtn?.replaceWith(cancelBtn.cloneNode(true));
  closeBtn?.replaceWith(closeBtn.cloneNode(true));
  confirmBtn?.replaceWith(confirmBtn.cloneNode(true));

  document.getElementById('inspect-overlay-btn')?.addEventListener('click', handleInspect);
  document.getElementById('cancel-checkpoint-btn')?.addEventListener('click', closeModal);
  document.getElementById('close-checkpoint-modal-btn')?.addEventListener('click', closeModal);
  document.getElementById('confirm-checkpoint-save-btn')?.addEventListener('click', handleConfirm);

  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

function saveCurrentWeaponSpec(forceSave?: boolean | Event) {
  const isForced = forceSave === true;
  const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
  const statusMsg = document.getElementById('save-status-msg');
  if (!sel) return;

  const name = sel.value;
  const w = loadedSpecsList.find(s => s.name === name);
  if (!w) return;

  const baseline = savedBaselineSpecs.get(name) || w;
  const candidate = activeSessionData?.spec || w;
  const report = computeDiscrepancyReport(baseline, candidate);

  if (!isForced && (report.hasDifferences || activeSessionData)) {
    showSpecCheckpointModal(report, () => {
      saveCurrentWeaponSpec(true);
    });
    return;
  }

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
  w.sample_count = w.sample_count || 1;

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
      savedBaselineSpecs.set(name, JSON.parse(JSON.stringify(w)));
      if (activeSessionData) {
        activeSessionData.baseline_spec = JSON.parse(JSON.stringify(w));
      }
      if (statusMsg) {
        statusMsg.innerText = `✅ Saved ${name.toUpperCase()} to specs.json! (${w.sample_count} sample${w.sample_count === 1 ? '' : 's'})`;
        statusMsg.className = 'success';
      }
      const stageSaveBtn = document.getElementById('save-stage-spec-btn') as HTMLButtonElement | null;
      if (stageSaveBtn) {
        const origHtml = stageSaveBtn.innerHTML;
        const checkSvg = '<svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
        stageSaveBtn.innerHTML = `<span class="btn-icon">${checkSvg}</span><span class="btn-label"> Saved!</span>`;
        stageSaveBtn.style.background = '#27ae60';
        setTimeout(() => {
          stageSaveBtn.innerHTML = origHtml;
          stageSaveBtn.style.background = '';
        }, 2000);
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
        savedBaselineSpecs.clear();
        loadedSpecsList.forEach(s => savedBaselineSpecs.set(s.name, JSON.parse(JSON.stringify(s))));
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

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

  const capFov = document.getElementById('capture-fov-input') as HTMLInputElement | null;
  const staticFov = document.getElementById('static-fov-input') as HTMLInputElement | null;
  const capHdr = document.getElementById('capture-hdr-select') as HTMLSelectElement | null;
  const staticHdr = document.getElementById('static-hdr-select') as HTMLSelectElement | null;

  if (capFov && staticFov) {
    capFov.addEventListener('change', () => { staticFov.value = capFov.value; });
    staticFov.addEventListener('change', () => { capFov.value = staticFov.value; });
  }

  const savedHdr = aHdrMode.value || 'hdr-standard';
  if (capHdr) capHdr.value = savedHdr;
  if (staticHdr) staticHdr.value = savedHdr;
  updateVideoHdrFilter();

  const onHdrChange = (newVal: string) => {
    aHdrMode.value = newVal;
    if (capHdr && capHdr.value !== newVal) capHdr.value = newVal;
    if (staticHdr && staticHdr.value !== newVal) staticHdr.value = newVal;
    updateVideoHdrFilter();
    if (currentLoadedRawBgUrl) {
      loadSampleScreenshotOnCanvas(currentLoadedRawBgUrl, false);
    }
  };

  capHdr?.addEventListener('change', () => onHdrChange(capHdr.value));
  staticHdr?.addEventListener('change', () => onHdrChange(staticHdr.value));

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

  const hdrSelect = (document.getElementById('capture-hdr-select') || document.getElementById('static-hdr-select')) as HTMLSelectElement | null;
  const hdrMode = hdrSelect ? hdrSelect.value : (aHdrMode.value || 'hdr-standard');
  if (hdrMode !== 'off') {
    applyHdrToneMappingToCanvas(canvas, hdrMode);
  }

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
    titleWrap.innerHTML = `<strong>${escapeHtml(s.name)}</strong> <span class="sample-meta">(${s.durationSec}s)${isTarget ? ' [Next spray will replace]' : ''}</span>`;

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

async function loadSampleScreenshotOnCanvas(imgDataUrl: string, isRaw: boolean = true) {
  if (!imgDataUrl) return;
  if (isRaw) {
    currentLoadedRawBgUrl = imgDataUrl;
  }

  const hdrSelect = (document.getElementById('static-hdr-select') || document.getElementById('capture-hdr-select')) as HTMLSelectElement | null;
  const hdrMode = hdrSelect ? hdrSelect.value : (aHdrMode.value || 'hdr-standard');
  const processedUrl = await toneMapImageIfNeeded(imgDataUrl, hdrMode);

  const hasCustomView = stage.scaleX() !== 1.0 || stage.x() !== 0 || stage.y() !== 0;
  if (!hasCustomView) {
    stage.position({ x: 0, y: 0 });
    stage.scale({ x: 1, y: 1 });
  }
  const { width: stageW, height: stageH } = syncStageSize();
  Konva.Image.fromURL(processedUrl, (konvaImg) => {
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
    const bgOpacitySlider = document.getElementById('bg-opacity-slider') as HTMLInputElement | null;
    const initialBgOpacity = bgOpacitySlider ? Number(bgOpacitySlider.value) / 100 : 0.8;
    konvaImg.opacity(initialBgOpacity);
    konvaImg.zIndex(0);
    konvaImg.moveToBottom();

    const toggleBg = document.getElementById('toggle-bg-img') as HTMLInputElement | null;
    if (toggleBg) konvaImg.visible(toggleBg.checked);

    layer.batchDraw();
    updateMarkerScales();
    stage.batchDraw();

    if (!activeSessionData) {
      const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
      if (sel && sel.value) {
        const w = loadedSpecsList.find(s => s.name === sel.value || (sel.value === 'havoc' && s.name === 'havoc_tc') || (sel.value === 'havoc_tc' && s.name === 'havoc'));
        if (w) displayWeaponOnCanvas(w);
      }
    }
  });
}

async function processSessionSprays() {
  if (capturedSamples.length === 0) return;
  const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
  const curWeapon = sel?.value || 'havoc_tc';
  const modeSelect = document.getElementById('weapon-mode-select') as HTMLSelectElement | null;
  const curMode = modeSelect?.value || 'auto';

  promptAnalysisConfirmation({
    actionTitle: 'Live In-Game Spray Analysis',
    defaultWeapon: curWeapon,
    defaultMode: curMode,
    defaultSave: true,
    onConfirm: (weapon, mode, saveCapture, strategy) => {
      executeProcessSessionSprays(weapon, mode, saveCapture, strategy);
    }
  });
}

async function executeProcessSessionSprays(weapon: string, mode: string, saveCapture: boolean, strategy: string = 'accumulate') {
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
    const fovInput = document.getElementById('capture-fov-input') as HTMLInputElement | null;
    const fovVal = fovInput && fovInput.value ? Number(fovInput.value) : 104.0;
    const hdrSelect = (document.getElementById('capture-hdr-select') || document.getElementById('static-hdr-select')) as HTMLSelectElement | null;
    const hdrVal = hdrSelect ? hdrSelect.value : (aHdrMode.value || 'hdr-standard');

    const targetW = loadedSpecsList.find(s => s.name === weapon || (weapon === 'havoc' && s.name === 'havoc_tc') || (weapon === 'havoc_tc' && s.name === 'havoc'));
    const existingSamples = targetW?.sample_count || 1;

    const res = await fetch('/api/discovery/process-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weapon,
        mode,
        save_capture: saveCapture,
        strategy: strategy,
        existing_samples: existingSamples,
        shots: shotsToRequest,
        rpm: rpmInput && rpmInput.value ? Number(rpmInput.value) : undefined,
        multiplier: multInput && multInput.value ? Number(multInput.value) : 0.73,
        distance: distVal,
        zoom: zoomVal,
        fov: fovVal,
        hdr: hdrVal,
        samples: samplesPayload
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMsg = `Server error (${res.status})`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error) errMsg = errJson.error;
      } catch {
        if (errText) errMsg += `: ${errText.slice(0, 100)}`;
      }
      throw new Error(errMsg);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Session processing failed');
    }

    const spec = data.spec;
    const conv = data.convergence || {};
    const measuredRpm = data.measured_rpm || spec.rpm;
    const shotCount = spec.x ? spec.x.length : 0;
    const convScore = conv.convergence_score !== undefined ? conv.convergence_score : 'N/A';
    const totalSamples = spec.total_sample_count || spec.sample_count || (strategy === 'accumulate' ? (existingSamples + data.trials_count) : data.trials_count);

    if (rpmInput) rpmInput.value = String(measuredRpm);

    const baselineSpec = JSON.parse(JSON.stringify(savedBaselineSpecs.get(weapon) || targetW || spec));
    if (targetW) {
      targetW.x = spec.x;
      targetW.y = spec.y;
      targetW.rpm = spec.rpm;
      targetW.time_points = spec.time_points;
      targetW.raw_1x_x = spec.raw_1x_x;
      targetW.raw_1x_y = spec.raw_1x_y;
      targetW.sample_count = totalSamples;
    }

    const discReport = computeDiscrepancyReport(baselineSpec, targetW || spec, zoomVal);

    const samplesInfo = document.getElementById('spec-samples-info');
    if (samplesInfo) {
      samplesInfo.innerText = `Samples: ${totalSamples}`;
    }

    const integrationModeText = (spec.merge_strategy === 'accumulate' && spec.existing_sample_count)
      ? `Proportional Accumulation (${spec.existing_sample_count} prior + ${spec.new_sample_count || data.trials_count} new = ${totalSamples} samples)`
      : `Fresh Overwrite (${data.trials_count} sample${data.trials_count === 1 ? '' : 's'})`;

    if (statusBox) {
      statusBox.className = 'success';
      statusBox.innerHTML = `
        <strong>✅ Analysis Complete!</strong><br/>
        • Target Weapon: <strong>${escapeHtml(weapon.toUpperCase())}</strong> (${escapeHtml(mode.toUpperCase())})<br/>
        • Sprays Analyzed: ${data.trials_count}<br/>
        • Detected Shots: ${shotCount} shots<br/>
        • Measured RPM: ${measuredRpm} RPM<br/>
        • Convergence Score: ${escapeHtml(String(convScore))} / 100<br/>
        • Spec Integration: <strong>${escapeHtml(integrationModeText)}</strong><br/>
        • Discrepancy Check: <span class="status-badge ${discReport.status}">${discReport.status === 'safe' ? '🟢 Consistent' : (discReport.status === 'warning' ? '🟡 Moderate Deviation' : '🔴 Major Discrepancy Alert')} (${discReport.meanDeviationPx.toFixed(1)}px avg delta${discReport.shotCountMatches ? '' : `, ${Math.abs(discReport.shotCountDelta)} shot mismatch`})</span><br/>
        • Saved to Captures: ${data.saved_to_disk ? 'Yes (processing/captures/)' : 'No (Analyzed in-memory)'}<br/>
        <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" id="save-session-result-btn" class="primary-btn" style="padding: 8px 16px; font-weight: bold; background: #27ae60; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
            💾 Save Analyzed Pattern to specs.json
          </button>
          <button type="button" id="inspect-session-compare-btn" class="tool-btn secondary-btn" style="padding: 8px 14px; background: #ff9800; color: #121212; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;">
            ⚖️ Inspect Discrepancies
          </button>
        </div>
      `;
      document.getElementById('save-session-result-btn')?.addEventListener('click', () => {
        saveCurrentWeaponSpec();
      });
      document.getElementById('inspect-session-compare-btn')?.addEventListener('click', () => {
        toggleCompareOverlay(true);
      });
    }

    activeSessionData = {
      spec: targetW || spec,
      baseline_spec: baselineSpec,
      candidate_spec: JSON.parse(JSON.stringify(spec)),
      standalone_batch_spec: spec.standalone_batch_spec,
      merge_strategy: spec.merge_strategy || strategy,
      sample_count: totalSamples,
      existing_sample_count: spec.existing_sample_count,
      new_sample_count: spec.new_sample_count || data.trials_count,
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
    const hasScreenshots = batchScreenshots.length > 0;
    analyzeBtn.disabled = !hasScreenshots;
    const btnText = hasScreenshots
      ? `Analyze ${batchScreenshots.length} Screenshot${batchScreenshots.length > 1 ? 's' : ''}`
      : 'Analyze Screenshot(s)';
    const boltSvg = '<svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
    analyzeBtn.innerHTML = `${boltSvg}<span> ${btnText}</span>`;
    analyzeBtn.classList.toggle('ready-to-analyze', hasScreenshots);
    analyzeBtn.title = hasScreenshots
      ? `Click to analyze ${batchScreenshots.length} loaded screenshot(s)`
      : 'Select or load screenshots above first to enable analysis';
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
      const hasMismatch = item.expectedShots && item.shots < item.expectedShots;
      if (hasMismatch) {
        badgeHtml = `<span class="batch-badge badge-mismatch" title="Expected ${item.expectedShots} shots but detected only ${item.shots}">${item.shots}/${item.expectedShots} ⚠️</span>`;
      } else {
        badgeHtml = `<span class="batch-badge badge-done">${item.shots} shots</span>`;
      }
    } else if (item.status === 'error') {
      badgeHtml = '<span class="batch-badge badge-error">Failed</span>';
    } else {
      badgeHtml = '<span class="batch-badge badge-pending">Ready</span>';
    }

    card.innerHTML = `
      <img src="${item.dataUrl}" alt="${escapeHtml(item.name)}" class="batch-thumb" />
      <div class="batch-info">
        <span class="batch-title" title="${escapeHtml(item.name)}">#${idx + 1}: ${escapeHtml(item.name)}</span>
        <span class="batch-meta">${escapeHtml(item.source)}</span>
      </div>
      <div class="batch-badge-wrap">${badgeHtml}</div>
      <button type="button" class="batch-remove-btn" title="Remove screenshot">✕</button>
    `;

    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.batch-remove-btn')) return;
      activeBatchIndex = idx;
      updateBatchNavUI();
      const previewSelect = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
      if (activeSessionData && activeSessionData.individual_trials) {
        switchBatchScreenshot(idx);
      } else {
        if (previewSelect && Array.from(previewSelect.options).some(o => o.value === `batch-${idx}`)) {
          previewSelect.value = `batch-${idx}`;
        }
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

  populateStagePreviewDropdown();
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
        statusBox.innerHTML = `⚠️ <strong>Duplicate:</strong> Screenshot "<em>${escapeHtml(filename)}</em>" is already in the batch list.`;
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
        statusBox.innerHTML = `✅ Added "<em>${escapeHtml(filename)}</em>" to batch.`;
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
    const curWeapon = weaponSelect ? weaponSelect.value : 'havoc_tc';
    const modeSelect = document.getElementById('weapon-mode-select') as HTMLSelectElement | null;
    const curMode = modeSelect ? modeSelect.value : 'auto';

    promptAnalysisConfirmation({
      actionTitle: `Static Screenshot Analysis (${batchScreenshots.length} images)`,
      defaultWeapon: curWeapon,
      defaultMode: curMode,
      defaultSave: false,
      onConfirm: (weapon, mode, saveCapture, strategy) => {
        executeBatchScreenshotAnalysis(weapon, mode, saveCapture, strategy);
      }
    });
  });

  refreshServerLibrary();
}

async function executeBatchScreenshotAnalysis(weapon: string, mode: string, saveCapture: boolean, strategy: string = 'accumulate') {
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
  const fovInput = (document.getElementById('static-fov-input') || document.getElementById('capture-fov-input')) as HTMLInputElement | null;
  const fovVal = fovInput && fovInput.value ? Number(fovInput.value) : 104.0;
  const hdrSelect = (document.getElementById('static-hdr-select') || document.getElementById('capture-hdr-select')) as HTMLSelectElement | null;
  const hdrVal = hdrSelect ? hdrSelect.value : (aHdrMode.value || 'hdr-standard');
  const rpmInput = document.getElementById('weapon-rpm') as HTMLInputElement | null;
  const multInput = document.getElementById('weapon-multiplier') as HTMLInputElement | null;

  const targetW = loadedSpecsList.find(s => s.name === weapon || (weapon === 'havoc' && s.name === 'havoc_tc') || (weapon === 'havoc_tc' && s.name === 'havoc'));
  const existingSamples = targetW?.sample_count || 1;

  batchScreenshots.forEach(b => b.status = 'analyzing');
  renderBatchScreenshotsList();

  if (statusBox) {
    statusBox.className = 'info';
    statusBox.innerText = `Analyzing batch of ${batchScreenshots.length} screenshot(s) for ${weapon.toUpperCase()} (${mode.toUpperCase()}) at ${distVal}m (${zoomVal}x zoom, ${fovVal}° FOV)...`;
  }
  if (analyzeBtn) {
    analyzeBtn.disabled = true;
    analyzeBtn.classList.remove('ready-to-analyze');
    analyzeBtn.innerHTML = `<span>⏳ Analyzing ${batchScreenshots.length} Screenshot(s)...</span>`;
  }

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
        strategy: strategy,
        existing_samples: existingSamples,
        images: payloadImages,
        shots: shotsToRequest,
        rpm: rpmInput && rpmInput.value ? Number(rpmInput.value) : undefined,
        multiplier: multInput && multInput.value ? Number(multInput.value) : 0.73,
        distance: distVal,
        zoom: zoomVal,
        fov: fovVal,
        hdr: hdrVal
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMsg = `Server error (${res.status})`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error) errMsg = errJson.error;
      } catch {
        if (errText) errMsg += `: ${errText.slice(0, 100)}`;
      }
      throw new Error(errMsg);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Static image analysis failed');
    }

    const spec = data.spec;
    const shotCount = spec.x ? spec.x.length : 0;
    const expectedMag = shotsToRequest || getExpectedMagSize();
    correctionExpectedShots = expectedMag;
    const totalSamples = spec.total_sample_count || spec.sample_count || (strategy === 'accumulate' ? (existingSamples + (data.trials_count || batchScreenshots.length)) : (data.trials_count || batchScreenshots.length));

    if (data.individual_trials && data.individual_trials.length > 0) {
      data.individual_trials.forEach((trial: any, idx: number) => {
        if (batchScreenshots[idx]) {
          batchScreenshots[idx].status = 'done';
          batchScreenshots[idx].shots = trial.shots;
          batchScreenshots[idx].expectedShots = expectedMag;
        }
      });
    } else if (batchScreenshots.length === 1) {
      batchScreenshots[0].status = 'done';
      batchScreenshots[0].shots = shotCount;
      batchScreenshots[0].expectedShots = expectedMag;
    }
    renderBatchScreenshotsList();

    const baselineSpec = JSON.parse(JSON.stringify(savedBaselineSpecs.get(weapon) || targetW || spec));
    if (targetW) {
      targetW.x = spec.x;
      targetW.y = spec.y;
      targetW.rpm = spec.rpm;
      targetW.time_points = spec.time_points;
      targetW.raw_1x_x = spec.raw_1x_x;
      targetW.raw_1x_y = spec.raw_1x_y;
      targetW.sample_count = totalSamples;
    }

    const discReport = computeDiscrepancyReport(baselineSpec, targetW || spec, zoomVal);

    const samplesInfo = document.getElementById('spec-samples-info');
    if (samplesInfo) {
      samplesInfo.innerText = `Samples: ${totalSamples}`;
    }

    const integrationModeText = (spec.merge_strategy === 'accumulate' && spec.existing_sample_count)
      ? `Proportional Accumulation (${spec.existing_sample_count} prior + ${spec.new_sample_count || (data.trials_count || batchScreenshots.length)} new = ${totalSamples} samples)`
      : `Fresh Overwrite (${data.trials_count || batchScreenshots.length} sample${(data.trials_count || batchScreenshots.length) === 1 ? '' : 's'})`;

    if (statusBox) {
      // Check for any trials with fewer shots than expected
      const mismatchTrials = batchScreenshots.filter(b =>
        b.status === 'done' && b.expectedShots && b.shots !== undefined && b.shots < b.expectedShots
      );
      const mismatchWarning = mismatchTrials.length > 0
        ? `<br/><span class="shot-mismatch-warning">⚠️ <strong>${mismatchTrials.length} image(s) have fewer shots than expected (${expectedMag}).</strong> Use <em>🔧 Correct Shots</em> on the toolbar to add missing bullet holes.</span>`
        : '';

      statusBox.className = mismatchTrials.length > 0 ? 'warning' : 'success';
      statusBox.innerHTML = `
        <strong>${mismatchTrials.length > 0 ? '⚠️' : '✅'} Batch Screenshot Analysis Complete!</strong><br/>
        • Target Weapon: <strong>${escapeHtml(weapon.toUpperCase())}</strong> (${escapeHtml(mode.toUpperCase())})<br/>
        • Screenshots Analyzed: ${data.trials_count || batchScreenshots.length}<br/>
        • Spec Shots (Median Aggregated): ${shotCount} shots<br/>
        • Expected Mag Size: ${expectedMag} shots<br/>
        • Spec Integration: <strong>${escapeHtml(integrationModeText)}</strong><br/>
        • Discrepancy Check: <span class="status-badge ${discReport.status}">${discReport.status === 'safe' ? '🟢 Consistent' : (discReport.status === 'warning' ? '🟡 Moderate Deviation' : '🔴 Major Discrepancy Alert')} (${discReport.meanDeviationPx.toFixed(1)}px avg delta${discReport.shotCountMatches ? '' : `, ${Math.abs(discReport.shotCountDelta)} shot mismatch`})</span><br/>
        • Storage: ${data.saved_to_disk ? 'Saved to captures library' : 'Analyzed in-memory (no duplicates)'}<br/>
        • <em>Use the stage toolbar ◀ Prev / Next ▶ (or [ and ]) to cycle through screenshots!</em>
        ${mismatchWarning}
        <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" id="save-batch-result-btn" class="primary-btn" style="padding: 8px 16px; font-weight: bold; background: #27ae60; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
            💾 Save Analyzed Pattern to specs.json
          </button>
          <button type="button" id="inspect-batch-compare-btn" class="tool-btn secondary-btn" style="padding: 8px 14px; background: #ff9800; color: #121212; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;">
            ⚖️ Inspect Discrepancies
          </button>
        </div>
      `;
      document.getElementById('save-batch-result-btn')?.addEventListener('click', () => {
        saveCurrentWeaponSpec();
      });
      document.getElementById('inspect-batch-compare-btn')?.addEventListener('click', () => {
        toggleCompareOverlay(true);
      });
    }

    clearCanvasForOverlay();
    activeSessionData = {
      spec: targetW || spec,
      baseline_spec: baselineSpec,
      candidate_spec: JSON.parse(JSON.stringify(spec)),
      standalone_batch_spec: spec.standalone_batch_spec,
      merge_strategy: spec.merge_strategy || strategy,
      sample_count: totalSamples,
      existing_sample_count: spec.existing_sample_count,
      new_sample_count: spec.new_sample_count || (data.trials_count || batchScreenshots.length),
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
    updateShotCorrectionStatus();
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
    renderBatchScreenshotsList();
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

      const loadedSamples = await Promise.all(session.samples.map(async (item: any, i: number) => {
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

        return {
          id: `sample_${Date.now()}_${i}`,
          blob,
          objectUrl,
          name: `Spray #${i + 1} (${item.video || 'clip'})`,
          durationSec: 0,
          timestamp: new Date(),
          screenshotData: screenshotDataUrl,
          screenshotUrl: item.screenshotUrl || screenshotDataUrl
        };
      }));

      capturedSamples.push(...loadedSamples);

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
          • Weapon: <strong>${escapeHtml(session.weapon.toUpperCase())}</strong> (${escapeHtml(session.mode.toUpperCase())})<br/>
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