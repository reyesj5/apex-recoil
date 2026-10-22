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

// Stage toolbar and keyboard shortcuts: pattern and background visibility, scale adjustment, pan,
// move-all and shot-correction modes, preview navigation and the discrepancy HUD buttons.
import Konva from 'konva';
import { layer, stage } from '../../stage';
import {
  activeSessionData,
  currentBgImageObj,
  setActiveSessionData,
  setActiveOpticZoom,
  setCurrentBgImageObj,
  setCorrectionExpectedShots,
  activeBatchIndex
} from './state';
import { fitAndCenterCanvas } from './layout';
import {
  updateMarkerScales,
  performUndo,
  performRedo,
  getExpectedMagSize,
  updateShotCorrectionStatus
} from './canvas';
import { getActiveOpticZoom } from './calibration';
import {
  switchBatchScreenshot,
  renderSelectedOverlay,
  toggleCompareOverlay,
  setCompareOverlayActive
} from './overlays';
import { loadedSpecsList, displayWeaponOnCanvas, saveCurrentWeaponSpec } from './weapon_manager';

export let activeScaleFactor = 1.0;
export let isMoveAllActive = false;

export let isSpacePressed = false;
export let isPanModeActive = false;
let isPanning = false;
let panStart = { x: 0, y: 0 };

// Shot correction mode: allows users to manually add/remove bullet holes
// to fix cases where the algorithm missed shots or made mistakes
let isCorrectionModeActive = false;

// Recoil pattern overlay visibility and opacity controls
export let isPatternVisible: boolean = true;
export let patternOpacity: number = 1.0;

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

export function setupStageToolbarControls() {
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
      const sub = moveAllBtn.querySelector('.mode-subtext');
      if (sub) {
        sub.textContent = isMoveAllActive ? 'Active (ON)' : 'Move all points';
      }
    }
  });

  panModeBtn?.addEventListener('click', () => {
    isPanModeActive = !isPanModeActive;
    if (panModeBtn) {
      panModeBtn.classList.toggle('active', isPanModeActive);
      const sub = panModeBtn.querySelector('.mode-subtext');
      if (sub) {
        sub.textContent = isPanModeActive ? 'Active (ON)' : 'Drag or Space';
      }
    }
    const stageContainer = document.getElementById('stage');
    if (stageContainer) stageContainer.style.cursor = isPanModeActive ? 'grab' : 'crosshair';
  });

  // Correction mode: toggle button to manually add/remove bullet holes
  const correctionBtn = document.getElementById('correction-mode-btn') as HTMLButtonElement | null;
  correctionBtn?.addEventListener('click', () => {
    isCorrectionModeActive = !isCorrectionModeActive;
    if (correctionBtn) {
      correctionBtn.classList.toggle('active', isCorrectionModeActive);
      const sub = correctionBtn.querySelector('.mode-subtext');
      if (sub) {
        sub.textContent = isCorrectionModeActive ? 'Active (ON)' : 'Add / remove holes';
      }
    }
    const stageEl = document.getElementById('stage');
    if (stageEl && !isPanModeActive && !isSpacePressed) {
      stageEl.style.cursor = isCorrectionModeActive ? 'copy' : 'crosshair';
    }
    // Compute expected from the highest mag tier when entering correction mode
    if (isCorrectionModeActive) {
      setCorrectionExpectedShots(getExpectedMagSize());
    }
    updateShotCorrectionStatus();
  });

  recenterBtn?.addEventListener('click', () => {
    fitAndCenterCanvas();
  });

  clearBgBtn?.addEventListener('click', () => {
    if (currentBgImageObj) {
      currentBgImageObj.remove();
      setCurrentBgImageObj(null);
    }
    if (activeSessionData) {
      setActiveSessionData(null);
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
    const canvasScaleTag = document.getElementById('canvas-status-scale');
    if (canvasScaleTag) canvasScaleTag.innerText = `${Math.round(factor * 100)}% Scale`;
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
    setActiveOpticZoom(getActiveOpticZoom());
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
  let targetPanX = 0;
  let targetPanY = 0;
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
      targetPanX = e.clientX - panStart.x;
      targetPanY = e.clientY - panStart.y;
      if (panRaf === null) {
        panRaf = requestAnimationFrame(() => {
          panRaf = null;
          if (isPanning) {
            stage.position({ x: targetPanX, y: targetPanY });
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
