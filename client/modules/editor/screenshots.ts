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

// Offline wall-screenshot analysis: the screenshot batch, the saved screenshot library and batch analysis.
import { BatchScreenshotItem } from '../types';
import {
  blobToBase64,
  dataUrlToBlob,
  escapeHtml,
  pollOrStreamJobResult,
  submitDiscoveryJob,
  DiscoveryUpload
} from '../utils';
import {
  aHdrMode,
  activeSessionData,
  currentBgImageObj,
  setActiveSessionData,
  setActiveOpticZoom,
  setCorrectionExpectedShots,
  setActiveBatchIndex,
  activeBatchIndex
} from './state';
import { promptAnalysisConfirmation } from './analysis_confirm';
import { getExpectedMagSize, updateShotCorrectionStatus, clearCanvasForOverlay } from './canvas';
import { computeDiscrepancyReport } from './calibration';
import {
  updateBatchNavUI,
  switchBatchScreenshot,
  populateStagePreviewDropdown,
  renderSelectedOverlay,
  toggleCompareOverlay,
  loadSampleScreenshotOnCanvas
} from './overlays';
import { loadedSpecsList, savedBaselineSpecs, saveCurrentWeaponSpec } from './weapon_manager';

export let batchScreenshots: BatchScreenshotItem[] = [];
let savedScreenshotsLibrary: any[] = [];

export function renderBatchScreenshotsList() {
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
      setActiveBatchIndex(idx);
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
        setActiveBatchIndex(Math.max(0, batchScreenshots.length - 1));
      }
      renderBatchScreenshotsList();
      updateBatchNavUI();
    });

    listEl.appendChild(card);
  });

  populateStagePreviewDropdown();
  updateBatchNavUI();
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function setupOfflineScreenshotAnalysis() {
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
    setActiveBatchIndex(0);
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
    const fields: Record<string, string> = {
      weapon,
      mode,
      save_capture: String(saveCapture),
      strategy,
      existing_samples: String(existingSamples),
      distance: String(distVal),
      zoom: String(zoomVal),
      fov: String(fovVal),
      hdr: hdrVal
    };
    if (shotsToRequest) fields.shots = String(shotsToRequest);
    if (rpmInput && rpmInput.value) fields.rpm = rpmInput.value;
    if (multInput && multInput.value) fields.multiplier = multInput.value;

    const uploads: DiscoveryUpload[] = batchScreenshots.map((b, idx) => ({
      field: 'images',
      blob: dataUrlToBlob(b.dataUrl),
      name: b.name || `spray_${String(idx + 1).padStart(2, '0')}_wall.jpg`
    }));

    const res = await submitDiscoveryJob('/api/discovery/process-static-image', 'static', fields, uploads);

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

    const initialData = await res.json();
    if (!initialData.success) {
      throw new Error(initialData.error || 'Static image analysis failed');
    }

    const data = await pollOrStreamJobResult(initialData, statusBox, 'Analyzing screenshot decals and calculating median pattern...');

    const spec = data.spec;
    const shotCount = spec.x ? spec.x.length : 0;
    const expectedMag = shotsToRequest || getExpectedMagSize();
    setCorrectionExpectedShots(expectedMag);
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
    setActiveSessionData({
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
    });
    setActiveOpticZoom(zoomVal);

    populateStagePreviewDropdown();
    setActiveBatchIndex(0);
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
