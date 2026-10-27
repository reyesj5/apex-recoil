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

import type { AnalysisSettings } from '../shared/requests.ts';

// The discovery CLI's arguments for an analysis's settings (the job runner adds --dir)
export function buildCliArgs(weaponTag: string, p: AnalysisSettings) {
  const cliArgs = [
    '-m',
    'recoil_discovery.cli',
    'session',
    '--weapon',
    weaponTag,
    '--multiplier',
    String(p.multiplier),
  ];
  if (p.rpm) cliArgs.push('--rpm', String(p.rpm));
  if (p.shots) cliArgs.push('--shots', String(p.shots));
  if (p.zoom !== 1) cliArgs.push('--zoom', String(p.zoom));
  cliArgs.push('--fov', String(p.fov));
  cliArgs.push('--distance', String(p.distance));
  cliArgs.push('--hdr', p.hdr);
  cliArgs.push('--strategy', p.strategy);
  if (p.existing_samples) cliArgs.push('--existing-samples', String(p.existing_samples));
  return cliArgs;
}

/** The settings a saved session records with its analysis */
export function sessionMetadata(p: AnalysisSettings) {
  return {
    zoom: p.zoom,
    fov: p.fov,
    distance: p.distance,
    multiplier: p.multiplier,
    hdr: p.hdr,
    strategy: p.strategy,
  };
}
