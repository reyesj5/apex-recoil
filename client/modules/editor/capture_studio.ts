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

// Auto-Capture Studio: screen and audio capture, gunfire-triggered spray recording, the recorded
// samples list with its video player, and sending a session for analysis.
import { RecordedSample } from '../types';
import {
  dataUrlToBlob,
  escapeHtml,
  applyHdrToneMappingToCanvas,
  pollOrStreamJobResult,
  submitDiscoveryJob,
  DiscoveryUpload
} from '../utils';
import { aHdrMode, activeSessionData, setActiveSessionData, setActiveOpticZoom } from './state';
import { promptAnalysisConfirmation } from './analysis_confirm';
import { computeDiscrepancyReport } from './calibration';
import {
  currentLoadedRawBgUrl,
  populateStagePreviewDropdown,
  switchToTrialPreview,
  renderSelectedOverlay,
  toggleCompareOverlay,
  loadSampleScreenshotOnCanvas
} from './overlays';
import { loadedSpecsList, savedBaselineSpecs, saveCurrentWeaponSpec } from './weapon_manager';

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
export const capturedSamples: RecordedSample[] = [];

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

export function initGameCaptureStudio() {
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

export function renderSamplesList() {
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

    const uploads: DiscoveryUpload[] = [];
    for (let i = 0; i < capturedSamples.length; i++) {
      const sample = capturedSamples[i];
      const videoFilename = `spray_${String(i + 1).padStart(2, '0')}.webm`;
      uploads.push({ field: 'videos', blob: sample.blob, name: videoFilename });
      if (sample.screenshotData) {
        const wallBlob = dataUrlToBlob(sample.screenshotData);
        const wallFilename = `spray_${String(i + 1).padStart(2, '0')}_wall.jpg`;
        uploads.push({ field: 'screenshots', blob: wallBlob, name: wallFilename });
      }
    }

    if (statusBox) {
      statusBox.innerText = `Tracking bullet decals and calculating median pattern...`;
    }

    const res = await submitDiscoveryJob('/api/discovery/process-session', 'session', fields, uploads);

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
      throw new Error(initialData.error || 'Session processing failed');
    }

    const data = await pollOrStreamJobResult(initialData, statusBox, 'Tracking bullet decals and calculating median pattern...');

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

    setActiveSessionData({
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
    });
    setActiveOpticZoom(zoomVal);

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
