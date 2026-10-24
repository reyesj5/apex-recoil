import { createPersistedStore, field, flag, number, numberIn, oneOf, text } from './index';

// The Studio's values under the keys the Recoil Editor writes: its spec and drawing state
// (client/modules/editor/state.ts, namespace 'editor', so 'editor:<name>'), and the layout and scale
// calibration, which the editor writes directly (layout.ts and toolbar.ts). Fallbacks are its
// defaults. The Studio adds the capture setup and the trigger under new keys, and keeps the color
// correction the editor offered but never stored.
export const editorFields = {
  /** The weapon the Studio opens on (the editor wrote it once and never changed it) */
  weapon: field('editor:weapon', text, 'r301'),
  /** The legacy anchors' in-game distance (the Manual tab) */
  distance: field('editor:distance', number, 100),
  stock: field('editor:stock', number, 0),
  barrel: field('editor:barrel', number, 0),
  sens: field('editor:sens', number, 5),
  comment: field('editor:comment', text, ''),
  hdrMode: field('editor:hdr-mode', oneOf(['hdr-standard', 'hdr-vibrant', 'off']), 'hdr-standard'),
  threshold: field('editor:threshold', number, 0),
  enableThreshold: field('editor:enable-threshold', flag, true),
  targetFrom: field('editor:target-from', number, 0),
  targetTo: field('editor:target-to', number, 0),
  autoTargets: field('editor:auto-targets', flag, true),
  connectHover: field('editor:connect-hover', flag, true),
  // The drawing, as JSON lists; the editor cleared these when it started, and the Studio doesn't use them
  points: field('editor:points', text, '[]'),
  edges: field('editor:edges', text, '[]'),
  anchors: field('editor:anchors', text, '[]'),
  imageData: field('editor:imagedata', text, '[]'),
  /** Fine-tunes the optic's scale (80 to 120 %); the key is removed at 100 % */
  scaleFactor: field('editor:scale_factor', numberIn(0.8, 1.2), 1, { removeAtFallback: true }),
  /** The capture panel (M) and the inspector (E), collapsed */
  sidebarCollapsed: field('editor_sidebar_collapsed', flag, false),
  toolsCollapsed: field('editor_tools_collapsed', flag, false),
  /** The capture tab: Live, Screenshots or Manual */
  recordingMethod: field('editor_recording_method', oneOf(['live', 'offline', 'legacy']), 'live'),
  // The capture setup, shared by the Live and Screenshots tabs
  captureDistance: field('editor:capture-distance', numberIn(5, 100), 20),
  captureOptic: field('editor:capture-optic', oneOf(['1.0', '2.0', '3.0', '4.0']), '2.0'),
  captureFov: field('editor:capture-fov', numberIn(70, 120), 104),
  /** The gunfire sensor's trigger level, 5 to 80 % */
  triggerThreshold: field('editor:trigger-threshold', numberIn(5, 80), 25),
  /** Seconds to reload and aim back at the wall before it is captured */
  reaimBuffer: field('editor:reaim-buffer', numberIn(1.5, 8), 4.5),
};

export const useEditorSettings = createPersistedStore(editorFields);
