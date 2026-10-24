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

// The live capture's sequence, as a reducer: the gunfire sensor starts a spray's recording, a silence
// starts the re-aim buffer (the player reloads and aims back at the wall), and the buffer's end, the
// Snap button or Space captures the wall and stops the recording. A spray that runs 20 s is cut off.
// The component feeds it the sensor's level every 25 ms and the time every 100 ms, and carries out the
// commands (start the MediaRecorder, or capture the wall and stop it). Moved from
// client/modules/editor/capture_studio.ts.

export const SENSOR_INTERVAL_MS = 25;
export const COUNTDOWN_INTERVAL_MS = 100;
/** Silence after the last shot before the re-aim buffer starts */
export const SILENCE_LEAD_MS = 700;
/** A spray is cut off after this long */
export const MAX_SPRAY_MS = 20000;
/** Recordings shorter than this are dropped as false triggers */
export const MIN_SPRAY_SECONDS = 0.8;
/** After a preview stops playing, the sensor stays muted this long */
export const PREVIEW_COOLDOWN_MS = 1500;

export interface CaptureState {
  /** The game window is shared */
  connected: boolean;
  phase: 'idle' | 'recording' | 'reaim';
  sprayStart: number;
  lastGunfire: number;
  reaimStart: number;
  /** A recorded sample is playing, so its gunfire must not trigger a recording */
  previewPlaying: boolean;
}

export const initialCapture: CaptureState = {
  connected: false,
  phase: 'idle',
  sprayStart: 0,
  lastGunfire: 0,
  reaimStart: 0,
  previewPlaying: false,
};

export type CaptureEvent =
  | { type: 'connect' }
  | { type: 'disconnect' }
  /** The sensor's level (0 to 100) against the trigger threshold */
  | { type: 'level'; now: number; level: number; threshold: number }
  /** The re-aim countdown's clock, with the buffer's length */
  | { type: 'tick'; now: number; bufferMs: number }
  /** The Manual spray button: starts a spray, or finishes the one recording */
  | { type: 'manual'; now: number }
  /** Space or Snap wall: finishes the spray now */
  | { type: 'snap' }
  | { type: 'preview'; playing: boolean };

/** What the component does: start the recorder, or capture the wall and stop the recorder */
export type CaptureCommand = 'start' | 'finish';

export interface CaptureStep {
  state: CaptureState;
  command?: CaptureCommand;
}

const start = (state: CaptureState, now: number): CaptureStep =>
  state.connected
    ? { state: { ...state, phase: 'recording', sprayStart: now, lastGunfire: now }, command: 'start' }
    : { state };

const finish = (state: CaptureState): CaptureStep =>
  state.phase === 'idle' ? { state } : { state: { ...state, phase: 'idle' }, command: 'finish' };

export function captureStep(state: CaptureState, event: CaptureEvent): CaptureStep {
  switch (event.type) {
    case 'connect':
      return { state: { ...initialCapture, connected: true, previewPlaying: state.previewPlaying } };
    case 'disconnect': {
      // A spray in progress is kept (its wall is captured as it stands)
      const step = finish(state);
      return { ...step, state: { ...step.state, connected: false } };
    }
    case 'preview':
      return { state: { ...state, previewPlaying: event.playing } };
    case 'snap':
      return finish(state);
    case 'manual':
      return state.phase === 'idle' ? start(state, event.now) : finish(state);
    case 'tick':
      if (state.phase === 'reaim' && reaimRemaining(state, event.now, event.bufferMs) <= 0) return finish(state);
      return { state };
    case 'level': {
      const { now } = event;
      if (event.level >= event.threshold && !state.previewPlaying) {
        // Gunfire: start a spray, or carry on with it (a burst weapon's next burst ends the buffer)
        if (state.phase === 'idle') return start(state, now);
        return { state: { ...state, phase: 'recording', lastGunfire: now } };
      }
      if (state.phase === 'idle') return { state };
      if (now - state.sprayStart > MAX_SPRAY_MS) return finish(state);
      if (state.phase === 'recording' && now - state.lastGunfire > SILENCE_LEAD_MS) {
        return { state: { ...state, phase: 'reaim', reaimStart: now } };
      }
      return { state };
    }
  }
}

/** Milliseconds left in the re-aim buffer */
export const reaimRemaining = (state: CaptureState, now: number, bufferMs: number) =>
  Math.max(0, bufferMs - (now - state.reaimStart));

/** The sensor's level from the audio's waveform (bytes around 128): its RMS, scaled so gunfire reads high */
export function audioLevel(waveform: Uint8Array): number {
  if (waveform.length === 0) return 0;
  let sum = 0;
  for (const byte of waveform) {
    const v = (byte - 128) / 128;
    sum += v * v;
  }
  return Math.min(100, Math.round(Math.sqrt(sum / waveform.length) * 280));
}

/** A recorded or imported spray: its clip and the wall screenshot taken after it */
export interface Sample {
  id: string;
  name: string;
  clip: Blob;
  /** The clip's object URL, revoked when the sample goes */
  url: string;
  durationSec: number;
  /** The wall as a data URL */
  wall?: string;
}

/**
 * The samples with `sample` added: in the slot marked for a re-recording (keeping that slot's name), or
 * at the end. Returns the sample it replaced, whose URL the caller revokes.
 */
export function addSample(samples: Sample[], sample: Sample, slot: number | null) {
  if (slot !== null && slot >= 0 && slot < samples.length) {
    const replaced = samples[slot];
    return {
      samples: samples.map((s, i) => (i === slot ? { ...sample, name: replaced.name } : s)),
      replaced,
    };
  }
  return { samples: [...samples, sample], replaced: undefined };
}

/** The samples without sample `index`, renumbered */
export const discardSample = (samples: Sample[], index: number) =>
  samples.filter((_, i) => i !== index).map((s, i) => ({ ...s, name: `Spray #${i + 1}` }));

/** The re-recording slot after the sample `index` is discarded */
export const slotAfterDiscard = (slot: number | null, index: number) =>
  slot === null || slot === index ? null : slot > index ? slot - 1 : slot;

/** The wall screenshot that goes with a clip: the same name, the same name with _wall, or a name the clip's starts with */
export function wallFor(clipName: string, imageNames: string[]): string | undefined {
  const base = clipName.replace(/\.[^/.]+$/, '');
  return imageNames.find((name) => {
    const image = name.replace(/\.[^/.]+$/, '');
    return image === base || image === `${base}_wall` || base.startsWith(image);
  });
}

const isClip = (file: { name: string; type: string }) =>
  file.type.startsWith('video/') || /\.(webm|mp4)$/i.test(file.name);
const isImage = (file: { name: string; type: string }) =>
  file.type.startsWith('image/') || /\.(jpe?g|png)$/i.test(file.name);

/** Splits imported files into clips and images; anything else is left out */
export function sortImports<F extends { name: string; type: string }>(files: F[]) {
  return { clips: files.filter(isClip), images: files.filter((f) => !isClip(f) && isImage(f)) };
}

/** The upload's file name for spray `index` (zero-based): spray_01.webm and spray_01_wall.jpg */
export const sprayFileName = (index: number, wall = false) =>
  `spray_${String(index + 1).padStart(2, '0')}${wall ? '_wall.jpg' : '.webm'}`;
