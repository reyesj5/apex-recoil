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

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useEditorSettings } from '@/lib/storage/editor';
import { newId, videoFrame } from '../media';
import {
  audioLevel,
  captureStep,
  COUNTDOWN_INTERVAL_MS,
  initialCapture,
  MIN_SPRAY_SECONDS,
  PREVIEW_COOLDOWN_MS,
  reaimRemaining,
  SENSOR_INTERVAL_MS,
  type CaptureEvent,
  type CaptureState,
} from '../model/capture';
import { recordSample, setBackground, setSampleWall, useStudio } from '../store';

// The live capture's media: the shared game window with its sound (or a microphone), the gunfire
// sensor that reads the sound every 25 ms, and the MediaRecorder that records each spray. The
// sequence itself is the tested reducer in model/capture.ts; this hook feeds it and carries out its
// commands. Browsers can't do this headless, so docs/studio-capture-check.md checks it by hand.

export interface AudioSource {
  id: string;
  label: string;
}

const defaultSources: AudioSource[] = [
  { id: 'display', label: 'System audio (the shared window)' },
  { id: 'mic-default', label: 'Default microphone or line-in' },
];

function playTone(frequency: number, seconds: number) {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + seconds);
    oscillator.onended = () => void context.close();
  } catch {
    // no sound for the countdown
  }
}

