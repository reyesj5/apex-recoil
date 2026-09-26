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
import { MagInfo, Weapon } from "./game";
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

export function setupEditor() {
  initAttributes(NS);
  setupControls();
  initImage();
  loadSpecs();
  initWeaponManagerUI();
  aComment.watch((v: string) => {
    const comment = document.getElementById('comment');
    if (comment != null) (comment as HTMLTextAreaElement).value = v;
  });
  stage.on('mousedown', function (e: Konva.KonvaEventObject<MouseEvent>) {
    addPoint(cursor().plain(), `${idxCounter}`);
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
    if (s === '') return;
    Konva.Image.fromURL(s, function (x: Konva.Image) {
      if (img != null) {
        img.remove();
      }
      img = x;
      layer.add(img);
      const s = window.innerHeight / img.height();
      img.scaleX(s);
      img.scaleY(s);
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
  points.clear();
  edges = [];
  anchors.clear();
  layer.destroyChildren();
  edgeStartName = '';
  aImageData.poke();
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
}

function updateShapes() {
  points.forEach((c, i) => {
    c.stroke(anchors.has(c.name()) ? 'red' : 'white');
    c.strokeWidth(c.name() == edgeStartName ? 3 : 1);
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
  c.on('dragend', function () {
    edgeStartName = '';
    updateShapes();
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
      return;
    }
  });
  points.set(name, c);
  updateShapes();
  layer.add(c);
  stage.batchDraw();
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
  clear();
  if (w && w.x && w.y) {
    const minLen = Math.min(w.x.length, w.y.length);
    const startX = window.innerWidth / 2;
    const startY = window.innerHeight * 0.75;
    for (let i = 0; i < minLen; i++) {
      addPoint({ x: startX + w.x[i] * 1.5, y: startY + w.y[i] * 1.5 }, `${i}`);
      if (i > 0) {
        addEdge(`${i - 1}`, `${i}`);
      }
    }
    updateShapes();
    stage.batchDraw();
  }
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
}

let captureStream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let isRecordingSpray = false;
let sprayStartTime = 0;
let lastGunfireTime = 0;
let audioMonitorTimer: any = null;
const silenceThresholdMs = 450;
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

function initGameCaptureStudio() {
  const startBtn = document.getElementById('start-capture-btn');
  const stopBtn = document.getElementById('stop-capture-btn');
  const manualBtn = document.getElementById('manual-record-btn');
  const clearBtn = document.getElementById('clear-samples-btn');
  const processBtn = document.getElementById('process-session-btn');
  const thresholdSlider = document.getElementById('trigger-threshold-slider') as HTMLInputElement | null;
  const thresholdLine = document.getElementById('trigger-threshold-line') as HTMLDivElement | null;

  if (thresholdSlider && thresholdLine) {
    thresholdSlider.addEventListener('input', () => {
      thresholdLine.style.left = `${thresholdSlider.value}%`;
    });
    thresholdLine.style.left = `${thresholdSlider.value}%`;
  }

  startBtn?.addEventListener('click', startGameCapture);
  stopBtn?.addEventListener('click', stopGameCapture);
  manualBtn?.addEventListener('click', toggleManualRecord);
  clearBtn?.addEventListener('click', clearAllSamples);
  processBtn?.addEventListener('click', processSessionSprays);
}

async function startGameCapture() {
  const previewVideo = document.getElementById('capture-preview-video') as HTMLVideoElement | null;
  const monitorPanel = document.getElementById('monitor-panel');
  const startBtn = document.getElementById('start-capture-btn');
  const stopBtn = document.getElementById('stop-capture-btn');
  const manualBtn = document.getElementById('manual-record-btn');
  const capBadge = document.getElementById('capture-status-badge');
  const trigBadge = document.getElementById('trigger-status-badge');

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
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioCtx = new AudioContextClass();
        const source = audioCtx.createMediaStreamSource(captureStream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        if (trigBadge) {
          trigBadge.innerText = '🟡 Trigger Listening (Audio)';
          trigBadge.className = 'badge badge-active';
        }

        startAudioMonitorLoop();
      } catch (e) {
        console.warn('Web Audio init error:', e);
        if (trigBadge) {
          trigBadge.innerText = '🟡 Audio Sensor Warning (Use Manual)';
          trigBadge.className = 'badge badge-off';
        }
      }
    } else {
      if (trigBadge) {
        trigBadge.innerText = '⚠️ No Audio Track (Use Manual Spray)';
        trigBadge.className = 'badge badge-off';
      }
    }
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

    const thresholdPct = thresholdSlider ? Number(thresholdSlider.value) : 25;
    const isTriggered = pct >= thresholdPct;

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
      if (!isRecordingSpray) {
        startRecordingSpray();
      }
    } else if (isRecordingSpray) {
      if (now - lastGunfireTime > silenceThresholdMs) {
        stopRecordingSpray();
      } else if (now - sprayStartTime > 6000) {
        stopRecordingSpray();
      }
    }
  }, 25);
}

function toggleManualRecord() {
  const manualBtn = document.getElementById('manual-record-btn');
  if (!isRecordingSpray) {
    startRecordingSpray();
    if (manualBtn) manualBtn.innerText = '⏹ Finish Spray';
  } else {
    stopRecordingSpray();
    if (manualBtn) manualBtn.innerText = '⏺ Manual Spray';
  }
}

function startRecordingSpray() {
  if (isRecordingSpray || !captureStream) return;
  isRecordingSpray = true;
  sprayStartTime = performance.now();
  lastGunfireTime = sprayStartTime;
  recordedChunks = [];

  document.getElementById('rec-indicator')?.classList.remove('hidden');
  const trigBadge = document.getElementById('trigger-status-badge');
  if (trigBadge) {
    trigBadge.innerText = '● RECORDING SPRAY';
    trigBadge.className = 'badge badge-rec';
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  try {
    mediaRecorder = new MediaRecorder(captureStream, { mimeType });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };
    mediaRecorder.onstop = () => {
      const durationSec = (performance.now() - sprayStartTime) / 1000;
      if (durationSec >= 0.3) {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        addCapturedSample(blob, durationSec);
      }
    };
    mediaRecorder.start(50);
  } catch (e) {
    console.error('MediaRecorder start error:', e);
  }
}

function stopRecordingSpray() {
  if (!isRecordingSpray) return;
  isRecordingSpray = false;

  document.getElementById('rec-indicator')?.classList.add('hidden');
  const trigBadge = document.getElementById('trigger-status-badge');
  if (trigBadge) {
    trigBadge.innerText = '🟡 Trigger Listening';
    trigBadge.className = 'badge badge-active';
  }

  const manualBtn = document.getElementById('manual-record-btn');
  if (manualBtn) manualBtn.innerText = '⏺ Manual Spray';

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

function addCapturedSample(blob: Blob, durationSec: number) {
  const objectUrl = URL.createObjectURL(blob);
  const sampleObj: RecordedSample = {
    id: 'sample_' + Date.now(),
    name: `Spray #${capturedSamples.length + 1}`,
    blob,
    objectUrl,
    durationSec: Math.round(durationSec * 10) / 10,
    timestamp: new Date()
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

    const rerecordBtn = document.createElement('button');
    rerecordBtn.className = 'small-btn';
    rerecordBtn.type = 'button';
    rerecordBtn.innerText = isTarget ? 'Cancel Re-record' : '🔄 Re-record';
    rerecordBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      markReRecordSample(idx);
    });

    const discardBtn = document.createElement('button');
    discardBtn.className = 'small-btn danger-btn';
    discardBtn.type = 'button';
    discardBtn.innerText = '🗑 Discard';
    discardBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      discardSample(idx);
    });

    actions.appendChild(rerecordBtn);
    actions.appendChild(discardBtn);
    top.appendChild(titleWrap);
    top.appendChild(actions);

    const video = document.createElement('video');
    video.src = s.objectUrl;
    video.controls = true;
    video.preload = 'metadata';

    card.appendChild(top);
    card.appendChild(video);
    listContainer.appendChild(card);
  });
}

