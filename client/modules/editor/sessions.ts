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

// Past capture sessions and clip import: loading a saved session or clip files into the samples list.
import { blobToBase64, escapeHtml } from '../utils';
import { loadSampleScreenshotOnCanvas } from './overlays';
import { loadWeaponIntoManager } from './weapon_manager';
import { capturedSamples, renderSamplesList } from './capture_studio';
import { batchScreenshots, renderBatchScreenshotsList, readFileAsDataUrl } from './screenshots';

let cachedSessionsList: any[] = [];

export function setupPastSessionsManager() {
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