export function useLiveCapture() {
  const [state, setState] = useState<CaptureState>(initialCapture);
  const [remaining, setRemaining] = useState(0);
  const [sources, setSources] = useState<AudioSource[]>(defaultSources);
  const [source, setSource] = useState('display');
  const [alert, setAlert] = useState<string | null>(null);
  const [resnap, setResnap] = useState<{ index: number; seconds: number } | null>(null);

  // The shared window, for the preview; frames are taken from a video element of the hook's own, which
  // keeps playing when the Live tab isn't shown
  const [display, setDisplay] = useState<MediaStream | null>(null);
  const grabber = useRef<HTMLVideoElement | null>(null);
  const stateRef = useRef(state);
  const media = useRef({
    display: null as MediaStream | null,
    audio: null as MediaStream | null,
    context: null as AudioContext | null,
    node: null as MediaStreamAudioSourceNode | null,
    analyser: null as AnalyserNode | null,
    recorder: null as MediaRecorder | null,
    chunks: [] as Blob[],
    pendingWall: '',
    monitor: 0,
    countdown: 0,
    cooldown: 0,
    // The meter's listeners: the level changes 40 times a second, so it skips React's renders
    levelListeners: new Set<(level: number, triggered: boolean) => void>(),
  });

  const frame = () => (grabber.current ? videoFrame(grabber.current, useEditorSettings.getState().hdrMode) : '');

  function dispatch(event: CaptureEvent) {
    const step = captureStep(stateRef.current, event);
    const before = stateRef.current;
    stateRef.current = step.state;
    if (step.state !== before) setState(step.state);
    if (step.command === 'start') startRecorder();
    if (step.command === 'finish') {
      media.current.pendingWall = frame();
      stopRecorder();
    }
  }

  function startRecorder() {
    const m = media.current;
    const videoTrack = m.display?.getVideoTracks()[0];
    if (!videoTrack) return;
    const audioTrack = m.audio?.getAudioTracks()[0] ?? m.display?.getAudioTracks()[0];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    m.chunks = [];
    m.pendingWall = '';
    try {
      const recorder = new MediaRecorder(new MediaStream(audioTrack ? [videoTrack, audioTrack] : [videoTrack]), {
        mimeType,
      });
      const started = performance.now();
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) m.chunks.push(e.data);
      };
      recorder.onstop = () => {
        const seconds = (performance.now() - started) / 1000;
        const wall = m.pendingWall || frame();
        m.pendingWall = '';
        if (seconds < MIN_SPRAY_SECONDS) {
          console.warn(`[Studio] A ${seconds.toFixed(2)} s recording was too short for a spray; it was dropped.`);
          return;
        }
        const clip = new Blob(m.chunks, { type: 'video/webm' });
        recordSample({
          id: newId('sample'),
          name: `Spray #${useStudio.getState().samples.length + 1}`,
          clip,
          url: URL.createObjectURL(clip),
          durationSec: Math.round(seconds * 10) / 10,
          ...(wall ? { wall } : {}),
        });
      };
      recorder.start(50);
      m.recorder = recorder;
    } catch (err) {
      console.error('[Studio] The recorder could not start:', err);
    }
  }

  function stopRecorder() {
    const recorder = media.current.recorder;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    media.current.recorder = null;
  }

  function listen(stream: MediaStream | null) {
    const m = media.current;
    m.node?.disconnect();
    m.node = null;
    if (!stream || stream.getAudioTracks().length === 0) return;
    m.context ??= new AudioContext();
    if (m.context.state === 'suspended') void m.context.resume();
    m.analyser ??= Object.assign(m.context.createAnalyser(), { fftSize: 512 });
    m.node = m.context.createMediaStreamSource(stream);
    m.node.connect(m.analyser);
    const track = stream.getAudioTracks()[0];
    track.onmute = () =>
      setAlert('The sound stopped: Windows may have switched the output device. Reconnect, or pick another input.');
    track.onunmute = () => setAlert(null);
    track.onended = () => setAlert('The audio device was disconnected. Reconnect, or pick another input.');
    startMonitor();
  }

  function startMonitor() {
    const m = media.current;
    clearInterval(m.monitor);
    const data = new Uint8Array(m.analyser?.frequencyBinCount ?? 256);
    m.monitor = window.setInterval(() => {
      if (!m.analyser) return;
      if (m.context?.state === 'suspended') void m.context.resume();
      m.analyser.getByteTimeDomainData(data);
      const level = audioLevel(data);
      const threshold = useEditorSettings.getState().triggerThreshold;
      for (const listener of m.levelListeners) listener(level, level >= threshold);
      dispatch({ type: 'level', now: performance.now(), level, threshold });
    }, SENSOR_INTERVAL_MS);
  }

  async function listSources() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default')
        .map((d, i) => ({ id: d.deviceId, label: d.label || `Audio input ${i + 1}` }));
      setSources([...defaultSources, ...inputs]);
    } catch {
      setSources(defaultSources);
    }
  }

  async function switchSource(id: string) {
    const m = media.current;
    setSource(id);
    if (m.audio && m.audio !== m.display) m.audio.getTracks().forEach((t) => t.stop());
    m.audio = null;
    if (id === 'display') {
      const tracks = m.display?.getAudioTracks() ?? [];
      if (tracks.length === 0) {
        setAlert('The shared window has no sound. Reconnect and share the audio, or pick a microphone.');
        listen(null);
        return;
      }
      m.audio = new MediaStream(tracks);
    } else {
      try {
        m.audio = await navigator.mediaDevices.getUserMedia({
          audio: id === 'mic-default' ? true : { deviceId: { exact: id } },
        });
        void listSources();
      } catch (err) {
        setAlert(`The audio input could not be opened: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }
    setAlert(null);
    listen(m.audio);
  }

  async function connect() {
    const m = media.current;
    try {
      m.display = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'window' } as MediaTrackConstraints,
        audio: true,
      });
    } catch (err) {
      setAlert(`Screen sharing didn't start: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    grabber.current ??= Object.assign(document.createElement('video'), { muted: true, playsInline: true });
    grabber.current.srcObject = m.display;
    void grabber.current.play().catch(() => undefined);
    setDisplay(m.display);
    for (const track of m.display.getVideoTracks()) track.onended = () => disconnect();
    dispatch({ type: 'connect' });
    await switchSource('display');
    void listSources();
  }

  function disconnect() {
    const m = media.current;
    dispatch({ type: 'disconnect' });
    clearInterval(m.monitor);
    clearInterval(m.countdown);
    m.node?.disconnect();
    m.node = null;
    m.analyser = null;
    void m.context?.close().catch(() => undefined);
    m.context = null;
    if (m.audio && m.audio !== m.display) m.audio.getTracks().forEach((t) => t.stop());
    m.audio = null;
    m.display?.getTracks().forEach((t) => t.stop());
    m.display = null;
    if (grabber.current) grabber.current.srcObject = null;
    setDisplay(null);
    setAlert(null);
  }

  async function reconnect() {
    const m = media.current;
    if (source !== 'display') {
      await switchSource(source);
      return;
    }
    try {
      const share = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      share.getVideoTracks().forEach((t) => t.stop());
      const tracks = share.getAudioTracks();
      if (tracks.length === 0) {
        setAlert('No sound was shared. Tick "Share system audio" in the browser\'s dialog, or pick a microphone.');
        return;
      }
      if (m.audio && m.audio !== m.display) m.audio.getTracks().forEach((t) => t.stop());
      m.audio = new MediaStream(tracks);
      setAlert(null);
      listen(m.audio);
    } catch {
      // the dialog was closed
    }
  }

  /** A sample playing in the Studio must not trigger a recording; the sensor wakes 1.5 s after it stops */
  function setPreviewPlaying(playing: boolean) {
    const m = media.current;
    clearTimeout(m.cooldown);
    if (playing) dispatch({ type: 'preview', playing: true });
    else m.cooldown = window.setTimeout(() => dispatch({ type: 'preview', playing: false }), PREVIEW_COOLDOWN_MS);
  }

  /** Captures a sample's wall again after a 3 s countdown (time to aim back at the decals) */
  function resnapWall(index: number) {
    let seconds = 3;
    setResnap({ index, seconds });
    playTone(440, 0.12);
    const timer = window.setInterval(() => {
      seconds--;
      if (seconds > 0) {
        setResnap({ index, seconds });
        playTone(440, 0.12);
        return;
      }
      clearInterval(timer);
      setResnap(null);
      playTone(880, 0.25);
      const wall = frame();
      if (!wall) {
        setAlert("The wall couldn't be captured: is the game window shared and showing?");
        return;
      }
      setSampleWall(index, wall);
      const sample = useStudio.getState().samples[index];
      if (sample) setBackground({ key: newId(sample.id), name: sample.name, src: wall, correct: true });
    }, 1000);
  }

  // The re-aim buffer's countdown
  const reaiming = state.phase === 'reaim';
  useEffect(() => {
    if (!reaiming) return;
    const m = media.current;
    const tick = () => {
      const bufferMs = useEditorSettings.getState().reaimBuffer * 1000;
      const now = performance.now();
      setRemaining(reaimRemaining(stateRef.current, now, bufferMs));
      dispatch({ type: 'tick', now, bufferMs });
    };
    tick();
    m.countdown = window.setInterval(tick, COUNTDOWN_INTERVAL_MS);
    return () => clearInterval(m.countdown);
  }, [reaiming]);

  // Space snaps the wall while a spray records; Windows' output device changes need a reconnect
  const recording = state.phase !== 'idle';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || stateRef.current.phase === 'idle') return;
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return;
      e.preventDefault();
      dispatch({ type: 'snap' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recording]);

  useEffect(() => {
    const onDeviceChange = () => {
      if (!stateRef.current.connected) return;
      void listSources();
      setAlert('The audio devices changed. If the sensor stays quiet, reconnect or pick another input.');
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      disconnect();
    };
  }, []);

  return {
    state,
    remaining,
    sources,
    source,
    alert,
    resnap,
    display,
    /** Calls `listener` with the sensor's level (0 to 100) and whether it triggers, until the returned function is called */
    subscribeLevel(listener: (level: number, triggered: boolean) => void) {
      const listeners = media.current.levelListeners;
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    connect: () => void connect(),
    disconnect,
    manual: () => dispatch({ type: 'manual', now: performance.now() }),
    snap: () => dispatch({ type: 'snap' }),
    selectSource: (id: string) => void switchSource(id),
    reconnect: () => void reconnect(),
    dismissAlert: () => setAlert(null),
    setPreviewPlaying,
    resnapWall,
  };
}

export type LiveCapture = ReturnType<typeof useLiveCapture>;

/**
 * The capture lives with the Studio rather than the Live tab, so switching tabs or sections doesn't
 * stop a recording
 */
export const LiveCaptureContext = createContext<LiveCapture | null>(null);

export function useLiveCaptureContext(): LiveCapture {
  const capture = useContext(LiveCaptureContext);
  if (!capture) throw new Error('useLiveCaptureContext needs the Studio around it');
  return capture;
}
