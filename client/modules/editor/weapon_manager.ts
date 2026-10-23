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

// Weapon manager panel: loading and editing weapon specs, the save checkpoint dialog, and saving to the server.
import { getWeaponModeConfig } from '../../game';
import { stage } from '../../stage';
import specs from '../../specs.json';
import { DiscrepancyReport } from '../types';
import { activeSessionData, activeBgImageScale, activeBgImageOffset, currentBgImageObj } from './state';
import { syncStageSize } from './layout';
import { activeScaleFactor } from './toolbar';
import {
  updateMarkerScales,
  updateShapes,
  addPoint,
  syncSpecFromPoints,
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
import { populateStagePreviewDropdown, renderSelectedOverlay, toggleCompareOverlay } from './overlays';
import { initGameCaptureStudio } from './capture_studio';

export let loadedSpecsList: any[] = JSON.parse(JSON.stringify(specs));
export const savedBaselineSpecs = new Map<string, any>();
loadedSpecsList.forEach(s => savedBaselineSpecs.set(s.name, JSON.parse(JSON.stringify(s))));

export function initWeaponManagerUI() {
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
  document.getElementById('add-weapon-btn')?.addEventListener('click', () => {
    const rawName = prompt('Enter a unique identifier for the new weapon (e.g. "car_smg", "prowler_burst"):');
    if (!rawName) return;
    const cleanName = rawName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (!cleanName) {
      alert('Invalid weapon name.');
      return;
    }
    const existing = loadedSpecsList.find(s => s.name === cleanName);
    if (existing) {
      alert(`Weapon "${cleanName}" already exists. Selecting it now.`);
      if (sel) {
        sel.value = cleanName;
        loadWeaponIntoManager(cleanName);
      }
      return;
    }
    const newSpec = {
      name: cleanName,
      rpm: 600,
      multiplier: 0.73,
      sample_count: 1,
      mags: [
        { size: 20, audio: `${cleanName}_20` },
        { size: 24, audio: `${cleanName}_24` },
        { size: 27, audio: `${cleanName}_27` },
        { size: 30, audio: `${cleanName}_30` }
      ],
      x: [0],
      y: [0],
      time_points: [0]
    };
    loadedSpecsList.push(newSpec);
    savedBaselineSpecs.set(cleanName, JSON.parse(JSON.stringify(newSpec)));
    populateDropdown();
    if (sel) sel.value = cleanName;
    loadWeaponIntoManager(cleanName, true);
    const statusMsg = document.getElementById('save-status-msg');
    if (statusMsg) {
      statusMsg.innerText = `Created new weapon "${cleanName.toUpperCase()}". Add points or adjust parameters, then click "Save to specs.json".`;
      statusMsg.className = 'info';
    }
  });
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

export function loadWeaponIntoManager(name: string, preserveStatusMsg = false) {
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

  const canvasWeaponTag = document.getElementById('canvas-status-weapon');
  if (canvasWeaponTag) {
    const modeSel = document.getElementById('weapon-mode-select') as HTMLSelectElement | null;
    const mode = modeSel ? ` (${modeSel.value.toUpperCase()})` : '';
    canvasWeaponTag.innerText = `🎯 ${w.name.toUpperCase()}${mode}`;
  }
  const canvasShotsTag = document.getElementById('canvas-status-shots');
  if (canvasShotsTag) canvasShotsTag.innerText = `${shotCount} shots`;
  const canvasScaleTag = document.getElementById('canvas-status-scale');
  if (canvasScaleTag) canvasScaleTag.innerText = `${Math.round(activeScaleFactor * 100)}% Scale`;

  if (statusMsg && !preserveStatusMsg) {
    statusMsg.innerText = '';
    statusMsg.className = '';
  }

  displayWeaponOnCanvas(w);
}

export function displayWeaponOnCanvas(w: any) {
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

export function saveCurrentWeaponSpec(forceSave?: boolean | Event) {
  const isForced = forceSave === true;
  const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
  const statusMsg = document.getElementById('save-status-msg');
  if (!sel) return;

  const name = sel.value;
  const w = loadedSpecsList.find(s => s.name === name);
  if (!w) return;

  syncSpecFromPoints();

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
      loadWeaponIntoManager(name, true);
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