async function processSessionSprays() {
  if (capturedSamples.length === 0) return;
  const sel = document.getElementById('weapon-select') as HTMLSelectElement | null;
  const weapon = sel?.value || 'r301';
  const rpmInput = document.getElementById('weapon-rpm') as HTMLInputElement | null;
  const multInput = document.getElementById('weapon-multiplier') as HTMLInputElement | null;
  const statusBox = document.getElementById('session-process-status');
  const procBtn = document.getElementById('process-session-btn') as HTMLButtonElement | null;

  if (procBtn) procBtn.disabled = true;
  if (statusBox) {
    statusBox.className = 'info';
    statusBox.innerText = `Preparing ${capturedSamples.length} spray video(s) for analysis...`;
  }

  try {
    const samplesPayload = [];
    for (let i = 0; i < capturedSamples.length; i++) {
      const b = capturedSamples[i].blob;
      const base64 = await blobToBase64(b);
      samplesPayload.push({
        name: `spray_${i + 1}.webm`,
        data: base64
      });
    }

    if (statusBox) {
      statusBox.innerText = `Tracking bullet decals and calculating median pattern...`;
    }

    const res = await fetch('/api/discovery/process-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weapon,
        rpm: rpmInput && rpmInput.value ? Number(rpmInput.value) : undefined,
        multiplier: multInput && multInput.value ? Number(multInput.value) : 0.73,
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
        • Sprays Analyzed: ${data.trials_count}<br/>
        • Detected Shots: ${shotCount} shots<br/>
        • Measured RPM: ${measuredRpm} RPM<br/>
        • Convergence Score: ${convScore} / 100<br/>
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
      displayWeaponOnCanvas(targetW);
    } else {
      displayWeaponOnCanvas(spec);
    }
  } catch (err: any) {
    if (statusBox) {
      statusBox.className = 'error';
      statusBox.innerText = `Error: ${err.message}`;
    }
  } finally {
    if (procBtn) procBtn.disabled = false;
  }
}