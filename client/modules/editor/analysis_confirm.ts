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

// Confirmation dialog shown before captured clips or screenshots are sent for analysis.
import { getWeaponModeConfig } from '../../game';
import { loadedSpecsList, loadWeaponIntoManager } from './weapon_manager';

interface AnalysisConfirmOptions {
  actionTitle: string;
  defaultWeapon: string;
  defaultMode: string;
  defaultSave: boolean;
  onConfirm: (weapon: string, mode: string, saveCapture: boolean, strategy: string) => void;
}

let activeAnalysisConfirmCallback: ((weapon: string, mode: string, saveCapture: boolean, strategy: string) => void) | null = null;

export function setupAnalysisConfirmModal() {
  const modal = document.getElementById('analysis-confirm-modal');
  const closeBtn = document.getElementById('close-confirm-modal-btn');
  const cancelBtn = document.getElementById('cancel-analysis-btn');
  const proceedBtn = document.getElementById('proceed-analysis-btn');
  const weaponSel = document.getElementById('modal-weapon-select') as HTMLSelectElement | null;
  const modeSel = document.getElementById('modal-mode-select') as HTMLSelectElement | null;

  function closeModal() {
    modal?.classList.add('hidden');
    activeAnalysisConfirmCallback = null;
  }

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  function updateStrategyDesc() {
    if (!weaponSel) return;
    const wName = weaponSel.value;
    const w = loadedSpecsList.find(s => s.name === wName || (wName === 'havoc' && s.name === 'havoc_tc') || (wName === 'havoc_tc' && s.name === 'havoc'));
    const curSamples = w?.sample_count || 1;
    const desc = document.getElementById('strategy-accumulate-desc');
    if (desc) {
      desc.innerText = `Blends new captures proportionally with the existing ${wName.toUpperCase()} spec (currently built from ${curSamples} sample${curSamples === 1 ? '' : 's'}). Reduces noise and increases accuracy.`;
    }
  }

  weaponSel?.addEventListener('change', () => {
    if (!weaponSel || !modeSel) return;
    const wName = weaponSel.value;
    const cfg = getWeaponModeConfig(wName);
    modeSel.innerHTML = '';
    cfg.modes.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.text = m.toUpperCase();
      modeSel.appendChild(opt);
    });
    modeSel.value = cfg.defaultMode;
    updateStrategyDesc();
  });

  proceedBtn?.addEventListener('click', () => {
    if (!activeAnalysisConfirmCallback || !weaponSel || !modeSel) return;
    const chosenWeapon = weaponSel.value;
    const chosenMode = modeSel.value;
    const saveCheck = document.getElementById('modal-save-capture') as HTMLInputElement | null;
    const shouldSave = saveCheck ? saveCheck.checked : true;

    const stratRadios = document.getElementsByName('modal-analysis-strategy') as NodeListOf<HTMLInputElement>;
    let chosenStrategy = 'accumulate';
    for (let i = 0; i < stratRadios.length; i++) {
      if (stratRadios[i].checked) {
        chosenStrategy = stratRadios[i].value;
        break;
      }
    }

    // Synchronize the main weapon manager UI so it matches the confirmed weapon and mode
    const mainWeaponSel = document.getElementById('weapon-select') as HTMLSelectElement | null;
    if (mainWeaponSel && mainWeaponSel.value !== chosenWeapon) {
      mainWeaponSel.value = chosenWeapon;
      loadWeaponIntoManager(chosenWeapon);
    }
    const mainModeSel = document.getElementById('weapon-mode-select') as HTMLSelectElement | null;
    if (mainModeSel) {
      mainModeSel.value = chosenMode;
    }

    const cb = activeAnalysisConfirmCallback;
    closeModal();
    cb(chosenWeapon, chosenMode, shouldSave, chosenStrategy);
  });
}

export function promptAnalysisConfirmation(opts: AnalysisConfirmOptions) {
  const modal = document.getElementById('analysis-confirm-modal');
  const weaponSel = document.getElementById('modal-weapon-select') as HTMLSelectElement | null;
  const modeSel = document.getElementById('modal-mode-select') as HTMLSelectElement | null;
  const saveCheck = document.getElementById('modal-save-capture') as HTMLInputElement | null;
  if (!modal || !weaponSel || !modeSel) return;

  weaponSel.innerHTML = '';
  loadedSpecsList.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.name;
    opt.text = s.name.toUpperCase();
    if (s.name === opts.defaultWeapon) opt.selected = true;
    weaponSel.appendChild(opt);
  });

  const cfg = getWeaponModeConfig(opts.defaultWeapon);
  modeSel.innerHTML = '';
  cfg.modes.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.text = m.toUpperCase();
    if (m === opts.defaultMode) opt.selected = true;
    modeSel.appendChild(opt);
  });

  if (saveCheck) {
    saveCheck.checked = opts.defaultSave;
  }

  // Reset strategy radio to accumulate
  const stratRadios = document.getElementsByName('modal-analysis-strategy') as NodeListOf<HTMLInputElement>;
  stratRadios.forEach(r => {
    r.checked = r.value === 'accumulate';
  });

  const w = loadedSpecsList.find(s => s.name === opts.defaultWeapon || (opts.defaultWeapon === 'havoc' && s.name === 'havoc_tc') || (opts.defaultWeapon === 'havoc_tc' && s.name === 'havoc'));
  const curSamples = w?.sample_count || 1;
  const desc = document.getElementById('strategy-accumulate-desc');
  if (desc) {
    desc.innerText = `Blends new captures proportionally with the existing ${opts.defaultWeapon.toUpperCase()} spec (currently built from ${curSamples} sample${curSamples === 1 ? '' : 's'}). Reduces noise and increases accuracy.`;
  }

  activeAnalysisConfirmCallback = opts.onConfirm;
  modal.classList.remove('hidden');
}
