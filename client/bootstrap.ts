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

import { stage } from './stage';
import { pokeAttrs } from './storage';

// Shared start-up for the route entries (trainer_main.ts, editor_main.ts).
export function startApp(init: () => void) {
  if (window.location.hostname.includes('.online')) {
    alert('Apex Legends Recoils is moving to a new domain and .ONLINE will not be available from 10 of April.\n'+
    'Please update your bookmark to apexlegendsrecoils.NET.\nYou will now be redirected.');
    window.location.href = 'https://apexlegendsrecoils.net' + window.location.pathname;
  }

  init();
  pokeAttrs();
  stage.batchDraw();
}
