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

// Stage sizing (fit and center on resize), the collapsible sidebars and the recording-method tabs.
import { stage } from '../../stage';
import {
  points,
  activeBgImageScale,
  activeBgImageOffset,
  currentBgImageObj,
  setActiveBgImageScale,
  setActiveBgImageOffset
} from './state';
import { updateMarkerScales, updateShapes } from './canvas';

export function syncStageSize(): { width: number; height: number; changed: boolean } {
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

export function fitAndCenterCanvas() {
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

    setActiveBgImageScale(scale);
    setActiveBgImageOffset({ x: offsetX, y: offsetY });

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
export function handleStageResize() {
  const { changed } = syncStageSize();
  if (!changed) return;
  if (stageResizeDebounce) {
    cancelAnimationFrame(stageResizeDebounce);
  }
  stageResizeDebounce = requestAnimationFrame(() => {
    fitAndCenterCanvas();
  });
}

export function setupSidebarToggle() {
  const toggleBtn = document.getElementById('toggle-sidebar-btn');
  const toolsEl = document.getElementById('tools');
  if (!toggleBtn || !toolsEl) return;

  const btn = toggleBtn;
  const panel = toolsEl;

  function setSidebarCollapsed(collapsed: boolean) {
    panel.classList.toggle('collapsed', collapsed);
    const label = btn.querySelector('.btn-label');
    if (label) {
      label.textContent = collapsed ? ' Show' : ' Sidebar';
    } else {
      btn.innerText = collapsed ? '▶ Sidebar' : '◀ Sidebar';
    }
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

export function setupToolsSidebarToggle() {
  const toggleBtn = document.getElementById('toggle-tools-panel-btn');
  const collapseBtn = document.getElementById('collapse-tools-sidebar-btn');
  const sidebarEl = document.getElementById('editor-tools-sidebar');
  if (!sidebarEl) return;

  const panel = sidebarEl;

  function setToolsCollapsed(collapsed: boolean) {
    panel.classList.toggle('collapsed', collapsed);
    if (toggleBtn) {
      toggleBtn.classList.toggle('active', !collapsed);
      const label = toggleBtn.querySelector('.btn-label');
      if (label) {
        label.textContent = collapsed ? ' Show Tools [E]' : ' Editing Tools [E]';
      }
      toggleBtn.title = collapsed ? 'Expand Editing Tools Panel [E]' : 'Collapse Editing Tools Panel [E]';
    }
    try {
      localStorage.setItem('editor_tools_collapsed', collapsed ? 'true' : 'false');
    } catch (e) {}
    setTimeout(() => {
      handleStageResize();
    }, 260);
  }

  toggleBtn?.addEventListener('click', () => {
    const isCollapsed = sidebarEl.classList.contains('collapsed');
    setToolsCollapsed(!isCollapsed);
  });

  collapseBtn?.addEventListener('click', () => {
    setToolsCollapsed(true);
  });

  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      return;
    }
    if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const isCollapsed = sidebarEl.classList.contains('collapsed');
      setToolsCollapsed(!isCollapsed);
    }
  });

  let savedCollapsed = false;
  try {
    savedCollapsed = localStorage.getItem('editor_tools_collapsed') === 'true';
  } catch (e) {}
  if (savedCollapsed) {
    setToolsCollapsed(true);
  }
}

export function setupRecordingMethodTabs() {
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
