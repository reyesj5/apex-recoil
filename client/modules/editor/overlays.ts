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

// Analysis results on the stage: wall-screenshot backgrounds, per-trial previews, the batch navigator,
// the spec-vs-candidate compare overlay and the discrepancy HUD.
import Konva from 'konva';
import { layer, stage } from '../../stage';
import { toneMapImageIfNeeded } from '../utils';
import {
  aHdrMode,
  activeSessionData,
  currentBgImageObj,
  correctionExpectedShots,
  setActiveBgImageScale,
  setActiveBgImageOffset,
  setActiveOpticZoom,
  setCurrentBgImageObj,
  setActiveBatchIndex,
  activeBatchIndex
} from './state';
import { syncStageSize } from './layout';
import { applyPatternVisibilityAndOpacity } from './toolbar';
import {
  updateMarkerScales,
  updateShapes,
  addPoint,
  getExpectedMagSize,
  updateShotCorrectionStatus,
  clearCanvasForOverlay,
  addEdge
} from './canvas';
import {
  getActiveOpticZoom,
  getMouseToPixelScale,
  getActiveCaptureDecals,
  computeCaptureToSpecScale,
  computeDiscrepancyReport
} from './calibration';
import { loadedSpecsList, savedBaselineSpecs, displayWeaponOnCanvas } from './weapon_manager';
import { batchScreenshots } from './screenshots';

export let currentLoadedRawBgUrl = '';

export function updateBatchNavUI() {
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

export function switchBatchScreenshot(idx: number) {
  const count = activeSessionData?.individual_trials?.length || batchScreenshots.length;
  if (count === 0) return;
  if (idx < 0) idx = count - 1;
  if (idx >= count) idx = 0;

  setActiveBatchIndex(idx);
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

export function populateStagePreviewDropdown() {
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

export function switchToTrialPreview(idx: number) {
  const sel = document.getElementById('stage-preview-select') as HTMLSelectElement | null;
  setActiveBatchIndex(idx);
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

export function renderSelectedOverlay(key: string) {
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
  setActiveOpticZoom(zoom);

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
    setActiveBatchIndex(trialIdx);
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

      setActiveBgImageScale(scale);
      setActiveBgImageOffset({ x: offsetX, y: offsetY });

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
        setCurrentBgImageObj(konvaImg);
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
    setActiveBgImageScale(1.5);
    setActiveBgImageOffset({ x: startX, y: startY });

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
  setActiveOpticZoom(zoom);

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

      setActiveBgImageScale(scale);
      setActiveBgImageOffset({ x: offsetX, y: offsetY });

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
        setCurrentBgImageObj(konvaImg);
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

export function toggleCompareOverlay(forceActive?: boolean) {
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

export function setCompareOverlayActive(active: boolean) {
  toggleCompareOverlay(active);
}

export async function loadSampleScreenshotOnCanvas(imgDataUrl: string, isRaw: boolean = true) {
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
    setCurrentBgImageObj(konvaImg);
    layer.add(konvaImg);

    const imgW = konvaImg.width() || 1920;
    const imgH = konvaImg.height() || 1080;

    const padding = 20;
    const scale = Math.min((stageW - padding * 2) / imgW, (stageH - padding * 2) / imgH, 1.0);
    const offsetX = Math.max(0, (stageW - imgW * scale) / 2);
    const offsetY = Math.max(0, (stageH - imgH * scale) / 2);

    setActiveBgImageScale(scale);
    setActiveBgImageOffset({ x: offsetX, y: offsetY });

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
