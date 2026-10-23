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

// Recoil Editor entry point: wires together the editor modules in client/modules/editor/.
import Konva from 'konva';
import { cursor, stage } from './stage';
import { watch, initAttributes } from './storage';
import {
  NS,
  aDistance,
  aWeapon,
  aStock,
  aBarrel,
  aSens,
  aComment,
  currentBgImageObj
} from './modules/editor/state';
import {
  syncStageSize,
  handleStageResize,
  setupSidebarToggle,
  setupToolsSidebarToggle,
  setupRecordingMethodTabs
} from './modules/editor/layout';
import { setupAnalysisConfirmModal } from './modules/editor/analysis_confirm';
import { isSpacePressed, isPanModeActive, setupStageToolbarControls } from './modules/editor/toolbar';
import {
  acceptAuto,
  initImage,
  clear,
  setupControls,
  insertBulletHole,
  updateShapes,
  updateSpec,
  loadSpecs
} from './modules/editor/canvas';
import { initWeaponManagerUI } from './modules/editor/weapon_manager';
import { setupOfflineScreenshotAnalysis } from './modules/editor/screenshots';
import { setupPastSessionsManager } from './modules/editor/sessions';

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
  setupToolsSidebarToggle();
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
