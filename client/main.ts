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

import Konva from 'konva';
import { Point } from './point';
import { initGame } from './game';
import { setupEditor } from './editor';
import { pokeAttrs } from './storage';

const stageContainer = document.getElementById('stage');
export const stage = new Konva.Stage({
  container: 'stage',
  width: stageContainer?.clientWidth || window.innerWidth,
  height: stageContainer?.clientHeight || window.innerHeight,
});

document.getElementById('stage')?.addEventListener('contextmenu', e => {
  e.preventDefault();
});

export const layer = new Konva.Layer();
stage.add(layer);

export function cursor(): Point {
  let pos = stage.getPointerPosition();
  if (pos == null) pos = { x: 0, y: 0 };
  const transform = stage.getAbsoluteTransform().copy().invert();
  return new Point(transform.point(pos));
}

if (window.location.hostname.includes('.online')) {
  alert('Apex Legends Recoils is moving to a new domain and .ONLINE will not be available from 10 of April.\n'+
  'Please update your bookmark to apexlegendsrecoils.NET.\nYou will now be redirected.');
  window.location.href = 'https://apexlegendsrecoils.net' + window.location.pathname;
}

if (window.location.pathname.startsWith('/editor')) {
  setupEditor();
} else {
  initGame();
}
pokeAttrs();
stage.batchDraw();